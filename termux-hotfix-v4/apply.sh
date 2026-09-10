#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
PAYLOAD="${1:?payload root required}"
BASE="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/main/termux-hotfix-v4"
echo "[compat-v4] Applying production repair layer"

get(){ curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors "$BASE/$1" -o "$2"; }
get requirements.txt "$PAYLOAD/gateway/requirements.txt"
get server.py "$PAYLOAD/gateway/server.py"
get tts_server.py "$PAYLOAD/gateway/tts_server.py"
get build_engines.sh "$PAYLOAD/scripts/build_engines.sh"
get start.sh "$PAYLOAD/start.sh"
get stop.sh "$PAYLOAD/stop.sh"
get install_payload.sh "$PAYLOAD/install.sh"

chmod +x "$PAYLOAD/install.sh" "$PAYLOAD/start.sh" "$PAYLOAD/stop.sh" "$PAYLOAD/scripts/build_engines.sh"
bash -n "$PAYLOAD/install.sh"
bash -n "$PAYLOAD/start.sh"
bash -n "$PAYLOAD/stop.sh"
bash -n "$PAYLOAD/scripts/build_engines.sh"
echo "[compat-v4] Repair layer verified"
