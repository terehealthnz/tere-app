#!/usr/bin/env python3
"""
CHILL dataset ingest for Tere VitalsValidate benchmarking.

Loads the CHILL rPPG dataset (Nature NPJ Digital Medicine 2025,
Zenodo DOI 10.5281/zenodo.14637544) and uploads it to the Tere
validation_readings table as pseudo-readings with subject_code
prefix 'CHILL-' so our existing /rppg-replay harness can benchmark
our baseline algorithm on the same data the paper used.

Paper: https://pmc.ncbi.nlm.nih.gov/articles/PMC12678791/
Dataset: 45 subjects × 4 conditions (bright/dark × resting/elevated)
         = 180 one-minute recordings at ~30fps, pre-cropped to 36×36
License: CC BY 4.0 (reuse permitted with attribution)

Usage:
    1. Manually download CHILL from Zenodo (~500MB-5GB depending on format):
         https://zenodo.org/records/14637544
       Place extracted files in a local directory (e.g. /tmp/CHILL/).
    2. Set env vars:
         VITE_SUPABASE_URL=https://xxx.supabase.co
         SUPABASE_SERVICE_ROLE_KEY=eyJ...
    3. Install deps:
         pip install numpy opencv-python h5py supabase python-dotenv
    4. Run:
         python scripts/ingest_chill_dataset.py --input /tmp/CHILL --dry-run
       Review the planned inserts, then re-run without --dry-run.

Output: adds rows to validation_subjects (CHILL-01..CHILL-45) and
validation_readings (180 rows) with raw_rppg_signal.frames in the
same {r,g,b,t} format our live pipeline uses. After ingest, open
/rppg-replay in the Tere admin, click "Run replay", and the leaderboard
will include CHILL readings alongside existing TERE readings.

To separate CHILL vs TERE metrics in the dashboard, filter by
subject_code prefix. The paper's POS-alone MAE on CHILL was 1.1 bpm;
our baseline on our TERE data is 5.92 bpm. If our baseline on CHILL
is also ~1-2 bpm → our algo is fine, Tere capture conditions are the
issue. If >3 bpm → implementation gap worth closing.
"""

import argparse
import json
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
    cv2 = None  # Optional — only needed if dataset ships as video files.

try:
    import h5py
except ImportError:
    h5py = None  # Optional — only needed if dataset ships as HDF5.

try:
    from supabase import create_client
except ImportError:
    sys.exit("Missing supabase. Run: pip install supabase")


SUBJECT_PREFIX = "CHILL"
TARGET_FPS = 30  # CHILL recordings are nominally 30fps per the paper


# ─── Dataset readers (handle the common Zenodo delivery formats) ─────────────

def extract_face_mean_rgb_from_video(video_path: Path):
    """Decode a video file (.mp4/.avi) and compute per-frame face-mean RGB.

    CHILL frames are already pre-cropped to 36×36 face regions, so no
    face detection is needed — just mean over all pixels per frame.
    """
    if cv2 is None:
        sys.exit("opencv-python required for video decoding. pip install opencv-python")
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None, 0
    fps = cap.get(cv2.CAP_PROP_FPS) or TARGET_FPS
    frames = []
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        # OpenCV uses BGR by default — convert to RGB.
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.float32)
        r = float(rgb[..., 0].mean())
        g = float(rgb[..., 1].mean())
        b = float(rgb[..., 2].mean())
        t_ms = int(round(frame_idx * 1000 / fps))
        frames.append({"r": r, "g": g, "b": b, "t": t_ms})
        frame_idx += 1
    cap.release()
    return frames, fps


def extract_face_mean_rgb_from_npy(npy_path: Path, fps_hint: float = TARGET_FPS):
    """Load a numpy array of shape (T, H, W, 3) and compute per-frame mean RGB."""
    arr = np.load(npy_path)
    if arr.ndim != 4 or arr.shape[-1] != 3:
        return None, 0
    T = arr.shape[0]
    arr = arr.astype(np.float32)
    means = arr.reshape(T, -1, 3).mean(axis=1)  # (T, 3)
    frames = []
    for i, (r, g, b) in enumerate(means):
        t_ms = int(round(i * 1000 / fps_hint))
        frames.append({"r": float(r), "g": float(g), "b": float(b), "t": t_ms})
    return frames, fps_hint


def extract_face_mean_rgb_from_h5(h5_path: Path, dataset_key: str = "frames", fps_hint: float = TARGET_FPS):
    """Load frames from an HDF5 file. Assumes shape (T, H, W, 3)."""
    if h5py is None:
        sys.exit("h5py required for HDF5 ingest. pip install h5py")
    with h5py.File(h5_path, "r") as f:
        if dataset_key not in f:
            print(f"  WARN: '{dataset_key}' not in {h5_path}, keys: {list(f.keys())}", file=sys.stderr)
            return None, 0
        arr = f[dataset_key][()]
    return extract_face_mean_rgb_from_npy_data(arr, fps_hint)


def extract_face_mean_rgb_from_npy_data(arr: np.ndarray, fps_hint: float = TARGET_FPS):
    T = arr.shape[0]
    arr = arr.astype(np.float32)
    means = arr.reshape(T, -1, 3).mean(axis=1)
    frames = []
    for i, (r, g, b) in enumerate(means):
        t_ms = int(round(i * 1000 / fps_hint))
        frames.append({"r": float(r), "g": float(g), "b": float(b), "t": t_ms})
    return frames, fps_hint


# ─── Ground truth HR extraction ──────────────────────────────────────────────

def hr_from_bvp(bvp_signal: np.ndarray, sample_rate_hz: float) -> float:
    """Mean HR from a BVP (ground-truth pulse) signal via peak detection.

    Simple algorithm: band-pass 0.75–3.5 Hz (45–210 bpm), find peaks
    above 30% max amplitude with 0.3s min spacing, HR = 60 / median IBI.
    Only used when CHILL provides ground-truth as a BVP waveform rather
    than a scalar HR per recording. If the dataset ships scalar HR,
    use that directly.
    """
    from scipy.signal import butter, filtfilt, find_peaks
    nyq = sample_rate_hz / 2
    low, high = 0.75 / nyq, 3.5 / nyq
    b, a = butter(4, [low, high], btype="band")
    filtered = filtfilt(b, a, bvp_signal)
    min_spacing = int(0.3 * sample_rate_hz)
    threshold = 0.3 * np.max(np.abs(filtered))
    peaks, _ = find_peaks(filtered, height=threshold, distance=min_spacing)
    if len(peaks) < 3:
        return float("nan")
    ibis_sec = np.diff(peaks) / sample_rate_hz
    ibis_sec = ibis_sec[(ibis_sec >= 60 / 200) & (ibis_sec <= 60 / 40)]
    if len(ibis_sec) == 0:
        return float("nan")
    return float(60.0 / np.median(ibis_sec))


# ─── Dataset structure walker ────────────────────────────────────────────────

def walk_chill_dir(input_dir: Path):
    """Yield (subject_code, condition_tag, media_path, label_path) tuples.

    This is defensive — the exact Zenodo structure may be:
      CHILL/subject_01/bright_rest.mp4 + ground_truth.csv
      OR CHILL/subject_01/bright_rest.npy + bvp.npy
      OR CHILL/subject_01/bright_rest.h5
    We scan for common filename patterns and emit everything we find.
    Adjust the filename patterns here if your download layout differs.
    """
    for subject_dir in sorted(input_dir.iterdir()):
        if not subject_dir.is_dir():
            continue
        # Subject code: pad to 2 digits.
        name = subject_dir.name.lower()
        subj_num = "".join(c for c in name if c.isdigit())
        if not subj_num:
            continue
        subject_code = f"{SUBJECT_PREFIX}-{int(subj_num):02d}"

        for media in sorted(subject_dir.iterdir()):
            if media.suffix.lower() not in {".mp4", ".avi", ".npy", ".h5", ".hdf5"}:
                continue
            # Condition tag inferred from filename (bright/dark × rest/elevated).
            stem = media.stem.lower()
            tag = "unknown"
            if "bright" in stem and "rest" in stem:   tag = "bright_rest"
            elif "bright" in stem and ("elev" in stem or "exer" in stem): tag = "bright_elev"
            elif "dark"   in stem and "rest" in stem: tag = "dark_rest"
            elif "dark"   in stem and ("elev" in stem or "exer" in stem): tag = "dark_elev"
            # Ground truth label — look for bvp.csv/.npy or a scalar hr.csv.
            label = None
            for cand in [f"{media.stem}_bvp.npy", f"{media.stem}_bvp.csv",
                         f"{media.stem}_hr.csv",  f"{media.stem}.json",
                         "ground_truth.csv"]:
                p = subject_dir / cand
                if p.exists():
                    label = p
                    break
            yield subject_code, tag, media, label


def load_ground_truth_hr(label_path: Path, media_stem: str) -> float:
    """Return mean HR in bpm for the given recording.

    Handles multiple label formats. If label is a BVP waveform, compute
    HR from it. If label is a scalar HR CSV/JSON, read it directly.
    Returns NaN if parsing fails — ingest will skip the row.
    """
    if label_path is None:
        return float("nan")
    suffix = label_path.suffix.lower()
    if suffix == ".json":
        with open(label_path) as f:
            data = json.load(f)
        for key_variant in [media_stem, media_stem.lower(), "mean_hr", "hr"]:
            if key_variant in data:
                return float(data[key_variant])
        return float("nan")
    if suffix == ".csv":
        import csv
        with open(label_path) as f:
            rows = list(csv.reader(f))
        # Try scalar-HR CSV first (2 columns: filename,hr).
        for r in rows:
            if len(r) >= 2 and media_stem in r[0]:
                try:
                    return float(r[1])
                except ValueError:
                    pass
        # Treat as BVP waveform: single column of samples at ~1000Hz.
        try:
            bvp = np.array([float(r[0]) for r in rows if r and r[0]])
            return hr_from_bvp(bvp, sample_rate_hz=1000.0)
        except (ValueError, IndexError):
            return float("nan")
    if suffix == ".npy":
        bvp = np.load(label_path).astype(np.float64).flatten()
        return hr_from_bvp(bvp, sample_rate_hz=1000.0)
    return float("nan")


# ─── Supabase upload ─────────────────────────────────────────────────────────

def ensure_subject(supabase, subject_code: str, dry_run: bool = False):
    """Upsert into validation_subjects. Returns subject id (uuid)."""
    existing = supabase.table("validation_subjects").select("id").eq("subject_code", subject_code).execute()
    if existing.data:
        return existing.data[0]["id"]
    if dry_run:
        print(f"  [dry-run] would create subject {subject_code}")
        return None
    created = supabase.table("validation_subjects").insert({
        "subject_code": subject_code,
        "fitzpatrick_scale": None,  # CHILL dataset is anonymised, no Fitzpatrick labels
        "notes": "CHILL benchmark dataset (Nature NPJ Digital Medicine 2025, Zenodo 10.5281/zenodo.14637544)",
    }).execute()
    return created.data[0]["id"]


def upload_reading(supabase, subject_id: str, subject_code: str,
                   condition_tag: str, frames: list, fps: float,
                   manual_hr: float, dry_run: bool = False):
    """Insert a validation_readings row with raw_rppg_signal.frames in Tere format."""
    row = {
        "subject_id": subject_id,
        "subject_code": subject_code,
        "manual_hr": int(round(manual_hr)),
        "manual_systolic": None,
        "manual_diastolic": None,
        "tere_hr": None,          # Will be filled by replay in-browser
        "tere_rr": None,
        "raw_rppg_signal": {
            "frames": frames,
            "fps": fps,
            "source": f"CHILL:{condition_tag}",
        },
        "notes": f"CHILL benchmark · {condition_tag} · {len(frames)} frames @ {fps:.1f}fps",
    }
    if dry_run:
        print(f"  [dry-run] would insert reading: {subject_code} / {condition_tag} / "
              f"manual_hr={manual_hr:.1f} / {len(frames)} frames")
        return
    supabase.table("validation_readings").insert(row).execute()


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--input", required=True, type=Path,
                   help="Path to extracted CHILL dataset directory")
    p.add_argument("--dry-run", action="store_true",
                   help="Preview inserts without writing to Supabase")
    p.add_argument("--limit", type=int, default=None,
                   help="Process only first N recordings (for testing)")
    args = p.parse_args()

    if not args.input.is_dir():
        sys.exit(f"Input directory not found: {args.input}")

    url = os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var")

    supabase = create_client(url, key)
    print(f"Connected: {url}")
    print(f"Dry run: {args.dry_run}")
    print()

    ingested, skipped = 0, 0
    for i, (subject_code, condition, media, label) in enumerate(walk_chill_dir(args.input)):
        if args.limit and ingested >= args.limit:
            break
        print(f"[{i:3d}] {subject_code} / {condition} / {media.name}")
        # Extract frames based on file format.
        suffix = media.suffix.lower()
        if suffix in {".mp4", ".avi"}:
            frames, fps = extract_face_mean_rgb_from_video(media)
        elif suffix == ".npy":
            frames, fps = extract_face_mean_rgb_from_npy(media)
        elif suffix in {".h5", ".hdf5"}:
            frames, fps = extract_face_mean_rgb_from_h5(media)
        else:
            print(f"      SKIP: unsupported format {suffix}")
            skipped += 1
            continue
        if not frames or len(frames) < 60:
            print(f"      SKIP: too few frames ({len(frames) if frames else 0})")
            skipped += 1
            continue
        hr = load_ground_truth_hr(label, media.stem)
        if np.isnan(hr) or hr < 30 or hr > 220:
            print(f"      SKIP: no valid ground-truth HR (got {hr})")
            skipped += 1
            continue
        subject_id = ensure_subject(supabase, subject_code, args.dry_run)
        upload_reading(supabase, subject_id, subject_code, condition,
                       frames, fps, hr, args.dry_run)
        ingested += 1
        print(f"      OK: {len(frames)} frames @ {fps:.1f}fps · manual_hr={hr:.1f}")

    print()
    print(f"Done. Ingested: {ingested} · Skipped: {skipped}")
    print()
    print("Next steps:")
    print("  1. Open https://terehealth.co.nz/rppg-replay in the Tere admin")
    print("  2. Click 'Run replay' — leaderboard will include CHILL readings")
    print("  3. Filter TERE vs CHILL metrics by subject_code prefix in CSV export")


if __name__ == "__main__":
    main()
