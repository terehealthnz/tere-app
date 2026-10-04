#!/usr/bin/env python3
"""
Step 2 — Decode each video, detect face per frame via MediaPipe FaceLandmarker
(same tasks-vision API the browser uses), crop 72×72 forehead patch, save as
.npy arrays with shape (T, 72, 72, 3) uint8.

Also writes ./data/labels.csv with one row per video including manual_hr,
subject_id, and demographics pulled from the manifest.

Usage:
    python 02_extract_face_crops.py tere-dl-manifest.json
"""

import json
import sys
import urllib.request
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import pandas as pd
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from tqdm import tqdm

CROP_SIZE = 72
# Forehead patch same as rppg.js sampleROI top-weighted region: 30-70% horizontal × 0-18% vertical of face bbox
FOREHEAD_X_RANGE = (0.30, 0.70)
FOREHEAD_Y_RANGE = (0.00, 0.18)

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
MODEL_PATH = Path(__file__).parent / "data" / "face_landmarker.task"


def ensure_model():
    """Download the FaceLandmarker .task file on first run."""
    if MODEL_PATH.exists():
        return
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading face landmarker model to {MODEL_PATH} ...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print(f"Downloaded {MODEL_PATH.stat().st_size / 1024:.0f} KB")


def make_detector():
    # Explicitly pin to CPU delegate — MediaPipe's Metal/GPU path crashes on
    # Apple Silicon when the FaceLandmarker TensorsToDetectionsCalculator can't
    # initialise DrishtiMetalHelper. Browser-side GPU works via WebGL, but the
    # Python tasks-vision bindings don't fall back cleanly, so we force CPU.
    base_options = mp_python.BaseOptions(
        model_asset_path=str(MODEL_PATH),
        delegate=mp_python.BaseOptions.Delegate.CPU,
    )
    options = mp_vision.FaceLandmarkerOptions(
        base_options=base_options,
        running_mode=mp_vision.RunningMode.VIDEO,
        num_faces=1,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
    )
    return mp_vision.FaceLandmarker.create_from_options(options)


def extract_crops_from_video(video_path: Path, crop_dir: Path, reading_id: str):
    """Decode video, run face mesh, produce (T, 72, 72, 3) uint8 crops."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None, 0, "cv2 could not open video"

    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    detector = make_detector()

    crops = []
    face_seen = 0
    frame_idx = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame_idx += 1
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w = rgb.shape[:2]

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        # tasks-vision wants monotonically-increasing timestamps in ms. Compute
        # from frame index since cv2 doesn't always expose reliable mediaTime.
        timestamp_ms = int(frame_idx * (1000 / fps))
        res = detector.detect_for_video(mp_image, timestamp_ms)
        if not res.face_landmarks:
            continue
        face_seen += 1
        lms = res.face_landmarks[0]

        xs = [p.x for p in lms]
        ys = [p.y for p in lms]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)

        fx1 = int((min_x + (max_x - min_x) * FOREHEAD_X_RANGE[0]) * w)
        fx2 = int((min_x + (max_x - min_x) * FOREHEAD_X_RANGE[1]) * w)
        fy1 = int((min_y + (max_y - min_y) * FOREHEAD_Y_RANGE[0]) * h)
        fy2 = int((min_y + (max_y - min_y) * FOREHEAD_Y_RANGE[1]) * h)

        if fx2 - fx1 < 10 or fy2 - fy1 < 5:
            continue
        patch = rgb[fy1:fy2, fx1:fx2]
        if patch.size == 0:
            continue
        patch = cv2.resize(patch, (CROP_SIZE, CROP_SIZE), interpolation=cv2.INTER_AREA)
        crops.append(patch)

    detector.close()
    cap.release()

    if len(crops) < 60:
        return None, face_seen, f"only {len(crops)} crops (need 60+)"

    arr = np.stack(crops, axis=0).astype(np.uint8)
    out_path = crop_dir / f"{reading_id}.npy"
    np.save(out_path, arr)
    return arr.shape, face_seen, None


def main(manifest_path: str):
    ensure_model()
    manifest = json.loads(Path(manifest_path).read_text())
    videos_dir = Path(__file__).parent / "data" / "videos"
    crop_dir = Path(__file__).parent / "data" / "crops"
    crop_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    extracted, skipped, failed = 0, 0, 0

    for row in tqdm(manifest, desc="Extracting"):
        rid = row["id"]
        video_path = videos_dir / f"{rid}.webm"
        if not video_path.exists():
            skipped += 1
            continue
        out = crop_dir / f"{rid}.npy"
        if out.exists():
            extracted += 1
            arr = np.load(out, mmap_mode="r")
            frames = int(arr.shape[0])
        else:
            shape, face_seen, err = extract_crops_from_video(video_path, crop_dir, rid)
            if err:
                failed += 1
                print(f"{rid}: {err} (face seen on {face_seen} frames)")
                continue
            extracted += 1
            frames = shape[0]

        rows.append({
            "reading_id": rid,
            "subject_id": row.get("subject_id") or row.get("subject_code"),
            "manual_hr": row.get("manual_hr"),
            "tere_hr": row.get("tere_hr"),
            "me_rppg_hr": row.get("me_rppg_hr"),
            "age": row.get("age"),
            "sex": row.get("sex"),
            "fitzpatrick": row.get("fitzpatrick"),
            "frames": frames,
            "recorded_at": row.get("recorded_at"),
        })

    df = pd.DataFrame(rows)
    # Drop rows without a manual_hr label — can't train against them
    labelled = df[df["manual_hr"].notna()].reset_index(drop=True)
    labels_path = Path(__file__).parent / "data" / "labels.csv"
    labelled.to_csv(labels_path, index=False)

    print(f"\nExtracted {extracted}, skipped {skipped} (no video), failed {failed}.")
    print(f"Labelled rows (manual_hr present): {len(labelled)} of {len(df)}")
    print(f"Unique subjects: {labelled['subject_id'].nunique()}")
    print(f"Mean frames per clip: {labelled['frames'].mean():.0f}")
    print(f"Manual HR range: {labelled['manual_hr'].min()}-{labelled['manual_hr'].max()} bpm")
    print(f"Labels saved: {labels_path}")
    print(f"Crops in: {crop_dir}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python 02_extract_face_crops.py <manifest.json>")
        sys.exit(1)
    main(sys.argv[1])
