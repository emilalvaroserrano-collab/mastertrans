#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}"
export EBURON_ROOT="$ROOT"

red(){ printf '\033[31m%s\033[0m\n' "$*"; }
green(){ printf '\033[32m%s\033[0m\n' "$*"; }
blue(){ printf '\033[36m%s\033[0m\n' "$*"; }
warn(){ printf '\033[33m%s\033[0m\n' "$*"; }
fail_report(){ red "Installation stopped safely. No Offline Ready status was issued."; [ -x "$ROOT/status.sh" ] && "$ROOT/status.sh" || true; }
trap 'red "Install failed at line $LINENO."; fail_report' ERR

case "${PREFIX:-}" in *com.termux*) ;; *) red 'Run this installer inside Termux, not proot Ubuntu.'; exit 1;; esac
ARCH="$(uname -m)"; case "$ARCH" in aarch64|arm64) ;; *) red "This build targets ARM64. Detected: $ARCH"; exit 1;; esac

blue 'Eburon Edge — production Termux installer v9'
blue 'Internet is required only during installation.'

pkg install -y git cmake ninja clang make python python-pip python-numpy python-onnxruntime curl ffmpeg libsndfile libffi openssl >/dev/null

mkdir -p "$ROOT" "$ROOT/logs" "$ROOT/run"
if [ -x "$ROOT/stop.sh" ]; then "$ROOT/stop.sh" >/dev/null 2>&1 || true; fi
pkill -f "$ROOT/bin/llama-server" 2>/dev/null || true
pkill -f "$ROOT/bin/whisper-server" 2>/dev/null || true
pkill -f "uvicorn gateway.tts_server:app" 2>/dev/null || true
pkill -f "uvicorn gateway.piper_server:app" 2>/dev/null || true
pkill -f "node server.mjs" 2>/dev/null || true
pkill -f "uvicorn gateway.server:app" 2>/dev/null || true
sleep 1

if [ "$SELF_DIR" != "$ROOT" ]; then cp -a "$SELF_DIR"/. "$ROOT"/; fi
chmod +x "$ROOT"/*.sh "$ROOT"/scripts/*.sh

blue '[1/7] Native engines'
"$ROOT/scripts/build_engines.sh"

blue '[2/7] Local LLM + STT models'
"$ROOT/scripts/download_models.sh"

blue '[3/7] Eburon gateway'
rm -rf "$ROOT/venv-gateway"
python -m venv --system-site-packages "$ROOT/venv-gateway"
"$ROOT/venv-gateway/bin/pip" -q install -U pip wheel setuptools
"$ROOT/venv-gateway/bin/pip" -q install -r "$ROOT/gateway/requirements.txt"
"$ROOT/venv-gateway/bin/python" - <<'PYG'
import starlette, uvicorn, httpx, websockets
print("  ✓ gateway Python runtime ready")
PYG

blue '[4/7] Supertonic 3'
python - <<'PYORT'
import numpy as np, onnxruntime as ort
print("  ✓ NumPy", np.__version__, "| ONNX Runtime", ort.__version__)
PYORT
rm -rf "$ROOT/venv-tts"
python -m venv --system-site-packages "$ROOT/venv-tts"
"$ROOT/venv-tts/bin/pip" -q install -U pip wheel setuptools
"$ROOT/venv-tts/bin/pip" -q install 'soundfile>=0.12' 'starlette>=1.0,<2' 'uvicorn>=0.30,<1'
"$ROOT/venv-tts/bin/pip" -q install --no-deps 'git+https://github.com/supertone-oss-archive/supertonic-py.git@df0f9686dac7fbbde391b759e2ee5286a3737622'

MODEL_DIR="$ROOT/models/supertonic-3"; mkdir -p "$MODEL_DIR/onnx" "$MODEL_DIR/voice_styles"
HF_BASE="https://huggingface.co/Supertone/supertonic-3/resolve/724fb5abbf5502583fb520898d45929e62f02c0b"
download_asset(){ local rel="$1" dest="$MODEL_DIR/$1"; [ -s "$dest" ] && return 0; echo "  downloading $rel"; mkdir -p "$(dirname "$dest")"; curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors "$HF_BASE/$rel?download=true" -o "$dest.part"; mv "$dest.part" "$dest"; }
for f in duration_predictor.onnx text_encoder.onnx vector_estimator.onnx vocoder.onnx tts.json unicode_indexer.json; do download_asset "onnx/$f"; done
for v in F1 F2 F3 F4 F5 M1 M2 M3 M4 M5; do download_asset "voice_styles/$v.json"; done
SUPERTONIC_MODEL_DIR="$MODEL_DIR" "$ROOT/venv-tts/bin/python" - <<'PYTTS'
import os, soundfile as sf
from supertonic import TTS
tts=TTS(model_dir=os.environ["SUPERTONIC_MODEL_DIR"], auto_download=False)
style=tts.get_voice_style(voice_name="M1")
wav,duration=tts.synthesize("Eburon local voice verification.",voice_style=style,total_steps=2,speed=1.05,lang="en")
out=os.path.expanduser("~/.eburon-edge/logs/install-tts-test.wav"); sf.write(out,wav.squeeze(),tts.sample_rate)
print("  ✓ Supertonic synthesis", round(float(duration[0]),2), "sec")
PYTTS

blue '[5/7] Piper catalog + local default voice packs'
PIPER_ROOT="$ROOT/models/piper"; mkdir -p "$PIPER_ROOT/voices"
curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors   "https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json?download=true" -o "$PIPER_ROOT/voices.json"
PIPER_DEB="$ROOT/logs/piper-tts-cli-1.2.deb"
if ! command -v piper >/dev/null 2>&1; then
  pkg install -y espeak >/dev/null 2>&1 || true
  if curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors     "https://github.com/gyroing/piper-tts-for-termux/releases/download/v1.2-android-termux/piper-tts-cli-1.2.deb" -o "$PIPER_DEB"; then
    printf '%s  %s\n' "ebde80d388bf11df0dfc0fe55d09a0263a286b4d81dfb387c5f90d023c8c812f" "$PIPER_DEB" | sha256sum -c - >/dev/null
    if apt install -y "$PIPER_DEB" >"$ROOT/logs/piper-install.log" 2>&1; then
      echo '  ✓ Piper Android/Termux runtime installed'
    else
      warn '  ! Piper Android package install failed; catalog remains available and Supertonic stays default.'
    fi
  else
    warn '  ! Piper Android package download failed; catalog remains available.'
  fi
else
  echo '  ✓ Piper runtime already installed'
fi
PIPER_HF="https://huggingface.co/rhasspy/piper-voices/resolve/main"
download_piper(){ local rel="$1"; local dest="$PIPER_ROOT/voices/$rel"; [ -s "$dest" ] && return 0; mkdir -p "$(dirname "$dest")"; curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors "$PIPER_HF/$rel?download=true" -o "$dest.part"; mv "$dest.part" "$dest"; }
download_piper "en/en_US/lessac/medium/en_US-lessac-medium.onnx"
download_piper "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
download_piper "nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx"
download_piper "nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx.json"
echo '  ✓ Piper full voice catalog + EN/NL-BE default packs installed'

blue '[6/7] Kokoro JS optional local server'
if pkg install -y nodejs-lts >/dev/null 2>&1 || pkg install -y nodejs >/dev/null 2>&1; then
  mkdir -p "$ROOT/kokoro-server"
  cp "$ROOT/gateway/kokoro_server.mjs" "$ROOT/kokoro-server/server.mjs"
  cat >"$ROOT/kokoro-server/package.json" <<'JSON'
{"type":"module","private":true,"dependencies":{"kokoro-js":"1.2.1"}}
JSON
  if (cd "$ROOT/kokoro-server" && npm install --silent --no-audit --no-fund) >"$ROOT/logs/kokoro-install.log" 2>&1; then
    echo '  ✓ Kokoro JS package installed'
  else
    warn '  ! Kokoro JS package install failed; provider will stay optional.'
  fi
else
  warn '  ! Node.js unavailable; Kokoro provider will stay optional.'
fi

blue '[7/7] Background launcher + start + real smoke tests'
"$ROOT/scripts/install_boot.sh" >/dev/null
"$ROOT/stop.sh" >/dev/null 2>&1 || true
"$ROOT/start.sh"
"$ROOT/scripts/smoke_test.sh"

green '=================================================='
green ' EBURON EDGE: OFFLINE READY'
green ' Core STT + LLM + Supertonic passed local tests.'
green ' Piper/Kokoro availability is shown in Settings.'
green ' Wi-Fi may now be disabled for installed voice packs.'
green '=================================================='
URL="http://127.0.0.1:8850"
termux-open-url "$URL" 2>/dev/null || am start -a android.intent.action.VIEW -d "$URL" >/dev/null 2>&1 || true
