<p align="center">
  <img src="public/favicon.svg" width="90" height="90" alt="Argus"/>
</p>

# ARGUS — Global Conflict Intelligence Dashboard

**[Live Demo →](https://argusosint.vercel.app)**

Argus is a multi-source OSINT dashboard for tracking and analyzing global conflict events in near real-time. It fuses live GDELT 2.0 news signals with UCDP GED validated conflict data, cross-references kinetic events against NASA satellite thermal imagery, filters noise via structured Claude Haiku classification, and generates AI-written theater situation reports per country.

Built for operational intelligence use cases: dense information layout, multi-source provenance tracking, fatality estimates, and analyst feedback workflows.

---

## The Problem

GDELT 2.0 processes 300+ news sources every 15 minutes and extracts events using an NLP pipeline trained on the CAMEO conflict ontology. The coverage is extraordinary — but the signal quality is not.

The core failure mode is CAMEO misclassification: the same code that means "Use conventional military force" (CAMEO 190) gets applied to "Travelers fight TSA policy" or "Police respond to road rage." GDELT's structural filters — QuadClass, root codes, Goldstein scale — all derive from the same NLP output and inherit the same errors. Filtering on `QuadClass = 4 (Material Conflict)` doesn't fix it; it just reduces volume while keeping the misclassification rate roughly constant.

The result: a raw GDELT feed for "conflict events" contains roughly 60-70% noise — domestic crime, sports disputes, court proceedings, and opinion pieces that all got CAMEO-coded as kinetic violence. An analyst dashboard built directly on this is worse than useless; it trains analysts to ignore alerts.

Argus addresses this through a five-stage pipeline:

1. **Structural pre-filtering** — CAMEO root codes (14–20 only), QuadClass gates, armed actor type detection, source count thresholds, domain blocklists, URL pattern rejection. Zero LLM cost; eliminates ~80% of noise before any API call.
2. **Geographic validation** — country bounding box checks, centroid coordinate rejection ("Null Island" detection), spatial coherence verification.
3. **Relevance scoring** — 0–100 score from event type base rates + armed actor bonuses + Goldstein penalties + source count adjustments.
4. **Claude Haiku classification** — structured multi-dimensional assessment for events that clear the structural gates but can't be auto-passed. Returns a scored JSON object (credibility, severity, specificity, novelty, conflict relevance) with reasoning and event tags.
5. **Spatial-temporal deduplication** — 1° grid, 2-day window. Keeps highest source-count event per cluster.

---

## Data Sources

| Source | Role | Coverage | Auth |
|---|---|---|---|
| [GDELT 2.0](https://www.gdeltproject.org/) | Live conflict signals (hourly refresh) | 2015–present | None |
| [UCDP GED](https://ucdp.uu.se/downloads/) | Validated conflict events with expert-coded fatality estimates | 2023–2024 | API token |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Satellite corroboration of kinetic events | Rolling 3-day VIIRS | API key |
| [ReliefWeb / UN OCHA](https://reliefweb.int/help/api) | Humanitarian context per country | Ongoing | None |
| [POLECAT](https://doi.org/10.7910/DVN/AJGVIT) | Historical backtest baseline | 2018–present | None (Harvard Dataverse) |

**GDELT** provides real-time news-derived signals (NLP-extracted, noisy, 15-min upstream cadence). All GDELT events pass through the full filtering pipeline before entering the feed. **UCDP GED** provides expert-coded, peer-reviewed conflict events with validated fatality estimates (best/low/high), real actor names, and conflict typology (state-based, non-state, one-sided violence). The two sources are merged, deduplicated by date-priority, and capped at 800 events per hourly cycle. FIRMS provides independent satellite-based corroboration for Battles and Explosions events.

---

## Features

**Live Intelligence Feed**
- Interactive Mapbox GL map with conflict event markers sized by fatalities (UCDP) or media mentions (GDELT), color-coded by event type
- Event feed with KIA column, source provenance badges (UCDP / SAT / GDELT), sortable by impact
- Event detail panel with CAMEO codes, actor types, Goldstein scores, UCDP casualty range (low/best/high), source provenance, and AI classification breakdown
- Time series chart showing event frequency trends by type over the active window
- Data freshness indicator — green badge (GDELT + UCDP · HOURLY REFRESH) turns orange if cache is >90 minutes stale

**AI Classification Panel (per event)**
- Every GDELT event classified by Claude Haiku against five analyst dimensions: credibility, severity, specificity, novelty, conflict relevance (scored 0–12)
- Per-dimension bar chart, event tags (battle / explosion / troop_movement / etc.), confidence rating, and one-line factual reasoning note sourced from the article
- Classification stored on event objects and surfaced in the detail panel — analysts can see exactly why an event was included

**AI Theater Situation Reports**
- Per-country SITREP generated by Claude Haiku — 3-paragraph structured assessment covering current situation, recent trajectory, and key actor analysis
- Synthesized from GDELT signals + UCDP validated data for that country
- UCDP·N and GDELT·N event count badges show source balance
- Cached at CDN level for 30 minutes; includes "AI-GENERATED · NOT FOR OPERATIONAL USE" disclaimer

**Multi-Source Data Fusion**
- GDELT events tagged `source: 'gdelt'`, UCDP events tagged `source: 'ucdp'` — provenance preserved end-to-end
- Source filter in FilterPanel lets analysts isolate GDELT signals or UCDP validated events independently
- UCDP actors displayed with cleaned names (trailing abbreviation suffixes stripped)
- Fatality aggregate (sum of UCDP best estimates) displayed in header stats bar

**Multi-Signal Corroboration**
- Satellite corroboration: Battles and Explosions events cross-referenced against NASA FIRMS thermal anomaly detections (VIIRS SNPP, ~1 km resolution, 3-day rolling window)
- Events with nearby satellite detections flagged with detection count, max fire radiative power (FRP), and nearest detection distance
- Haiku classification gate: structured scoring across five dimensions for all GDELT events that pass structural pre-filters

**Analyst Workflow**
- Dismiss events as noise or confirm as valid signal — persisted server-side, optimistic UI
- Escalation banner alerts when recent Goldstein average crosses a negative threshold
- Free-text search across location, actors, and event notes

**Filtering**
- Event type (Battles, Explosions/Remote violence, Violence against civilians, Riots, Strategic developments)
- Data source (GDELT 2.0 / UCDP GED)
- Country / region
- Date range
- Impact score minimum threshold
- Rolling time windows (24H, 48H, 72H, ALL)

---

## Key Design Decisions & Tradeoffs

**1. Structural pre-filtering before LLM calls**

The Haiku classification gate only runs on events that survive 100+ URL pattern rejections, domain blocklisting, CAMEO/QuadClass structural gates, armed actor type checks, and source count thresholds. This is deliberate: LLM calls are expensive and slow; structural filters are free. The goal is to route only genuinely ambiguous events to Haiku — the cases where NLP codes are plausible but article content is needed to make the call.

The alternative (route everything through Haiku) would cost 10x more, take 3x longer, and produce worse results because Haiku would be making the same "is this CAMEO code right?" decision that the structural filters already handle better with explicit rules.

**2. Auto-pass for high-confidence armed actor events**

Events with military/rebel actor types (MIL, REB, UAF), Goldstein ≤ −4, and ≥3 sources skip Haiku entirely. These are virtually certain to be real combat events — the classification error rate at this threshold is negligible, and silently discarding a high-confidence report of ongoing combat because of a rate limit is a worse failure mode than occasionally passing a marginal event.

**3. Fail-open / fail-closed split on API errors**

When Haiku is unavailable (rate limit, timeout), events are treated differently based on their pre-Haiku signal strength: high-confidence armed actor events fail open (kept); everything else fails closed (dropped). This means the dashboard degrades gracefully under load — it loses edge cases, not core events.

**4. Structured scoring over binary classification**

The Haiku gate was originally a binary YES/NO filter. Replacing it with a five-dimension scored JSON output (credibility, severity, specificity, novelty, conflict relevance) surfaces analyst reasoning that was previously discarded. This enables: per-event score display in the UI, tag-based filtering, audit trails for why events were included, and a basis for future threshold tuning based on analyst feedback. The tradeoff is more tokens per call (300 vs 150) and a JSON parser — both are acceptable at the volume this pipeline operates at.

**5. UCDP as ground truth, GDELT as signal layer**

UCDP GED events bypass the Haiku filter entirely because they're already expert-validated with coded fatality estimates. Merging both sources on a shared schema preserves provenance end-to-end while giving analysts a clear view of confidence levels: a GDELT event with SAT corroboration is more credible than a raw GDELT signal, but neither approaches UCDP validation quality. This hierarchy is surfaced in the UI (UCDP VALIDATED / SAT CORROBORATED / GDELT SIGNAL badges) rather than flattened into a single feed.

---

## Data Pipeline

The event pipeline runs as an hourly GitHub Actions cron job, writing to Vercel Blob. The frontend reads exclusively from Blob — no live API calls on page load.

### Pipeline Steps

1. **GDELT fetch** — downloads last 7 days of GDELT 2.0 exports in 6-hour steps, extracts conflict-relevant CAMEO codes
2. **Haiku filter** — structured multi-dimensional classification of GDELT events; drops noise, attaches `ai_classification` to passing events
3. **UCDP fetch** — paginates UCDP GED API for 2023–2024, normalizes to Argus schema with fatality estimates and conflict typology
4. **Merge & cap** — merges both sources, sorts descending by date (UCDP first on same date), caps at 800 events
5. **Blob write** — writes final event set + `fetchedAt` timestamp to Vercel Blob

### Event Schema

```js
// GDELT event (with AI classification)
{
  event_id_cnty:     string,
  event_date:        string,       // 'YYYY-MM-DD'
  event_type:        string,       // 'Battles' | 'Explosions' | 'Violence against civilians' | ...
  sub_event_type:    string,
  actor1:            string,
  actor2:            string,
  actor1_type:       string,       // GDELT actor type code
  location:          string,
  country:           string,
  latitude:          number,
  longitude:         number,
  goldstein_scale:   number,       // -10 to +10
  num_sources:       number,
  num_mentions:      number,
  avg_tone:          number,
  impact_score:      number,       // 0-10, derived from Goldstein
  source_url:        string,
  source:            'gdelt',
  notes:             string,       // Haiku one-line reasoning note
  ai_classification: {             // structured Haiku assessment
    include:    boolean,
    score:      number,            // 0–12 total
    breakdown:  {
      credibility:        number,  // 0-2
      severity:           number,  // 0-3
      specificity:        number,  // 0-2
      novelty:            number,  // 0-2
      conflict_relevance: number,  // 0-3
    },
    reasoning:  string,
    tags:       string[],          // e.g. ['battle', 'cross_border_attack']
    confidence: 'low' | 'medium' | 'high',
  } | null,
  satellite_corroborated: boolean,
  firms_detections:       number,
  firms_max_frp:          number,
}

// UCDP event (additional fields)
{
  source:              'ucdp',
  fatalities_best:     number,   // expert best-estimate fatalities
  fatalities_low:      number,
  fatalities_high:     number,
  ucdp_conflict:       string,   // e.g. "Myanmar - Military Factions"
  ucdp_violence_type:  string,   // "Battles" | "Violence against civilians"
}
```

---

## Validation: Multi-Source Backtest

A Python backtest pipeline compares Argus (GDELT + POLECAT) against UCDP GED as ground truth across 2023–2024 to measure source agreement, divergence, and false positive rate at the country level.

**Findings:** GDELT and POLECAT agree on top-conflict countries (Ukraine, Palestine, Russia, Israel appear in both top-10 lists). Intensity scores diverge substantially — GDELT clusters near −10 on the Goldstein scale while POLECAT scores more granularly in the −2 to −8 range (r = 0.12). This is a methodological difference, not a data quality failure: GDELT's CAMEO coder skews toward extreme scores for kinetic events; POLECAT's PLOVER ontology produces more graduated values. UCDP GED remains the authoritative ground truth for fatality-confirmed events within its coverage window.

The backtest is extensible — GTD integration is stubbed in `backtest_compare.py` and wires in automatically once `data/gtd_events.csv` is present.

---

## Quick Start

```bash
npm install
cp .env.example .env.local   # populate required vars
npm run dev                   # Vite (port 5173) + Express (port 3001)
```

### Environment Variables

```env
VITE_MAPBOX_TOKEN=       # Required — Mapbox GL map tiles
ANTHROPIC_API_KEY=       # Required — Haiku event classification + country SITREPs
NASA_FIRMS_API_KEY=      # Required — satellite corroboration (free at firms.modaps.eosdis.nasa.gov)
UCDP_API_TOKEN=          # Required — UCDP GED API access (register at ucdp.uu.se)
BLOB_READ_WRITE_TOKEN=   # Required in prod — Vercel Blob (set automatically on Vercel)
```

GDELT and ReliefWeb require no credentials.

---

## Project Structure

```
argus/
├── server/
│   ├── index.js              # Express backend — routing, caching, startup
│   ├── gdeltFetcher.js       # GDELT 2.0 ZIP/CSV downloader and parser
│   ├── ucdpFetcher.js        # UCDP GED API client — paginated fetch, normalization
│   ├── haikuFilter.js        # Claude Haiku structured classification gate
│   ├── firmsService.js       # NASA FIRMS satellite thermal anomaly integration
│   ├── reliefwebService.js   # ReliefWeb / UN OCHA humanitarian context proxy
│   ├── feedbackStore.js      # Analyst dismiss/confirm event persistence
│   └── blobCache.js          # Vercel Blob read/write layer
├── scripts/
│   └── refresh-events.js     # Hourly pipeline: GDELT + UCDP → merge → Blob write
├── api/
│   └── brief/
│       └── [country].js      # GET /api/brief/:country — Haiku SITREP (30min CDN cache)
├── src/
│   ├── App.jsx               # Main layout and state management
│   ├── components/
│   │   ├── Header.jsx        # Stats bar: events, fatalities, countries, Goldstein, trend
│   │   ├── FilterPanel.jsx   # Filters including DATA SOURCE toggle (GDELT / UCDP)
│   │   ├── MapView.jsx       # Mapbox GL map — markers sized by fatalities or mentions
│   │   ├── EventFeed.jsx     # Event table with KIA column and source provenance badges
│   │   ├── EventDetailPanel.jsx  # Detail view: AI classification, UCDP casualty range
│   │   ├── CountryBrief.jsx  # AI SITREP + UN OCHA humanitarian context
│   │   ├── TimeChart.jsx
│   │   ├── EscalationBanner.jsx
│   │   ├── HotZones.jsx
│   │   └── ActorPanel.jsx
│   ├── hooks/
│   │   └── useEventData.js
│   └── utils/
│       └── constants.js
├── python/
│   ├── quality_filter.py     # Four-stage Python filter: geo validation, relevance scoring, coherence, dedup
│   ├── ingest_polecat.py     # POLECAT → Argus schema normalization pipeline
│   ├── build_conflict_index.py  # Spatial conflict grid from POLECAT (used by FIRMS corroboration)
│   └── backtest_compare.py   # Multi-source comparison: POLECAT vs GDELT (+ GTD stub)
├── .github/
│   └── workflows/
│       └── refresh-events.yml  # Hourly cron: runs scripts/refresh-events.js → Vercel Blob
└── data/                     # Gitignored — raw + processed data files
```

---

## API

**GET /api/health**

**GET /api/events**
```bash
curl "http://localhost:3001/api/events?limit=100&days=7"
```
Parameters: `limit`, `days`, `event_type`, `country`

**GET /api/brief/:country** *(Vercel serverless, CDN-cached 30min)*
```bash
curl "https://argusosint.vercel.app/api/brief/Ukraine"
```
Response: `{ sitrep: string, gdelt_events: number, ucdp_events: number, generated_at: number }`

**POST /api/events/:id/dismiss** — Analyst marks event as noise

**POST /api/events/:id/confirm** — Analyst confirms event as valid signal

**POST /api/firms/corroborate-batch** — Batch satellite corroboration
```json
{ "events": [{ "id": "...", "lat": 48.5, "lon": 34.2, "date": "2024-04-10" }] }
```

---

## Technologies

- **Frontend**: React 19, Vite
- **Maps**: Mapbox GL JS, react-map-gl
- **Charts**: Recharts
- **Backend**: Express.js + Vercel serverless functions
- **AI**: Claude Haiku — structured event classification (five-dimension scoring) + country SITREP generation
- **Event cache**: Vercel Blob (written hourly by GitHub Actions, read by frontend)
- **Data pipeline**: Node.js (scripts/refresh-events.js), Python 3 (quality filter, historical backtest)
- **Fonts**: JetBrains Mono (data), Inter (UI)

---

## Python Filter Pipeline

The Python pipeline handles geographic validation, relevance scoring, spatial coherence checks, and deduplication as a pre-processing step independent of the Node.js ingestion pipeline.

```bash
python python/quality_filter.py       # four-stage filter on raw GDELT exports
python python/ingest_polecat.py       # normalize POLECAT → Argus schema
python python/backtest_compare.py --skip-download   # multi-source backtest
```

No external dependencies — stdlib only (`csv`, `json`, `urllib`).

---

## Design

Dense, analytical layout optimized for information density over visual polish. No rounded corners or decorative elements — sharp, functional, operational aesthetic derived from Palantir Blueprint's dark theme color system. Monospace fonts (JetBrains Mono) for all numerical and event data; Inter for UI chrome. Color-coded event taxonomy maps directly to CAMEO conflict categories.

Source provenance is preserved and surfaced at every layer: map markers, event feed badges, detail panel callouts, and SITREP footnotes. Analysts can always trace a displayed data point to its origin (UCDP peer-reviewed / NASA satellite / GDELT NLP) without drilling into metadata.

The AI Classification panel in the event detail view makes the Haiku assessment transparent — analysts see the score breakdown, the confidence rating, the event tags, and the one-line reasoning note that justified inclusion. This is intentional: a black-box filter trains analysts to distrust the system; a legible one lets them calibrate it.
