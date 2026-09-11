#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO="emilalvaroserrano-collab/mastertrans"
BRANCH="main"
HOTFIX_REF="11db2fcebd596ec577bf996a8f003960552dc8c1"
VERSION="v0.1.0-r10.3"
PACKAGE="eburon-edge-termux-tablet-mvp-v0.1.0.zip"
PACKAGE_SHA256="1a4b71f593f5025d47c3db1b515a7415649c73725a405993fef6a99cc6aae658"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}/dist"
TMP_DIR="$(mktemp -d)"

red(){ printf '\033[31m%s\033[0m\n' "$*"; }
green(){ printf '\033[32m%s\033[0m\n' "$*"; }
blue(){ printf '\033[36m%s\033[0m\n' "$*"; }
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT
trap 'red "Eburon bootstrap failed at line $LINENO. Keep Wi-Fi enabled and run the same command again."' ERR

case "${PREFIX:-}" in
  *com.termux*) ;;
  *) red "Run this inside the Termux app."; exit 1 ;;
esac

ARCH="$(uname -m)"
case "$ARCH" in
  aarch64|arm64) ;;
  *) red "This tablet build currently targets ARM64. Detected: $ARCH"; exit 1 ;;
esac

blue "Eburon Edge ${VERSION} — one-command installer"
blue "Internet is required only for this initial installation."

pkg update -y >/dev/null
pkg install -y curl unzip coreutils >/dev/null

blue "Downloading Eburon Edge package..."
: > "$TMP_DIR/package.b64"
for part in 00 01 02 03 04 05; do
  curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors \
    "${RAW_BASE}/${PACKAGE}.b64.${part}?cb=${VERSION}" \
    >> "$TMP_DIR/package.b64"
done

base64 -d "$TMP_DIR/package.b64" > "$TMP_DIR/$PACKAGE"
printf '%s  %s\n' "$PACKAGE_SHA256" "$TMP_DIR/$PACKAGE" | sha256sum -c -

green "Package integrity verified."
unzip -q "$TMP_DIR/$PACKAGE" -d "$TMP_DIR/payload"

PAYLOAD_INSTALL="$TMP_DIR/payload/eburon-edge-termux/install.sh"
[ -f "$PAYLOAD_INSTALL" ] || { red "Installer payload is missing."; exit 2; }
chmod +x "$PAYLOAD_INSTALL"

blue "Applying low-latency translation-only engine + multi-TTS layer v10..."
HOTFIX="$TMP_DIR/apply-hotfix.sh"
curl -fLsS --retry 6 --retry-delay 2 --retry-all-errors \
  "https://raw.githubusercontent.com/${REPO}/${HOTFIX_REF}/termux-hotfix-v10/apply.sh?cb=${VERSION}" -o "$HOTFIX"
chmod +x "$HOTFIX"
bash "$HOTFIX" "$TMP_DIR/payload/eburon-edge-termux"

blue "Starting full offline stack installation..."
EBURON_ROOT="${EBURON_ROOT:-$HOME/.eburon-edge}" bash "$PAYLOAD_INSTALL"

green "Eburon Edge bootstrap complete."
