#!/usr/bin/env python3
"""
Step 3 v2 — Train TereDLrPPG on 57-subject paired data. Mac MPS backend.

v2 changes vs v1 (which hit val MAE 19.33, worse than classical 5.9):
- Direct HR regression. v1 predicted a sine-wave BVP at the known frequency
  then FFT'd it back to HR. Two layers of indirection, weak gradient. v2 just
  outputs HR as a scalar and losses MSE/Huber directly against the cuff HR.
- Horizontal flip + Gaussian noise augmentation on top of brightness jitter.
  Horizontal flip effectively doubles the dataset. Gaussian noise forces the
  model to tolerate sensor variation.
- Keeps the same TSM + Conv3D backbone, same 140K params.

Model: EfficientPhys-lite backbone → spatial GAP → temporal mean+std → MLP → HR scalar.

Training: leave-5-subjects-out validation. Huber loss (robust to outliers).
AdamW, cosine LR schedule, early stopping on val HR MAE.

Usage:
    python 03_train.py                       # defaults, 50 epochs
    python 03_train.py --epochs 100 --lr 5e-4

Outputs:
    ./models/tere-dl-{timestamp}.pt          best weights
    ./models/log-{timestamp}.json            per-epoch metrics
"""

import argparse
import json
import random
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.model_selection import GroupShuffleSplit
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm

DATA_DIR = Path(__file__).parent / "data"
MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

CROP_SIZE = 72
CLIP_FRAMES = 180          # 6 sec at 30 fps
TARGET_FPS = 30


# ─── Dataset ────────────────────────────────────────────────────────────────

class RppgDataset(Dataset):
    """Serves 180-frame clips with HR scalar label. Random temporal crop + hflip
    + Gaussian noise + brightness jitter during training."""

    def __init__(self, labels_df: pd.DataFrame, crop_dir: Path, train: bool):
        self.df = labels_df.reset_index(drop=True)
        self.crop_dir = crop_dir
        self.train = train

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        arr = np.load(self.crop_dir / f"{row['reading_id']}.npy", mmap_mode="r")
        T = arr.shape[0]
        if T < CLIP_FRAMES:
            pad = np.zeros((CLIP_FRAMES - T, CROP_SIZE, CROP_SIZE, 3), dtype=np.uint8)
            arr = np.concatenate([arr, pad], axis=0)
            T = CLIP_FRAMES
        if self.train:
            start = random.randint(0, T - CLIP_FRAMES)
        else:
            start = (T - CLIP_FRAMES) // 2
        clip = np.array(arr[start:start + CLIP_FRAMES])  # (180, 72, 72, 3)

        clip = clip.astype(np.float32) / 255.0

        if self.train:
            # Brightness jitter — same as v1
            jitter = random.uniform(0.85, 1.15)
            clip = np.clip(clip * jitter, 0, 1)
            # Horizontal flip — doubles effective dataset size for free
            if random.random() < 0.5:
                clip = clip[:, :, ::-1, :].copy()
            # Gaussian noise — forces tolerance to sensor variation
            if random.random() < 0.5:
                noise = np.random.normal(0, 0.02, clip.shape).astype(np.float32)
                clip = np.clip(clip + noise, 0, 1)

        clip = np.transpose(clip, (3, 0, 1, 2))  # (C=3, T=180, H=72, W=72)

        hr = float(row["manual_hr"])
        return torch.from_numpy(clip), torch.tensor(hr, dtype=torch.float32)


# ─── Model ──────────────────────────────────────────────────────────────────

class TemporalShiftBlock(nn.Module):
    """TSM — shift a fraction of channels along the time axis for free temporal
    receptive field without extra params."""
    def __init__(self, fold_div: int = 8):
        super().__init__()
        self.fold_div = fold_div

    def forward(self, x):
        # x: (B, C, T, H, W)
        B, C, T, H, W = x.shape
        fold = C // self.fold_div
        out = torch.zeros_like(x)
        out[:, :fold, 1:] = x[:, :fold, :-1]
        out[:, fold:2*fold, :-1] = x[:, fold:2*fold, 1:]
        out[:, 2*fold:] = x[:, 2*fold:]
        return out


class TereDLrPPG(nn.Module):
    """Lightweight spatiotemporal CNN → direct HR scalar.
    Backbone: 5 Conv3D blocks + TSM for temporal mixing.
    Head: spatial GAP → temporal mean+std → MLP → scalar HR."""
    def __init__(self, in_ch: int = 3, hidden: int = 32):
        super().__init__()
        self.tsm1 = TemporalShiftBlock()
        self.conv1 = nn.Conv3d(in_ch, hidden, kernel_size=(1, 3, 3), padding=(0, 1, 1))
        self.bn1 = nn.BatchNorm3d(hidden)
        self.tsm2 = TemporalShiftBlock()
        self.conv2 = nn.Conv3d(hidden, hidden, kernel_size=(1, 3, 3), padding=(0, 1, 1))
        self.bn2 = nn.BatchNorm3d(hidden)
        self.pool1 = nn.AvgPool3d(kernel_size=(1, 2, 2))

        self.tsm3 = TemporalShiftBlock()
        self.conv3 = nn.Conv3d(hidden, hidden * 2, kernel_size=(1, 3, 3), padding=(0, 1, 1))
        self.bn3 = nn.BatchNorm3d(hidden * 2)
        self.tsm4 = TemporalShiftBlock()
        self.conv4 = nn.Conv3d(hidden * 2, hidden * 2, kernel_size=(1, 3, 3), padding=(0, 1, 1))
        self.bn4 = nn.BatchNorm3d(hidden * 2)
        self.pool2 = nn.AvgPool3d(kernel_size=(1, 2, 2))

        self.tsm5 = TemporalShiftBlock()
        self.conv5 = nn.Conv3d(hidden * 2, hidden * 4, kernel_size=(1, 3, 3), padding=(0, 1, 1))
        self.bn5 = nn.BatchNorm3d(hidden * 4)

        # HR head: temporal mean + std over 128 channels → 256-dim feature → MLP → scalar
        self.head = nn.Sequential(
            nn.Linear(hidden * 4 * 2, 64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 1),
        )

    def forward(self, x):
        # x: (B, 3, 180, 72, 72)
        x = F.relu(self.bn1(self.conv1(self.tsm1(x))))
        x = F.relu(self.bn2(self.conv2(self.tsm2(x))))
        x = self.pool1(x)
        x = F.relu(self.bn3(self.conv3(self.tsm3(x))))
        x = F.relu(self.bn4(self.conv4(self.tsm4(x))))
        x = self.pool2(x)
        x = F.relu(self.bn5(self.conv5(self.tsm5(x))))
        # Spatial GAP: (B, 128, T, H, W) → (B, 128, T)
        x = x.mean(dim=(3, 4))
        # Temporal mean + std → (B, 128*2)
        feat = torch.cat([x.mean(dim=2), x.std(dim=2)], dim=1)
        # HR scalar — centered on 75 bpm (middle of our data range), network predicts offset
        hr_delta = self.head(feat).squeeze(-1)
        return 75.0 + hr_delta * 20.0  # de-normalize: delta ~ [-2, +2] → ~[35, 115] bpm


# ─── Training loop ──────────────────────────────────────────────────────────

def train_epoch(model, loader, optimizer, device):
    model.train()
    total_loss = 0
    for clip, hr in tqdm(loader, desc="train", leave=False):
        clip, hr = clip.to(device), hr.to(device)
        pred_hr = model(clip)
        # Huber loss — robust to outlier labels (manual_hr can occasionally be mistyped)
        loss = F.smooth_l1_loss(pred_hr, hr, beta=5.0)
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        total_loss += loss.item()
    return total_loss / max(1, len(loader))


def eval_epoch(model, loader, device):
    model.eval()
    errs = []
    with torch.no_grad():
        for clip, hr in tqdm(loader, desc="val", leave=False):
            clip = clip.to(device)
            pred_hr = model(clip).cpu().numpy()
            for i in range(pred_hr.shape[0]):
                errs.append(abs(float(pred_hr[i]) - float(hr[i])))
    return float(np.mean(errs)), float(np.median(errs))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--batch", type=int, default=4)
    parser.add_argument("--val-subjects", type=int, default=5)
    parser.add_argument("--patience", type=int, default=15,
                        help="Early stop if val MAE hasn't improved in N epochs")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed for train/val split, torch init, and augmentation RNG")
    parser.add_argument("--run-id", type=str, default=None,
                        help="Override auto-timestamp — used by ensemble trainer to tag runs")
    args = parser.parse_args()

    # Make this run reproducible-ish given the seed. Different seeds → different
    # models that an ensemble can average over. We vary train/val split so each
    # ensemble member sees a slightly different training distribution.
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    labels_df = pd.read_csv(DATA_DIR / "labels.csv")
    print(f"Loaded {len(labels_df)} labelled clips from {labels_df['subject_id'].nunique()} subjects (seed={args.seed})")

    splitter = GroupShuffleSplit(n_splits=1,
                                  test_size=args.val_subjects / labels_df['subject_id'].nunique(),
                                  random_state=args.seed)
    train_idx, val_idx = next(splitter.split(labels_df, groups=labels_df['subject_id']))
    train_df = labels_df.iloc[train_idx]
    val_df = labels_df.iloc[val_idx]
    print(f"Train: {len(train_df)} clips / {train_df['subject_id'].nunique()} subjects")
    print(f"Val:   {len(val_df)} clips / {val_df['subject_id'].nunique()} subjects")

    train_ds = RppgDataset(train_df, DATA_DIR / "crops", train=True)
    val_ds = RppgDataset(val_df, DATA_DIR / "crops", train=False)
    train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=args.batch, shuffle=False, num_workers=0)

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Device: {device}")
    model = TereDLrPPG().to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"Model params: {n_params:,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    ts = args.run_id or datetime.now().strftime("%Y%m%d-%H%M%S")
    log = []
    best_mae = float("inf")
    epochs_since_best = 0

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        train_loss = train_epoch(model, train_loader, optimizer, device)
        val_mae, val_med = eval_epoch(model, val_loader, device)
        scheduler.step()
        dt = time.time() - t0
        log.append({"epoch": epoch, "train_loss": train_loss, "val_mae": val_mae,
                    "val_med": val_med, "lr": scheduler.get_last_lr()[0], "sec": dt})
        print(f"Epoch {epoch:3d}  loss={train_loss:.4f}  val MAE={val_mae:.2f} bpm  "
              f"median={val_med:.2f}  ({dt:.0f}s)")

        if val_mae < best_mae:
            best_mae = val_mae
            epochs_since_best = 0
            torch.save({"state_dict": model.state_dict(), "epoch": epoch,
                        "val_mae": val_mae}, MODELS_DIR / f"tere-dl-{ts}.pt")
            print(f"  → saved best weights (val MAE {best_mae:.2f})")
        else:
            epochs_since_best += 1
            if epochs_since_best >= args.patience:
                print(f"\nEarly stop: no val MAE improvement in {args.patience} epochs")
                break

    (MODELS_DIR / f"log-{ts}.json").write_text(json.dumps(log, indent=2))
    print(f"\nTraining complete. Best val MAE: {best_mae:.2f} bpm")
    print(f"Weights: {MODELS_DIR}/tere-dl-{ts}.pt")
    print(f"Log:     {MODELS_DIR}/log-{ts}.json")


if __name__ == "__main__":
    main()
