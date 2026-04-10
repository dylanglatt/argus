<p align="center">
  <img src="public/favicon.svg" width="90" height="90" alt="Argus"/>
</p>

# ARGUS — Global Conflict Intelligence Dashboard

**[Live Demo →](https://argusosint.vercel.app)**

Argus is a multi-source OSINT dashboard for tracking and analyzing global conflict events. It ingests live event data from GDELT 2.0, cross-references kinetic events against NASA satellite imagery, filters AI-classified noise, and provides historical backtesting against POLECAT — a CIA/DARPA-funded conflict event dataset. Built for operational intelligence use cases: dense information layout, analyst feedback workflows, and multi-source provenance tracking.

## Data Sources

| Source | Role | Coverage | Auth |
|---|---|---|---|
| [GDELT 2.0](https://www.gdeltproject.org/) | Live conflict events (15-min updates) | 2015–present | None |
| [POLECAT](https://doi.org/10.7910/DVN/AJGVIT) | Historical backtest baseline | 2018–present | None (Harvard Dataverse) |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Satellite corroboration of kinetic events | Rolling 3-day VIIRS | API key |
| [ReliefWeb / UN OCHA](https://reliefweb.int/help/api) | Humanitarian context per country | Ongoing | None |
| [GTD](https://www.start.umd.edu/gtd/) | Terrorism-specific historical events | 1970–present | Pending registration |

GDELT provides the live operational feed. POLECAT and GTD are used exclusively in the Python backtest pipeline to validate GDELT signal quality and measure source agreement. FIRMS provides independent satellite-based corroboration for Battles and Explosions events.

## Features

**Live Intelligence Feed**
- Interactive Mapbox GL map with clustered conflict event markers, color-coded by event type and severity
- Event feed with sortable, filterable table — impact score, media mentions, Goldstein scale, source links
- Event detail panel with CAMEO codes, actor types, Goldstein scores, and primary source URLs
- Time series chart showing event frequency trends by type over the active window

**Analyst Workflow**
- Dismiss events as noise or confirm as valid signal — persisted server-side, optimistic UI updates
- Escalation banner alerts when recent Goldstein average crosses a negative threshold
- Free-text search across location, actors, and event notes

**Multi-Signal Corroboration**
- Satellite corroboration: Battles and Explosions/Remote violence events are cross-referenced against NASA FIRMS thermal anomaly detections (VIIRS SNPP satellite, ~1 km resolution, 3-day rolling window)
- Events with nearby satellite detections are flagged with corroboration status, detection count, max fire radiative power (FRP), and nearest detection distance in km
- AI classification gate: all GDELT events (except auto-pass military/high-Goldstein events) are routed through Claude Haiku for binary conflict verification, eliminating CAMEO misclassifications that structural filters cannot catch

**Situational Awareness Panels**
- Hot Zones: ranked list of highest-activity countries in the current window
- Actor panel: most active conflict actors and their event counts
- Country brief: UN OCHA humanitarian context for the selected country, sourced from ReliefWeb
- Stats bar: aggregate totals, affected countries, average Goldstein, dominant actor, and trend (ESCALATING / STABLE / DE-ESCALATING)

**Filtering**
- Event type (Battles, Explosions/Remote violence, Violence against civilians, Riots, Strategic developments)
- Country / region
- Date range
- Impact score minimum threshold
- Rolling time windows (24H, 48H, 72H, ALL)

## Python Data Pipeline

A separate Python pipeline handles historical data ingestion and multi-source backtesting. No external dependencies — stdlib only (`csv`, `json`, `urllib`).

### Setup

Place POLECAT annual files (downloaded from [Harvard Dataverse](https://doi.org/10.7910/DVN/AJGVIT)) in `data/`:

```
data/
  ngecEvents.DV.2023.txt
  ngecEvents.DV.2024.txt
```

The `data/` directory is gitignored. Raw and processed files are never committed.

### Ingestion

Normalize POLECAT event files into the Argus event schema:

```bash
python python/ingest_polecat.py
python python/ingest_polecat.py --years 2023 2024 --min-intensity -3
```

Output: `data/processed/polecat_events.json` (~206K conflict events), `data/processed/polecat_summary.json`

POLECAT is filtered to conflict quad codes only (MATERIAL CONFLICT, VERBAL CONFLICT). Event types are mapped from POLECAT's PLOVER ontology to the Argus taxonomy. ISO 3-letter country codes are resolved to full names. Intensity is normalized to the same Goldstein-scale convention used by GDELT.

### Backtest Comparison

Compare POLECAT against sampled GDELT historical data:

```bash
python python/backtest_compare.py
python python/backtest_compare.py --skip-download   # use cached GDELT files
```

Output: `data/processed/gdelt_sampled.json`, `data/processed/backtest_report.json`

**Methodology:** GDELT publishes a 15-minute export every 15 minutes. Downloading all files for 2023–2024 exceeds 500 GB. The script samples one file per month (15th, 00:00 UTC) — 18 total samples — and aggregates by country+month for comparison. Counts are not directly comparable between sources (GDELT is sampled, POLECAT is complete), but intensity correlation and hotspot agreement are valid comparisons.

**Findings (2023–2024):** Both sources agree on which countries are highest-conflict (Ukraine, Palestine, Russia, Israel appear in both top 10s). Intensity scores diverge significantly — GDELT's sampled events cluster near -10 on the Goldstein scale while POLECAT scores more granularly in the -2 to -8 range (r = 0.12). This reflects a real methodological difference: GDELT's CAMEO coder tends toward extreme scores for kinetic events in the sample window, while POLECAT's PLOVER ontology produces more graduated intensity values. Neither source is ground truth — the divergence is itself a signal.

**GTD integration** is stubbed in `backtest_compare.py` and activates automatically once `data/gtd_events.csv` is present. GTD adds a terrorism-specific third source dimension, particularly useful for non-state actor and IED/bombing events.

## Quick Start

```bash
npm install
cp .env.example .env   # add MAPBOX_TOKEN and ANTHROPIC_API_KEY
npm run dev            # starts Vite (port 5173) + Express (port 3001)
```

Or run separately:

```bash
npm run dev:client
npm run dev:server
```

### Environment Variables

```env
VITE_MAPBOX_TOKEN=       # Required — Mapbox GL map tiles
ANTHROPIC_API_KEY=       # Required — Claude Haiku event classification
NASA_FIRMS_API_KEY=      # Required — satellite corroboration (free at firms.modaps.eosdis.nasa.gov)
```

GDELT and ReliefWeb require no credentials.

## Project Structure

```
argus/
├── server/
│   ├── index.js              # Express backend — routing, caching, startup
│   ├── gdeltFetcher.js       # GDELT 2.0 ZIP/CSV downloader, parser, disk cache
│   ├── haikuFilter.js        # Claude Haiku AI classification gate for GDELT events
│   ├── firmsService.js       # NASA FIRMS satellite thermal anomaly integration
│   ├── reliefwebService.js   # ReliefWeb / UN OCHA humanitarian context proxy
│   ├── feedbackStore.js      # Analyst dismiss/confirm event persistence
│   ├── blobCache.js          # Disk cache layer
│   └── mockData.js           # Fallback mock events for offline dev
├── src/
│   ├── App.jsx               # Main layout and state management
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── StatsBar.jsx
│   │   ├── FilterPanel.jsx
│   │   ├── MapView.jsx
│   │   ├── EventFeed.jsx
│   │   ├── EventDetailPanel.jsx
│   │   ├── TimeChart.jsx
│   │   ├── EscalationBanner.jsx
│   │   ├── HotZones.jsx
│   │   ├── ActorPanel.jsx
│   │   └── CountryBrief.jsx
│   ├── hooks/
│   │   └── useEventData.js   # GDELT fetch, filtering, stats, FIRMS corroboration
│   └── utils/
│       └── constants.js      # Design tokens, event taxonomy, map config
├── python/
│   ├── ingest_polecat.py     # POLECAT → Argus schema normalization pipeline
│   └── backtest_compare.py   # Multi-source comparison: POLECAT vs GDELT (+ GTD stub)
├── data/                     # Gitignored — raw + processed data files
│   ├── ngecEvents.DV.2023.txt
│   ├── ngecEvents.DV.2024.txt
│   └── processed/
│       ├── polecat_events.json
│       ├── polecat_summary.json
│       ├── gdelt_sampled.json
│       └── backtest_report.json
├── vite.config.js
└── package.json
```

## API

**GET /api/health**

**GET /api/events**
```bash
curl "http://localhost:3001/api/events?limit=100&days=7"
```
Parameters: `limit`, `days`, `event_type`, `country`

**POST /api/events/:id/dismiss** — Analyst marks event as noise

**POST /api/events/:id/confirm** — Analyst confirms event as valid signal

**POST /api/firms/corroborate-batch** — Batch satellite corroboration for a set of events
```json
{ "events": [{ "id": "...", "lat": 48.5, "lon": 34.2, "date": "2024-04-10" }] }
```

## Technologies

- **Frontend**: React 19, Vite, Tailwind CSS v4
- **Maps**: Mapbox GL JS, react-map-gl
- **Charts**: Recharts
- **Backend**: Express.js
- **AI**: Claude Haiku (Anthropic API) — GDELT noise classification
- **Data pipeline**: Python 3 (stdlib — csv, json, urllib)
- **Fonts**: JetBrains Mono (data), Inter (UI)

## Design

Dense, analytical layout optimized for information density. No rounded corners or soft UI — sharp, functional, operational aesthetic derived from Palantir Blueprint's dark theme color system. Monospace fonts for all numerical and event data. Color-coded event taxonomy maps directly to CAMEO conflict categories.
