#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}"
source "$ROOT/config/eburon.env"
BASE="http://127.0.0.1:$EBURON_GATEWAY_PORT"
TMP="$ROOT/logs/smoke-v8"; mkdir -p "$TMP"

fail(){ echo "SMOKE TEST FAILED: $*" >&2; exit 1; }

echo "[smoke] health"
H="$(curl -fLsS --max-time 8 "$BASE/health")" || fail "gateway health unreachable"
printf '%s' "$H" | grep -Eq '"offline_ready"[[:space:]]*:[[:space:]]*true' || fail "not all local engines ready"

echo "[smoke] translation API"
TR="$(curl -fLsS --max-time 60 -H 'Content-Type: application/json'   -d '{"text":"Good morning.","source_language":"en-US","target_language":"nl-BE","mode":"general"}'   "$BASE/v1/translate")" || fail "translation API request failed"
printf '%s' "$TR" | grep -Eq '"text"[[:space:]]*:[[:space:]]*"[^"]+"' || fail "translation API returned no text"

echo "[smoke] TTS API"
curl -fLsS --max-time 90 -H 'Content-Type: application/json'   -d '{"text":"Eburon voice pipeline verification.","voice":"M1","lang":"en"}'   "$BASE/v1/audio/speech" -o "$TMP/tts.wav" || fail "TTS API failed"
[ "$(wc -c < "$TMP/tts.wav")" -gt 1000 ] || fail "TTS WAV too small"

echo "[smoke] browser-codec STT API"
ffmpeg -loglevel error -y -i "$TMP/tts.wav" -c:a libopus -b:a 32k "$TMP/browser.webm" || fail "ffmpeg WebM preparation failed"
STT="$(curl -fLsS --max-time 90 -F "file=@$TMP/browser.webm;type=audio/webm" "$BASE/v1/audio/transcriptions")" || fail "STT API failed for WebM/Opus"
printf '%s' "$STT" | grep -Eq '"text"[[:space:]]*:[[:space:]]*"[^"]+"' || fail "STT returned empty transcript"

echo "[smoke] PASS — health + LLM translation + Supertonic + WebM/Opus whisper STT"
