"""
ingest_polecat.py
-----------------
Ingests raw POLECAT Weekly Data files (tab-separated .txt) from data/,
normalizes them to the Argus event schema, filters to conflict events,
and writes output to data/processed/.

POLECAT data sourced from Harvard Dataverse (CIA/DARPA-funded ICEWS successor):
  https://doi.org/10.7910/DVN/AJGVIT
  License: Research and educational use only (© 2023 Leidos)

Usage:
  python python/ingest_polecat.py
  python python/ingest_polecat.py --years 2023 2024
  python python/ingest_polecat.py --years 2023 2024 --min-intensity -3

Output:
  data/processed/polecat_events.json       — normalized conflict events
  data/processed/polecat_summary.json      — aggregate stats by country / month
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# ── ISO 3166-1 alpha-3 → full country name ────────────────────────────────────
ISO3_TO_NAME = {
    "AFG": "Afghanistan", "ALB": "Albania", "DZA": "Algeria", "AGO": "Angola",
    "ARG": "Argentina", "ARM": "Armenia", "AUS": "Australia", "AUT": "Austria",
    "AZE": "Azerbaijan", "BGD": "Bangladesh", "BLR": "Belarus", "BEL": "Belgium",
    "BRA": "Brazil", "BFA": "Burkina Faso", "BDI": "Burundi", "KHM": "Cambodia", "CMR": "Cameroon",
    "CAN": "Canada", "CAF": "Central African Republic", "TCD": "Chad",
    "CHL": "Chile", "CHN": "China", "COL": "Colombia", "COD": "DR Congo",
    "COG": "Republic of Congo", "HRV": "Croatia", "CUB": "Cuba", "CYP": "Cyprus",
    "CZE": "Czech Republic", "DNK": "Denmark", "DJI": "Djibouti",
    "EGY": "Egypt", "SLV": "El Salvador", "ERI": "Eritrea", "EST": "Estonia",
    "ETH": "Ethiopia", "FIN": "Finland", "FRA": "France", "GAB": "Gabon",
    "GEO": "Georgia", "DEU": "Germany", "GHA": "Ghana", "GRC": "Greece",
    "GTM": "Guatemala", "GIN": "Guinea", "HTI": "Haiti", "HND": "Honduras",
    "HUN": "Hungary", "IND": "India", "IDN": "Indonesia", "IRN": "Iran",
    "IRQ": "Iraq", "IRL": "Ireland", "ISR": "Israel", "ITA": "Italy",
    "JAM": "Jamaica", "JPN": "Japan", "JOR": "Jordan", "KAZ": "Kazakhstan",
    "KEN": "Kenya", "PRK": "North Korea", "KOR": "South Korea", "KWT": "Kuwait",
    "KGZ": "Kyrgyzstan", "LAO": "Laos", "LVA": "Latvia", "LBN": "Lebanon",
    "LBR": "Liberia", "LBY": "Libya", "LTU": "Lithuania", "MKD": "North Macedonia",
    "MDG": "Madagascar", "MWI": "Malawi", "MYS": "Malaysia", "MDV": "Maldives",
    "MLI": "Mali", "MRT": "Mauritania", "MEX": "Mexico", "MDA": "Moldova",
    "MNG": "Mongolia", "MNE": "Montenegro", "MAR": "Morocco", "MOZ": "Mozambique",
    "MMR": "Myanmar", "NAM": "Namibia", "NPL": "Nepal", "NLD": "Netherlands",
    "NZL": "New Zealand", "NIC": "Nicaragua", "NER": "Niger", "NGA": "Nigeria",
    "NOR": "Norway", "OMN": "Oman", "PAK": "Pakistan", "PAN": "Panama",
    "PNG": "Papua New Guinea", "PRY": "Paraguay", "PER": "Peru", "PHL": "Philippines",
    "POL": "Poland", "PRT": "Portugal", "PSE": "Palestine", "QAT": "Qatar",
    "ROU": "Romania", "RUS": "Russia", "RWA": "Rwanda", "SAU": "Saudi Arabia",
    "SEN": "Senegal", "SRB": "Serbia", "SLE": "Sierra Leone", "SOM": "Somalia",
    "ZAF": "South Africa", "SSD": "South Sudan", "ESP": "Spain", "LKA": "Sri Lanka",
    "SDN": "Sudan", "SWE": "Sweden", "SYR": "Syria", "TWN": "Taiwan",
    "TJK": "Tajikistan", "TZA": "Tanzania", "THA": "Thailand", "TLS": "Timor-Leste",
    "TGO": "Togo", "TUN": "Tunisia", "TUR": "Turkey", "TKM": "Turkmenistan",
    "UGA": "Uganda", "UKR": "Ukraine", "ARE": "United Arab Emirates",
    "GBR": "United Kingdom", "USA": "United States", "URY": "Uruguay",
    "UZB": "Uzbekistan", "VEN": "Venezuela", "VNM": "Vietnam", "YEM": "Yemen",
    "ZMB": "Zambia", "ZWE": "Zimbabwe",
}

def resolve_country(code: str) -> str:
    """Resolve ISO 3-letter code to full country name, or return code as fallback."""
    if not code or code in ("None", ""):
        return "Unknown"
    return ISO3_TO_NAME.get(code.strip(), code.strip())

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
OUT_DIR = DATA_DIR / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── POLECAT → Argus event type mapping ────────────────────────────────────────
# POLECAT Quad Codes: MATERIAL CONFLICT | VERBAL CONFLICT | MATERIAL COOPERATION | VERBAL COOPERATION
# POLECAT Event Types: ASSAULT, COERCE, THREATEN, ACCUSE, PROTEST, SANCTION, etc.
#
# Argus event types mirror ACLED: Battles | Explosions/Remote violence |
#   Violence against civilians | Riots | Strategic developments

QUAD_TO_ARGUS = {
    # Direct kinetic action → Battles
    "MATERIAL CONFLICT": "Battles",
    # Verbal threats, accusations, ultimatums → Strategic developments
    "VERBAL CONFLICT":   "Strategic developments",
}

POLECAT_TYPE_OVERRIDES = {
    # More granular overrides within MATERIAL CONFLICT
    "ASSAULT":    "Battles",
    "ATTACK":     "Explosions/Remote violence",
    "THREATEN":   "Strategic developments",
    "COERCE":     "Strategic developments",
    "ACCUSE":     "Strategic developments",
    "PROTEST":    "Riots",
    "SANCTION":   "Strategic developments",
    "DEMAND":     "Strategic developments",
    "REJECT":     "Strategic developments",
    "REQUEST":    "Strategic developments",
}

# Only ingest events in these Quad Codes (filter out cooperation events)
CONFLICT_QUAD_CODES = {"MATERIAL CONFLICT", "VERBAL CONFLICT"}


def map_event_type(polecat_type: str, quad_code: str) -> str:
    """Map a POLECAT event type + quad code to an Argus event type."""
    if polecat_type in POLECAT_TYPE_OVERRIDES:
        return POLECAT_TYPE_OVERRIDES[polecat_type]
    # Fall back to quad code mapping
    for quad_key, argus_type in QUAD_TO_ARGUS.items():
        if quad_key in quad_code:
            return argus_type
    return "Strategic developments"


def intensity_to_impact_score(intensity: float) -> float:
    """
    Convert POLECAT Event Intensity to Argus impact_score (0–10).

    POLECAT intensity is signed: negative = conflict/hostile, positive = cooperative.
    Argus impact_score is 0–10 where higher = more severe conflict.
    We invert and clamp the negative range (-10 to 0) onto 0–10.
    """
    if intensity >= 0:
        return 0.0
    clamped = max(intensity, -10.0)
    return round(abs(clamped), 2)


def normalize_row(row: dict) -> dict | None:
    """
    Normalize a single POLECAT row to the Argus event schema.
    Returns None if the row should be filtered out.
    """
    quad_code = row.get("Quad Code", "").strip()

    # Filter to conflict quad codes only
    if quad_code not in CONFLICT_QUAD_CODES:
        return None

    # Require lat/lon for map rendering
    try:
        lat = float(row["Latitude"])
        lon = float(row["Longitude"])
    except (ValueError, KeyError):
        return None

    # Parse intensity
    try:
        intensity = float(row.get("Event Intensity", 0))
    except ValueError:
        intensity = 0.0

    polecat_type = row.get("Event Type", "").strip()
    event_date = row.get("Event Date", "").strip()
    country = row.get("Country", "").strip()

    return {
        # Core identity
        "event_id_cnty":   row.get("Event ID", "").strip(),
        "source":          "polecat",

        # Temporal
        "event_date":      event_date,

        # Classification
        "event_type":      map_event_type(polecat_type, quad_code),
        "polecat_type":    polecat_type,       # preserve original for transparency
        "quad_code":       quad_code,

        # Severity
        "goldstein_scale": intensity,           # negative = hostile (same convention as GDELT)
        "impact_score":    intensity_to_impact_score(intensity),

        # Actors
        "actor1":          row.get("Actor Name", "").strip() or "Unknown",
        "actor2":          row.get("Recipient Name", "").strip() or "Unknown",
        "actor1_country":  resolve_country(row.get("Actor Country", "")),
        "actor2_country":  resolve_country(row.get("Recipient Country", "")),

        # Geography
        "country":         resolve_country(country),
        "location":        row.get("Placename", "").strip() or row.get("City", "").strip(),
        "latitude":        lat,
        "longitude":       lon,

        # Source provenance
        "news_source":     row.get("Source", "").strip(),
        "num_sources":     1,
        "num_mentions":    1,

        # Context tags (pipe-separated in raw data, exclude "None" strings)
        "contexts":        [
            c.strip() for c in row.get("Contexts", "").split("|")
            if c.strip() and c.strip().lower() != "none"
        ],

        # Notes for free-text search
        "notes": " | ".join(filter(None, [
            row.get("Story Locations", "").strip(),
            row.get("Story Organizations", "").strip(),
        ])),
    }


def build_summary(events: list[dict]) -> dict:
    """
    Build aggregate summary statistics from normalized events.
    Used for backtesting comparison against GDELT.
    """
    by_country = defaultdict(lambda: {"count": 0, "avg_intensity": 0.0, "event_types": defaultdict(int)})
    by_month   = defaultdict(lambda: {"count": 0, "avg_intensity": 0.0})
    total_intensity = 0.0

    for e in events:
        country = e["country"] or "Unknown"
        month   = e["event_date"][:7] if len(e["event_date"]) >= 7 else "Unknown"

        by_country[country]["count"] += 1
        by_country[country]["avg_intensity"] += e["goldstein_scale"]
        by_country[country]["event_types"][e["event_type"]] += 1

        by_month[month]["count"] += 1
        by_month[month]["avg_intensity"] += e["goldstein_scale"]

        total_intensity += e["goldstein_scale"]

    # Finalize averages
    for c in by_country.values():
        if c["count"] > 0:
            c["avg_intensity"] = round(c["avg_intensity"] / c["count"], 3)
        c["event_types"] = dict(c["event_types"])

    for m in by_month.values():
        if m["count"] > 0:
            m["avg_intensity"] = round(m["avg_intensity"] / m["count"], 3)

    # Top 10 most active conflict countries
    top_countries = sorted(by_country.items(), key=lambda x: x[1]["count"], reverse=True)[:10]

    return {
        "total_events":   len(events),
        "avg_intensity":  round(total_intensity / len(events), 3) if events else 0,
        "top_countries":  [{"country": k, **v} for k, v in top_countries],
        "by_month":       dict(sorted(by_month.items())),
        "by_country":     dict(by_country),
    }


def ingest_file(path: Path, min_intensity: float) -> list[dict]:
    """Read a single POLECAT .txt file and return normalized conflict events."""
    events = []
    skipped = 0

    print(f"  Reading {path.name} ({path.stat().st_size / 1e6:.1f} MB)...")

    with open(path, encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for i, row in enumerate(reader):
            normalized = normalize_row(row)
            if normalized is None:
                skipped += 1
                continue

            # Apply intensity filter (e.g. --min-intensity -3 keeps only events < -3)
            if normalized["goldstein_scale"] > min_intensity:
                skipped += 1
                continue

            events.append(normalized)

    print(f"  → {len(events):,} conflict events kept, {skipped:,} filtered out")
    return events


def main():
    parser = argparse.ArgumentParser(description="Ingest POLECAT data into Argus schema")
    parser.add_argument(
        "--years", nargs="+", type=int,
        default=[2023, 2024],
        help="Years to ingest (default: 2023 2024)"
    )
    parser.add_argument(
        "--min-intensity", type=float,
        default=0.0,
        help="Only keep events with intensity ≤ this value (default: 0.0, i.e. all hostile events)"
    )
    args = parser.parse_args()

    print(f"\nArgus POLECAT Ingestion Pipeline")
    print(f"{'─' * 40}")
    print(f"Years:         {args.years}")
    print(f"Min intensity: {args.min_intensity} (lower = more hostile only)\n")

    all_events = []

    for year in args.years:
        path = DATA_DIR / f"ngecEvents.DV.{year}.txt"
        if not path.exists():
            print(f"  [WARN] {path.name} not found — skipping")
            continue
        events = ingest_file(path, min_intensity=args.min_intensity)
        all_events.extend(events)

    if not all_events:
        print("\n[ERROR] No events ingested. Check that data files exist in data/")
        sys.exit(1)

    # Sort by date descending (most recent first, matching GDELT API convention)
    all_events.sort(key=lambda e: e["event_date"], reverse=True)

    print(f"\nTotal conflict events: {len(all_events):,}")
    print(f"Date range: {all_events[-1]['event_date']} → {all_events[0]['event_date']}")

    # ── Write normalized events ──────────────────────────────────────────────
    events_path = OUT_DIR / "polecat_events.json"
    with open(events_path, "w", encoding="utf-8") as f:
        json.dump({"source": "polecat", "count": len(all_events), "data": all_events}, f, indent=2)
    print(f"\nWrote {events_path.relative_to(ROOT)}")

    # ── Write summary / backtest stats ───────────────────────────────────────
    summary = build_summary(all_events)
    summary_path = OUT_DIR / "polecat_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"Wrote {summary_path.relative_to(ROOT)}")

    # ── Print quick digest ────────────────────────────────────────────────────
    print(f"\nTop 5 conflict countries (by event count):")
    for entry in summary["top_countries"][:5]:
        print(f"  {entry['country']:<30} {entry['count']:>6,} events  "
              f"(avg intensity {entry['avg_intensity']:+.2f})")

    print(f"\nDone. Run the backtest comparison with:\n"
          f"  python python/backtest_compare.py\n")


if __name__ == "__main__":
    main()
