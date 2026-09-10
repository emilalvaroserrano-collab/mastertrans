#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
PAYLOAD="${1:?payload root required}"
BASE="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/76a14569feb2f54ecec06fb344961e2522c881d1"
echo "[compat-v7] Applying realtime STT -> translator LLM -> TTS pipeline"

get(){ curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors "$1" -o "$2"; }

# Stable runtime pieces
get "$BASE/termux-hotfix-v4/requirements.txt" "$PAYLOAD/gateway/requirements.txt"
get "$BASE/termux-hotfix-v4/tts_server.py" "$PAYLOAD/gateway/tts_server.py"
get "$BASE/termux-hotfix-v4/build_engines.sh" "$PAYLOAD/scripts/build_engines.sh"
get "$BASE/termux-hotfix-v4/start.sh" "$PAYLOAD/start.sh"
get "$BASE/termux-hotfix-v4/stop.sh" "$PAYLOAD/stop.sh"
get "$BASE/termux-hotfix-v4/install_payload.sh" "$PAYLOAD/install.sh"

# Realtime gateway
get "$BASE/termux-hotfix-v7/server.py" "$PAYLOAD/gateway/server.py"

# UI
mkdir -p "$PAYLOAD/public"
get "$BASE/termux-hotfix-v6/index.html" "$PAYLOAD/public/index.html"
get "$BASE/termux-hotfix-v7/translate.html" "$PAYLOAD/public/translate.html"
get "$BASE/termux-hotfix-v6/settings.html" "$PAYLOAD/public/settings.html"
get "$BASE/termux-hotfix-v6/manifest.webmanifest" "$PAYLOAD/public/manifest.webmanifest"
get "$BASE/termux-hotfix-v7/service-worker.js" "$PAYLOAD/public/service-worker.js"

chmod +x "$PAYLOAD/install.sh" "$PAYLOAD/start.sh" "$PAYLOAD/stop.sh" "$PAYLOAD/scripts/build_engines.sh"
bash -n "$PAYLOAD/install.sh"
bash -n "$PAYLOAD/start.sh"
bash -n "$PAYLOAD/stop.sh"
bash -n "$PAYLOAD/scripts/build_engines.sh"

python -m py_compile "$PAYLOAD/gateway/server.py" "$PAYLOAD/gateway/tts_server.py"
for f in "$PAYLOAD/public/index.html" "$PAYLOAD/public/translate.html" "$PAYLOAD/public/settings.html" "$PAYLOAD/public/manifest.webmanifest" "$PAYLOAD/public/service-worker.js"; do
  [ -s "$f" ] || { echo "Missing frontend file: $f"; exit 1; }
done
echo "[compat-v7] Realtime pipeline layer verified"
