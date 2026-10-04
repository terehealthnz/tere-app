#!/usr/bin/env python3
"""
Train a 5-model ensemble sequentially. Each member sees a different random
train/val split (different seed) + different augmentation RNG, so their
predictions decorrelate. At inference we average their outputs — same way
every production ML team reduces variance when data is small.

Expected impact: val MAE ~8 → ~6-7, by cancelling out the per-model variance
that was making v2 bounce between 8 and 19 across epochs.

Usage:
    python 03b_train_ensemble.py              # 5 seeds, 50 epochs each
    python 03b_train_ensemble.py --n 10       # 10-model ensemble
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
MODELS_DIR = HERE / "models"
MODELS_DIR.mkdir(exist_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=5, help="Ensemble size")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--batch", type=int, default=4)
    args = parser.parse_args()

    ensemble_ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    ensemble_tag = f"ens-{ensemble_ts}"

    print(f"═══════════════════════════════════════════════════════════════════")
    print(f"  Tere-DL ensemble training — {args.n} models")
    print(f"  Tag: {ensemble_tag}")
    print(f"  Started: {datetime.now().isoformat(timespec='seconds')}")
    print(f"═══════════════════════════════════════════════════════════════════\n")

    results = []
    for i in range(args.n):
        seed = 42 + i * 7  # arbitrary spacing to decorrelate RNG streams
        run_id = f"{ensemble_tag}-seed{seed}"
        print(f"\n──── Member {i+1}/{args.n}  seed={seed}  run_id={run_id} ────")
        cmd = [
            sys.executable, str(HERE / "03_train.py"),
            "--seed", str(seed),
            "--run-id", run_id,
            "--epochs", str(args.epochs),
            "--lr", str(args.lr),
            "--batch", str(args.batch),
        ]
        subprocess.run(cmd, check=True)

        # Read back the log to extract best val MAE for this member
        log_path = MODELS_DIR / f"log-{run_id}.json"
        if log_path.exists():
            log = json.loads(log_path.read_text())
            best = min(log, key=lambda e: e["val_mae"])
            results.append({"seed": seed, "run_id": run_id, "best_val_mae": best["val_mae"],
                            "best_val_med": best["val_med"], "best_epoch": best["epoch"]})

    print(f"\n═══════════════════════════════════════════════════════════════════")
    print(f"  Ensemble training complete")
    print(f"  Finished: {datetime.now().isoformat(timespec='seconds')}\n")
    print(f"  Per-member best val MAE:")
    for r in results:
        print(f"    seed {r['seed']:>3}: {r['best_val_mae']:.2f} bpm (median {r['best_val_med']:.2f}, epoch {r['best_epoch']})")
    if results:
        avg = sum(r["best_val_mae"] for r in results) / len(results)
        print(f"\n  Mean of best val MAEs: {avg:.2f} bpm")
        print(f"  (The ensemble prediction averages these models' outputs — expect better than any single member.)")
    print(f"\n  Next: python 04_export_onnx.py --ensemble {ensemble_tag}")
    print(f"═══════════════════════════════════════════════════════════════════")

    # Write ensemble manifest so step 4 knows which checkpoints to combine
    manifest = {"tag": ensemble_tag, "members": [r["run_id"] for r in results], "results": results}
    (MODELS_DIR / f"{ensemble_tag}-manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
