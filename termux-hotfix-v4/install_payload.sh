#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}"
export EBURON_ROOT="$ROOT"

red(){ printf '\033[31m%s\033[0m\n' "$*"; }
green(){ printf '\033[32m%s\033[0m\n' "$*"; }
blue(){ printf '\033[36m%s\033[0m\n' "$*"; }
fail_report(){ red "Installation stopped safely. No Offline Ready status was issued."; [ -x "$ROOT/status.sh" ] && "$ROOT/status.sh" || true; }
trap 'red "Install failed at line $LINENO."; fail_report' ERR

case "${PREFIX:-}" in *com.termux*) ;; *) red 'Run this installer inside Termux, not proot Ubuntu.'; exit 1;; esac
ARCH="$(uname -m)"; case "$ARCH" in aarch64|arm64) ;; *) red "This build targets ARM64. Detected: $ARCH"; exit 1;; esac

blue 'Eburon Edge — production Termux installer v4'
blue 'Internet is required only during installation.'

pkg install -y git cmake ninja clang make python python-pip python-numpy python-onnxruntime curl ffmpeg libsndfile libffi openssl >/dev/null

mkdir -p "$ROOT" "$ROOT/logs" "$ROOT/run"
# A repair install must stop old processes BEFORE replacing native executables.
if [ -x "$ROOT/stop.sh" ]; then "$ROOT/stop.sh" >/dev/null 2>&1 || true; fi
pkill -f "$ROOT/bin/llama-server" 2>/dev/null || true
pkill -f "$ROOT/bin/whisper-server" 2>/dev/null || true
pkill -f "uvicorn gateway.tts_server:app" 2>/dev/null || true
pkill -f "uvicorn gateway.server:app" 2>/dev/null || true
sleep 1

if [ "$SELF_DIR" != "$ROOT" ]; then cp -a "$SELF_DIR"/. "$ROOT"/; fi
chmod +x "$ROOT"/*.sh "$ROOT"/scripts/*.sh

blue '[1/6] Native engines'
"$ROOT/scripts/build_engines.sh"

blue '[2/6] Local LLM + STT models'
"$ROOT/scripts/download_models.sh"

blue '[3/6] Eburon gateway'
rm -rf "$ROOT/venv-gateway"
python -m venv --system-site-packages "$ROOT/venv-gateway"
"$ROOT/venv-gateway/bin/pip" -q install -U pip wheel setuptools
"$ROOT/venv-gateway/bin/pip" -q install -r "$ROOT/gateway/requirements.txt"
"$ROOT/venv-gateway/bin/python" - <<'PYG'
import starlette, uvicorn, httpx, websockets
print("  ✓ gateway Python runtime ready")
PYG

blue '[4/6] Supertonic 3'
python - <<'PYORT'
import numpy as np, onnxruntime as ort
print("  ✓ NumPy", np.__version__, "| ONNX Runtime", ort.__version__)
PYORT
rm -rf "$ROOT/venv-tts"
python -m venv --system-site-packages "$ROOT/venv-tts"
"$ROOT/venv-tts/bin/pip" -q install -U pip wheel setuptools
"$ROOT/venv-tts/bin/pip" -q install 'soundfile>=0.12' 'starlette>=1.0,<2' 'uvicorn>=0.30,<1'
"$ROOT/venv-tts/bin/pip" -q install --no-deps 'git+https://github.com/supertone-oss-archive/supertonic-py.git@df0f9686dac7fbbde391b759e2ee5286a3737622'

MODEL_DIR="$ROOT/models/supertonic-3"
mkdir -p "$MODEL_DIR/onnx" "$MODEL_DIR/voice_styles"
HF_BASE="https://huggingface.co/Supertone/supertonic-3/resolve/724fb5abbf5502583fb520898d45929e62f02c0b"
download_asset(){
  local rel="$1" dest="$MODEL_DIR/$1"
  [ -s "$dest" ] && return 0
  echo "  downloading $rel"
  mkdir -p "$(dirname "$dest")"
  curl -fL --silent --show-error --retry 6 --retry-delay 2 --retry-all-errors "$HF_BASE/$rel?download=true" -o "$dest.part"
  mv "$dest.part" "$dest"
}
for f in duration_predictor.onnx text_encoder.onnx vector_estimator.onnx vocoder.onnx tts.json unicode_indexer.json; do download_asset "onnx/$f"; done
for v in F1 F2 F3 F4 F5 M1 M2 M3 M4 M5; do download_asset "voice_styles/$v.json"; done

SUPERTONIC_MODEL_DIR="$MODEL_DIR" "$ROOT/venv-tts/bin/python" - <<'PYTTS'
import os, soundfile as sf, onnxruntime as ort
from supertonic import TTS
tts=TTS(model_dir=os.environ["SUPERTONIC_MODEL_DIR"], auto_download=False)
style=tts.get_voice_style(voice_name="M1")
wav,duration=tts.synthesize("Eburon local voice verification.",voice_style=style,total_steps=2,speed=1.05,lang="en")
out=os.path.expanduser("~/.eburon-edge/logs/install-tts-test.wav")
sf.write(out,wav.squeeze(),tts.sample_rate)
print("  ✓ Supertonic synthesis", round(float(duration[0]),2), "sec")
PYTTS
[ -s "$ROOT/logs/install-tts-test.wav" ]

blue '[5/6] Background/reboot launcher'
"$ROOT/scripts/install_boot.sh" >/dev/null
echo '  ✓ boot launcher installed'

blue '[6/6] Start + verify all local services'
"$ROOT/stop.sh" >/dev/null 2>&1 || true
"$ROOT/start.sh"
"$ROOT/scripts/smoke_test.sh"

green '=================================================='
green ' EBURON EDGE: OFFLINE READY'
green ' STT + LLM + TTS + Gateway passed local tests.'
green ' Wi-Fi may now be disabled.'
green '=================================================='
URL="http://127.0.0.1:8850"
termux-open-url "$URL" 2>/dev/null || am start -a android.intent.action.VIEW -d "$URL" >/dev/null 2>&1 || true
