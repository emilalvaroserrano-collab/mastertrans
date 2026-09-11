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

blue 'Eburon Edge — production Termux installer v10'
blue 'Internet is required only during installation.'

pkg install -y git cmake ninja clang make python python-pip python-numpy python-onnxruntime curl ffmpeg libsndfile libffi openssl >/dev/null
if ! pkg install -y nodejs-lts >/dev/null 2>&1; then pkg install -y nodejs >/dev/null; fi

mkdir -p "$ROOT" "$ROOT/logs" "$ROOT/run"
if [ -x "$ROOT/stop.sh" ]; then "$ROOT/stop.sh" >/dev/null 2>&1 || true; fi
pkill -f "$ROOT/bin/llama-server" 2>/dev/null || true
pkill -f "$ROOT/translator-server/server.mjs" 2>/dev/null || true
pkill -f "$ROOT/bin/whisper-server" 2>/dev/null || true
pkill -f "uvicorn gateway.tts_server:app" 2>/dev/null || true
pkill -f "uvicorn gateway.piper_server:app" 2>/dev/null || true
pkill -f "node server.mjs" 2>/dev/null || true
pkill -f "uvicorn gateway.server:app" 2>/dev/null || true
sleep 1

if [ "$SELF_DIR" != "$ROOT" ]; then cp -a "$SELF_DIR"/. "$ROOT"/; fi
chmod +x "$ROOT"/*.sh "$ROOT"/scripts/*.sh

blue '[1/8] Native STT engine'
"$ROOT/scripts/build_engines.sh"

blue '[2/8] Local STT model'
"$ROOT/scripts/download_models.sh"

blue '[3/8] Translation-only engine (M2M100 INT8/Q8)'
mkdir -p "$ROOT/translator-server" "$ROOT/models/m2m100-cache"
cp "$ROOT/gateway/translator_server.mjs" "$ROOT/translator-server/server.mjs"
cat >"$ROOT/translator-server/package.json" <<'JSON'
{"type":"module","private":true,"dependencies":{"@huggingface/transformers":"4.2.0"}}
JSON
if ! (cd "$ROOT/translator-server" && npm install --force --ignore-scripts --omit=optional --no-audit --no-fund) >"$ROOT/logs/translator-install.log" 2>&1; then
  red 'Transformers.js install failed. Last log lines:'
  tail -n 60 "$ROOT/logs/translator-install.log" || true
  exit 1
fi
echo '  ✓ Transformers.js web/WASM runtime installed'
if (cd "$ROOT/translator-server" && EBURON_TRANSLATOR_CACHE="$ROOT/models/m2m100-cache" EBURON_OFFLINE=0 timeout 420 node --input-type=module <<'JS'
import { env, pipeline } from "./node_modules/@huggingface/transformers/dist/transformers.web.js";
import path from "node:path";
env.cacheDir=process.env.EBURON_TRANSLATOR_CACHE;
env.allowLocalModels=true;
env.allowRemoteModels=true;
const t=await pipeline("translation","huggingworld/m2m100_418M",{dtype:"q8",device:"wasm"});
const out=await t("Good morning",{src_lang:"en",tgt_lang:"nl",max_new_tokens:32,num_beams:1,do_sample:false});
if(!out?.[0]?.translation_text) throw new Error("M2M100 warmup produced no translation");
console.log("  ✓ M2M100 translation-only engine cached and verified:",out[0].translation_text);
JS
); then
  rm -f "$ROOT/models/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf"
else
  red 'Translation-only engine warmup failed. Keeping Wi-Fi on and stopping install.'
  exit 1
fi

blue '[4/8] Eburon gateway'
rm -rf "$ROOT/venv-gateway"
python -m venv --system-site-packages "$ROOT/venv-gateway"
"$ROOT/venv-gateway/bin/pip" -q install -U pip wheel setuptools
"$ROOT/venv-gateway/bin/pip" -q install -r "$ROOT/gateway/requirements.txt"
"$ROOT/venv-gateway/bin/python" - <<'PYG'
import starlette, uvicorn, httpx, websockets
print("  ✓ gateway Python runtime ready")
PYG

blue '[5/8] Supertonic 3'
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

blue '[6/8] Piper catalog + local default voice packs'
PIPER_ROOT="$ROOT/models/piper"; mkdir -p "$PIPER_ROOT/voices"
curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors   "https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json?download=true" -o "$PIPER_ROOT/voices.json"
PIPER_DEB="$ROOT/logs/piper-tts-cli-1.2.deb"
# Do not install the third-party Piper .deb into the global Termux prefix:
# it bundles libonnxruntime.so and conflicts with Termux python-onnxruntime used by Supertonic.
if command -v piper >/dev/null 2>&1; then
  echo '  ✓ Piper runtime already installed'
else
  warn '  ! Piper native runtime deferred: global .deb would overwrite Termux ONNX Runtime.'
  warn '    Voice catalog/default packs are kept; Supertonic remains the safe default.'
fi
PIPER_HF="https://huggingface.co/rhasspy/piper-voices/resolve/main"
download_piper(){ local rel="$1"; local dest="$PIPER_ROOT/voices/$rel"; [ -s "$dest" ] && return 0; mkdir -p "$(dirname "$dest")"; curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors "$PIPER_HF/$rel?download=true" -o "$dest.part"; mv "$dest.part" "$dest"; }
download_piper "en/en_US/lessac/medium/en_US-lessac-medium.onnx"
download_piper "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
download_piper "nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx"
download_piper "nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx.json"
echo '  ✓ Piper full voice catalog + EN/NL-BE default packs installed'

blue '[7/8] Kokoro JS optional local server'
if pkg install -y nodejs-lts >/dev/null 2>&1 || pkg install -y nodejs >/dev/null 2>&1; then
  mkdir -p "$ROOT/kokoro-server"
  cp "$ROOT/gateway/kokoro_server.mjs" "$ROOT/kokoro-server/server.mjs"
  cat >"$ROOT/kokoro-server/package.json" <<'JSON'
{"type":"module","private":true,"dependencies":{"kokoro-js":"1.2.1"}}
JSON
  if (cd "$ROOT/kokoro-server" && npm install --silent --no-audit --no-fund) >"$ROOT/logs/kokoro-install.log" 2>&1; then
    echo '  ✓ Kokoro JS package installed'
    if (cd "$ROOT/kokoro-server" && timeout 240 node --input-type=module <<'JS'
import { KokoroTTS } from "kokoro-js";
const tts=await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX",{dtype:"q8",device:"wasm"});
await tts.generate("Eburon Kokoro offline cache verification.",{voice:"af_heart"});
console.log("kokoro warmup ok");
JS
    ) >"$ROOT/logs/kokoro-warmup.log" 2>&1; then
      echo '  ✓ Kokoro model cached for offline use'
    else
      warn '  ! Kokoro package installed but model warmup failed; provider will remain optional until it can initialize.'
    fi
  else
    warn '  ! Kokoro JS package install failed; provider will stay optional.'
  fi
else
  warn '  ! Node.js unavailable; Kokoro provider will stay optional.'
fi

blue '[8/8] Background launcher + start + real smoke tests'
"$ROOT/scripts/install_boot.sh" >/dev/null
"$ROOT/stop.sh" >/dev/null 2>&1 || true
"$ROOT/start.sh"
"$ROOT/scripts/smoke_test.sh"

green '=================================================='
green ' EBURON EDGE: OFFLINE READY'
green ' Core STT + translation-only engine + Supertonic passed local tests.'
green ' Piper/Kokoro availability is shown in Settings.'
green ' Wi-Fi may now be disabled for installed voice packs.'
green '=================================================='
URL="http://127.0.0.1:8850"
termux-open-url "$URL" 2>/dev/null || am start -a android.intent.action.VIEW -d "$URL" >/dev/null 2>&1 || true
