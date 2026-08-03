#!/usr/bin/env python3
"""
geocode_pharmacies.py

Adds `lat` / `lng` fields to public/pharmacies.json by geocoding each
premises address via OpenStreetMap's Nominatim service. Idempotent —
pharmacies that already have coordinates are skipped, so re-runs after
a monthly refresh only geocode the new entries.

Nominatim usage policy:
  · Max 1 request per second.
  · Descriptive User-Agent required (contact email included below).
  · Attribution required in any UI: "© OpenStreetMap contributors".

Free, no API key. Runs in ~17 minutes for the full ~1050-pharmacy list.
Progress printed every 25 rows so you can tail the run.

Usage:
  python scripts/geocode_pharmacies.py
  python scripts/geocode_pharmacies.py --force        # re-geocode everything, even entries with lat/lng
  python scripts/geocode_pharmacies.py --limit 50     # only process first N (for testing)
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import requests

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "TereHealth-PharmacyGeocoder/1.0 (patrickherling@gmail.com)"
RATE_LIMIT_SECONDS = 1.0

# NZ lat/lng bounding box — used to reject geocoding hits that fall
# outside NZ (Nominatim occasionally matches an ambiguous address to
# an Australian / UK street of the same name).
NZ_BOUNDS = {"lat": (-47.5, -34.0), "lng": (166.0, 179.0)}

# The Medsafe register glues district/region/network text onto the end of
# addresses ("... 5012, Capital, Coast and Hutt Valley"). Nominatim treats
# that as extra street context and often fails to find anything. Truncating
# at the NZ 4-digit postcode gives us a clean address string.
POSTCODE_RE = re.compile(r"\b(\d{4})\b")

# Shop/Unit/Tenancy/Retail prefixes are structural, not part of the actual
# street address. Stripping them helps Nominatim's street matcher.
PREFIX_RE = re.compile(r"^\s*(shop|unit|tenancy|retail|suite|level|floor|kiosk|store|lot)\s+\S+?[,\s]+", re.IGNORECASE)


def normalise_address(raw: str) -> str:
    """Clean the Medsafe address string for geocoding.

    Two known-bad patterns in the register:
      1. Trailing region/district appended after the postcode
      2. "Shop 3," / "Unit 1," / "Tenancy 5," structural prefixes
    """
    if not raw:
        return ""
    s = raw.strip()
    m = POSTCODE_RE.search(s)
    if m:
        s = s[: m.end()].rstrip(",").strip()
    prev = None
    while prev != s:
        prev = s
        s = PREFIX_RE.sub("", s).strip()
    return s


def _query_nominatim(query: str) -> Optional[dict]:
    params = {
        "q": query,
        "format": "json",
        "limit": 1,
        "countrycodes": "nz",
    }
    try:
        r = requests.get(NOMINATIM_URL, params=params,
                         headers={"User-Agent": USER_AGENT}, timeout=15)
        r.raise_for_status()
        results = r.json()
        if not results:
            return None
        top = results[0]
        lat = float(top["lat"])
        lng = float(top["lon"])
        if not (NZ_BOUNDS["lat"][0] <= lat <= NZ_BOUNDS["lat"][1]):
            return None
        if not (NZ_BOUNDS["lng"][0] <= lng <= NZ_BOUNDS["lng"][1]):
            return None
        return {"lat": round(lat, 6), "lng": round(lng, 6)}
    except Exception as e:
        print(f"    ! geocode error: {e}")
        return None


def geocode(address: str, town: str = "") -> Optional[dict]:
    """Query Nominatim with progressively broader fallbacks.

    Order: cleaned street address → street + suburb hint → suburb/town
    centre → None. Town-centre matches are still useful for the
    "closest to me" picker even though they aren't the exact door.
    """
    clean = normalise_address(address)

    # Attempt 1: full cleaned address
    if clean:
        result = _query_nominatim(f"{clean}, New Zealand")
        if result:
            return result
        time.sleep(RATE_LIMIT_SECONDS)

    # Attempt 2: last two comma-separated tokens (usually suburb + city).
    # Many failures on attempt 1 are because Nominatim can't resolve the
    # street; suburb + city + NZ still gets us within a few km of the
    # actual pharmacy, which is fine for "closest to me" sort.
    if clean and "," in clean:
        parts = [p.strip() for p in clean.split(",") if p.strip()]
        if len(parts) >= 2:
            fallback = ", ".join(parts[-2:])
            result = _query_nominatim(f"{fallback}, New Zealand")
            if result:
                return result
            time.sleep(RATE_LIMIT_SECONDS)

    # Attempt 3: any bare town/suburb name we can extract.
    # Skip if town looks like a region blob (contains a comma).
    if town and "," not in town:
        result = _query_nominatim(f"{town}, New Zealand")
        if result:
            return result

    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="public/pharmacies.json")
    ap.add_argument("--output", default="public/pharmacies.json")
    ap.add_argument("--force", action="store_true",
                    help="Re-geocode entries that already have lat/lng.")
    ap.add_argument("--limit", type=int, default=None,
                    help="Only process the first N pharmacies (for testing).")
    args = ap.parse_args()

    src = Path(args.input)
    if not src.exists():
        sys.exit(f"Input file not found: {src}")
    pharmacies = json.loads(src.read_text(encoding="utf-8"))
    total = len(pharmacies)

    to_process = []
    skipped_have_coords = 0
    for p in pharmacies:
        if args.force or not (p.get("lat") and p.get("lng")):
            to_process.append(p)
        else:
            skipped_have_coords += 1

    if args.limit:
        to_process = to_process[:args.limit]

    print(f"Loaded {total} pharmacies. {skipped_have_coords} already have coords. "
          f"Geocoding {len(to_process)} at 1 req/sec (~{len(to_process) // 60}m {len(to_process) % 60}s)...")
    start = time.time()

    hits = 0
    misses = 0
    for i, p in enumerate(to_process, 1):
        addr = p.get("address", "")
        town = p.get("town", "")
        result = geocode(addr, town)
        if result:
            p["lat"] = result["lat"]
            p["lng"] = result["lng"]
            hits += 1
        else:
            misses += 1
        if i % 25 == 0 or i == len(to_process):
            elapsed = time.time() - start
            rate = i / max(elapsed, 1)
            eta = (len(to_process) - i) / max(rate, 0.01)
            print(f"  [{i}/{len(to_process)}] {hits} hits, {misses} misses, "
                  f"ETA {int(eta // 60)}m {int(eta % 60)}s")
        time.sleep(RATE_LIMIT_SECONDS)

    # Write back to the same file (or output path if different).
    out = Path(args.output)
    out.write_text(json.dumps(pharmacies, indent=2, ensure_ascii=False), encoding="utf-8")

    with_coords = sum(1 for p in pharmacies if p.get("lat"))
    print(f"\nDone in {int((time.time() - start) // 60)}m {int((time.time() - start) % 60)}s.")
    print(f"  {with_coords}/{total} pharmacies now have coordinates ({100 * with_coords // total}%)")
    print(f"  {hits} new geocode hits, {misses} misses this run.")
    print(f"  Written to {out}")


if __name__ == "__main__":
    main()
