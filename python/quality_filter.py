#!/usr/bin/env python3
"""
quality_filter.py
-----------------
Three-stage data quality pipeline for Argus conflict events.

Addresses the three primary GDELT noise vectors:
  1. Geographic misplacements — events whose lat/lon don't match their reported country
  2. Irrelevant topics        — events that score low on conflict-relevance signals
  3. Duplicate clusters       — multiple records of the same real-world incident

Operates on the live GDELT cache (server/cache/events.json) or any file
conforming to the Argus event schema. Stdlib only — no external dependencies.

Usage:
  python3 python/quality_filter.py                              # filter live cache
  python3 python/quality_filter.py --input data/processed/gdelt_sampled.json
  python3 python/quality_filter.py --dry-run                    # stats only, no write
  python3 python/quality_filter.py --geo-tol 2.0               # relax geo tolerance
  python3 python/quality_filter.py --relevance-min 20           # adjust relevance gate
  python3 python/quality_filter.py --grid-size 0.5              # tighter dedup grid
  python3 python/quality_filter.py --keep-rejected --verbose    # full audit mode

Output:
  data/processed/filtered_events.json   — cleaned event records
  data/processed/filter_report.json     — per-stage rejection stats
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

DEFAULT_INPUT  = ROOT / "server" / "cache" / "events.json"
DEFAULT_OUTPUT = OUT_DIR / "filtered_events.json"
REPORT_PATH    = OUT_DIR / "filter_report.json"

# ── Stage defaults ─────────────────────────────────────────────────────────────
GEO_TOLERANCE_DEG  = 1.5   # Expand each bounding box by this many degrees (border leniency)
RELEVANCE_MIN      = 25    # Events below this 0–100 score are flagged as low-relevance noise
GRID_SIZE_DEG      = 1.0   # Spatial grid cell size for deduplication (1° ≈ 111 km at equator)
DEDUP_WINDOW_DAYS  = 2     # Events within N days in the same grid cell are dedup candidates

# ── Stage 1: Country bounding boxes ───────────────────────────────────────────
# Format: (min_lat, max_lat, min_lon, max_lon)
# Covers ~80% of GDELT conflict volume by country. Tolerance applied at runtime.
# Source: Natural Earth (approximate, conservative — not buffered here).
COUNTRY_BOUNDS: dict[str, tuple[float, float, float, float]] = {
    # ── Active conflict zones ──────────────────────────────────────────────────
    "Ukraine":                          ( 44.4,  52.4,  22.1,  40.2),
    "Russia":                           ( 41.2,  81.9,  19.6, 190.0),
    "Israel":                           ( 29.4,  33.3,  34.3,  35.9),
    "Palestine":                        ( 31.2,  32.5,  34.2,  35.6),
    "Syria":                            ( 32.3,  37.3,  35.7,  42.4),
    "Yemen":                            ( 12.1,  19.0,  42.5,  54.5),
    "Sudan":                            (  3.5,  22.2,  21.8,  38.6),
    "South Sudan":                      (  3.5,  12.2,  24.1,  36.3),
    "Somalia":                          ( -1.7,  12.0,  40.0,  51.5),
    "Ethiopia":                         (  3.4,  15.0,  33.0,  48.0),
    "Mali":                             ( 10.1,  25.0, -12.2,   4.3),
    "Niger":                            ( 11.7,  23.5,   0.2,  15.9),
    "Burkina Faso":                     (  9.4,  15.1,  -5.5,   2.4),
    "Nigeria":                          (  4.3,  13.9,   2.7,  14.7),
    "Democratic Republic of the Congo": (-13.5,   5.4,  12.2,  31.3),
    "DR Congo":                         (-13.5,   5.4,  12.2,  31.3),
    "Iraq":                             ( 29.1,  37.4,  38.8,  48.6),
    "Iran":                             ( 25.1,  39.8,  44.0,  63.3),
    "Afghanistan":                      ( 29.3,  38.5,  60.5,  74.9),
    "Pakistan":                         ( 23.6,  37.1,  60.9,  77.8),
    "Myanmar":                          (  9.6,  28.5,  92.2, 101.2),
    "Libya":                            ( 19.5,  33.2,   9.3,  25.2),
    "Mexico":                           ( 14.5,  32.7,-117.1, -86.7),
    "Colombia":                         ( -4.2,  12.4, -79.0, -66.9),
    "Venezuela":                        (  0.6,  12.2, -73.4, -59.8),
    "Haiti":                            ( 17.9,  20.1, -74.5, -71.6),
    "Central African Republic":         (  2.2,  11.0,  14.4,  27.5),
    "Chad":                             (  7.4,  23.5,  13.5,  24.0),
    "Cameroon":                         (  1.6,  13.1,   8.5,  16.2),
    "Mozambique":                       (-26.9, -10.5,  32.3,  40.8),
    "Lebanon":                          ( 33.1,  34.7,  35.1,  36.6),
    "Jordan":                           ( 29.2,  33.4,  34.9,  39.3),
    "Azerbaijan":                       ( 38.4,  41.9,  44.8,  50.4),
    "Armenia":                          ( 38.8,  41.3,  43.4,  46.6),
    "Georgia":                          ( 41.1,  43.6,  40.0,  46.7),
    "Bosnia and Herzegovina":           ( 42.5,  45.3,  15.7,  19.6),
    "Kosovo":                           ( 41.9,  43.3,  20.0,  21.8),
    # ── Major stable countries ─────────────────────────────────────────────────
    "United States":                    ( 18.9,  71.4,-179.1, -66.9),
    "China":                            ( 18.2,  53.6,  73.5, 135.1),
    "India":                            (  6.7,  35.7,  68.2,  97.4),
    "Brazil":                           (-33.8,   5.3, -73.9, -34.8),
    "France":                           ( 42.3,  51.1,  -5.1,   9.6),
    "United Kingdom":                   ( 49.9,  60.8,  -8.1,   1.8),
    "Germany":                          ( 47.3,  55.1,   5.9,  15.0),
    "Turkey":                           ( 36.0,  42.1,  26.0,  44.8),
    "Saudi Arabia":                     ( 16.4,  32.2,  34.6,  55.7),
    "Egypt":                            ( 22.0,  31.7,  24.7,  37.1),
    "Algeria":                          ( 18.9,  37.1,  -8.7,   9.0),
    # Morocco bounds include Western Sahara (de facto administered territory south to ~20.7°N)
    "Morocco":                          ( 20.7,  35.9, -17.1,   2.6),
    "Tunisia":                          ( 30.2,  37.5,   7.5,  11.6),
    "Kenya":                            ( -4.7,   4.6,  33.9,  41.9),
    "Uganda":                           ( -1.5,   4.2,  29.6,  35.0),
    "Tanzania":                         (-11.7,  -1.0,  29.3,  40.5),
    "South Africa":                     (-34.8, -22.1,  16.5,  32.9),
    "Zimbabwe":                         (-22.4, -15.6,  25.2,  33.1),
    "Philippines":                      (  4.6,  21.1, 117.2, 126.6),
    "Indonesia":                        (-11.0,   6.1,  95.0, 141.0),
    "Thailand":                         (  5.6,  20.5,  97.4, 105.6),
    "North Korea":                      ( 37.7,  42.7, 124.2, 130.7),
    "South Korea":                      ( 33.1,  38.6, 126.1, 129.6),
    "Poland":                           ( 49.0,  54.9,  14.1,  24.2),
    "Belarus":                          ( 51.3,  56.2,  23.2,  32.8),
    "Kazakhstan":                       ( 40.6,  55.4,  50.3,  87.4),
    "Tajikistan":                       ( 36.7,  41.0,  67.4,  75.1),
    "Guatemala":                        ( 13.7,  17.8, -92.2, -88.2),
    "Honduras":                         ( 13.0,  16.5, -89.4, -83.2),
    "El Salvador":                      ( 13.2,  14.5, -90.1, -87.7),
}


# ── Stage 2: Relevance scoring ─────────────────────────────────────────────────

# Base score by Argus event type bucket (0–100)
EVENT_TYPE_BASE: dict[str, int] = {
    "Battles":                    90,
    "Explosions/Remote violence": 85,
    "Violence against civilians": 80,
    "Riots":                      50,
    "Strategic developments":     35,
}

# Actor type codes that indicate armed/state actors (higher relevance signal)
ARMED_ACTOR_TYPES = frozenset({"MIL", "REB", "SPY", "UAF", "GOV", "COP", "IGO"})

# URL slug patterns strongly associated with non-conflict content.
# Each entry: (substring, penalty_points). First match wins (no stacking).
URL_PENALTIES: list[tuple[str, int]] = [
    # Sports
    ("nfl-", 45), ("nba-", 45), ("mlb-", 45), ("nhl-", 45), ("nascar", 45),
    ("super-bowl", 45), ("world-cup-", 40), ("-championship", 30),
    # Entertainment / celebrity
    ("grammy", 45), ("oscar-", 45), ("-emmy", 45), ("golden-globe", 45),
    ("box-office", 40), ("-celebrity-", 35), ("-breakup", 40),
    ("-wedding-", 45), ("-divorce-", 45), ("-pregnancy-", 40),
    # Financial / business (not sanctions/war)
    ("-earnings-", 35), ("-ipo-", 35), ("-crypto-", 30), ("-stocks-", 30),
    ("trade-deal", 25), ("trade-agreement", 25),
    # Natural disasters (not military events)
    ("hurricane-", 25), ("tornado-", 25), ("earthquake-", 25),
    # Opinion / editorial
    ("/opinion/", 25), ("/editorial/", 25), ("/op-ed/", 25),
]


def score_event(event: dict) -> int:
    """
    Score a single event 0–100 for conflict relevance.

    Model:
      Base:     event_type bucket (35–90)
      +Bonus:   armed actor types (+8–15), high source count (+3–12),
                extreme Goldstein severity (+2–10)
      -Penalty: URL keyword match (–25–45), single-source events (–5)

    The score intentionally does not replicate the structural CAMEO/QuadClass
    filters already in gdeltFetcher.js. It targets a different failure mode:
    events that pass structural gates but carry weak real-world signal.
    """
    score = EVENT_TYPE_BASE.get(event.get("event_type", ""), 35)

    # Armed actor bonus (actor types may be absent for POLECAT events)
    a1 = (event.get("actor1_type") or "").upper()
    a2 = (event.get("actor2_type") or "").upper()
    armed_count = sum(1 for t in (a1, a2) if t in ARMED_ACTOR_TYPES)
    if armed_count >= 2:
        score += 15
    elif armed_count == 1:
        score += 8

    # Source count — widely-reported events are more likely genuine
    num_src = int(event.get("num_sources") or 1)
    if num_src >= 10:
        score += 12
    elif num_src >= 5:
        score += 7
    elif num_src >= 2:
        score += 3
    else:
        score -= 5   # Single-source events are suspicious

    # Goldstein severity bonus — more negative = more kinetic
    gs = float(event.get("goldstein_scale") or 0)
    if gs <= -8:
        score += 10
    elif gs <= -5:
        score += 5
    elif gs <= -3:
        score += 2

    # URL keyword penalties — apply the first matching pattern only
    url = (event.get("source_url") or "").lower()
    if url:
        for pattern, penalty in URL_PENALTIES:
            if pattern in url:
                score -= penalty
                break

    return max(0, min(100, score))


# ── Stage 3: Deduplication helpers ────────────────────────────────────────────

def _grid_key(lat: float, lon: float, grid_size: float) -> tuple[float, float]:
    """Snap lat/lon to the southwest corner of the enclosing grid cell."""
    return (
        round(math.floor(lat / grid_size) * grid_size, 6),
        round(math.floor(lon / grid_size) * grid_size, 6),
    )


def _date_bucket(event_date: str, window_days: int) -> int:
    """
    Convert YYYY-MM-DD to an integer bucket so events within `window_days`
    of each other share the same bucket. Simple integer-day division avoids
    any datetime imports while remaining consistent across all platforms.
    """
    try:
        y, m, d = event_date.split("-")
        # Approximate days since 2020-01-01 (30-day months — good enough for bucketing)
        epoch_days = (int(y) - 2020) * 365 + (int(m) - 1) * 30 + int(d)
        return epoch_days // window_days
    except Exception:
        return 0


# ── Pipeline stages ────────────────────────────────────────────────────────────

def stage_geo(
    events: list[dict],
    tolerance: float = GEO_TOLERANCE_DEG,
) -> tuple[list[dict], list[dict]]:
    """
    Stage 1 — Geographic validation.

    Flags events whose lat/lon falls outside the expected bounding box for
    their reported country (expanded by `tolerance` degrees to allow for
    border crossings and imprecise location extraction).

    Special cases handled:
      • (0.0, 0.0)  "Null Island" — always rejected; GDELT falls back to this
                    when geo-coding fails entirely.
      • Country not in COUNTRY_BOUNDS — passed through (benefit of the doubt;
                    better to keep an unvalidatable event than lose a real one).
      • Missing / unparseable coordinates — passed through.
    """
    valid, rejected = [], []

    for event in events:
        try:
            lat = float(event.get("latitude") or 0)
            lon = float(event.get("longitude") or 0)
        except (TypeError, ValueError):
            valid.append(event)
            continue

        # Null Island guard — lat=0, lon=0 is GDELT's "I don't know" coord
        if lat == 0.0 and lon == 0.0:
            rejected.append({**event, "_geo_flag": "null_island"})
            continue

        country = event.get("country", "")
        bounds  = COUNTRY_BOUNDS.get(country)

        if bounds is None:
            # Country not in our table — cannot validate, pass through
            valid.append(event)
            continue

        min_lat, max_lat, min_lon, max_lon = bounds
        in_bounds = (
            (min_lat - tolerance) <= lat <= (max_lat + tolerance) and
            (min_lon - tolerance) <= lon <= (max_lon + tolerance)
        )

        if in_bounds:
            valid.append(event)
        else:
            rejected.append({
                **event,
                "_geo_flag":          f"outside_{country}_bounds",
                "_geo_reported_lat":  lat,
                "_geo_reported_lon":  lon,
                "_geo_expected_box":  bounds,
            })

    return valid, rejected


def stage_relevance(
    events: list[dict],
    min_score: int = RELEVANCE_MIN,
) -> tuple[list[dict], list[dict]]:
    """
    Stage 2 — Relevance scoring.

    Scores each event 0–100 using event type, actor type signals, source count,
    Goldstein severity, and URL keyword penalties. Events below `min_score` are
    flagged as low-relevance noise.

    The computed score is attached as `_relevance_score` on every event
    (both kept and rejected) so analysts can inspect the margin and tune thresholds
    without re-running the full pipeline.
    """
    valid, rejected = [], []

    for event in events:
        score     = score_event(event)
        annotated = {**event, "_relevance_score": score}
        if score >= min_score:
            valid.append(annotated)
        else:
            rejected.append(annotated)

    return valid, rejected


def stage_dedup(
    events: list[dict],
    grid_size: float  = GRID_SIZE_DEG,
    window_days: int  = DEDUP_WINDOW_DAYS,
) -> tuple[list[dict], list[dict]]:
    """
    Stage 3 — Spatial-temporal deduplication.

    Groups events by (grid_cell, time_bucket, event_type) and keeps exactly
    one canonical record per cluster — the one with the highest num_sources
    (tiebreak: highest abs(goldstein_scale), i.e. the most severe report).
    All other records in the cluster are marked as duplicates.

    Rationale for the canonical selection rule:
      - num_sources is the best proxy for ground-truth corroboration.
      - When sources are equal, the more extreme Goldstein record tends to be
        the primary kinetic report rather than a softer follow-up.

    The cluster metadata (`_dedup_cluster`, `_dedup_group_size`) is attached
    to the canonical record so analysts can audit compression decisions.
    """
    clusters: dict[tuple, list[dict]] = defaultdict(list)

    for event in events:
        try:
            lat = float(event.get("latitude") or 0)
            lon = float(event.get("longitude") or 0)
        except (TypeError, ValueError):
            lat, lon = 0.0, 0.0

        gk    = _grid_key(lat, lon, grid_size)
        tb    = _date_bucket(event.get("event_date", ""), window_days)
        etype = event.get("event_type", "")
        key   = (gk[0], gk[1], tb, etype)
        clusters[key].append(event)

    kept, dupes = [], []

    for key, group in clusters.items():
        if len(group) == 1:
            kept.append(group[0])
            continue

        # Sort: highest num_sources first; tiebreak by abs(goldstein_scale) desc
        group.sort(
            key=lambda e: (
                int(e.get("num_sources") or 1),
                abs(float(e.get("goldstein_scale") or 0)),
            ),
            reverse=True,
        )

        canonical = {
            **group[0],
            "_dedup_cluster":    str(key),
            "_dedup_group_size": len(group),
        }
        kept.append(canonical)
        dupes.extend(group[1:])

    return kept, dupes


# ── Full pipeline ──────────────────────────────────────────────────────────────

def run_pipeline(
    events: list[dict],
    geo_tol:     float = GEO_TOLERANCE_DEG,
    rel_min:     int   = RELEVANCE_MIN,
    grid_size:   float = GRID_SIZE_DEG,
    window_days: int   = DEDUP_WINDOW_DAYS,
) -> dict:
    """
    Run all three filter stages in sequence and return:
      {
        "events":   list[dict],   # cleaned, annotated records
        "stats":    dict,         # per-stage counts and rejection rates
        "rejected": {
          "geo":        list[dict],
          "relevance":  list[dict],
          "duplicates": list[dict],
        }
      }

    Importable for use in other pipeline scripts (e.g. backtest_compare.py).
    """
    n_input = len(events)

    after_geo,   rej_geo   = stage_geo(events, tolerance=geo_tol)
    after_rel,   rej_rel   = stage_relevance(after_geo, min_score=rel_min)
    after_dedup, rej_dedup = stage_dedup(after_rel, grid_size=grid_size, window_days=window_days)

    n_out = len(after_dedup)

    stats = {
        "input_count":              n_input,
        "geo_rejected":             len(rej_geo),
        "relevance_rejected":       len(rej_rel),
        "duplicates_removed":       len(rej_dedup),
        "output_count":             n_out,
        "geo_rejection_pct":        _pct(len(rej_geo),   n_input),
        "relevance_rejection_pct":  _pct(len(rej_rel),   n_input),
        "dedup_compression_pct":    _pct(len(rej_dedup), n_input),
        "overall_rejection_pct":    _pct(n_input - n_out, n_input),
        "output_pct":               _pct(n_out, n_input),
        "config": {
            "geo_tolerance_deg":  geo_tol,
            "relevance_min":      rel_min,
            "grid_size_deg":      grid_size,
            "dedup_window_days":  window_days,
        },
    }

    return {
        "events":   after_dedup,
        "stats":    stats,
        "rejected": {
            "geo":        rej_geo,
            "relevance":  rej_rel,
            "duplicates": rej_dedup,
        },
    }


def _pct(n: int, total: int) -> str:
    if total == 0:
        return "0.0%"
    return f"{100 * n / total:.1f}%"


# ── CLI ────────────────────────────────────────────────────────────────────────

def _print_stats(stats: dict) -> None:
    w = 45
    print(f"\nArgus Quality Filter — Pipeline Results")
    print("─" * w)
    print(f"  Input events:          {stats['input_count']:>6,}")
    print(f"  Stage 1 geo reject:    {stats['geo_rejected']:>6,}  ({stats['geo_rejection_pct']})")
    print(f"  Stage 2 rel reject:    {stats['relevance_rejected']:>6,}  ({stats['relevance_rejection_pct']})")
    print(f"  Stage 3 dedup drop:    {stats['duplicates_removed']:>6,}  ({stats['dedup_compression_pct']})")
    print("─" * w)
    print(f"  Output events:         {stats['output_count']:>6,}  ({stats['output_pct']} retained)")
    print()


def _print_samples(title: str, events: list[dict]) -> None:
    if not events:
        return
    print(f"  {title}:")
    for e in events:
        date    = e.get("event_date", "?")
        country = e.get("country", "?")
        etype   = (e.get("event_type") or "")[:32]
        flag    = e.get("_geo_flag", "")
        score   = e.get("_relevance_score")
        cluster = e.get("_dedup_cluster", "")
        if flag:
            detail = flag
        elif score is not None:
            detail = f"score={score}"
        elif cluster:
            detail = f"cluster_size={e.get('_dedup_group_size', '?')}"
        else:
            detail = ""
        print(f"    {date}  {country:<26}  {etype:<32}  {detail}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Three-stage quality filter for Argus conflict events",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--input", "-i", type=Path, default=DEFAULT_INPUT,
        help="Input JSON file (bare array or {data:[...]} envelope)",
    )
    parser.add_argument(
        "--output", "-o", type=Path, default=DEFAULT_OUTPUT,
        help="Output JSON file (cleaned event array)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print stats only — do not write output files",
    )
    parser.add_argument(
        "--geo-tol", type=float, default=GEO_TOLERANCE_DEG,
        help="Bounding box tolerance in degrees",
    )
    parser.add_argument(
        "--relevance-min", type=int, default=RELEVANCE_MIN,
        help="Minimum relevance score 0–100",
    )
    parser.add_argument(
        "--grid-size", type=float, default=GRID_SIZE_DEG,
        help="Dedup spatial grid cell size in degrees",
    )
    parser.add_argument(
        "--window-days", type=int, default=DEDUP_WINDOW_DAYS,
        help="Dedup temporal window in days",
    )
    parser.add_argument(
        "--keep-rejected", action="store_true",
        help="Include up to 20 sample rejected events per stage in the report",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Print sample rejected events to stdout",
    )
    args = parser.parse_args()

    # ── Load ───────────────────────────────────────────────────────────────────
    if not args.input.exists():
        print(f"[ERROR] Input file not found: {args.input}", file=sys.stderr)
        print(f"  Start the server to populate the live cache, or pass --input <file>",
              file=sys.stderr)
        sys.exit(1)

    print(f"\nLoading {args.input} ...")
    with open(args.input, encoding="utf-8") as f:
        raw = json.load(f)

    # Accept both bare arrays and POLECAT-style {data: [...]} envelopes
    if isinstance(raw, list):
        events = raw
    elif isinstance(raw, dict) and "data" in raw:
        events = raw["data"]
    else:
        print(f"[ERROR] Unexpected JSON structure in {args.input}", file=sys.stderr)
        sys.exit(1)

    print(f"  {len(events):,} events loaded")

    # ── Run ────────────────────────────────────────────────────────────────────
    result = run_pipeline(
        events,
        geo_tol     = args.geo_tol,
        rel_min     = args.relevance_min,
        grid_size   = args.grid_size,
        window_days = args.window_days,
    )

    _print_stats(result["stats"])

    if args.verbose:
        _print_samples("Geographic misplacements (sample)", result["rejected"]["geo"][:5])
        _print_samples("Low-relevance events (sample)",     result["rejected"]["relevance"][:5])
        _print_samples("Duplicate clusters (sample)",       result["rejected"]["duplicates"][:5])

    if args.dry_run:
        print("Dry run — no files written.\n")
        return

    # ── Write ──────────────────────────────────────────────────────────────────
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result["events"], f)
    print(f"Wrote {len(result['events']):,} events → {args.output.relative_to(ROOT)}")

    report: dict = {"stats": result["stats"]}
    if args.keep_rejected:
        report["rejected_samples"] = {
            stage: records[:20]
            for stage, records in result["rejected"].items()
        }

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"Wrote report     → {REPORT_PATH.relative_to(ROOT)}\n")


if __name__ == "__main__":
    main()
