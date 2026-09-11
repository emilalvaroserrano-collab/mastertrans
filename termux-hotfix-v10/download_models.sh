#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}"
mkdir -p "$ROOT/models"
MODEL="$ROOT/models/ggml-base.bin"
if [ -s "$MODEL" ]; then
  echo 'Already present: ggml-base.bin'
else
  echo 'Downloading whisper base model…'
  curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors     "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin?download=true" -o "$MODEL.part"
  mv "$MODEL.part" "$MODEL"
fi
[ -s "$MODEL" ] || { echo 'Whisper model missing'; exit 1; }
