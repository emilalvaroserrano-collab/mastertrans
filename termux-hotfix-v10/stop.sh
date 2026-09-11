#!/data/data/com.termux/files/usr/bin/bash
set -u
ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}"
for p in "$ROOT"/run/*.pid; do [ -f "$p" ] || continue; pid="$(cat "$p" 2>/dev/null || true)"; [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -f "$p"; done
sleep 1
pkill -f "$ROOT/translator-server/server.mjs" 2>/dev/null || true
pkill -f "$ROOT/bin/whisper-server" 2>/dev/null || true
pkill -f "uvicorn gateway.tts_server:app" 2>/dev/null || true
pkill -f "uvicorn gateway.piper_server:app" 2>/dev/null || true
pkill -f "$ROOT/kokoro-server/server.mjs" 2>/dev/null || true
pkill -f "uvicorn gateway.server:app" 2>/dev/null || true
command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock || true
