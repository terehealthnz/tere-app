#!/usr/bin/env python3
"""
Step 4 — Export trained TereDLrPPG weights to ONNX for browser inference via
onnxruntime-web (already in the Tere bundle, same WASM path as ME-rPPG).

Two modes:

  Single-model:
      python 04_export_onnx.py models/tere-dl-20261004-031354.pt

  Ensemble (average outputs of N trained members):
      python 04_export_onnx.py --ensemble ens-20261004-040000

Both produce /public/tere-dl/model.onnx ready to ship via git push.
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn as nn

sys.path.insert(0, str(Path(__file__).parent))
from importlib.machinery import SourceFileLoader
train_mod = SourceFileLoader("train_mod", str(Path(__file__).parent / "03_train.py")).load_module()
TereDLrPPG = train_mod.TereDLrPPG
CLIP_FRAMES = train_mod.CLIP_FRAMES
CROP_SIZE = train_mod.CROP_SIZE

HERE = Path(__file__).parent
MODELS_DIR = HERE / "models"
PUBLIC_DIR = HERE.parent.parent / "public" / "tere-dl"


class EnsembleModel(nn.Module):
    """Wraps N TereDLrPPG members, averages their outputs. One forward call
    produces the mean of all members' HR predictions."""
    def __init__(self, members: list):
        super().__init__()
        self.members = nn.ModuleList(members)

    def forward(self, x):
        preds = torch.stack([m(x) for m in self.members], dim=0)  # (N, B)
        return preds.mean(dim=0)


def load_single(ckpt_path: Path) -> nn.Module:
    model = TereDLrPPG()
    state = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    model.load_state_dict(state["state_dict"])
    model.eval()
    return model, state


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint", nargs="?", help="Single-model .pt path")
    parser.add_argument("--ensemble", help="Ensemble tag (e.g. ens-20261004-040000). Averages all members with that tag.")
    args = parser.parse_args()

    if args.ensemble:
        manifest_path = MODELS_DIR / f"{args.ensemble}-manifest.json"
        if not manifest_path.exists():
            print(f"ERROR: ensemble manifest not found: {manifest_path}")
            print("Did you run `python 03b_train_ensemble.py` first?")
            sys.exit(1)
        manifest = json.loads(manifest_path.read_text())
        member_ids = manifest["members"]
        print(f"Loading {len(member_ids)} ensemble members...")
        members = []
        for mid in member_ids:
            ckpt = MODELS_DIR / f"tere-dl-{mid}.pt"
            if not ckpt.exists():
                print(f"  WARN: missing checkpoint {ckpt}, skipping")
                continue
            m, _ = load_single(ckpt)
            members.append(m)
            print(f"  loaded {mid}")
        if not members:
            print("ERROR: no valid ensemble members found.")
            sys.exit(1)
        model = EnsembleModel(members)
        model.eval()
        out_onnx = MODELS_DIR / f"{args.ensemble}.onnx"
        print(f"\nExporting {len(members)}-model ensemble ONNX...")
    else:
        if not args.checkpoint:
            print("Usage: python 04_export_onnx.py <checkpoint.pt>")
            print("   or: python 04_export_onnx.py --ensemble <ensemble-tag>")
            sys.exit(1)
        ckpt_path = Path(args.checkpoint)
        model, state = load_single(ckpt_path)
        out_onnx = ckpt_path.with_suffix(".onnx")
        print(f"Exporting single-model ONNX (val MAE {state.get('val_mae', '?'):.2f} bpm at epoch {state.get('epoch', '?')})...")

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
    size_mb = out_onnx.stat().st_size / (1 << 20)
    print(f"ONNX smoke test — input {dummy.shape} → HR output {out.shape}, sample value: {float(out.flat[0]):.1f} bpm")
    print(f"File size: {size_mb:.2f} MB")

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    public_onnx = PUBLIC_DIR / "model.onnx"
    shutil.copy2(out_onnx, public_onnx)
    print(f"\nExported {out_onnx}")
    print(f"Shipped to {public_onnx} — ready for next git push.")


if __name__ == "__main__":
    main()
