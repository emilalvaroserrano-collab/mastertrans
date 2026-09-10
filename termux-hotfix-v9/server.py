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
SUPERTONIC_PORT=int(os.getenv("EBURON_TTS_PORT","8853"))
PIPER_PORT=int(os.getenv("EBURON_PIPER_PORT","8854"))
KOKORO_PORT=int(os.getenv("EBURON_KOKORO_PORT","8855"))

LLM_URL=f"http://127.0.0.1:{LLM_PORT}"
STT_URL=f"http://127.0.0.1:{STT_PORT}"
TTS_URLS={
    "supertonic":f"http://127.0.0.1:{SUPERTONIC_PORT}",
    "piper":f"http://127.0.0.1:{PIPER_PORT}",
    "kokoro":f"http://127.0.0.1:{KOKORO_PORT}",
}
client:httpx.AsyncClient|None=None

LANGUAGES=[
    {"code":"en","name":"English"},
    {"code":"ko","name":"Korean"},
    {"code":"ja","name":"Japanese"},
    {"code":"ar","name":"Arabic"},
    {"code":"bg","name":"Bulgarian"},
    {"code":"cs","name":"Czech"},
    {"code":"da","name":"Danish"},
    {"code":"de","name":"German"},
    {"code":"el","name":"Greek"},
    {"code":"es","name":"Spanish"},
    {"code":"et","name":"Estonian"},
    {"code":"fi","name":"Finnish"},
    {"code":"fr","name":"French"},
    {"code":"hi","name":"Hindi"},
    {"code":"hr","name":"Croatian"},
    {"code":"hu","name":"Hungarian"},
    {"code":"id","name":"Indonesian"},
    {"code":"it","name":"Italian"},
    {"code":"lt","name":"Lithuanian"},
    {"code":"lv","name":"Latvian"},
    {"code":"nl","name":"Dutch (Flemish)"},
    {"code":"pl","name":"Polish"},
    {"code":"pt","name":"Portuguese"},
    {"code":"ro","name":"Romanian"},
    {"code":"ru","name":"Russian"},
    {"code":"sk","name":"Slovak"},
    {"code":"sl","name":"Slovenian"},
    {"code":"sv","name":"Swedish"},
    {"code":"tr","name":"Turkish"},
    {"code":"uk","name":"Ukrainian"},
    {"code":"vi","name":"Vietnamese"},
]
LANG_NAMES={x["code"]:x["name"] for x in LANGUAGES}
LANG_ALIASES={"english":"en","dutch":"nl","flemish":"nl","french":"fr","german":"de","spanish":"es","italian":"it","portuguese":"pt","polish":"pl","chinese":"zh","mandarin":"zh","arabic":"ar","tagalog":"tl","filipino":"tl","indonesian":"id","japanese":"ja","korean":"ko","russian":"ru","ukrainian":"uk","turkish":"tr","vietnamese":"vi","hindi":"hi"}
SUPERTONIC_VOICES=[
    {"id":"F1","name":"F1","gender":"female"},{"id":"F2","name":"F2","gender":"female"},
    {"id":"F3","name":"F3","gender":"female"},{"id":"F4","name":"F4","gender":"female"},
    {"id":"F5","name":"F5","gender":"female"},{"id":"M1","name":"M1","gender":"male"},
    {"id":"M2","name":"M2","gender":"male"},{"id":"M3","name":"M3","gender":"male"},
    {"id":"M4","name":"M4","gender":"male"},{"id":"M5","name":"M5","gender":"male"},
]

def base_lang(v:str)->str:
    raw=(v or "auto").strip().lower().split("-")[0].split("_")[0]
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
        return (await client.get(url,timeout=2)).status_code<500
    except Exception:
        return False

async def provider_health()->dict:
    names=list(TTS_URLS)
    vals=await asyncio.gather(*[probe(TTS_URLS[n]+"/v1/health") for n in names])
    return dict(zip(names,vals))

async def health(request:Request):
    llm,stt=await asyncio.gather(probe(f"{LLM_URL}/health"),probe(f"{STT_URL}/"))
    tts=await provider_health()
    core_tts=tts.get("supertonic",False)
    ready=llm and stt and core_tts
    return JSONResponse({
        "status":"ready" if ready else "starting",
        "offline_ready":ready,
        "components":{"llm":llm,"stt":stt,"tts":tts},
        "ports":{"gateway":PORT,"llm":LLM_PORT,"stt":STT_PORT,"supertonic":SUPERTONIC_PORT,"piper":PIPER_PORT,"kokoro":KOKORO_PORT},
    })

async def whisper_transcribe(audio:bytes,mime:str="audio/webm")->tuple[str,str,float]:
    assert client
    t0=time.perf_counter()
    r=await client.post(
        f"{STT_URL}/inference",
        files={"file":("utterance.webm",audio,mime)},
        data={"language":"auto","response_format":"verbose_json","temperature":"0.0","no_language_probabilities":"true"},
    )
    if r.status_code>=400:
        raise RuntimeError(f"whisper.cpp {r.status_code}: {r.text[:300]}")
    data=r.json()
    text=str(data.get("text") or "").strip()
    detected=base_lang(str(data.get("detected_language") or data.get("language") or "auto"))
    return text,detected,(time.perf_counter()-t0)*1000

async def translate_text(text:str,source:str,target:str,mode:str)->tuple[str,float]:
    assert client
    prompt=load_prompt("translator.txt").format(source_language=lang_name(source),target_language=lang_name(target))
    prompt+="\nReturn ONLY the translated text. Never explain, label, quote, or add commentary."
    if mode=="medical":
        prompt+="\nMedical mode: preserve clinical meaning and terminology while keeping natural patient-facing phrasing."
    t0=time.perf_counter()
    r=await client.post(f"{LLM_URL}/v1/chat/completions",json={
        "model":"local",
        "messages":[{"role":"system","content":prompt},{"role":"user","content":text}],
        "temperature":0.05,"top_p":0.85,"max_tokens":256,"stream":False,
    })
    if r.status_code>=400:
        raise RuntimeError(f"llama.cpp {r.status_code}: {r.text[:300]}")
    out=r.json()["choices"][0]["message"]["content"].strip()
    return out,(time.perf_counter()-t0)*1000

async def synthesize(text:str,provider:str,voice:str,target:str)->tuple[bytes,float,str]:
    assert client
    provider=(provider or "supertonic").lower()
    if provider not in TTS_URLS:
        raise RuntimeError(f"Unknown TTS provider: {provider}")
    if not await probe(TTS_URLS[provider]+"/v1/health"):
        if provider!="supertonic" and await probe(TTS_URLS["supertonic"]+"/v1/health"):
            provider="supertonic"
            voice="M1" if not voice or ":" in voice else voice
        else:
            raise RuntimeError(f"TTS provider unavailable: {provider}")
    lang=base_lang(target)
    t0=time.perf_counter()
    r=await client.post(TTS_URLS[provider]+"/v1/tts",json={
        "text":text,"voice":voice,"lang":lang,
        "steps":int(os.getenv("TTS_STEPS","6")),
        "speed":float(os.getenv("TTS_SPEED","1.05")),
    })
    if r.status_code>=400:
        raise RuntimeError(f"{provider} TTS {r.status_code}: {r.text[:300]}")
    return r.content,(time.perf_counter()-t0)*1000,provider

def route_direction(detected:str,cfg:dict)->tuple[str,str]:
    staff=base_lang(cfg.get("staff_language","nl"))
    guest=base_lang(cfg.get("guest_language","en"))
    if detected==staff:
        return staff,guest
    if detected==guest:
        return guest,staff
    return (detected if detected!="auto" else guest),staff

async def tts_catalog(request:Request):
    provider=request.query_params.get("provider","supertonic").lower()
    if provider=="supertonic":
        return JSONResponse({"provider":"supertonic","available":await probe(TTS_URLS["supertonic"]+"/v1/health"),"languages":LANGUAGES,"voices":SUPERTONIC_VOICES})
    if provider in ("piper","kokoro"):
        try:
            assert client
            r=await client.get(TTS_URLS[provider]+"/v1/voices",timeout=8)
            if r.status_code<400:
                data=r.json()
                data["provider"]=provider
                data["available"]=True
                return JSONResponse(data)
        except Exception:
            pass
        return JSONResponse({"provider":provider,"available":False,"languages":[],"voices":[]})
    return JSONResponse({"error":"unknown provider"},status_code=400)

async def tts_providers(request:Request):
    h=await provider_health()
    return JSONResponse({"providers":[
        {"id":"supertonic","name":"Supertonic 3","available":h["supertonic"],"recommended":True},
        {"id":"piper","name":"Piper","available":h["piper"],"recommended":False},
        {"id":"kokoro","name":"Kokoro JS","available":h["kokoro"],"recommended":False},
    ]})

async def tts_preview(request:Request):
    b=await request.json()
    text=str(b.get("text") or "Hello. This is your selected Eburon voice.").strip()
    try:
        wav,ms,used=await synthesize(text,str(b.get("provider","supertonic")),str(b.get("voice","M1")),str(b.get("language","en")))
        return Response(wav,media_type="audio/wav",headers={"X-Eburon-TTS-Provider":used,"X-Eburon-TTS-Latency-Ms":str(round(ms))})
    except Exception as e:
        return JSONResponse({"error":str(e)},status_code=500)

async def live(ws:WebSocket):
    await ws.accept()
    audio_parts:list[bytes]=[]
    cfg={"staff_language":"nl","guest_language":"en","voice":"M1","tts_provider":"supertonic","mode":"medical","speaker":True,"audio_mime":"audio/webm"}
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
                await ws.send_json({"type":"transcript_final","text":transcript,"language":detected,"source_language":source,"target_language":target,"latency_ms":round(stt_ms)})

                await ws.send_json({"type":"stage","stage":"llm"})
                translation,llm_ms=await translate_text(transcript,source,target,cfg.get("mode","general"))
                await ws.send_json({"type":"translation_final","text":translation,"source_language":source,"target_language":target,"latency_ms":round(llm_ms)})

                tts_ms=0.0
                provider_used=cfg.get("tts_provider","supertonic")
                if cfg.get("speaker",True) and ev.get("tts",True):
                    await ws.send_json({"type":"stage","stage":"tts"})
                    wav,tts_ms,provider_used=await synthesize(translation,cfg.get("tts_provider","supertonic"),cfg.get("voice","M1"),target)
                    await ws.send_json({"type":"tts_begin","mime":"audio/wav","bytes":len(wav),"latency_ms":round(tts_ms),"provider":provider_used})
                    await ws.send_bytes(wav)

                await ws.send_json({"type":"turn_complete","ok":True,"total_ms":round((time.perf_counter()-turn_started)*1000),"stt_ms":round(stt_ms),"llm_ms":round(llm_ms),"tts_ms":round(tts_ms),"tts_provider":provider_used})
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
        wav,ms,used=await synthesize(text,str(b.get("provider","supertonic")),str(b.get("voice","M1")),str(b.get("lang") or b.get("language") or "en"))
        return Response(wav,media_type="audio/wav",headers={"X-Eburon-TTS-Provider":used,"X-Eburon-TTS-Latency-Ms":str(round(ms))})
    except Exception as e:
        return JSONResponse({"error":str(e)},status_code=500)

def safe_public(rel:str):
    pub=PUBLIC.resolve(); p=(PUBLIC/rel).resolve()
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
    Route("/v1/tts/providers",tts_providers),
    Route("/v1/tts/catalog",tts_catalog),
    Route("/v1/tts/preview",tts_preview,methods=["POST"]),
    WebSocketRoute("/ws/live",live),
    Route("/",root_page),
    Route("/{path:path}",public_file),
],lifespan=lifespan)
