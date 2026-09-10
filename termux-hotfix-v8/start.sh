#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}"; export EBURON_ROOT="$ROOT"
source "$ROOT/config/eburon.env"
mkdir -p "$ROOT/logs" "$ROOT/run"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true

quiet_ok(){ curl -fLs --connect-timeout 1 --max-time 2 "$1" >/dev/null 2>&1; }
tail_fail(){ local name="$1"; echo; echo "ERROR: $name failed to become ready."; echo "--- $name.log ---"; tail -n 40 "$ROOT/logs/$name.log" 2>/dev/null || true; }

start_proc(){
  local name="$1" cmd="$2"
  echo "Starting $name…"
  : > "$ROOT/logs/$name.log"
  nohup bash -lc "$cmd" >>"$ROOT/logs/$name.log" 2>&1 &
  echo $! >"$ROOT/run/$name.pid"
}

wait_ready(){
  local name="$1" url="$2" timeout="$3" pid
  pid="$(cat "$ROOT/run/$name.pid" 2>/dev/null || true)"
  for _ in $(seq 1 "$timeout"); do
    if quiet_ok "$url"; then echo "  ✓ $name ready"; return 0; fi
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then tail_fail "$name"; return 1; fi
    sleep 1
  done
  tail_fail "$name"; return 1
}

if quiet_ok "http://127.0.0.1:$EBURON_LLM_PORT/health"; then echo '  ✓ llm already ready'; else
  start_proc llm "exec '$ROOT/bin/llama-server' -m '$ROOT/models/$LLM_MODEL_NAME' --host 127.0.0.1 --port '$EBURON_LLM_PORT' -c '$LLM_CONTEXT' -t '$LLM_THREADS' -b '$LLM_BATCH' --jinja"
  wait_ready llm "http://127.0.0.1:$EBURON_LLM_PORT/health" 90
fi

if quiet_ok "http://127.0.0.1:$EBURON_STT_PORT/"; then
  echo '  ✓ stt already ready'
else
  # Browser sends WebM/Opus. --convert is required so whisper.cpp invokes local ffmpeg
  # and converts each utterance to WAV before inference.
  start_proc stt "exec '$ROOT/bin/whisper-server' --host 127.0.0.1 --port '$EBURON_STT_PORT' -m '$ROOT/models/$WHISPER_MODEL_NAME' -l auto -t '$WHISPER_THREADS' --convert -ng -sns"
  wait_ready stt "http://127.0.0.1:$EBURON_STT_PORT/" 90
fi

if quiet_ok "http://127.0.0.1:$EBURON_TTS_PORT/v1/health"; then echo '  ✓ tts already ready'; else
  start_proc tts "source '$ROOT/venv-tts/bin/activate'; cd '$ROOT'; SUPERTONIC_MODEL_DIR='$ROOT/models/supertonic-3' exec uvicorn gateway.tts_server:app --host 127.0.0.1 --port '$EBURON_TTS_PORT' --log-level warning"
  wait_ready tts "http://127.0.0.1:$EBURON_TTS_PORT/v1/health" 120
fi

if quiet_ok "http://127.0.0.1:$EBURON_GATEWAY_PORT/health"; then echo '  ✓ gateway already ready'; else
  start_proc gateway "source '$ROOT/venv-gateway/bin/activate'; cd '$ROOT'; exec uvicorn gateway.server:app --host 127.0.0.1 --port '$EBURON_GATEWAY_PORT' --log-level warning"
  wait_ready gateway "http://127.0.0.1:$EBURON_GATEWAY_PORT/health" 45
fi

H="$(curl -fLs --max-time 5 "http://127.0.0.1:$EBURON_GATEWAY_PORT/health")"
if ! printf '%s' "$H" | grep -Eq '"offline_ready"[[:space:]]*:[[:space:]]*true'; then
  echo 'ERROR: gateway is up but one or more engines are not ready.'
  printf '%s\n' "$H"
  exit 1
fi
echo "Eburon Edge READY at http://127.0.0.1:$EBURON_GATEWAY_PORT"
