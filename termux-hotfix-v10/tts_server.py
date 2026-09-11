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
    # Health must be cheap. Do NOT load the ~400MB ONNX model here; the start
    # script polls this endpoint repeatedly and model initialization can be
    # killed or interrupted on Android. Actual synthesis remains the readiness test.
    try:
        model_dir=os.environ.get("SUPERTONIC_MODEL_DIR","")
        required=[
            "onnx/duration_predictor.onnx","onnx/text_encoder.onnx",
            "onnx/vector_estimator.onnx","onnx/vocoder.onnx",
            "onnx/tts.json","onnx/unicode_indexer.json",
            "voice_styles/M1.json",
        ]
        missing=[p for p in required if not os.path.isfile(os.path.join(model_dir,p))]
        if missing:
            return JSONResponse({"status":"error","model":"supertonic-3","missing":missing},status_code=503)
        return JSONResponse({
            "status":"ready",
            "model":"supertonic-3",
            "loaded":_tts is not None,
            "voices":["F1","F2","F3","F4","F5","M1","M2","M3","M4","M5"],
        })
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
