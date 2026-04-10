"""
backtest_compare.py
-------------------
Multi-source conflict event backtest for Argus.

Compares POLECAT (Harvard Dataverse) against GDELT 2.0 (sampled historical
exports) across 2023–2024 to measure source agreement, divergence, and
temporal correlation at the country level.

Designed to be extensible: GTD loader stub is included and wires in
automatically once data/gtd_events.csv is present.

Methodology note:
  GDELT publishes a new 15-minute export every 15 min (~500–2,000 events
  per file). Downloading all files for 2023–2024 would exceed 500 GB.
  Instead, this script samples one file per month (the first 00:00 UTC
  export for the 15th of each month). The sampled window is small but
  produces consistent, statistically comparable aggregates per source.
  Results should be interpreted as indicative, not exhaustive.

Usage:
  python python/backtest_compare.py
  python python/backtest_compare.py --skip-download   # use cached GDELT files

Output:
  data/processed/gdelt_sampled.json    — normalized GDELT sample
  data/processed/backtest_report.json  — full comparison report
"""

import argparse
import csv
import io
import json
import os
import time
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent
DATA_DIR   = ROOT / "data"
OUT_DIR    = DATA_DIR / "processed"
GDELT_DIR  = DATA_DIR / "gdelt_samples"
GDELT_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── GDELT 2.0 column indices (mirrors gdeltFetcher.js) ────────────────────────
C_EVENTID    = 0
C_DATE       = 1
C_ACTOR1     = 6
C_ACTOR2     = 16
C_EVENTCODE  = 26
C_ROOTCODE   = 28
C_QUADCLASS  = 29
C_GOLDSTEIN  = 30
C_MENTIONS   = 31
C_SOURCES    = 32
C_ARTICLES   = 33
C_GEO_NAME   = 52
C_GEO_CTRY   = 53
C_LAT        = 56
C_LON        = 57
C_URL        = 60

# ── GDELT FIPS country code → full name (subset matching POLECAT coverage) ────
FIPS_TO_NAME = {
    "AF": "Afghanistan", "AL": "Albania", "AG": "Algeria", "AO": "Angola",
    "AR": "Argentina", "AM": "Armenia", "AS": "Australia", "AU": "Austria",
    "AJ": "Azerbaijan", "BG": "Bangladesh", "BO": "Belarus", "BE": "Belgium",
    "UV": "Burkina Faso", "BY": "Burundi", "CB": "Cambodia", "CM": "Cameroon",
    "CA": "Canada", "CT": "Central African Republic", "CD": "Chad",
    "CI": "Chile", "CH": "China", "CO": "Colombia", "CG": "DR Congo",
    "CF": "Republic of Congo", "HR": "Croatia", "CU": "Cuba", "CY": "Cyprus",
    "EZ": "Czech Republic", "DA": "Denmark", "DJ": "Djibouti",
    "EG": "Egypt", "ES": "El Salvador", "ER": "Eritrea", "EN": "Estonia",
    "ET": "Ethiopia", "FI": "Finland", "FR": "France", "GB": "Gabon",
    "GG": "Georgia", "GM": "Germany", "GH": "Ghana", "GR": "Greece",
    "GT": "Guatemala", "GV": "Guinea", "HA": "Haiti", "HO": "Honduras",
    "HU": "Hungary", "IN": "India", "ID": "Indonesia", "IR": "Iran",
    "IZ": "Iraq", "EI": "Ireland", "IS": "Israel", "IT": "Italy",
    "JM": "Jamaica", "JA": "Japan", "JO": "Jordan", "KZ": "Kazakhstan",
    "KE": "Kenya", "KN": "North Korea", "KS": "South Korea", "KU": "Kuwait",
    "KG": "Kyrgyzstan", "LA": "Laos", "LG": "Latvia", "LE": "Lebanon",
    "LI": "Liberia", "LY": "Libya", "LH": "Lithuania", "MK": "North Macedonia",
    "MA": "Madagascar", "MI": "Malawi", "MY": "Malaysia", "MV": "Maldives",
    "ML": "Mali", "MR": "Mauritania", "MX": "Mexico", "MD": "Moldova",
    "MG": "Mongolia", "MJ": "Montenegro", "MO": "Morocco", "MZ": "Mozambique",
    "BM": "Myanmar", "WA": "Namibia", "NP": "Nepal", "NL": "Netherlands",
    "NZ": "New Zealand", "NU": "Nicaragua", "NG": "Niger", "NI": "Nigeria",
    "NO": "Norway", "MU": "Oman", "PK": "Pakistan", "PM": "Panama",
    "PP": "Papua New Guinea", "PA": "Paraguay", "PE": "Peru", "RP": "Philippines",
    "PL": "Poland", "PO": "Portugal", "WE": "Palestine", "QA": "Qatar",
    "RO": "Romania", "RS": "Russia", "RW": "Rwanda", "SA": "Saudi Arabia",
    "SG": "Senegal", "RI": "Serbia", "SL": "Sierra Leone", "SO": "Somalia",
    "SF": "South Africa", "OD": "South Sudan", "SP": "Spain", "CE": "Sri Lanka",
    "SU": "Sudan", "SW": "Sweden", "SY": "Syria", "TW": "Taiwan",
    "TI": "Tajikistan", "TZ": "Tanzania", "TH": "Thailand", "TT": "Timor-Leste",
    "TO": "Togo", "TS": "Tunisia", "TU": "Turkey", "TX": "Turkmenistan",
    "UG": "Uganda", "UP": "Ukraine", "AE": "United Arab Emirates",
    "UK": "United Kingdom", "US": "United States", "UY": "Uruguay",
    "UZ": "Uzbekistan", "VE": "Venezuela", "VM": "Vietnam", "YM": "Yemen",
    "ZA": "Zambia", "ZI": "Zimbabwe", "GZ": "Gaza Strip",
}

# ── CAMEO → Argus event type (mirrors gdeltFetcher.js mapEventType) ────────────
def map_gdelt_event_type(root_code: str, event_code: str) -> str | None:
    try:
        root = int(root_code)
    except (ValueError, TypeError):
        return None
    code = str(event_code or "")

    if code == "145":              return "Riots"
    if root == 14:                 return None   # non-violent protest
    if root in (13, 16, 17):       return None   # threats, diplomatic, sanctions
    if (code.startswith("183") or
        code.startswith("195") or
        code in ("1951", "1952", "1953")):
        return "Explosions/Remote violence"
    if root in (18, 20):           return "Violence against civilians"
    if root == 19:                 return "Battles"
    if code in ("152", "154", "155"): return "Strategic developments"
    if root == 15:                 return None
    return None


def goldstein_to_impact(g: float) -> float:
    if g >= 0:
        return 0.0
    return round(min(abs(g), 10.0), 2)


# ── GDELT historical sampler ───────────────────────────────────────────────────
def build_sample_dates(years=(2023, 2024)) -> list[str]:
    """
    One sample per month: the 15th at 00:00 UTC.
    Produces YYYYMMDDHHMMSS strings for GDELT filenames.
    POLECAT 2024 coverage ends Jun 2024, so cap there.
    """
    dates = []
    for year in years:
        max_month = 6 if year == 2024 else 12
        for month in range(1, max_month + 1):
            dates.append(f"{year}{month:02d}15000000")
    return dates


def download_gdelt_file(timestamp: str, cache_dir: Path) -> Path | None:
    """Download a single GDELT 15-min export ZIP to cache_dir if not already present."""
    fname  = f"{timestamp}.export.CSV.zip"
    cached = cache_dir / fname
    if cached.exists():
        return cached

    url = f"http://data.gdeltproject.org/gdeltv2/{fname}"
    print(f"  Downloading {fname}...", end=" ", flush=True)
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = resp.read()
        cached.write_bytes(data)
        print(f"{len(data) / 1e6:.1f} MB")
        return cached
    except Exception as e:
        print(f"FAILED ({e})")
        return None


def parse_gdelt_zip(zip_path: Path) -> list[dict]:
    """Parse a GDELT export ZIP into normalized Argus-schema events."""
    events = []
    with zipfile.ZipFile(zip_path) as zf:
        csv_name = [n for n in zf.namelist() if n.endswith(".CSV")][0]
        with zf.open(csv_name) as f:
            reader = csv.reader(io.TextIOWrapper(f, encoding="utf-8", errors="replace"), delimiter="\t")
            for row in reader:
                if len(row) < 61:
                    continue
                quad = row[C_QUADCLASS]
                if quad not in ("3", "4"):   # 3=VerConflict, 4=MatConflict
                    continue

                event_type = map_gdelt_event_type(row[C_ROOTCODE], row[C_EVENTCODE])
                if event_type is None:
                    continue

                try:
                    lat = float(row[C_LAT])
                    lon = float(row[C_LON])
                except ValueError:
                    continue

                try:
                    goldstein = float(row[C_GOLDSTEIN])
                except ValueError:
                    goldstein = 0.0

                date_raw = row[C_DATE]
                event_date = f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:8]}" if len(date_raw) >= 8 else ""
                fips = row[C_GEO_CTRY].strip()
                country = FIPS_TO_NAME.get(fips, fips or "Unknown")

                events.append({
                    "event_id_cnty": row[C_EVENTID],
                    "source":        "gdelt",
                    "event_date":    event_date,
                    "event_type":    event_type,
                    "actor1":        row[C_ACTOR1].strip() or "Unknown",
                    "actor2":        row[C_ACTOR2].strip() or "Unknown",
                    "country":       country,
                    "location":      row[C_GEO_NAME].strip(),
                    "latitude":      lat,
                    "longitude":     lon,
                    "goldstein_scale": goldstein,
                    "impact_score":  goldstein_to_impact(goldstein),
                    "num_mentions":  int(row[C_MENTIONS] or 0),
                    "num_sources":   int(row[C_SOURCES] or 0),
                })
    return events


# ── GTD loader (stub — wires in once data/gtd_events.csv is available) ─────────
def load_gtd_events() -> list[dict] | None:
    """
    Load and normalize GTD (Global Terrorism Database) events.
    Register at: https://www.start.umd.edu/gtd/
    Place the downloaded CSV at: data/gtd_events.csv

    GTD covers 1970–present with terrorism-specific events.
    When available, it adds a third source dimension to the backtest,
    particularly for non-state actor and IED/bombing events that
    GDELT and POLECAT may undercount relative to academic coders.
    """
    gtd_path = DATA_DIR / "gtd_events.csv"
    if not gtd_path.exists():
        return None  # Not yet available — skipped silently

    print("  Loading GTD events...")
    events = []
    with open(gtd_path, encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                year  = row.get("iyear", "")
                month = row.get("imonth", "1").zfill(2)
                day   = row.get("iday", "1").zfill(2)
                if not year or year < "2023":
                    continue
                lat = float(row.get("latitude") or 0)
                lon = float(row.get("longitude") or 0)
                if lat == 0 and lon == 0:
                    continue
                events.append({
                    "event_id_cnty": row.get("eventid", ""),
                    "source":        "gtd",
                    "event_date":    f"{year}-{month}-{day}",
                    "event_type":    "Explosions/Remote violence",  # GTD is terrorism-specific
                    "actor1":        row.get("gname", "Unknown"),
                    "actor2":        "Civilians",
                    "country":       row.get("country_txt", "Unknown"),
                    "location":      row.get("city", ""),
                    "latitude":      lat,
                    "longitude":     lon,
                    "goldstein_scale": -8.0,   # GTD events are inherently severe
                    "impact_score":  8.0,
                    "num_mentions":  1,
                    "num_sources":   1,
                    "nkill":        int(row.get("nkill") or 0),
                })
            except (ValueError, KeyError):
                continue
    print(f"  → {len(events):,} GTD events loaded")
    return events if events else None


# ── Comparison engine ─────────────────────────────────────────────────────────
def aggregate_by_country_month(events: list[dict]) -> dict:
    """Aggregate event counts and avg intensity by country+month."""
    agg = defaultdict(lambda: {"count": 0, "total_intensity": 0.0, "event_types": defaultdict(int)})
    for e in events:
        key = (e["country"], e["event_date"][:7])
        agg[key]["count"] += 1
        agg[key]["total_intensity"] += e["goldstein_scale"]
        agg[key]["event_types"][e["event_type"]] += 1
    # Finalize averages
    result = {}
    for (country, month), v in agg.items():
        result[f"{country}|{month}"] = {
            "country":       country,
            "month":         month,
            "count":         v["count"],
            "avg_intensity": round(v["total_intensity"] / v["count"], 3),
            "event_types":   dict(v["event_types"]),
        }
    return result


def compare_sources(source_a: dict, label_a: str,
                    source_b: dict, label_b: str) -> dict:
    """
    Compare two country+month aggregates.
    Returns overlap stats, top agreements, and top divergences.
    """
    keys_a = set(source_a.keys())
    keys_b = set(source_b.keys())
    shared = keys_a & keys_b
    only_a = keys_a - keys_b
    only_b = keys_b - keys_a

    # Intensity correlation on shared keys
    pairs = [(source_a[k]["avg_intensity"], source_b[k]["avg_intensity"]) for k in shared]
    if pairs:
        mean_a = sum(p[0] for p in pairs) / len(pairs)
        mean_b = sum(p[1] for p in pairs) / len(pairs)
        num    = sum((a - mean_a) * (b - mean_b) for a, b in pairs)
        den_a  = sum((a - mean_a) ** 2 for a, b in pairs) ** 0.5
        den_b  = sum((b - mean_b) ** 2 for a, b in pairs) ** 0.5
        correlation = round(num / (den_a * den_b), 4) if den_a * den_b > 0 else 0.0
    else:
        correlation = 0.0

    # Largest divergences (where both see the same country/month but disagree on intensity)
    divergences = sorted(
        [{"key": k,
          "country": source_a[k]["country"],
          "month":   source_a[k]["month"],
          label_a + "_count":     source_a[k]["count"],
          label_b + "_count":     source_b[k]["count"],
          label_a + "_intensity": source_a[k]["avg_intensity"],
          label_b + "_intensity": source_b[k]["avg_intensity"],
          "intensity_delta": round(abs(source_a[k]["avg_intensity"] - source_b[k]["avg_intensity"]), 3),
          } for k in shared],
        key=lambda x: x["intensity_delta"],
        reverse=True
    )[:20]

    # Hotspots: country+months flagged by one source but not the other
    a_exclusive = sorted(
        [{"key": k, "country": source_a[k]["country"], "month": source_a[k]["month"],
          "count": source_a[k]["count"], "avg_intensity": source_a[k]["avg_intensity"]}
         for k in only_a],
        key=lambda x: x["count"], reverse=True
    )[:15]

    b_exclusive = sorted(
        [{"key": k, "country": source_b[k]["country"], "month": source_b[k]["month"],
          "count": source_b[k]["count"], "avg_intensity": source_b[k]["avg_intensity"]}
         for k in only_b],
        key=lambda x: x["count"], reverse=True
    )[:15]

    return {
        "sources":            [label_a, label_b],
        "shared_keys":        len(shared),
        f"{label_a}_only":    len(only_a),
        f"{label_b}_only":    len(only_b),
        "overlap_pct":        round(len(shared) / max(len(keys_a | keys_b), 1) * 100, 1),
        "intensity_correlation": correlation,
        "top_divergences":    divergences,
        f"{label_a}_exclusive_hotspots": a_exclusive,
        f"{label_b}_exclusive_hotspots": b_exclusive,
    }


def top_countries_by_source(events: list[dict], label: str, n=10) -> list[dict]:
    counts = defaultdict(lambda: {"count": 0, "total_intensity": 0.0})
    for e in events:
        counts[e["country"]]["count"] += 1
        counts[e["country"]]["total_intensity"] += e["goldstein_scale"]
    ranked = sorted(counts.items(), key=lambda x: x[1]["count"], reverse=True)[:n]
    return [{"source": label, "country": c,
             "count": v["count"],
             "avg_intensity": round(v["total_intensity"] / v["count"], 3)}
            for c, v in ranked]


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Argus multi-source backtest comparison")
    parser.add_argument("--skip-download", action="store_true",
                        help="Use cached GDELT sample files only, skip downloading")
    args = parser.parse_args()

    print("\nArgus Backtest — Multi-Source Comparison")
    print("─" * 50)

    # ── Load POLECAT ──────────────────────────────────────────────────────────
    polecat_path = OUT_DIR / "polecat_events.json"
    if not polecat_path.exists():
        print("[ERROR] Run ingest_polecat.py first to generate data/processed/polecat_events.json")
        return

    print("\n[1/3] Loading POLECAT events...")
    with open(polecat_path) as f:
        polecat_data = json.load(f)
    polecat_events = polecat_data["data"]
    print(f"  → {len(polecat_events):,} events ({polecat_data.get('count', '?')} total)")

    # ── Fetch GDELT historical sample ─────────────────────────────────────────
    print("\n[2/3] Fetching GDELT historical sample (one 15-min file per month)...")
    sample_dates = build_sample_dates(years=[2023, 2024])
    gdelt_events = []

    for ts in sample_dates:
        if args.skip_download:
            zip_path = GDELT_DIR / f"{ts}.export.CSV.zip"
            if not zip_path.exists():
                print(f"  Skipping {ts} (not cached)")
                continue
        else:
            zip_path = download_gdelt_file(ts, GDELT_DIR)
            if zip_path is None:
                continue
            time.sleep(0.5)  # polite rate limit

        try:
            batch = parse_gdelt_zip(zip_path)
            gdelt_events.extend(batch)
            print(f"  {ts[:8]} → {len(batch):,} conflict events")
        except Exception as e:
            print(f"  {ts[:8]} → parse error: {e}")

    if not gdelt_events:
        print("[WARN] No GDELT events loaded. Check network or run with --skip-download.")
    else:
        # Save normalized GDELT sample
        gdelt_out = OUT_DIR / "gdelt_sampled.json"
        with open(gdelt_out, "w") as f:
            json.dump({"source": "gdelt_sampled", "sample_dates": sample_dates,
                       "count": len(gdelt_events), "data": gdelt_events}, f, indent=2)
        print(f"\n  Saved {gdelt_out.relative_to(ROOT)}")

    # ── Load GTD (if available) ───────────────────────────────────────────────
    print("\n[3/3] Checking for GTD data...")
    gtd_events = load_gtd_events()
    if gtd_events is None:
        print("  GTD not yet available (data/gtd_events.csv not found) — skipping")

    # ── Aggregate and compare ─────────────────────────────────────────────────
    print("\n── Aggregating by country + month...")
    polecat_agg = aggregate_by_country_month(polecat_events)

    report = {
        "methodology": (
            "GDELT: one 15-minute export sampled per month (15th, 00:00 UTC). "
            "POLECAT: full annual files (2023–2024). "
            "Comparison is at country+month granularity. "
            "GDELT samples represent a fraction of total daily events — "
            "counts are not directly comparable but intensity correlation is valid."
        ),
        "polecat_summary": {
            "total_events":   len(polecat_events),
            "top_countries":  top_countries_by_source(polecat_events, "polecat"),
        },
        "comparisons": [],
    }

    if gdelt_events:
        gdelt_agg = aggregate_by_country_month(gdelt_events)
        report["gdelt_summary"] = {
            "total_sampled_events": len(gdelt_events),
            "sample_dates":         sample_dates,
            "top_countries":        top_countries_by_source(gdelt_events, "gdelt"),
        }
        report["comparisons"].append(compare_sources(polecat_agg, "polecat", gdelt_agg, "gdelt"))

    if gtd_events:
        gtd_agg = aggregate_by_country_month(gtd_events)
        report["gtd_summary"] = {
            "total_events":  len(gtd_events),
            "top_countries": top_countries_by_source(gtd_events, "gtd"),
        }
        report["comparisons"].append(compare_sources(polecat_agg, "polecat", gtd_agg, "gtd"))
        if gdelt_events:
            report["comparisons"].append(compare_sources(gdelt_agg, "gdelt", gtd_agg, "gtd"))

    # ── Write report ──────────────────────────────────────────────────────────
    report_path = OUT_DIR / "backtest_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nWrote {report_path.relative_to(ROOT)}")

    # ── Print digest ──────────────────────────────────────────────────────────
    print("\n── POLECAT top conflict countries ──")
    for entry in report["polecat_summary"]["top_countries"]:
        print(f"  {entry['country']:<30} {entry['count']:>7,} events  "
              f"avg intensity {entry['avg_intensity']:+.2f}")

    if gdelt_events:
        print("\n── GDELT (sampled) top conflict countries ──")
        for entry in report["gdelt_summary"]["top_countries"]:
            print(f"  {entry['country']:<30} {entry['count']:>7,} events  "
                  f"avg intensity {entry['avg_intensity']:+.2f}")

        cmp = report["comparisons"][0]
        print(f"\n── POLECAT vs GDELT comparison ──")
        print(f"  Shared country+month cells : {cmp['shared_keys']}")
        print(f"  Overlap coverage           : {cmp['overlap_pct']}%")
        print(f"  Intensity correlation (r)  : {cmp['intensity_correlation']}")
        print(f"\n  Top intensity divergences:")
        for d in cmp["top_divergences"][:5]:
            print(f"    {d['country']:<25} {d['month']}  "
                  f"POLECAT {d['polecat_intensity']:+.2f} | "
                  f"GDELT {d['gdelt_intensity']:+.2f}  "
                  f"(Δ {d['intensity_delta']:.2f})")

    if gtd_events:
        print("\n── GTD top conflict countries ──")
        for entry in report["gtd_summary"]["top_countries"]:
            print(f"  {entry['country']:<30} {entry['count']:>7,} events")

    print("\nDone. Full report: data/processed/backtest_report.json\n")


if __name__ == "__main__":
    main()
