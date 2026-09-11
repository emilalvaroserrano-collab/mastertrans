#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}"
source "$ROOT/config/eburon.env"
BASE="http://127.0.0.1:$EBURON_GATEWAY_PORT"
TMP="$ROOT/logs/smoke-v9"; mkdir -p "$TMP"
fail(){ echo "SMOKE TEST FAILED: $*" >&2; exit 1; }

echo "[smoke] health"
H="$(curl -fLsS --max-time 8 "$BASE/health")" || fail "gateway health unreachable"
printf '%s' "$H" | grep -Eq '"offline_ready"[[:space:]]*:[[:space:]]*true' || fail "core local engines not ready"

echo "[smoke] provider catalog"
P="$(curl -fLsS --max-time 8 "$BASE/v1/tts/providers")" || fail "provider endpoint failed"
printf '%s' "$P" | grep -q '"supertonic"' || fail "Supertonic provider missing"
C="$(curl -fLsS --max-time 8 "$BASE/v1/tts/catalog?provider=supertonic")" || fail "Supertonic catalog failed"
printf '%s' "$C" | grep -q '"M5"' || fail "Supertonic voice catalog incomplete"

echo "[smoke] translation-only engine API"
TR="$(curl -fLsS --max-time 60 -H 'Content-Type: application/json'   -d '{"text":"Good morning.","source_language":"en","target_language":"nl","mode":"general"}'   "$BASE/v1/translate")" || fail "translation-only engine request failed"
printf '%s' "$TR" | grep -Eq '"text"[[:space:]]*:[[:space:]]*"[^"]+"' || fail "translation-only engine returned no text"

echo "[smoke] Supertonic preview"
curl -fLsS --max-time 90 -H 'Content-Type: application/json'   -d '{"provider":"supertonic","voice":"M1","language":"en","text":"Eburon voice preview verification."}'   "$BASE/v1/tts/preview" -o "$TMP/tts.wav" || fail "Supertonic preview failed"
[ "$(wc -c < "$TMP/tts.wav")" -gt 1000 ] || fail "TTS WAV too small"

echo "[smoke] browser-codec STT API"
ffmpeg -loglevel error -y -i "$TMP/tts.wav" -c:a libopus -b:a 32k "$TMP/browser.webm" || fail "ffmpeg WebM preparation failed"
STT="$(curl -fLsS --max-time 90 -F "file=@$TMP/browser.webm;type=audio/webm" "$BASE/v1/audio/transcriptions")" || fail "STT API failed for WebM/Opus"
printf '%s' "$STT" | grep -Eq '"text"[[:space:]]*:[[:space:]]*"[^"]+"' || fail "STT returned empty transcript"

echo "[smoke] PASS — STT + translation-only engine + Supertonic + provider APIs"
