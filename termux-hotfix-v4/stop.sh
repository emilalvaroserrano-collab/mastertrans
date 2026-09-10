#!/data/data/com.termux/files/usr/bin/bash
set -u
ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}"
for p in "$ROOT"/run/*.pid; do
  [ -f "$p" ] || continue
  pid="$(cat "$p" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; fi
  rm -f "$p"
done
sleep 1
pkill -f "$ROOT/bin/llama-server" 2>/dev/null || true
pkill -f "$ROOT/bin/whisper-server" 2>/dev/null || true
pkill -f "uvicorn gateway.tts_server:app" 2>/dev/null || true
pkill -f "uvicorn gateway.server:app" 2>/dev/null || true
sleep 1
command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock || true
