#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
PAYLOAD="${1:?payload root required}"
HOTFIX_BASE="https://raw.githubusercontent.com/emilalvaroserrano-collab/mastertrans/main/termux-hotfix"

echo "[compat] Applying Android/Python 3.14 compatibility hotfix"
curl -fsSL "$HOTFIX_BASE/requirements.txt" -o "$PAYLOAD/gateway/requirements.txt"
curl -fsSL "$HOTFIX_BASE/server.py" -o "$PAYLOAD/gateway/server.py"
curl -fsSL "$HOTFIX_BASE/tts_server.py" -o "$PAYLOAD/gateway/tts_server.py"

python - "$PAYLOAD/install.sh" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
s=s.replace(
'pkg install -y git cmake ninja clang make python python-pip python-onnxruntime curl ffmpeg libsndfile openssl',
'pkg install -y git cmake ninja clang make python python-pip python-numpy python-onnxruntime curl ffmpeg libsndfile libffi openssl')
start=s.index("blue '[3/6] Installing Eburon gateway'")
end=s.index("blue '[5/6] Installing reboot/background launcher'")
new=r'''blue '[3/6] Installing Eburon gateway (Python 3.14-safe; no Pydantic/Rust)'
rm -rf "$ROOT/venv-gateway"
python -m venv --system-site-packages "$ROOT/venv-gateway"
"$ROOT/venv-gateway/bin/pip" install -U pip wheel setuptools
"$ROOT/venv-gateway/bin/pip" install -r "$ROOT/gateway/requirements.txt"

blue '[4/6] Installing Supertonic 3 local TTS server'
python - <<'PYORT'
import numpy as np, onnxruntime as ort
print('Termux NumPy:', np.__version__)
print('Termux ONNX Runtime:', ort.__version__)
PYORT
rm -rf "$ROOT/venv-tts"
python -m venv --system-site-packages "$ROOT/venv-tts"
"$ROOT/venv-tts/bin/pip" install -U pip wheel setuptools
"$ROOT/venv-tts/bin/pip" install 'soundfile>=0.12' 'starlette>=0.46,<2' 'uvicorn>=0.30,<1'
"$ROOT/venv-tts/bin/pip" install --no-deps 'git+https://github.com/supertone-oss-archive/supertonic-py.git@df0f9686dac7fbbde391b759e2ee5286a3737622'
mkdir -p "$ROOT/models/supertonic-3/onnx" "$ROOT/models/supertonic-3/voice_styles" "$ROOT/logs"

HF_BASE="https://huggingface.co/Supertone/supertonic-3/resolve/724fb5abbf5502583fb520898d45929e62f02c0b"
for f in duration_predictor.onnx text_encoder.onnx vector_estimator.onnx vocoder.onnx tts.json unicode_indexer.json; do
  curl -fL --retry 6 --retry-delay 2 --retry-all-errors "$HF_BASE/onnx/$f?download=true" -o "$ROOT/models/supertonic-3/onnx/$f"
done
for v in F1 F2 F3 F4 F5 M1 M2 M3 M4 M5; do
  curl -fL --retry 6 --retry-delay 2 --retry-all-errors "$HF_BASE/voice_styles/$v.json?download=true" -o "$ROOT/models/supertonic-3/voice_styles/$v.json"
done
SUPERTONIC_MODEL_DIR="$ROOT/models/supertonic-3" "$ROOT/venv-tts/bin/python" - <<'PYTTS'
import os, soundfile as sf, onnxruntime as ort
from supertonic import TTS
print('ONNX Runtime import OK:', ort.__version__)
tts=TTS(model_dir=os.environ['SUPERTONIC_MODEL_DIR'], auto_download=False)
style=tts.get_voice_style(voice_name='M1')
wav,duration=tts.synthesize('Eburon local voice verification.', voice_style=style, total_steps=2, speed=1.05, lang='en')
sf.write(os.path.expanduser('~/.eburon-edge/logs/install-tts-test.wav'), wav.squeeze(), tts.sample_rate)
print('Supertonic synthesis OK:', float(duration[0]))
PYTTS
[ -s "$ROOT/logs/install-tts-test.wav" ]

'''
p.write_text(s[:start]+new+s[end:])
PY

python - "$PAYLOAD/start.sh" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
old='if [ "$TTS_PROVIDER" = supertonic ]; then start_one tts "$EBURON_TTS_PORT" "source \'$ROOT/venv-tts/bin/activate\'; exec supertonic serve --model supertonic-3 --host 127.0.0.1 --port \'$EBURON_TTS_PORT\' --log-level warning"; fi'
new='if [ "$TTS_PROVIDER" = supertonic ]; then start_one tts "$EBURON_TTS_PORT" "source \'$ROOT/venv-tts/bin/activate\'; cd \'$ROOT\'; SUPERTONIC_MODEL_DIR=\'$ROOT/models/supertonic-3\' exec uvicorn gateway.tts_server:app --host 127.0.0.1 --port \'$EBURON_TTS_PORT\' --log-level warning"; fi'
if old not in s:
    raise SystemExit("start.sh TTS command signature changed; refusing unsafe patch")
s=s.replace(old,new)
p.write_text(s)
PY

bash -n "$PAYLOAD/install.sh"
bash -n "$PAYLOAD/start.sh"
echo "[compat] Hotfix applied"
