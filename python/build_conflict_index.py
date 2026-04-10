#!/usr/bin/env python3
"""
build_conflict_index.py
-----------------------
Builds a spatial conflict zone index from POLECAT historical event data.
Used by server/firmsService.js to filter NASA FIRMS thermal anomaly detections —
a FIRMS hit only corroborates a current event if it falls in a grid cell that
has documented historical conflict activity.

Without this filter, FIRMS picks up agricultural burns, gas flares, and
industrial fires in conflict-adjacent areas, producing false corroboration.

Usage:
  python3 python/build_conflict_index.py
  python3 python/build_conflict_index.py --grid-size 0.5    # default: 0.5°
  python3 python/build_conflict_index.py --min-events 2     # min events per cell

Output:
  data/processed/conflict_zone_index.json
"""

import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT     = Path(__file__).parent.parent
OUT_DIR  = ROOT / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

POLECAT_PATH = OUT_DIR / "polecat_events.json"
OUTPUT_PATH  = OUT_DIR / "conflict_zone_index.json"

# ── Defaults ───────────────────────────────────────────────────────────────────
# 0.5° ≈ 55 km at equator — slightly larger than the 25 km FIRMS search radius
# so a conflict cell always fully covers any FIRMS detection that falls near
# its center. Matching firmsService.js corroborateEvent() radius of 25 km.
DEFAULT_GRID_SIZE  = 0.5
DEFAULT_MIN_EVENTS = 1   # Any documented conflict in a cell makes it valid


def grid_key(lat: float, lon: float, grid_size: float) -> str:
    """
    Snap lat/lon to the southwest corner of the enclosing grid cell and return
    a string key compatible with the JavaScript lookup in firmsService.js.
    Format: "lat,lon" with 1 decimal place (e.g. "31.5,34.5").
    """
    snapped_lat = math.floor(lat / grid_size) * grid_size
    snapped_lon = math.floor(lon / grid_size) * grid_size
    return f"{round(snapped_lat, 4)},{round(snapped_lon, 4)}"


def build_index(
    events: list[dict],
    grid_size: float = DEFAULT_GRID_SIZE,
    min_events: int  = DEFAULT_MIN_EVENTS,
) -> dict:
    """
    Aggregate events into a spatial grid and return cells that meet the
    minimum event count threshold.

    Returns a dict ready to be serialized and loaded by firmsService.js:
      {
        "grid_size_deg": 0.5,
        "min_events":    1,
        "cell_count":    N,
        "total_events":  M,
        "cells":         { "lat,lon": count, ... }
      }
    """
    raw_grid: dict[str, int] = defaultdict(int)
    skipped = 0

    for event in events:
        try:
            lat = float(event.get("latitude") or 0)
            lon = float(event.get("longitude") or 0)
        except (TypeError, ValueError):
            skipped += 1
            continue

        # Skip null-island and zero coordinates
        if lat == 0.0 and lon == 0.0:
            skipped += 1
            continue

        key = grid_key(lat, lon, grid_size)
        raw_grid[key] += 1

    # Apply minimum event threshold — cells with fewer events are noise
    cells = {k: v for k, v in raw_grid.items() if v >= min_events}

    if skipped:
        print(f"  Skipped {skipped:,} events with invalid / null-island coordinates")

    return {
        "grid_size_deg": grid_size,
        "min_events":    min_events,
        "cell_count":    len(cells),
        "total_events":  sum(cells.values()),
        "cells":         cells,
    }


def print_digest(index: dict) -> None:
    """Print a readable summary of the conflict zone index."""
    cells  = index["cells"]
    counts = sorted(cells.values(), reverse=True)

    print(f"\n  Grid size:      {index['grid_size_deg']}° "
          f"(≈{index['grid_size_deg'] * 111:.0f} km per cell side)")
    print(f"  Conflict cells: {index['cell_count']:,}")
    print(f"  Total events:   {index['total_events']:,}")
    if counts:
        print(f"  Busiest cell:   {counts[0]:,} events")
        print(f"  Median cell:    {counts[len(counts) // 2]:,} events")

    # Top 10 densest cells
    print(f"\n  Top 10 conflict-dense grid cells:")
    top = sorted(cells.items(), key=lambda x: x[1], reverse=True)[:10]
    for key, count in top:
        lat_str, lon_str = key.split(",")
        print(f"    {lat_str:>8}°N  {lon_str:>9}°E  →  {count:>5,} events")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build spatial conflict zone index from POLECAT historical data",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--input", "-i", type=Path, default=POLECAT_PATH,
        help="POLECAT events JSON (bare array or {data:[...]} envelope)",
    )
    parser.add_argument(
        "--output", "-o", type=Path, default=OUTPUT_PATH,
        help="Output conflict zone index JSON",
    )
    parser.add_argument(
        "--grid-size", type=float, default=DEFAULT_GRID_SIZE,
        help="Grid cell size in degrees (should match or exceed FIRMS search radius / 111)",
    )
    parser.add_argument(
        "--min-events", type=int, default=DEFAULT_MIN_EVENTS,
        help="Minimum historical events for a cell to be considered a conflict zone",
    )
    args = parser.parse_args()

    # ── Load ───────────────────────────────────────────────────────────────────
    if not args.input.exists():
        print(f"[ERROR] Input file not found: {args.input}", file=sys.stderr)
        print(f"  Run python3 python/ingest_polecat.py first to generate POLECAT data.",
              file=sys.stderr)
        sys.exit(1)

    print(f"\nArgus Conflict Zone Index Builder")
    print(f"{'─' * 40}")
    print(f"  Loading {args.input.name} ...")

    with open(args.input, encoding="utf-8") as f:
        raw = json.load(f)

    events = raw["data"] if isinstance(raw, dict) and "data" in raw else raw
    print(f"  {len(events):,} events loaded")

    # ── Build ──────────────────────────────────────────────────────────────────
    print(f"\n  Building {args.grid_size}° grid (min {args.min_events} event/cell)...")
    index = build_index(events, grid_size=args.grid_size, min_events=args.min_events)
    print_digest(index)

    # ── Write ──────────────────────────────────────────────────────────────────
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"))   # compact — loaded at server startup

    size_kb = args.output.stat().st_size / 1024
    print(f"\n  Wrote {args.output.relative_to(ROOT)}  ({size_kb:.1f} KB)")
    print(f"\n  Next: restart the server — firmsService.js will load this index")
    print(f"  automatically and use it to filter FIRMS corroboration.\n")


if __name__ == "__main__":
    main()
