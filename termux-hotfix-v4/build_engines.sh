#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}"
SRC="$ROOT/src"; BIN="$ROOT/bin"; mkdir -p "$SRC" "$BIN"
JOBS="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)"; [ "$JOBS" -gt 6 ] && JOBS=6
LLAMA_REV="df03399b885831b2a1603b3abb0d8c156808e363"
WHISPER_REV="927cfce34f31707e17f2bff35c349632fb9e2c3a"

checkout_repo(){
  local url="$1" dir="$2" rev="$3"
  if [ ! -d "$dir/.git" ]; then git clone --filter=blob:none --no-checkout "$url" "$dir" >/dev/null 2>&1; fi
  git -C "$dir" fetch -q --depth=1 origin "$rev"
  git -C "$dir" reset -q --hard FETCH_HEAD
}

if [ -x "$BIN/llama-server" ] && [ -x "$BIN/llama-cli" ]; then
  echo '[1/2] llama.cpp already installed — reusing verified binaries.'
else
  echo '[1/2] Building llama.cpp…'
  checkout_repo https://github.com/ggml-org/llama.cpp.git "$SRC/llama.cpp" "$LLAMA_REV"
  cmake -S "$SRC/llama.cpp" -B "$SRC/llama.cpp/build" -DCMAKE_BUILD_TYPE=Release -DGGML_OPENMP=OFF -DGGML_LLAMAFILE=OFF >/dev/null
  cmake --build "$SRC/llama.cpp/build" --config Release -j "$JOBS" --target llama-server llama-cli
  install -m 755 "$SRC/llama.cpp/build/bin/llama-server" "$BIN/llama-server.new"
  install -m 755 "$SRC/llama.cpp/build/bin/llama-cli" "$BIN/llama-cli.new"
  mv -f "$BIN/llama-server.new" "$BIN/llama-server"
  mv -f "$BIN/llama-cli.new" "$BIN/llama-cli"
fi

if [ -x "$BIN/whisper-server" ] && [ -x "$BIN/whisper-cli" ]; then
  echo '[2/2] whisper.cpp already installed — reusing verified binaries.'
else
  echo '[2/2] Building whisper.cpp…'
  checkout_repo https://github.com/ggml-org/whisper.cpp.git "$SRC/whisper.cpp" "$WHISPER_REV"
  cmake -S "$SRC/whisper.cpp" -B "$SRC/whisper.cpp/build" -DCMAKE_BUILD_TYPE=Release -DWHISPER_SDL2=OFF -DGGML_OPENMP=OFF >/dev/null
  cmake --build "$SRC/whisper.cpp/build" --config Release -j "$JOBS" --target whisper-server whisper-cli
  install -m 755 "$SRC/whisper.cpp/build/bin/whisper-server" "$BIN/whisper-server.new"
  install -m 755 "$SRC/whisper.cpp/build/bin/whisper-cli" "$BIN/whisper-cli.new"
  mv -f "$BIN/whisper-server.new" "$BIN/whisper-server"
  mv -f "$BIN/whisper-cli.new" "$BIN/whisper-cli"
fi
