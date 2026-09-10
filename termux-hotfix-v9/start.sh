#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}"; export EBURON_ROOT="$ROOT"
source "$ROOT/config/eburon.env"
export EBURON_PIPER_PORT="${EBURON_PIPER_PORT:-8854}"
export EBURON_KOKORO_PORT="${EBURON_KOKORO_PORT:-8855}"
mkdir -p "$ROOT/logs" "$ROOT/run"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true

quiet_ok(){ curl -fLs --connect-timeout 1 --max-time 2 "$1" >/dev/null 2>&1; }
tail_fail(){ local name="$1"; echo; echo "ERROR: $name failed to become ready."; echo "--- $name.log ---"; tail -n 40 "$ROOT/logs/$name.log" 2>/dev/null || true; }
start_proc(){ local name="$1" cmd="$2"; echo "Starting $name…"; : >"$ROOT/logs/$name.log"; nohup bash -lc "$cmd" >>"$ROOT/logs/$name.log" 2>&1 & echo $! >"$ROOT/run/$name.pid"; }
wait_ready(){ local name="$1" url="$2" timeout="$3" pid; pid="$(cat "$ROOT/run/$name.pid" 2>/dev/null || true)"; for _ in $(seq 1 "$timeout"); do if quiet_ok "$url"; then echo "  ✓ $name ready"; return 0; fi; if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then tail_fail "$name"; return 1; fi; sleep 1; done; tail_fail "$name"; return 1; }

if quiet_ok "http://127.0.0.1:$EBURON_LLM_PORT/health"; then echo '  ✓ llm already ready'; else
  start_proc llm "exec '$ROOT/bin/llama-server' -m '$ROOT/models/$LLM_MODEL_NAME' --host 127.0.0.1 --port '$EBURON_LLM_PORT' -c '$LLM_CONTEXT' -t '$LLM_THREADS' -b '$LLM_BATCH' --jinja"
  wait_ready llm "http://127.0.0.1:$EBURON_LLM_PORT/health" 90
fi

if quiet_ok "http://127.0.0.1:$EBURON_STT_PORT/"; then echo '  ✓ stt already ready'; else
  start_proc stt "exec '$ROOT/bin/whisper-server' --host 127.0.0.1 --port '$EBURON_STT_PORT' -m '$ROOT/models/$WHISPER_MODEL_NAME' -l auto -t '$WHISPER_THREADS' --convert -ng -sns"
  wait_ready stt "http://127.0.0.1:$EBURON_STT_PORT/" 90
fi

if quiet_ok "http://127.0.0.1:$EBURON_TTS_PORT/v1/health"; then echo '  ✓ supertonic already ready'; else
  start_proc supertonic "source '$ROOT/venv-tts/bin/activate'; cd '$ROOT'; SUPERTONIC_MODEL_DIR='$ROOT/models/supertonic-3' exec uvicorn gateway.tts_server:app --host 127.0.0.1 --port '$EBURON_TTS_PORT' --log-level warning"
  wait_ready supertonic "http://127.0.0.1:$EBURON_TTS_PORT/v1/health" 120
fi

# Optional Piper catalog/server. It may report unavailable when the runtime itself could not be installed.
if ! quiet_ok "http://127.0.0.1:$EBURON_PIPER_PORT/v1/voices"; then
  start_proc piper "source '$ROOT/venv-gateway/bin/activate'; cd '$ROOT'; exec uvicorn gateway.piper_server:app --host 127.0.0.1 --port '$EBURON_PIPER_PORT' --log-level warning"
  for _ in $(seq 1 15); do quiet_ok "http://127.0.0.1:$EBURON_PIPER_PORT/v1/voices" && { echo '  ✓ piper catalog server ready'; break; }; sleep 1; done
fi

# Optional Kokoro JS server. Do not fail the core translator if Android WASM/node runtime is unavailable.
if [ -d "$ROOT/kokoro-server/node_modules/kokoro-js" ] && ! quiet_ok "http://127.0.0.1:$EBURON_KOKORO_PORT/v1/health"; then
  start_proc kokoro "cd '$ROOT/kokoro-server'; EBURON_KOKORO_PORT='$EBURON_KOKORO_PORT' exec node server.mjs"
  for _ in $(seq 1 45); do
    if quiet_ok "http://127.0.0.1:$EBURON_KOKORO_PORT/v1/health"; then echo '  ✓ kokoro ready'; break; fi
    pid="$(cat "$ROOT/run/kokoro.pid" 2>/dev/null || true)"; [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null && break
    sleep 1
  done
fi

if quiet_ok "http://127.0.0.1:$EBURON_GATEWAY_PORT/health"; then echo '  ✓ gateway already ready'; else
  start_proc gateway "source '$ROOT/venv-gateway/bin/activate'; cd '$ROOT'; exec uvicorn gateway.server:app --host 127.0.0.1 --port '$EBURON_GATEWAY_PORT' --log-level warning"
  wait_ready gateway "http://127.0.0.1:$EBURON_GATEWAY_PORT/health" 45
fi

H="$(curl -fLs --max-time 5 "http://127.0.0.1:$EBURON_GATEWAY_PORT/health")"
printf '%s' "$H" | grep -Eq '"offline_ready"[[:space:]]*:[[:space:]]*true' || { echo 'ERROR: core STT/LLM/Supertonic stack is not ready.'; printf '%s\n' "$H"; exit 1; }
echo "Eburon Edge READY at http://127.0.0.1:$EBURON_GATEWAY_PORT"
