#!/usr/bin/env bash
# One-shot runner for the full Tere-DL rPPG pipeline. Run from this directory.
#
# Prereqs (one-time setup):
#   brew install python@3.11 ffmpeg
#   python3 -m venv .venv && source .venv/bin/activate
#   pip install -r requirements.txt
#
# Then: drop tere-dl-manifest.json (exported from admin dashboard) here, and:
#   bash run_all.sh
#
# Overnight run on M-series MPS: ~8-12 hours end-to-end.

set -euo pipefail
cd "$(dirname "$0")"

# MPS has a growing but incomplete op coverage. Fall back to CPU for any ops
# PyTorch hasn't implemented on Metal yet (adaptive_avg_pool3d etc). Trainingk
# stays on MPS for the vast majority of compute.
export PYTORCH_ENABLE_MPS_FALLBACK=1

MANIFEST=${1:-tere-dl-manifest.json}

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: manifest not found at $MANIFEST"
  echo "Export it first from the admin dashboard → 'Export training manifest' button."
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════════"
echo "  Tere-DL rPPG training pipeline"
echo "  Manifest: $MANIFEST"
echo "  Started: $(date)"
echo "═══════════════════════════════════════════════════════════════════"

echo ""
echo "[1/4] Downloading videos..."
python 01_download_videos.py "$MANIFEST"

echo ""
echo "[2/4] Extracting face crops..."
python 02_extract_face_crops.py "$MANIFEST"

echo ""
echo "[3/4] Training model (overnight on MPS)..."
python 03_train.py --epochs 50

echo ""
echo "[4/4] Exporting ONNX..."
LATEST_CKPT=$(ls -t models/tere-dl-*.pt | head -1)
python 04_export_onnx.py "$LATEST_CKPT"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Done! Model shipped to /public/tere-dl/model.onnx"
echo "  Finished: $(date)"
echo ""
echo "  Next: review training curves in models/log-*.json,"
echo "  then git push to deploy the model to prod."
echo "═══════════════════════════════════════════════════════════════════"
