#!/usr/bin/env python3
"""
Step 4 — Export trained TereDLrPPG weights to ONNX for browser inference via
onnxruntime-web (already in the Tere bundle, same WASM path as ME-rPPG).

Also copies the resulting .onnx into /public/tere-dl/ so a push ships it.

Usage:
    python 04_export_onnx.py models/tere-dl-20261004-220000.pt
"""

import sys
from pathlib import Path

import torch
import numpy as np
import onnx
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).parent))
from importlib.machinery import SourceFileLoader
train_mod = SourceFileLoader("train_mod", str(Path(__file__).parent / "03_train.py")).load_module()
TereDLrPPG = train_mod.TereDLrPPG
CLIP_FRAMES = train_mod.CLIP_FRAMES
CROP_SIZE = train_mod.CROP_SIZE

PUBLIC_DIR = Path(__file__).parent.parent.parent / "public" / "tere-dl"


def main(ckpt_path: str):
    ckpt_path = Path(ckpt_path)
    out_onnx = ckpt_path.with_suffix(".onnx")

    model = TereDLrPPG()
    state = torch.load(ckpt_path, map_location="cpu")
    model.load_state_dict(state["state_dict"])
    model.eval()

    dummy = torch.randn(1, 3, CLIP_FRAMES, CROP_SIZE, CROP_SIZE)

    torch.onnx.export(
        model, dummy, str(out_onnx),
        input_names=["clip"],
        output_names=["hr"],
        dynamic_axes={"clip": {0: "batch"}, "hr": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
    )

    onnx_model = onnx.load(str(out_onnx))
    onnx.checker.check_model(onnx_model)

    sess = ort.InferenceSession(str(out_onnx), providers=["CPUExecutionProvider"])
    out = sess.run(["hr"], {"clip": dummy.numpy()})[0]
    print(f"ONNX smoke test — input {dummy.shape} → HR output {out.shape}, sample value: {float(out.flat[0]):.1f} bpm")

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    public_onnx = PUBLIC_DIR / "model.onnx"
    import shutil
    shutil.copy2(out_onnx, public_onnx)

    size_mb = out_onnx.stat().st_size / (1 << 20)
    print(f"Exported {out_onnx} ({size_mb:.2f} MB)")
    print(f"Copied to {public_onnx} — ready to ship via next git push.")
    print(f"\nSource checkpoint: {ckpt_path} (val MAE {state.get('val_mae', '?'):.2f} bpm at epoch {state.get('epoch', '?')})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python 04_export_onnx.py <checkpoint.pt>")
        sys.exit(1)
    main(sys.argv[1])
