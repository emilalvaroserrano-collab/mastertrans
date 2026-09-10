#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
PAYLOAD="${1:?payload root required}"
RUNTIME_BASE="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/0df8e47d5232a8e0a74565a85bcbcd748138356e/termux-hotfix-v4"
UI_BASE="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/0df8e47d5232a8e0a74565a85bcbcd748138356e/termux-hotfix-v6"
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

chmod +x "$PAYLOAD/install.sh" "$PAYLOAD/start.sh" "$PAYLOAD/stop.sh" "$PAYLOAD/scripts/build_engines.sh"
bash -n "$PAYLOAD/install.sh"
bash -n "$PAYLOAD/start.sh"
bash -n "$PAYLOAD/stop.sh"
bash -n "$PAYLOAD/scripts/build_engines.sh"

for f in "$PAYLOAD/public/index.html" "$PAYLOAD/public/translate.html" "$PAYLOAD/public/settings.html"; do
  [ -s "$f" ] || { echo "Missing frontend file: $f"; exit 1; }
done
echo "[compat-v6] Frontend + runtime layer verified"
