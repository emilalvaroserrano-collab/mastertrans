#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
PAYLOAD="${1:?payload root required}"
BASE="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/main/termux-hotfix-v5"
echo "[compat-v5] Applying full mobile frontend + production repair layer"
get(){ curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors "$BASE/$1" -o "$2"; }
# Backend/runtime stays on verified v4 files
V4="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/main/termux-hotfix-v4"
curl -fLsS "$V4/requirements.txt" -o "$PAYLOAD/gateway/requirements.txt"
curl -fLsS "$V4/server.py" -o "$PAYLOAD/gateway/server.py"
curl -fLsS "$V4/tts_server.py" -o "$PAYLOAD/gateway/tts_server.py"
curl -fLsS "$V4/build_engines.sh" -o "$PAYLOAD/scripts/build_engines.sh"
curl -fLsS "$V4/start.sh" -o "$PAYLOAD/start.sh"
curl -fLsS "$V4/stop.sh" -o "$PAYLOAD/stop.sh"
curl -fLsS "$V4/install_payload.sh" -o "$PAYLOAD/install.sh"
# Replace PWA frontend completely
mkdir -p "$PAYLOAD/public"
get public/index.html "$PAYLOAD/public/index.html"
get public/app.css "$PAYLOAD/public/app.css"
get public/app.js "$PAYLOAD/public/app.js"
get public/manifest.webmanifest "$PAYLOAD/public/manifest.webmanifest"
get public/sw.js "$PAYLOAD/public/sw.js"
# Ensure no obsolete settings page is used
cat > "$PAYLOAD/public/settings.html" <<'HTML'
<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/"><title>Eburon Translator</title>
HTML
chmod +x "$PAYLOAD/install.sh" "$PAYLOAD/start.sh" "$PAYLOAD/stop.sh" "$PAYLOAD/scripts/build_engines.sh"
bash -n "$PAYLOAD/install.sh"
bash -n "$PAYLOAD/start.sh"
echo "[compat-v5] Frontend and runtime layer verified"
