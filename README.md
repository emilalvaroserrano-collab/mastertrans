# Eburon Edge — Local Dual Translator

A fully local speech-to-speech translation stack for **ARM64 Android phones and tablets** using Termux.

The target experience is appliance-like: install once while online, verify every engine and model, then operate with Wi-Fi disabled.

## One-command install

> **Installer v4:** repair-safe and idempotent. Existing Eburon services are stopped before native binaries are replaced, already-built llama.cpp/whisper.cpp binaries and downloaded models are reused, readiness polling is silent, and a service that crashes prints only its own concise log tail instead of flooding Termux with repeated curl errors.



Install **Termux**, open it once, then paste this single command:

```bash
curl -fsSL https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/main/install.sh | bash
```

No repository clone and no manual model configuration are required.

> **Termux Python 3.14 note:** the installer applies an Android compatibility layer that removes FastAPI/Pydantic from the local gateway and TTS sidecar. This avoids the `pydantic-core` / Rust target failure on ARM64 Android. Re-running the same curl command repairs a failed partial install.

The bootstrap downloads the versioned Eburon Edge package, verifies its SHA-256 checksum, and launches the full installer.

## What gets installed

| Service | Local address | Purpose |
|---|---|---|
| Eburon Gateway + PWA | `127.0.0.1:8850` | Unified app/API entrypoint |
| llama.cpp | `127.0.0.1:8851` | Translation and chat completion |
| whisper.cpp | `127.0.0.1:8852` | Offline speech recognition |
| Supertonic 3 | `127.0.0.1:8853` | Local multilingual TTS |

The gateway exposes independent STT, LLM/translation, and TTS interfaces plus a local WebSocket live pipeline so the same backend can later be reused by other apps.

## Installation flow

```text
Termux
  ↓
curl install.sh
  ↓
Download + checksum verify payload
  ↓
Build llama.cpp + whisper.cpp
  ↓
Download local LLM + Whisper model
  ↓
Install/download Supertonic 3 + voices
  ↓
Install Eburon gateway + static PWA
  ↓
Start localhost services
  ↓
Run real smoke tests
  ↓
EBURON EDGE: OFFLINE READY
  ↓
Open http://127.0.0.1:8850 automatically
```

The installer must not declare the tablet offline-ready until the core services pass their local checks.

## Install the PWA

After a successful setup the installer opens:

```text
http://127.0.0.1:8850
```

Chrome will present the **Install Eburon Translator** option. Android requires one user confirmation for PWA installation; browsers do not permit silent PWA installation.

After that, the translator launches from its Home Screen icon in standalone mode with no normal browser address bar.

## After installation

Once the installer prints:

```text
EBURON EDGE: OFFLINE READY
You may now disable Wi-Fi / enable Airplane Mode.
```

all runtime traffic is local loopback traffic on the device.

Service controls:

```bash
~/.eburon-edge/start.sh
~/.eburon-edge/status.sh
~/.eburon-edge/stop.sh
```

Re-run the same installer command to repair or refresh the installation:

```bash
curl -fsSL https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/main/install.sh | bash
```

## Reboot persistence

For dedicated tablets, install **Termux:Boot** from the same trusted Termux distribution source and open it once. The payload creates the Eburon boot script under `~/.termux/boot/`.

Also exclude Termux from aggressive Android battery optimization on the deployment tablet. The servers stay idle when there is no active translation session; model inference is the battery-intensive part, not localhost WebSocket transport itself.

## Local speech-to-speech flow

```text
Microphone
   ↓
whisper.cpp STT
   ↓
complete/final transcript
   ↓
llama.cpp translator
   ↓
translated text
   ↓
Supertonic 3 TTS
   ↓
Speaker

PWA ⇄ HTTP/WebSocket ⇄ Eburon Gateway @ 127.0.0.1:8850
```

## Package storage

The deployable ZIP is stored in GitHub as base64 chunks under `dist/` so the public bootstrap can reconstruct it in Termux without requiring `git clone`.

Current package SHA-256:

```text
1a4b71f593f5025d47c3db1b515a7415649c73725a405993fef6a99cc6aae658
```

## Current scope

This installer is focused on Android/Termux ARM64 first. The same localhost API contract can later back a native APK, Electron shell, or macOS client without changing the STT → LLM → TTS architecture.

> Packaging improves deployment ergonomics, but a public GitHub repository is not a code-secrecy boundary. Proprietary releases should eventually move the core payload to a signed/private artifact channel while keeping a small bootstrap installer public.
