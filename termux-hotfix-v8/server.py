from __future__ import annotations
import asyncio, json, mimetypes, os, pathlib, time
from contextlib import asynccontextmanager
import httpx
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket, WebSocketDisconnect

ROOT=pathlib.Path(__file__).resolve().parents[1]
PUBLIC=ROOT/"public"
PROMPTS=ROOT/"config"/"prompts"
PORT=int(os.getenv("EBURON_GATEWAY_PORT","8850"))
LLM_PORT=int(os.getenv("EBURON_LLM_PORT","8851"))
STT_PORT=int(os.getenv("EBURON_STT_PORT","8852"))
TTS_PORT=int(os.getenv("EBURON_TTS_PORT","8853"))
LLM_URL=f"http://127.0.0.1:{LLM_PORT}"
STT_URL=f"http://127.0.0.1:{STT_PORT}"
TTS_URL=f"http://127.0.0.1:{TTS_PORT}"
client: httpx.AsyncClient|None=None

LANG_NAMES={"nl":"Dutch (Flemish)","en":"English","fr":"French","de":"German","es":"Spanish","it":"Italian","pt":"Portuguese","pl":"Polish","zh":"Chinese","ar":"Arabic","tl":"Filipino","id":"Indonesian","ja":"Japanese","ko":"Korean","ru":"Russian","uk":"Ukrainian","tr":"Turkish","vi":"Vietnamese","hi":"Hindi"}
LANG_ALIASES={"english":"en","dutch":"nl","flemish":"nl","french":"fr","german":"de","spanish":"es","italian":"it","portuguese":"pt","polish":"pl","chinese":"zh","mandarin":"zh","arabic":"ar","tagalog":"tl","filipino":"tl","indonesian":"id","japanese":"ja","korean":"ko","russian":"ru","ukrainian":"uk","turkish":"tr","vietnamese":"vi","hindi":"hi"}
ST3_LANGS={"en","ko","ja","ar","bg","cs","da","de","el","es","et","fi","fr","hi","hr","hu","id","it","lt","lv","nl","pl","pt","ro","ru","sk","sl","sv","tr","uk","vi"}

def base_lang(v:str)->str:
    raw=(v or "auto").strip().lower().split("-")[0]
    return LANG_ALIASES.get(raw,raw)

def lang_name(v:str)->str:
    return LANG_NAMES.get(base_lang(v),v or "Auto")

def load_prompt(name:str)->str:
    return (PROMPTS/name).read_text(encoding="utf-8").strip()

@asynccontextmanager
async def lifespan(app):
    global client
    client=httpx.AsyncClient(timeout=httpx.Timeout(120,connect=5))
    try:
        yield
    finally:
        if client:
            await client.aclose()

async def probe(url:str)->bool:
    try:
        assert client
        r=await client.get(url,timeout=2)
        return r.status_code<500
    except Exception:
        return False

async def health(request:Request):
    llm,stt,tts=await asyncio.gather(
        probe(f"{LLM_URL}/health"),
        probe(f"{STT_URL}/"),
        probe(f"{TTS_URL}/v1/health"),
    )
    ready=llm and stt and tts
    return JSONResponse({
        "status":"ready" if ready else "starting",
        "offline_ready":ready,
        "components":{"llm":llm,"stt":stt,"tts":tts},
        "ports":{"gateway":PORT,"llm":LLM_PORT,"stt":STT_PORT,"tts":TTS_PORT},
    })

async def whisper_transcribe(audio:bytes,mime:str="audio/webm")->tuple[str,str,float]:
    assert client
    t0=time.perf_counter()
    r=await client.post(
        f"{STT_URL}/inference",
        files={"file":("utterance.webm",audio,mime)},
        data={
            "language":"auto",
            "response_format":"verbose_json",
            "temperature":"0.0",
            "no_language_probabilities":"true",
            "no_context":"true",
        },
    )
    if r.status_code>=400:
        raise RuntimeError(f"whisper.cpp {r.status_code}: {r.text[:300]}")
    try:
        data=r.json()
    except Exception:
        raise RuntimeError(f"whisper.cpp returned invalid JSON: {r.text[:300]}")
    text=str(data.get("text") or "").strip()
    detected=base_lang(str(data.get("detected_language") or data.get("language") or "auto"))
    return text,detected,(time.perf_counter()-t0)*1000

async def translate_text(text:str,source:str,target:str,mode:str)->tuple[str,float]:
    assert client
    prompt=load_prompt("translator.txt").format(
        source_language=lang_name(source),
        target_language=lang_name(target),
    )
    prompt+="\nReturn ONLY the translated text. Never explain, label, quote, or add commentary."
    if mode=="medical":
        prompt+="\nMedical mode: preserve clinical meaning and terminology while keeping natural patient-facing phrasing."
    t0=time.perf_counter()
    r=await client.post(f"{LLM_URL}/v1/chat/completions",json={
        "model":"local",
        "messages":[
            {"role":"system","content":prompt},
            {"role":"user","content":text},
        ],
        "temperature":0.05,
        "top_p":0.85,
        "max_tokens":256,
        "stream":False,
    })
    if r.status_code>=400:
        raise RuntimeError(f"llama.cpp {r.status_code}: {r.text[:300]}")
    try:
        out=r.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        raise RuntimeError(f"llama.cpp returned unexpected response: {r.text[:300]}")
    return out,(time.perf_counter()-t0)*1000

async def synthesize(text:str,voice:str,target:str)->tuple[bytes,float]:
    assert client
    lang=base_lang(target)
    if lang not in ST3_LANGS:
        lang="na"
    t0=time.perf_counter()
    r=await client.post(f"{TTS_URL}/v1/tts",json={
        "text":text,
        "voice":voice or "M1",
        "lang":lang,
        "steps":int(os.getenv("TTS_STEPS","6")),
        "speed":float(os.getenv("TTS_SPEED","1.05")),
    })
    if r.status_code>=400:
        raise RuntimeError(f"Supertonic {r.status_code}: {r.text[:300]}")
    return r.content,(time.perf_counter()-t0)*1000

def route_direction(detected:str,cfg:dict)->tuple[str,str]:
    staff=base_lang(cfg.get("staff_language","nl-BE"))
    guest=base_lang(cfg.get("guest_language","en-US"))
    if detected==staff:
        return cfg.get("staff_language","nl-BE"),cfg.get("guest_language","en-US")
    if detected==guest:
        return cfg.get("guest_language","en-US"),cfg.get("staff_language","nl-BE")
    # Unknown third language: treat as guest side and translate to staff language.
    return detected if detected!="auto" else cfg.get("guest_language","en-US"),cfg.get("staff_language","nl-BE")

async def live(ws:WebSocket):
    await ws.accept()
    audio_parts:list[bytes]=[]
    cfg={
        "staff_language":"nl-BE",
        "guest_language":"en-US",
        "auto_detect_guest":True,
        "voice":"M1",
        "mode":"medical",
        "speaker":True,
        "audio_mime":"audio/webm",
    }
    await ws.send_json({"type":"ready"})
    try:
        while True:
            msg=await ws.receive()
            if msg.get("bytes") is not None:
                audio_parts.append(msg["bytes"])
                continue
            raw=msg.get("text")
            if raw is None:
                continue
            try:
                ev=json.loads(raw)
            except Exception:
                await ws.send_json({"type":"error","stage":"protocol","message":"Invalid JSON control message"})
                continue
            typ=ev.get("type")
            if typ=="configure":
                cfg.update({k:v for k,v in ev.items() if k!="type"})
                await ws.send_json({"type":"configured","settings":cfg})
                continue
            if typ=="clear":
                audio_parts.clear()
                await ws.send_json({"type":"cleared"})
                continue
            if typ!="commit":
                continue
            if not audio_parts:
                await ws.send_json({"type":"error","stage":"stt","message":"No utterance audio received"})
                await ws.send_json({"type":"turn_complete","ok":False})
                continue

            audio=b"".join(audio_parts)
            audio_parts.clear()
            turn_started=time.perf_counter()
            try:
                await ws.send_json({"type":"stage","stage":"stt"})
                transcript,detected,stt_ms=await whisper_transcribe(audio,cfg.get("audio_mime","audio/webm"))
                if not transcript:
                    await ws.send_json({"type":"turn_complete","ok":True,"empty":True,"stt_ms":round(stt_ms)})
                    continue
                source,target=route_direction(detected,cfg)
                await ws.send_json({
                    "type":"transcript_final",
                    "text":transcript,
                    "language":detected,
                    "source_language":source,
                    "target_language":target,
                    "latency_ms":round(stt_ms),
                })

                await ws.send_json({"type":"stage","stage":"llm"})
                translation,llm_ms=await translate_text(transcript,source,target,cfg.get("mode","general"))
                await ws.send_json({
                    "type":"translation_final",
                    "text":translation,
                    "source_language":source,
                    "target_language":target,
                    "latency_ms":round(llm_ms),
                })

                tts_ms=0.0
                if cfg.get("speaker",True) and ev.get("tts",True):
                    await ws.send_json({"type":"stage","stage":"tts"})
                    wav,tts_ms=await synthesize(translation,cfg.get("voice","M1"),target)
                    await ws.send_json({"type":"tts_begin","mime":"audio/wav","bytes":len(wav),"latency_ms":round(tts_ms)})
                    await ws.send_bytes(wav)

                await ws.send_json({
                    "type":"turn_complete",
                    "ok":True,
                    "total_ms":round((time.perf_counter()-turn_started)*1000),
                    "stt_ms":round(stt_ms),
                    "llm_ms":round(llm_ms),
                    "tts_ms":round(tts_ms),
                })
            except Exception as e:
                await ws.send_json({"type":"error","stage":"pipeline","message":str(e)[:500]})
                await ws.send_json({"type":"turn_complete","ok":False})
    except WebSocketDisconnect:
        return

async def translate_api(request:Request):
    b=await request.json()
    text=str(b.get("text") or "").strip()
    if not text:
        return JSONResponse({"error":"text is required"},status_code=400)
    try:
        out,ms=await translate_text(text,str(b.get("source_language","Auto")),str(b.get("target_language","English")),str(b.get("mode","general")))
        return JSONResponse({"text":out,"latency_ms":round(ms)})
    except Exception as e:
        return JSONResponse({"error":str(e)},status_code=500)

async def transcribe_api(request:Request):
    form=await request.form()
    up=form.get("file")
    if up is None:
        return JSONResponse({"error":"file required"},status_code=400)
    try:
        text,lang,ms=await whisper_transcribe(await up.read(),getattr(up,"content_type",None) or "audio/webm")
        return JSONResponse({"text":text,"language":lang,"latency_ms":round(ms)})
    except Exception as e:
        return JSONResponse({"error":str(e)},status_code=500)

async def speech_api(request:Request):
    b=await request.json()
    text=str(b.get("input") or b.get("text") or "").strip()
    if not text:
        return JSONResponse({"error":"text is required"},status_code=400)
    try:
        wav,ms=await synthesize(text,str(b.get("voice","M1")),str(b.get("lang") or b.get("language") or "na"))
        return Response(wav,media_type="audio/wav",headers={"X-Eburon-TTS-Latency-Ms":str(round(ms))})
    except Exception as e:
        return JSONResponse({"error":str(e)},status_code=500)

def safe_public(rel:str):
    pub=PUBLIC.resolve()
    p=(PUBLIC/rel).resolve()
    return p if p==pub or pub in p.parents else None

async def root_page(request:Request):
    return FileResponse(PUBLIC/"index.html",media_type="text/html",headers={"Cache-Control":"no-store"})

async def public_file(request:Request):
    p=safe_public(request.path_params.get("path",""))
    if p and p.is_file():
        return FileResponse(p,media_type=mimetypes.guess_type(p.name)[0] or "application/octet-stream",headers={"Cache-Control":"no-store"})
    return Response("Not found",status_code=404)

app=Starlette(routes=[
    Route("/health",health),
    Route("/v1/translate",translate_api,methods=["POST"]),
    Route("/v1/audio/transcriptions",transcribe_api,methods=["POST"]),
    Route("/v1/audio/speech",speech_api,methods=["POST"]),
    WebSocketRoute("/ws/live",live),
    Route("/",root_page),
    Route("/{path:path}",public_file),
],lifespan=lifespan)
