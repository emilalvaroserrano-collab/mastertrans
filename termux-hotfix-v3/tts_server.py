from __future__ import annotations
import io, os, threading, wave
import numpy as np
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route
from supertonic import TTS

_tts=None
_lock=threading.Lock()

def get_tts():
    global _tts
    if _tts is None:
        with _lock:
            if _tts is None:
                _tts=TTS(model_dir=os.environ["SUPERTONIC_MODEL_DIR"], auto_download=False)
    return _tts

def wav_bytes(audio, sample_rate:int)->bytes:
    arr=np.asarray(audio).squeeze()
    arr=np.clip(arr,-1.0,1.0)
    pcm=(arr*32767.0).astype(np.int16).tobytes()
    buf=io.BytesIO()
    with wave.open(buf,"wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sample_rate); wf.writeframes(pcm)
    return buf.getvalue()

async def health(request:Request):
    try:
        tts=get_tts()
        return JSONResponse({"status":"ready","model":"supertonic-3","voices":list(tts.voice_style_names)})
    except Exception as e:
        return JSONResponse({"status":"error","error":str(e)},status_code=503)

async def synthesize(request:Request):
    body=await request.json()
    text=str(body.get("text") or body.get("input") or "").strip()
    if not text: return JSONResponse({"error":"text is required"},status_code=400)
    voice=str(body.get("voice") or os.getenv("TTS_VOICE","M1"))
    lang=str(body.get("lang") or body.get("language") or "na")
    steps=int(body.get("steps") or os.getenv("TTS_STEPS","6"))
    speed=float(body.get("speed") or os.getenv("TTS_SPEED","1.05"))
    try:
        tts=get_tts()
        style=tts.get_voice_style(voice_name=voice)
        audio,_=tts.synthesize(text,voice_style=style,total_steps=steps,speed=speed,lang=lang)
        return Response(wav_bytes(audio,tts.sample_rate),media_type="audio/wav")
    except Exception as e:
        return JSONResponse({"error":str(e)},status_code=500)

app=Starlette(routes=[
    Route("/v1/health",health),
    Route("/v1/tts",synthesize,methods=["POST"]),
    Route("/v1/audio/speech",synthesize,methods=["POST"]),
])
