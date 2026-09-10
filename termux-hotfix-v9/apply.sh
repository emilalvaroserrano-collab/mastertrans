#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
PAYLOAD="${1:?payload root required}"
BASE="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/743380182b99c8b9fcf6e6ff953918ca475379f4"
echo "[compat-v9] Applying provider-aware realtime translator + voice settings"

get(){ curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors "$1" -o "$2"; }

# Stable runtime/build pieces
get "$BASE/termux-hotfix-v4/requirements.txt" "$PAYLOAD/gateway/requirements.txt"
get "$BASE/termux-hotfix-v4/tts_server.py" "$PAYLOAD/gateway/tts_server.py"
get "$BASE/termux-hotfix-v4/build_engines.sh" "$PAYLOAD/scripts/build_engines.sh"
get "$BASE/termux-hotfix-v4/stop.sh" "$PAYLOAD/stop.sh"

# v9 runtime
get "$BASE/termux-hotfix-v9/install_payload.sh" "$PAYLOAD/install.sh"
get "$BASE/termux-hotfix-v9/start.sh" "$PAYLOAD/start.sh"
get "$BASE/termux-hotfix-v9/server.py" "$PAYLOAD/gateway/server.py"
get "$BASE/termux-hotfix-v9/piper_server.py" "$PAYLOAD/gateway/piper_server.py"
get "$BASE/termux-hotfix-v9/kokoro_server.mjs" "$PAYLOAD/gateway/kokoro_server.mjs"
get "$BASE/termux-hotfix-v9/smoke_test.sh" "$PAYLOAD/scripts/smoke_test.sh"

# UI
mkdir -p "$PAYLOAD/public"
get "$BASE/termux-hotfix-v6/index.html" "$PAYLOAD/public/index.html"
get "$BASE/termux-hotfix-v9/translate.html" "$PAYLOAD/public/translate.html"
get "$BASE/termux-hotfix-v9/settings.html" "$PAYLOAD/public/settings.html"
get "$BASE/termux-hotfix-v6/manifest.webmanifest" "$PAYLOAD/public/manifest.webmanifest"
get "$BASE/termux-hotfix-v9/service-worker.js" "$PAYLOAD/public/service-worker.js"

chmod +x "$PAYLOAD/install.sh" "$PAYLOAD/start.sh" "$PAYLOAD/stop.sh" "$PAYLOAD/scripts/"*.sh

bash -n "$PAYLOAD/install.sh"
bash -n "$PAYLOAD/start.sh"
bash -n "$PAYLOAD/stop.sh"
bash -n "$PAYLOAD/scripts/build_engines.sh"
bash -n "$PAYLOAD/scripts/smoke_test.sh"
python -m py_compile "$PAYLOAD/gateway/server.py" "$PAYLOAD/gateway/tts_server.py" "$PAYLOAD/gateway/piper_server.py"

grep -q -- '--convert' "$PAYLOAD/start.sh" || { echo "whisper browser-audio conversion missing"; exit 1; }
grep -q '/ws/live' "$PAYLOAD/public/translate.html" || { echo "realtime WebSocket missing"; exit 1; }
grep -q "tts_provider" "$PAYLOAD/public/translate.html" || { echo "TTS provider wiring missing"; exit 1; }
grep -q '/v1/tts/preview' "$PAYLOAD/public/settings.html" || { echo "voice preview UI missing"; exit 1; }
grep -q 'PIPER_PORT' "$PAYLOAD/gateway/server.py" || { echo "Piper gateway wiring missing"; exit 1; }
grep -q 'KOKORO_PORT' "$PAYLOAD/gateway/server.py" || { echo "Kokoro gateway wiring missing"; exit 1; }

echo "[compat-v9] Realtime translator, provider catalogs, voices, and preview UI verified"
