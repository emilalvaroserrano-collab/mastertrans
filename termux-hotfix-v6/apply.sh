#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
PAYLOAD="${1:?payload root required}"
RUNTIME_BASE="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/e1d6f6b0088f97b47dc26e99ac138a988955d31f/termux-hotfix-v4"
UI_BASE="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/e1d6f6b0088f97b47dc26e99ac138a988955d31f/termux-hotfix-v6"
echo "[compat-v6] Applying exact responsive mobile frontend + production runtime"

get(){ curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors "$1" -o "$2"; }

get "$RUNTIME_BASE/requirements.txt" "$PAYLOAD/gateway/requirements.txt"
get "$RUNTIME_BASE/server.py" "$PAYLOAD/gateway/server.py"
get "$RUNTIME_BASE/tts_server.py" "$PAYLOAD/gateway/tts_server.py"
get "$RUNTIME_BASE/build_engines.sh" "$PAYLOAD/scripts/build_engines.sh"
get "$RUNTIME_BASE/start.sh" "$PAYLOAD/start.sh"
get "$RUNTIME_BASE/stop.sh" "$PAYLOAD/stop.sh"
get "$RUNTIME_BASE/install_payload.sh" "$PAYLOAD/install.sh"

mkdir -p "$PAYLOAD/public"
get "$UI_BASE/index.html" "$PAYLOAD/public/index.html"
get "$UI_BASE/translate.html" "$PAYLOAD/public/translate.html"
get "$UI_BASE/settings.html" "$PAYLOAD/public/settings.html"
get "$UI_BASE/manifest.webmanifest" "$PAYLOAD/public/manifest.webmanifest"
get "$UI_BASE/service-worker.js" "$PAYLOAD/public/service-worker.js"

chmod +x "$PAYLOAD/install.sh" "$PAYLOAD/start.sh" "$PAYLOAD/stop.sh" "$PAYLOAD/scripts/build_engines.sh"
bash -n "$PAYLOAD/install.sh"
bash -n "$PAYLOAD/start.sh"
bash -n "$PAYLOAD/stop.sh"
bash -n "$PAYLOAD/scripts/build_engines.sh"

for f in "$PAYLOAD/public/index.html" "$PAYLOAD/public/translate.html" "$PAYLOAD/public/settings.html" "$PAYLOAD/public/manifest.webmanifest" "$PAYLOAD/public/service-worker.js"; do
  [ -s "$f" ] || { echo "Missing frontend file: $f"; exit 1; }
done
echo "[compat-v6] Frontend + runtime layer verified"
