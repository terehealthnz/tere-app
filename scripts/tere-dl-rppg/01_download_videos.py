#!/usr/bin/env python3
"""
Step 1 — Download the 70 validation videos from the manifest JSON exported
from the admin dashboard.

Usage:
    python 01_download_videos.py tere-dl-manifest.json

The manifest is a JSON array of {id, subject_code, video_url, manual_hr, ...}.
We iterate, GET each pre-signed Supabase URL, save to ./data/videos/{id}.webm.
Idempotent — skips files that already exist. Sequential (not parallel) so a
flaky Starlink connection doesn't blow up with 70 concurrent downloads.
"""

import json
import os
import sys
from pathlib import Path
import requests
from tqdm import tqdm


def main(manifest_path: str):
    manifest = json.loads(Path(manifest_path).read_text())
    videos_dir = Path(__file__).parent / "data" / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)

    downloaded, skipped, failed = 0, 0, 0
    with tqdm(manifest, desc="Downloading") as bar:
        for row in bar:
            rid = row["id"]
            url = row.get("video_url")
            if not url:
                skipped += 1
                continue
            out = videos_dir / f"{rid}.webm"
            if out.exists() and out.stat().st_size > 10_000:
                skipped += 1
                bar.set_postfix(skipped=skipped, downloaded=downloaded)
                continue
            try:
                r = requests.get(url, stream=True, timeout=120)
                r.raise_for_status()
                with open(out, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        f.write(chunk)
                size_mb = out.stat().st_size / (1 << 20)
                if size_mb < 0.1:
                    out.unlink()
                    failed += 1
                    print(f"\n{rid}: file too small ({size_mb:.2f} MB), likely 403 — signed URL may have expired")
                else:
                    downloaded += 1
                    bar.set_postfix(downloaded=downloaded, skipped=skipped, failed=failed)
            except Exception as e:
                failed += 1
                print(f"\n{rid} failed: {e}")

    print(f"\nDone. Downloaded {downloaded}, skipped {skipped} (already present or no URL), failed {failed}.")
    print(f"Videos in: {videos_dir}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python 01_download_videos.py <manifest.json>")
        sys.exit(1)
    main(sys.argv[1])
