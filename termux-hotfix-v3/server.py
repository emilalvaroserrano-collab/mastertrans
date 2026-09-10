from __future__ import annotations
import asyncio, io, json, mimetypes, os, pathlib, time, wave
from contextlib import asynccontextmanager
from typing import Any
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
MOCK=os.getenv("EBURON_MOCK","0")=="1"
LLM_URL=f"http://127.0.0.1:{LLM_PORT}"
STT_URL=f"http://127.0.0.1:{STT_PORT}"
TTS_URL=f"http://127.0.0.1:{TTS_PORT}"
client: httpx.AsyncClient|None=None

def load_prompt(name:str)->str:
    return (PROMPTS/name).read_text(encoding="utf-8").strip()

@asynccontextmanager
async def lifespan(app):
    global client
    client=httpx.AsyncClient(timeout=httpx.Timeout(120.0,connect=5.0))
    try:
        yield
    finally:
        if client:
            await client.aclose()

async def probe(url:str)->bool:
    if MOCK: return True
    try:
        assert client
        r=await client.get(url,timeout=2.0)
        return r.status_code<500
    except Exception:
        return False

def err(msg:str,status:int=400):
    return JSONResponse({"error":{"message":msg}},status_code=status)

async def health(request:Request):
    llm,stt,tts=await asyncio.gather(probe(f"{LLM_URL}/health"),probe(f"{STT_URL}/"),probe(f"{TTS_URL}/v1/health"))
    ready=llm and stt and tts
    return JSONResponse({"status":"ready" if ready else "starting","offline_ready":ready,"mock":MOCK,
        "components":{"llm":llm,"stt":stt,"tts":tts},
        "ports":{"gateway":PORT,"llm":LLM_PORT,"stt":STT_PORT,"tts":TTS_PORT}})

async def models(request:Request):
    if MOCK: return JSONResponse({"data":[{"id":"eburon-local-mock","object":"model"}]})
    assert client
    r=await client.get(f"{LLM_URL}/v1/models")
    return Response(r.content,status_code=r.status_code,media_type=r.headers.get("content-type","application/json"))

async def chat(request:Request):
    body=await request.json()
    if MOCK:
        msg=body.get("messages",[{}])[-1].get("content","")
        return JSONResponse({"id":"mock","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":f"Mock local response: {msg}"},"finish_reason":"stop"}]})
    assert client
    r=await client.post(f"{LLM_URL}/v1/chat/completions",json=body)
    return Response(r.content,status_code=r.status_code,media_type=r.headers.get("content-type","application/json"))

async def translate(request:Request):
    body=await request.json()
    text=str(body.get("text","")).strip()
    source=str(body.get("source_language","Auto"))
    target=str(body.get("target_language","English"))
    mode=str(body.get("mode","general"))
    if not text: return err("text is required")
    if MOCK: return JSONResponse({"text":f"[{target}] {text}","source_language":source,"target_language":target,"mode":mode})
    prompt=load_prompt("translator.txt").format(source_language=source,target_language=target)
    if mode=="medical":
        prompt+="\nMedical mode: prioritize clinically accurate terminology while keeping patient-facing phrasing natural."
    payload={"model":"local","messages":[{"role":"system","content":prompt},{"role":"user","content":text}],
             "temperature":0.05,"top_p":0.85,"max_tokens":256,"stream":False}
    assert client
    r=await client.post(f"{LLM_URL}/v1/chat/completions",json=payload)
    if r.status_code>=400: return err(r.text[:500],r.status_code)
    data=r.json()
    return JSONResponse({"text":data["choices"][0]["message"]["content"].strip(),"source_language":source,"target_language":target,"mode":mode})

async def transcribe(request:Request):
    form=await request.form()
    upload=form.get("file")
    language=str(form.get("language","auto"))
    if upload is None or not hasattr(upload,"read"): return err("file is required")
    raw=await upload.read()
    if MOCK: return JSONResponse({"text":"Mock local transcription","language":language})
    assert client
    r=await client.post(f"{STT_URL}/inference",
        files={"file":(getattr(upload,"filename",None) or "audio.webm",raw,getattr(upload,"content_type",None) or "application/octet-stream")},
        data={"language":language,"response_format":"json","temperature":"0.0"})
    if r.status_code>=400: return err(r.text[:500],r.status_code)
    try: data=r.json()
    except Exception: data={"text":r.text.strip()}
    return JSONResponse({"text":str(data.get("text","")).strip(),"language":data.get("language",language),"raw":data})

def silent_wav()->bytes:
    b=io.BytesIO()
    with wave.open(b,"wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(16000); wf.writeframes(b"\x00\x00"*1600)
    return b.getvalue()

async def speech(request:Request):
    body=await request.json()
    text=body.get("input") or body.get("text")
    if not text: return err("input/text is required")
    if MOCK: return Response(silent_wav(),media_type="audio/wav")
    payload={"text":text,"voice":body.get("voice") or os.getenv("TTS_VOICE","M1"),
             "lang":body.get("lang") or body.get("language") or "na",
             "steps":int(os.getenv("TTS_STEPS","6")),"speed":float(os.getenv("TTS_SPEED","1.05")),"response_format":"wav"}
    assert client
    r=await client.post(f"{TTS_URL}/v1/tts",json=payload)
    if r.status_code>=400: return err(r.text[:500],r.status_code)
    return Response(r.content,media_type=r.headers.get("content-type","audio/wav"))

async def live(ws:WebSocket):
    await ws.accept()
    audio_parts=[]
    settings={"source_language":"Auto","target_language":"English","tts_lang":"en","voice":"M1","mode":"general"}
    try:
        await ws.send_json({"type":"ready"})
        while True:
            msg=await ws.receive()
            if msg.get("bytes") is not None:
                audio_parts.append(msg["bytes"])
                await ws.send_json({"type":"audio_buffered","bytes":sum(map(len,audio_parts))})
                continue
            if msg.get("text") is None: continue
            ev=json.loads(msg["text"]); typ=ev.get("type")
            if typ=="configure":
                settings.update({k:v for k,v in ev.items() if k!="type"})
                await ws.send_json({"type":"configured","settings":settings}); continue
            if typ=="clear":
                audio_parts.clear(); await ws.send_json({"type":"cleared"}); continue
            if typ!="commit": continue
            if not audio_parts:
                await ws.send_json({"type":"error","message":"No audio buffered"}); continue
            audio=b"".join(audio_parts); audio_parts.clear(); started=time.perf_counter()
            if MOCK: transcript="Mock local transcription"
            else:
                assert client
                r=await client.post(f"{STT_URL}/inference",files={"file":("utterance.webm",audio,"audio/webm")},
                    data={"language":ev.get("language","auto"),"response_format":"json","temperature":"0.0"})
                if r.status_code>=400:
                    await ws.send_json({"type":"error","stage":"stt","message":r.text[:500]}); continue
                transcript=str(r.json().get("text","")).strip()
            await ws.send_json({"type":"transcript_final","text":transcript,"latency_ms":round((time.perf_counter()-started)*1000)})
            if MOCK: translation=f"[{settings.get('target_language')}] {transcript}"
            else:
                prompt=load_prompt("translator.txt").format(source_language=settings.get("source_language","Auto"),target_language=settings.get("target_language","English"))
                r=await client.post(f"{LLM_URL}/v1/chat/completions",json={"model":"local","messages":[{"role":"system","content":prompt},{"role":"user","content":transcript}],"temperature":0.05,"max_tokens":256,"stream":False})
                if r.status_code>=400:
                    await ws.send_json({"type":"error","stage":"llm","message":r.text[:500]}); continue
                translation=r.json()["choices"][0]["message"]["content"].strip()
            await ws.send_json({"type":"translation_final","text":translation})
            if ev.get("tts",True):
                if MOCK: wav=silent_wav()
                else:
                    r=await client.post(f"{TTS_URL}/v1/tts",json={"text":translation,"voice":settings.get("voice","M1"),"lang":settings.get("tts_lang","na"),"steps":int(os.getenv("TTS_STEPS","6")),"speed":float(os.getenv("TTS_SPEED","1.05")),"response_format":"wav"})
                    if r.status_code>=400:
                        await ws.send_json({"type":"error","stage":"tts","message":r.text[:500]}); continue
                    wav=r.content
                await ws.send_json({"type":"tts_begin","mime":"audio/wav","bytes":len(wav)})
                await ws.send_bytes(wav)
                await ws.send_json({"type":"turn_complete"})
    except WebSocketDisconnect:
        return
    except Exception as e:
        try: await ws.send_json({"type":"error","message":str(e)})
        except Exception: pass

async def static(request:Request):
    path=request.path_params.get("path","") or "index.html"
    candidate=(PUBLIC/path).resolve()
    pub=PUBLIC.resolve()
    if candidate!=pub and pub not in candidate.parents: return Response("Not found",status_code=404)
    if not candidate.is_file(): candidate=PUBLIC/"index.html"
    return FileResponse(candidate,media_type=mimetypes.guess_type(candidate.name)[0])

app=Starlette(routes=[
    Route("/health",health),
    Route("/v1/models",models),
    Route("/v1/chat/completions",chat,methods=["POST"]),
    Route("/v1/translate",translate,methods=["POST"]),
    Route("/v1/audio/transcriptions",transcribe,methods=["POST"]),
    Route("/v1/audio/speech",speech,methods=["POST"]),
    WebSocketRoute("/ws/live",live),
    Route("/{path:path}",static),
],lifespan=lifespan)
