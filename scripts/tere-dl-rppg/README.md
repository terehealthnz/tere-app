# Tere DL rPPG — fine-tune a small HR model on our own paired data

Patrick 2026-10-04. Phase 3 after ME-rPPG swap and PTT prototype proved to be
either infeasible (ME-rPPG training code not released) or complementary rather
than curative (PTT is a BP signal, not an HR fix).

This directory trains a small CNN+temporal-head model from scratch on Tere's
57-subject / 70-video paired dataset to produce HR estimates calibrated on NZ
rural phone-captured faces (not RLAP college students in a lab darkroom).

## What this is not

- Not a drop-in replacement for the classical pipeline yet. We expect ±4-5
  bpm MAE on leave-k-subjects-out validation, modestly beating classical's
  5.9 baseline. The real win is **catching the TERE-336-class sub-harmonic
  failures** the classical pipeline silently halves.
- Not shippable to real patients until (a) we have >200 subjects' worth of
  paired data and (b) HDEC/WAND signoff. This v1 ships as a side-by-side
  column on VitalsValidate like ME-rPPG does today — research only.

## Pipeline (sequential, run on local Mac — no service role key needed)

```
Step 1  — Export training manifest from dashboard
          Admin dashboard button → downloads tere-dl-manifest.json

Step 2  — Download videos locally
          python 01_download_videos.py tere-dl-manifest.json
          → saves ~70 WebM files to ./data/videos/

Step 3  — Extract face crops as numpy arrays
          python 02_extract_face_crops.py
          → reads ./data/videos/*.webm
          → outputs ./data/crops/{reading_id}.npy (shape: T × 72 × 72 × 3)
             and ./data/labels.csv (reading_id, manual_hr, subject_id,
             age, sex, fitzpatrick, tere_hr, duration_sec)

Step 4  — Train model on Mac MPS
          python 03_train.py
          → trains for ~30-60 epochs on MPS, ~8-12 hours overnight
          → leave-5-subjects-out validation each epoch
          → saves best weights to ./models/tere-dl-{ts}.pt
          → saves training log + validation curves to ./models/log-{ts}.json

Step 5  — Export to ONNX for browser inference
          python 04_export_onnx.py ./models/tere-dl-{ts}.pt
          → produces tere-dl-{ts}.onnx (~2-5 MB) + state.json (initial state)
          → copies to /public/tere-dl/ for the frontend

Step 6  — Deploy
          Dashboard shows Tere-DL as a 4th HR column alongside Tere, ME-rPPG, PTT
          Model_versions row + promote-to-prod button, same v3 pattern
```

## Model architecture (planned, in 03_train.py)

Lightweight EfficientPhys-lite:
- Input: 72×72 RGB face crop, chunked into 180-frame sequences (6 sec at 30 fps)
- Spatial encoder: 2D-CNN, 4 conv blocks with batchnorm + ReLU, ~300K params
- Temporal head: 1D self-attention over frame embeddings, outputs per-frame BVP
- HR output: FFT-based from predicted BVP, converted to BPM
- ~500K total params, ~2 MB ONNX file
- Loss: MSE on BVP waveform + Pearson correlation + frequency-domain penalty
  (same combo as PulseGAN uses)

## Dataset expectations

| Metric | Expected |
|---|---|
| Subjects | 57 unique |
| Clips | 70 (some subjects have multiple) |
| Clip duration | 15 sec typical |
| Framerate | 30 fps (sampled, actual varies 25-30) |
| Total frames | ~31,500 |
| Train/val split | Leave-5-subjects-out (not leave-5-clips-out — subject
                 overlap would inflate accuracy) |

## Running locally

Prerequisites:
- Python 3.10+ via `brew install python@3.11` or pyenv
- FFmpeg via `brew install ffmpeg` (for video decoding)
- Apple Silicon Mac (M1/M2/M3/M4) for MPS GPU acceleration

Setup:
```bash
cd scripts/tere-dl-rppg
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Then run steps 1-6 above sequentially. Each step is independent and resumable.

## Why not Modal/Replicate

Patrick's call 2026-10-04 — keep training on local Mac. M-series MPS is slow
compared to A100 (~5× slower) but zero marginal cost and no auth leakage.
Overnight training is fine for this iteration scale. If we move to >500
subjects post-launch, revisit GPU hosting.
