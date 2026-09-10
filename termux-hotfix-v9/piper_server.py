from __future__ import annotations
import json, os, pathlib, shutil, subprocess, tempfile
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

ROOT=pathlib.Path(__file__).resolve().parents[1]
CATALOG=ROOT/"models"/"piper"/"voices.json"
VOICE_ROOT=ROOT/"models"/"piper"/"voices"
PIPER_BIN=os.getenv("PIPER_BIN") or shutil.which("piper") or (str(ROOT/"venv-gateway"/"bin"/"piper") if (ROOT/"venv-gateway"/"bin"/"piper").exists() else str(ROOT/"bin"/"piper"))

def load_catalog():
    if not CATALOG.exists():
        return {}
    try:
        return json.loads(CATALOG.read_text(encoding="utf-8"))
    except Exception:
        return {}

def voice_files(meta):
    files=meta.get("files") or {}
    onnx=None; config=None
    for rel in files:
        if rel.endswith(".onnx") and not rel.endswith(".onnx.json"): onnx=rel
        if rel.endswith(".onnx.json"): config=rel
    return onnx,config

def installed_for(meta):
    onnx,config=voice_files(meta)
    if not onnx or not config: return False
    return (VOICE_ROOT/onnx).is_file() and (VOICE_ROOT/config).is_file()

async def health(request:Request):
    ok=pathlib.Path(PIPER_BIN).is_file() or shutil.which(PIPER_BIN)
    return JSONResponse({"status":"ready" if ok else "unavailable","runtime":"piper","catalog":CATALOG.exists()},status_code=200 if ok else 503)

async def voices(request:Request):
    catalog=load_catalog()
    items=[]
    langs={}
    for key,meta in catalog.items():
        lang=meta.get("language") or {}
        code=lang.get("code") or ""
        family=lang.get("family") or (code.split("_")[0] if code else "")
        label=(lang.get("name_english") or family or code)
        country=lang.get("country_english")
        if country: label=f"{label} ({country})"
        langs[code]={"code":code,"family":family,"name":label}
        items.append({
            "id":key,
            "name":meta.get("name") or key,
            "language":code,
            "family":family,
            "quality":meta.get("quality"),
            "installed":installed_for(meta),
            "num_speakers":meta.get("num_speakers",1),
        })
    items.sort(key=lambda x:(x.get("language") or "",x.get("name") or "",x.get("quality") or ""))
    return JSONResponse({"languages":sorted(langs.values(),key=lambda x:x["name"]),"voices":items})

async def synthesize(request:Request):
    body=await request.json()
    text=str(body.get("text") or body.get("input") or "").strip()
    voice=str(body.get("voice") or "").strip()
    if not text: return JSONResponse({"error":"text is required"},status_code=400)
    if not voice: return JSONResponse({"error":"voice is required"},status_code=400)
    catalog=load_catalog(); meta=catalog.get(voice)
    if not meta: return JSONResponse({"error":"unknown Piper voice"},status_code=404)
    onnx,config=voice_files(meta)
    if not onnx or not config: return JSONResponse({"error":"voice metadata incomplete"},status_code=500)
    model=VOICE_ROOT/onnx; cfg=VOICE_ROOT/config
    if not model.is_file() or not cfg.is_file():
        return JSONResponse({"error":"Piper voice pack is catalogued but not installed on this tablet","voice":voice},status_code=409)
    if not (pathlib.Path(PIPER_BIN).is_file() or shutil.which(PIPER_BIN)):
        return JSONResponse({"error":"Piper runtime is not installed on this tablet"},status_code=503)
    try:
        with tempfile.TemporaryDirectory(prefix="eburon-piper-") as td:
            out=pathlib.Path(td)/"out.wav"
            proc=subprocess.run([PIPER_BIN,"--model",str(model),"--config",str(cfg),"--output_file",str(out)],
                input=text.encode("utf-8"),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
            if proc.returncode!=0:
                return JSONResponse({"error":proc.stderr.decode("utf-8","ignore")[-500:]},status_code=500)
            return Response(out.read_bytes(),media_type="audio/wav")
    except Exception as e:
        return JSONResponse({"error":str(e)},status_code=500)

app=Starlette(routes=[
    Route("/v1/health",health),
    Route("/v1/voices",voices),
    Route("/v1/tts",synthesize,methods=["POST"]),
])
