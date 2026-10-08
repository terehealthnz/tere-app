#!/usr/bin/env python3
"""
MPU-rPPG dataset ingest for Tere VitalsValidate benchmarking.

Loads the MPU-rPPG dataset (Scientific Data 2026, DOI 10.1038/s41597-026-07310-3,
Figshare DOI 10.6084/m9.figshare.29377835) and uploads it to the Tere
validation_readings table as pseudo-readings with subject_code prefix
'MPU-' so our existing /rppg-replay harness can benchmark our baseline
algorithm against ground-truth HR + SpO2 captured by the paper's authors.

Paper:   https://pubmed.ncbi.nlm.nih.gov/42209535/
Dataset: https://figshare.com/articles/dataset/MPU-rPPG_Sample_Dataset/29377835
         Sample: ~7.8 GB, 5 subjects (numbered folders + one at root).
         Full:   >1 TB, 50 subjects, email-gated (flyingsnow2235@gmail.com).
Licence: CC BY 4.0 on Figshare metadata; authors' written description says
         "research purposes only" — we're treating this as evaluation
         pending the licence-use clarification email ([[task-627]]).

CSV format (per MPU-rPPG convention):
    Count, PPG, HR, SPO2
    0,     0,   76, 99
    1,     24,  76, 99
    ...
PPG is the reference pulse waveform (unitless), HR is the live pulse-ox
reading in bpm, SPO2 is the oxygen saturation %. Sampling appears to be
around 100 Hz regardless of video fps — we take the median across the
whole recording as the scalar ground truth.

Folder structure of the Figshare sample:
    mpu-rppg-sample/root/Output.mkv  (+ Output.csv)   ← subject 0 / unlabeled
    mpu-rppg-sample/5/Output.mp4     (+ Output.csv)
    mpu-rppg-sample/8/Output.mp4     (+ Output.csv)
    mpu-rppg-sample/9/Output.mp4     (+ Output.csv)
    mpu-rppg-sample/10/Output.mp4    (+ Output.csv)

Face ROI: unlike CHILL (pre-cropped 36×36 forehead), MPU-rPPG ships full
video. We use OpenCV's Haar cascade to detect the largest face per frame
and compute mean RGB over that bbox. If no face is detected, we fall back
to a centered square crop so we still get a signal (noisier). To speed
things up we detect the face every N frames and re-use the bbox.

Usage:
    1. Download the sample (if not already):
         The 7.8 GB sample lives in ~/Downloads/mpu-rppg-sample/
    2. Set env vars:
         VITE_SUPABASE_URL=https://xxx.supabase.co
         SUPABASE_SERVICE_ROLE_KEY=eyJ...
    3. Install deps:
         pip install numpy opencv-python supabase
    4. Run (dry-run first):
         python scripts/ingest_mpu_rppg.py --input ~/Downloads/mpu-rppg-sample --dry-run
       Review the planned inserts, then re-run without --dry-run.

Output: adds rows to validation_subjects (MPU-01..MPU-NN) and
validation_readings with raw_rppg_signal.frames in the same {r,g,b,t}
format our live pipeline uses. After ingest, open /rppg-replay in the
admin, click "Run replay", and the leaderboard will include MPU readings.

To separate MPU vs CHILL vs TERE metrics in the dashboard, filter by
subject_code prefix.
"""

import argparse
import csv
import os
import sys
from pathlib import Path

try:
    import numpy as np
except ImportError:
    sys.exit("Missing numpy. Run: pip install numpy")

try:
    import cv2
except ImportError:
    sys.exit("Missing opencv-python. Run: pip install opencv-python")

try:
    from supabase import create_client
except ImportError:
    create_client = None  # only needed when writing (not --dry-run)


SUBJECT_PREFIX = "MPU"
FACE_DETECT_EVERY = 15  # redetect face every N frames; reuse bbox otherwise


# ─── Face detection ─────────────────────────────────────────────────────────

_CASCADE = None
_CASCADE_AVAILABLE = None  # tri-state: None=unprobed, True=loaded, False=unavailable

def _get_cascade():
    """Lazy-load the Haar cascade. Returns None if cv2 build lacks it (common
    with opencv-python-headless). Caller must fall back to center-crop."""
    global _CASCADE, _CASCADE_AVAILABLE
    if _CASCADE_AVAILABLE is False:
        return None
    if _CASCADE is not None:
        return _CASCADE
    try:
        path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        cascade = cv2.CascadeClassifier(path)
        if cascade.empty():
            raise RuntimeError(f"empty cascade at {path}")
        _CASCADE = cascade
        _CASCADE_AVAILABLE = True
        return _CASCADE
    except (AttributeError, RuntimeError) as e:
        print(f"  WARN: face detection unavailable ({e}); using center-crop fallback", file=sys.stderr)
        _CASCADE_AVAILABLE = False
        return None


def detect_face_bbox(frame_bgr):
    """Return (x, y, w, h) of the largest frontal face, or None."""
    cascade = _get_cascade()
    if cascade is None:
        return None
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))
    if len(faces) == 0:
        return None
    # Largest-area face
    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    return tuple(int(v) for v in faces[0])


def center_crop_bbox(frame_bgr, side_ratio=0.4):
    """Fallback ROI: centered square covering `side_ratio` of the shorter edge."""
    h, w = frame_bgr.shape[:2]
    side = int(min(h, w) * side_ratio)
    x = (w - side) // 2
    y = (h - side) // 2
    return (x, y, side, side)


# ─── Video ingest ────────────────────────────────────────────────────────────

def extract_face_mean_rgb_from_video(video_path: Path, max_frames: int | None = None,
                                     verbose: bool = False):
    """Decode a video, detect face every N frames, return per-frame mean RGB in face ROI.

    Returns (frames_list, measured_fps, face_hit_rate).
    frames_list is [{r,g,b,t}] in the Tere `raw_rppg_signal.frames` schema.
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None, 0, 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames = []
    frame_idx = 0
    bbox = None
    face_hits = 0
    face_attempts = 0
    fallback_bbox = None
    while True:
        ret, frame_bgr = cap.read()
        if not ret:
            break
        if max_frames and frame_idx >= max_frames:
            break
        # Redetect face periodically (not every frame — too slow).
        if frame_idx % FACE_DETECT_EVERY == 0 or bbox is None:
            face_attempts += 1
            detected = detect_face_bbox(frame_bgr)
            if detected is not None:
                bbox = detected
                face_hits += 1
            elif bbox is None:
                # First-frame face miss — fall back to center crop.
                if fallback_bbox is None:
                    fallback_bbox = center_crop_bbox(frame_bgr)
                bbox = fallback_bbox
        x, y, w, h = bbox
        roi = frame_bgr[y:y + h, x:x + w]
        if roi.size == 0:
            frame_idx += 1
            continue
        rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB).astype(np.float32)
        frames.append({
            "r": float(rgb[..., 0].mean()),
            "g": float(rgb[..., 1].mean()),
            "b": float(rgb[..., 2].mean()),
            "t": int(round(frame_idx * 1000 / fps)),
        })
        frame_idx += 1
        if verbose and frame_idx % 500 == 0:
            print(f"      ...{frame_idx} frames", flush=True)
    cap.release()
    hit_rate = (face_hits / face_attempts) if face_attempts else 0.0
    return frames, fps, hit_rate


# ─── Ground truth CSV reader ─────────────────────────────────────────────────

def load_mpu_ground_truth(csv_path: Path):
    """Return (median_hr, median_spo2) scalars from an MPU-rPPG Output.csv.

    CSV columns: Count, PPG, HR, SPO2. HR is bpm, SPO2 is %. We median over
    the full recording to produce a single ground-truth scalar per reading.
    Zero / <30 bpm values are treated as sensor dropouts and excluded.
    """
    hr_values = []
    spo2_values = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                hr = float(row.get("HR", "") or "nan")
                spo2 = float(row.get("SPO2", "") or "nan")
            except ValueError:
                continue
            if np.isfinite(hr) and 30 <= hr <= 220:
                hr_values.append(hr)
            if np.isfinite(spo2) and 70 <= spo2 <= 100:
                spo2_values.append(spo2)
    median_hr = float(np.median(hr_values)) if hr_values else float("nan")
    median_spo2 = float(np.median(spo2_values)) if spo2_values else float("nan")
    return median_hr, median_spo2


# ─── Dataset walker ──────────────────────────────────────────────────────────

def walk_mpu_dir(input_dir: Path):
    """Yield (subject_code, video_path, csv_path) tuples.

    MPU-rPPG sample layout: numbered subject folders each holding
    Output.mkv or Output.mp4 + Output.csv. The Figshare sample additionally
    puts one subject's files at the root (unnumbered) which we treat as
    subject 0.
    """
    # Numbered subfolders first.
    subjects = []
    for p in sorted(input_dir.iterdir()):
        if not p.is_dir():
            continue
        name = p.name.lower()
        if name == "root":
            subjects.append(("00", p))
        else:
            digits = "".join(c for c in name if c.isdigit())
            if digits:
                subjects.append((f"{int(digits):02d}", p))
    for subj_num, subj_dir in subjects:
        video = None
        for ext in (".mp4", ".mkv", ".avi", ".mov"):
            cand = subj_dir / f"Output{ext}"
            if cand.exists():
                video = cand
                break
        csv_path = subj_dir / "Output.csv"
        if video is None or not csv_path.exists():
            print(f"  WARN: skipping {subj_dir.name} — missing video or csv", file=sys.stderr)
            continue
        yield f"{SUBJECT_PREFIX}-{subj_num}", video, csv_path


# ─── Supabase upload ─────────────────────────────────────────────────────────

def ensure_subject(supabase, subject_code: str, dry_run: bool = False):
    existing = supabase.table("validation_subjects").select("id").eq("subject_code", subject_code).execute()
    if existing.data:
        return existing.data[0]["id"]
    if dry_run:
        print(f"  [dry-run] would create subject {subject_code}")
        return None
    created = supabase.table("validation_subjects").insert({
        "subject_code": subject_code,
        "fitzpatrick_scale": None,
        "notes": "MPU-rPPG benchmark (Scientific Data 2026, DOI 10.1038/s41597-026-07310-3, Figshare 10.6084/m9.figshare.29377835)",
    }).execute()
    return created.data[0]["id"]


def upload_reading(supabase, subject_id: str, subject_code: str,
                   frames: list, fps: float, manual_hr: float, manual_spo2: float,
                   face_hit_rate: float, video_name: str, dry_run: bool = False):
    row = {
        "subject_id": subject_id,
        "subject_code": subject_code,
        "manual_hr": int(round(manual_hr)),
        "manual_spo2": int(round(manual_spo2)) if np.isfinite(manual_spo2) else None,
        "manual_systolic": None,
        "manual_diastolic": None,
        "tere_hr": None,
        "tere_rr": None,
        "raw_rppg_signal": {
            "frames": frames,
            "fps": fps,
            "source": f"MPU-rPPG:{video_name}",
            "face_hit_rate": round(face_hit_rate, 3),
        },
        "notes": (
            f"MPU-rPPG benchmark · {len(frames)} frames @ {fps:.1f}fps · "
            f"face_hit_rate={face_hit_rate:.1%} · "
            f"ground-truth HR={manual_hr:.1f}bpm, SpO2={manual_spo2:.1f}%"
        ),
    }
    if dry_run:
        print(f"  [dry-run] would insert reading: {subject_code} / "
              f"manual_hr={manual_hr:.1f} / manual_spo2={manual_spo2:.1f} / "
              f"{len(frames)} frames / face_hit={face_hit_rate:.1%}")
        return
    supabase.table("validation_readings").insert(row).execute()


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--input", required=True, type=Path,
                   help="Path to MPU-rPPG dataset directory (e.g. ~/Downloads/mpu-rppg-sample)")
    p.add_argument("--dry-run", action="store_true",
                   help="Preview inserts without writing to Supabase")
    p.add_argument("--limit", type=int, default=None,
                   help="Process only first N subjects (for smoke-testing)")
    p.add_argument("--max-frames", type=int, default=None,
                   help="Cap frames per video (useful for the 9-min root MKV; "
                        "default: full video — 16k+ frames for the long one)")
    args = p.parse_args()

    if not args.input.is_dir():
        sys.exit(f"Input directory not found: {args.input}")

    url = os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not args.dry_run:
        if not url or not key:
            sys.exit("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var")
        if create_client is None:
            sys.exit("Missing supabase. Run: pip install supabase")
    supabase = create_client(url, key) if not args.dry_run else None
    if supabase: print(f"Connected: {url}")
    print(f"Dry run: {args.dry_run}")
    print(f"Max frames per video: {args.max_frames or '(no cap — full video)'}")
    print()

    ingested, skipped = 0, 0
    for i, (subject_code, video, csv_path) in enumerate(walk_mpu_dir(args.input)):
        if args.limit and ingested >= args.limit:
            break
        print(f"[{i:3d}] {subject_code} · video={video.name} ({video.stat().st_size/1e9:.2f} GB) · csv={csv_path.name}")
        hr, spo2 = load_mpu_ground_truth(csv_path)
        if np.isnan(hr) or hr < 30 or hr > 220:
            print(f"      SKIP: no valid ground-truth HR (got {hr})")
            skipped += 1
            continue
        print(f"      Ground truth: HR={hr:.1f}bpm, SpO2={spo2:.1f}% · decoding video...")
        frames, fps, face_hit_rate = extract_face_mean_rgb_from_video(
            video, max_frames=args.max_frames, verbose=True
        )
        if not frames or len(frames) < 60:
            print(f"      SKIP: too few frames ({len(frames) if frames else 0})")
            skipped += 1
            continue
        subject_id = ensure_subject(supabase, subject_code, args.dry_run) if supabase else None
        upload_reading(supabase, subject_id, subject_code, frames, fps,
                       hr, spo2, face_hit_rate, video.name, args.dry_run)
        ingested += 1
        print(f"      OK: {len(frames)} frames @ {fps:.1f}fps · face_hit_rate={face_hit_rate:.1%}")

    print()
    print(f"Done. Ingested: {ingested} · Skipped: {skipped}")
    print()
    print("Next steps:")
    print("  1. Open https://terehealth.co.nz/rppg-replay in the Tere admin")
    print("  2. Click 'Run replay' — leaderboard will include MPU-* readings")
    print("  3. Filter MPU vs CHILL vs TERE metrics by subject_code prefix in CSV export")


if __name__ == "__main__":
    main()
