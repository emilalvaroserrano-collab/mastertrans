#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
PAYLOAD="${1:?payload root required}"
BASE="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/b6520a5179f951c21a41ad012537b03cca5a5343"
echo "[compat-v8] Applying reviewed realtime voice pipeline"

get(){ curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors "$1" -o "$2"; }

# Stable runtime/install pieces
get "$BASE/termux-hotfix-v4/requirements.txt" "$PAYLOAD/gateway/requirements.txt"
get "$BASE/termux-hotfix-v4/tts_server.py" "$PAYLOAD/gateway/tts_server.py"
get "$BASE/termux-hotfix-v4/build_engines.sh" "$PAYLOAD/scripts/build_engines.sh"
get "$BASE/termux-hotfix-v4/stop.sh" "$PAYLOAD/stop.sh"
get "$BASE/termux-hotfix-v4/install_payload.sh" "$PAYLOAD/install.sh"

# Reviewed realtime runtime
get "$BASE/termux-hotfix-v8/start.sh" "$PAYLOAD/start.sh"
get "$BASE/termux-hotfix-v8/server.py" "$PAYLOAD/gateway/server.py"
get "$BASE/termux-hotfix-v8/smoke_test.sh" "$PAYLOAD/scripts/smoke_test.sh"

# Exact UI + realtime controller
mkdir -p "$PAYLOAD/public"
get "$BASE/termux-hotfix-v6/index.html" "$PAYLOAD/public/index.html"
get "$BASE/termux-hotfix-v8/translate.html" "$PAYLOAD/public/translate.html"
get "$BASE/termux-hotfix-v6/settings.html" "$PAYLOAD/public/settings.html"
get "$BASE/termux-hotfix-v6/manifest.webmanifest" "$PAYLOAD/public/manifest.webmanifest"
get "$BASE/termux-hotfix-v8/service-worker.js" "$PAYLOAD/public/service-worker.js"

chmod +x "$PAYLOAD/install.sh" "$PAYLOAD/start.sh" "$PAYLOAD/stop.sh" "$PAYLOAD/scripts/"*.sh

# Fail before touching the live install if generated files are malformed.
bash -n "$PAYLOAD/install.sh"
bash -n "$PAYLOAD/start.sh"
bash -n "$PAYLOAD/stop.sh"
bash -n "$PAYLOAD/scripts/build_engines.sh"
bash -n "$PAYLOAD/scripts/smoke_test.sh"
python -m py_compile "$PAYLOAD/gateway/server.py" "$PAYLOAD/gateway/tts_server.py"

grep -q -- '--convert' "$PAYLOAD/start.sh" || { echo "whisper --convert missing"; exit 1; }
grep -q '/ws/live' "$PAYLOAD/public/translate.html" || { echo "realtime WebSocket missing"; exit 1; }
grep -q "type:'commit'" "$PAYLOAD/public/translate.html" || { echo "utterance commit missing"; exit 1; }
grep -q 'v1/chat/completions' "$PAYLOAD/gateway/server.py" || { echo "LLM translator route missing"; exit 1; }
grep -q 'tts_begin' "$PAYLOAD/gateway/server.py" || { echo "TTS WebSocket output missing"; exit 1; }

echo "[compat-v8] Runtime, frontend, STT conversion, translator, and TTS wiring verified"
