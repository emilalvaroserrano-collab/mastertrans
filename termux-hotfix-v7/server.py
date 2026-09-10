from __future__ import annotations
import asyncio, io, json, mimetypes, os, pathlib, time, wave
from contextlib import asynccontextmanager
import httpx
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket, WebSocketDisconnect

ROOT=pathlib.Path(__file__).resolve().parents[1]
PUBLIC=ROOT/"public"; PROMPTS=ROOT/"config"/"prompts"
PORT=int(os.getenv("EBURON_GATEWAY_PORT","8850"))
LLM_PORT=int(os.getenv("EBURON_LLM_PORT","8851")); STT_PORT=int(os.getenv("EBURON_STT_PORT","8852")); TTS_PORT=int(os.getenv("EBURON_TTS_PORT","8853"))
LLM_URL=f"http://127.0.0.1:{LLM_PORT}"; STT_URL=f"http://127.0.0.1:{STT_PORT}"; TTS_URL=f"http://127.0.0.1:{TTS_PORT}"
client: httpx.AsyncClient|None=None
LANG_NAMES={"nl":"Dutch (Flemish)","en":"English","fr":"French","de":"German","es":"Spanish","it":"Italian","pt":"Portuguese","pl":"Polish","zh":"Chinese","ar":"Arabic","tl":"Filipino","id":"Indonesian","ja":"Japanese","ko":"Korean","ru":"Russian","uk":"Ukrainian","tr":"Turkish","vi":"Vietnamese","hi":"Hindi"}
def base_lang(v:str)->str: return (v or "auto").split("-")[0].lower()
def lang_name(v:str)->str: return LANG_NAMES.get(base_lang(v),v or "Auto")
def load_prompt(name:str)->str: return (PROMPTS/name).read_text(encoding="utf-8").strip()

@asynccontextmanager
async def lifespan(app):
    global client
    client=httpx.AsyncClient(timeout=httpx.Timeout(120,connect=5))
    try: yield
    finally:
        if client: await client.aclose()

async def probe(url):
    try:
        assert client
        return (await client.get(url,timeout=2)).status_code<500
    except Exception:return False

async def health(request):
    llm,stt,tts=await asyncio.gather(probe(f"{LLM_URL}/health"),probe(f"{STT_URL}/"),probe(f"{TTS_URL}/v1/health"))
    return JSONResponse({"status":"ready" if llm and stt and tts else "starting","offline_ready":llm and stt and tts,"components":{"llm":llm,"stt":stt,"tts":tts},"ports":{"gateway":PORT,"llm":LLM_PORT,"stt":STT_PORT,"tts":TTS_PORT}})

async def translate_text(text,source,target,mode):
    assert client
    prompt=load_prompt("translator.txt").format(source_language=lang_name(source),target_language=lang_name(target))
    prompt+="\nReturn ONLY the translated text. Do not explain, label, quote, or add commentary."
    if mode=="medical": prompt+="\nMedical mode: preserve clinical meaning and terminology while keeping natural patient-facing phrasing."
    r=await client.post(f"{LLM_URL}/v1/chat/completions",json={"model":"local","messages":[{"role":"system","content":prompt},{"role":"user","content":text}],"temperature":0.05,"top_p":0.85,"max_tokens":256,"stream":False})
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()

async def live(ws:WebSocket):
    await ws.accept()
    audio_parts=[]
    cfg={"staff_language":"nl-BE","guest_language":"en-US","auto_detect_guest":True,"voice":"M1","mode":"medical","speaker":True}
    try:
        await ws.send_json({"type":"ready"})
        while True:
            msg=await ws.receive()
            if msg.get("bytes") is not None:
                audio_parts.append(msg["bytes"]); continue
            raw=msg.get("text")
            if raw is None: continue
            ev=json.loads(raw); typ=ev.get("type")
            if typ=="configure":
                cfg.update({k:v for k,v in ev.items() if k!="type"})
                await ws.send_json({"type":"configured","settings":cfg}); continue
            if typ=="clear":
                audio_parts.clear(); await ws.send_json({"type":"cleared"}); continue
            if typ!="commit": continue
            if not audio_parts:
                await ws.send_json({"type":"error","stage":"stt","message":"No utterance audio received"}); continue
            audio=b"".join(audio_parts); audio_parts.clear(); t0=time.perf_counter()
            try:
                assert client
                r=await client.post(f"{STT_URL}/inference",files={"file":("utterance.webm",audio,"audio/webm")},data={"language":"auto","response_format":"json","temperature":"0.0"})
                r.raise_for_status(); data=r.json()
                transcript=str(data.get("text","")).strip()
                detected=base_lang(str(data.get("language","auto")))
                if not transcript:
                    await ws.send_json({"type":"turn_complete","empty":True}); continue
                await ws.send_json({"type":"transcript_final","text":transcript,"language":detected,"latency_ms":round((time.perf_counter()-t0)*1000)})
                staff=base_lang(cfg["staff_language"]); guest=base_lang(cfg["guest_language"])
                if detected==staff:
                    source=cfg["staff_language"]; target=cfg["guest_language"]
                else:
                    source=(detected if detected!="auto" else cfg["guest_language"]); target=cfg["staff_language"]
                translation=await translate_text(transcript,source,target,cfg.get("mode","general"))
                await ws.send_json({"type":"translation_final","text":translation,"source_language":source,"target_language":target})
                if cfg.get("speaker",True):
                    tts_lang=base_lang(target)
                    tr=await client.post(f"{TTS_URL}/v1/tts",json={"text":translation,"voice":cfg.get("voice","M1"),"lang":tts_lang,"steps":int(os.getenv("TTS_STEPS","6")),"speed":float(os.getenv("TTS_SPEED","1.05"))})
                    tr.raise_for_status()
                    await ws.send_json({"type":"tts_begin","mime":"audio/wav","bytes":len(tr.content)})
                    await ws.send_bytes(tr.content)
                await ws.send_json({"type":"turn_complete"})
            except Exception as e:
                await ws.send_json({"type":"error","message":str(e)[:500]})
                await ws.send_json({"type":"turn_complete"})
    except WebSocketDisconnect:return

async def translate_api(request):
    b=await request.json()
    try:return JSONResponse({"text":await translate_text(str(b.get("text","")).strip(),str(b.get("source_language","Auto")),str(b.get("target_language","English")),str(b.get("mode","general")))})
    except Exception as e:return JSONResponse({"error":str(e)},status_code=500)

async def transcribe(request):
    form=await request.form(); up=form.get("file")
    if up is None:return JSONResponse({"error":"file required"},status_code=400)
    assert client
    r=await client.post(f"{STT_URL}/inference",files={"file":(getattr(up,"filename","audio.webm"),await up.read(),getattr(up,"content_type","audio/webm"))},data={"language":str(form.get("language","auto")),"response_format":"json","temperature":"0.0"})
    return Response(r.content,status_code=r.status_code,media_type="application/json")

async def speech(request):
    b=await request.json(); assert client
    r=await client.post(f"{TTS_URL}/v1/tts",json={"text":b.get("input") or b.get("text"),"voice":b.get("voice","M1"),"lang":base_lang(b.get("lang") or b.get("language") or "na")})
    return Response(r.content,status_code=r.status_code,media_type=r.headers.get("content-type","audio/wav"))

def safe_public(rel):
    pub=PUBLIC.resolve(); p=(PUBLIC/rel).resolve()
    return p if p==pub or pub in p.parents else None
async def root_page(request): return FileResponse(PUBLIC/"index.html",media_type="text/html")
async def settings_page(request): return FileResponse(PUBLIC/"settings.html",media_type="text/html")
async def public_file(request):
    p=safe_public(request.path_params.get("path",""))
    return FileResponse(p,media_type=mimetypes.guess_type(p.name)[0] or "application/octet-stream") if p and p.is_file() else Response("Not found",status_code=404)

app=Starlette(routes=[
 Route("/health",health),Route("/v1/translate",translate_api,methods=["POST"]),Route("/v1/audio/transcriptions",transcribe,methods=["POST"]),Route("/v1/audio/speech",speech,methods=["POST"]),
 WebSocketRoute("/ws/live",live),Route("/",root_page),Route("/settings.html",settings_page),Route("/{path:path}",public_file)
],lifespan=lifespan)
