<p align="center">
  <img src="public/favicon.svg" width="90" height="90" alt="Argus"/>
</p>

# ARGUS — Global Conflict Intelligence Dashboard

**[Live Demo →](https://argusosint.vercel.app)**

---

## The Problem

GDELT 2.0 processes 300+ news sources every 15 minutes and extracts events using an NLP pipeline trained on the CAMEO conflict ontology. The coverage is extraordinary — but the signal quality is not.

The core failure mode is CAMEO misclassification: the same code that means "Use conventional military force" (CAMEO 190) gets applied to "Travelers fight TSA policy" or "Police respond to road rage." GDELT's structural filters — QuadClass, root codes, Goldstein scale — all derive from the same NLP output and inherit the same errors. Filtering on `QuadClass = 4 (Material Conflict)` doesn't fix it; it just reduces volume while keeping the misclassification rate roughly constant.

The result: a raw GDELT feed for "conflict events" contains roughly 60–70% noise — domestic crime, sports disputes, court proceedings, and opinion pieces that all got CAMEO-coded as kinetic violence. A dashboard built directly on this is worse than useless; it trains analysts to ignore alerts.

A second problem: even clean events lack independent corroboration. A media report of a military strike is one signal. A media report that aligns with a NASA satellite thermal anomaly at the same location is a different kind of signal entirely.

---

## What I Built

Argus is a multi-source conflict intelligence dashboard that fuses live GDELT 2.0 signals with UCDP GED validated conflict data, runs a five-stage noise reduction pipeline (structural pre-filtering → geographic validation → relevance scoring → Claude Haiku classification → spatial deduplication), cross-references kinetic events against NASA FIRMS satellite thermal imagery, and generates AI-written per-country situation reports.

The frontend is a dense, operational-grade interface built on React 19 and Mapbox GL — designed for information density over visual polish, with source provenance surfaced at every layer so an analyst always knows whether they're looking at a peer-reviewed fatality estimate or an NLP-extracted news signal.

Data refreshes every 15 minutes via a GitHub Actions pipeline that writes to Vercel Blob. The frontend reads exclusively from Blob — no live API calls on page load, predictable latency, no cold-start failures.

---

## Key Design Decisions

These are the decisions I'd flag in a product review — the judgment calls that shaped the architecture.

**1. Structural pre-filtering before LLM calls**

The Haiku classification gate only runs on events that survive 100+ URL pattern rejections, domain blocklisting, CAMEO/QuadClass structural gates, armed actor type checks, and source count thresholds. This is deliberate: LLM calls are expensive and slow; structural filters are free and deterministic. The goal is to route only genuinely ambiguous events to Haiku — the cases where NLP codes are plausible but article content is needed to make the final call.

Routing everything through Haiku would cost 10x more, take 3x longer, and produce worse results because the model would be making the same judgment the structural filters already handle more reliably with explicit rules.

**2. Auto-pass for high-confidence armed actor events**

Events with military/rebel actor types (MIL, REB, UAF), Goldstein ≤ −4, and ≥3 independent sources skip Haiku entirely. The classification error rate at this threshold is negligible, and silently dropping a high-confidence report of ongoing combat because of an API rate limit is a worse failure mode than occasionally passing a marginal event. This is an explicit fail-open decision for high-signal inputs.

**3. Fail-open / fail-closed split on API errors**

When Haiku is unavailable (rate limit, timeout), events are handled differently based on pre-filter signal strength: high-confidence armed actor events fail open (kept); everything else fails closed (dropped). The dashboard degrades gracefully under load — it loses edge cases, not confirmed combat events.

**4. Structured scoring over binary classification**

The Haiku gate was originally a binary YES/NO filter. Replacing it with a five-dimension scored JSON output (credibility, severity, specificity, novelty, conflict relevance) surfaces analyst reasoning that was previously discarded. This enables per-event score display in the UI, tag-based filtering, audit trails for why events were included, and a basis for threshold tuning based on analyst feedback. The tradeoff is more tokens per call — acceptable at this volume.

**5. UCDP as ground truth, GDELT as signal layer**

UCDP GED events bypass the Haiku filter entirely because they're already expert-validated with coded fatality estimates. Merging both sources on a shared schema preserves provenance end-to-end while giving analysts a clear confidence hierarchy: UCDP peer-reviewed > NASA satellite corroborated > raw GDELT signal. This hierarchy is surfaced in the UI (UCDP VALIDATED / SAT CORROBORATED / GDELT SIGNAL badges) rather than flattened into a single undifferentiated feed.

**6. Making the AI layer transparent**

The event detail panel exposes the full Haiku assessment — score breakdown by dimension, confidence rating, event tags, and the one-line reasoning note that justified inclusion. A black-box filter trains analysts to distrust the system. A legible one lets them calibrate it.

---

## Data Sources

| Source | Role | Coverage | Auth |
|---|---|---|---|
| [GDELT 2.0](https://www.gdeltproject.org/) | Live conflict signals | 2015–present | None |
| [UCDP GED](https://ucdp.uu.se/downloads/) | Validated events with expert fatality estimates | 2023–2024 | API token |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Satellite corroboration of kinetic events | Rolling 3-day VIIRS | API key |
| [ReliefWeb / UN OCHA](https://reliefweb.int/help/api) | Humanitarian context per country | Ongoing | None |
| [POLECAT](https://doi.org/10.7910/DVN/AJGVIT) | Historical backtest baseline | 2018–present | None (Harvard Dataverse) |

---

## Pipeline

The event pipeline runs as a GitHub Actions cron job every 15 minutes, writing to Vercel Blob.

1. **GDELT fetch** — last 7 days of exports in 6-hour steps, conflict CAMEO codes only
2. **Structural pre-filter** — CAMEO root codes (14–20), QuadClass gates, armed actor detection, source count thresholds, domain blocklists, URL pattern rejection. Eliminates ~80% of noise at zero LLM cost.
3. **Geographic validation** — country bounding box checks, Null Island detection, spatial coherence
4. **Relevance scoring** — 0–100 score from event type base rates, armed actor bonuses, Goldstein penalties, source count adjustments
5. **Haiku classification** — five-dimension structured assessment for events that clear structural gates but can't be auto-passed. Returns scored JSON with reasoning and event tags.
6. **UCDP fetch** — paginated UCDP GED API, normalized to Argus schema with fatality estimates
7. **Merge & deduplicate** — both sources merged on shared schema, spatial-temporal dedup (1° grid, 2-day window), capped at 800 events
8. **Blob write** — final event set written to Vercel Blob with `fetchedAt` timestamp

### Event Schema

```js
// GDELT event (with AI classification)
{
  event_id_cnty:     string,
  event_date:        string,       // 'YYYY-MM-DD'
  event_type:        string,       // 'Battles' | 'Explosions' | 'Violence against civilians' | ...
  actor1:            string,
  actor2:            string,
  location:          string,
  country:           string,
  latitude:          number,
  longitude:         number,
  goldstein_scale:   number,       // -10 to +10
  num_sources:       number,
  impact_score:      number,       // 0-10
  source:            'gdelt',
  ai_classification: {
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
    tags:       string[],
    confidence: 'low' | 'medium' | 'high',
  } | null,
  satellite_corroborated: boolean,
  firms_detections:       number,
  firms_max_frp:          number,
}

// UCDP event (additional fields)
{
  source:              'ucdp',
  fatalities_best:     number,
  fatalities_low:      number,
  fatalities_high:     number,
  ucdp_conflict:       string,
  ucdp_violence_type:  string,
}
```

---

## Validation: Multi-Source Backtest

A Python backtest pipeline compares Argus output against UCDP GED as ground truth across 2023–2024 to measure source agreement, divergence, and false positive rate at the country level.

**Findings:** GDELT and POLECAT agree on top-conflict countries (Ukraine, Palestine, Russia, Israel appear in both top-10 lists). Intensity scores diverge substantially — GDELT clusters near −10 on the Goldstein scale while POLECAT scores more granularly in the −2 to −8 range (r = 0.12). This is a methodological difference, not a data quality failure: GDELT's CAMEO coder skews toward extreme scores for kinetic events; POLECAT's PLOVER ontology produces more graduated values. UCDP GED remains the authoritative ground truth for fatality-confirmed events within its coverage window.

---

## Features

- Interactive Mapbox GL map — conflict markers sized by fatalities (UCDP) or media mentions (GDELT), color-coded by event type, clustered at low zoom
- Event feed with KIA column, source provenance badges, sortable by impact score or date
- Event detail panel — CAMEO codes, actor types, Goldstein scores, UCDP casualty range (low/best/high), full AI classification breakdown
- Time series chart — event frequency by type across 6-hour windows
- Escalation banner — alerts when a country's recent event rate spikes significantly vs. prior period
- Per-country AI situation reports — 3-paragraph SITREP covering current situation, trajectory, and key actors; synthesized from both data sources; CDN-cached 30 minutes
- Satellite corroboration layer — NASA FIRMS thermal anomalies overlaid on the map
- Analyst feedback workflow — dismiss events as noise or confirm as valid signal, persisted server-side
- Filter panel — event type, data source (GDELT / UCDP), country, date range, impact threshold, rolling time windows

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
ANTHROPIC_API_KEY=       # Required — Haiku classification + country SITREPs
NASA_FIRMS_API_KEY=      # Required — satellite corroboration (free at firms.modaps.eosdis.nasa.gov)
UCDP_API_TOKEN=          # Required — UCDP GED API (register at ucdp.uu.se)
BLOB_READ_WRITE_TOKEN=   # Required in prod — Vercel Blob (set automatically on Vercel)
```

---

## Project Structure

```
argus/
├── server/
│   ├── index.js              # Express backend — routing, caching
│   ├── gdeltFetcher.js       # GDELT 2.0 downloader and parser
│   ├── ucdpFetcher.js        # UCDP GED API client
│   ├── haikuFilter.js        # Claude Haiku classification gate
│   ├── firmsService.js       # NASA FIRMS satellite integration
│   ├── reliefwebService.js   # UN OCHA humanitarian context proxy
│   ├── feedbackStore.js      # Analyst dismiss/confirm persistence
│   └── blobCache.js          # Vercel Blob read/write
├── scripts/
│   └── refresh-events.js     # Pipeline: GDELT + UCDP → merge → Blob
├── api/
│   └── brief/[country].js    # Country SITREP endpoint (30min CDN cache)
├── src/
│   ├── App.jsx
│   ├── components/
│   │   ├── Header.jsx        # Stats bar: events, fatalities, Goldstein, trend
│   │   ├── FilterPanel.jsx
│   │   ├── MapView.jsx
│   │   ├── EventFeed.jsx
│   │   ├── EventDetailPanel.jsx
│   │   ├── CountryBrief.jsx  # AI SITREP + UN OCHA context
│   │   ├── TimeChart.jsx
│   │   ├── EscalationBanner.jsx
│   │   ├── HotZones.jsx
│   │   └── ActorPanel.jsx
│   └── hooks/useEventData.js
├── python/
│   ├── quality_filter.py     # Geo validation, relevance scoring, dedup
│   ├── ingest_polecat.py     # POLECAT → Argus schema normalization
│   └── backtest_compare.py   # Multi-source validation vs. UCDP ground truth
└── .github/workflows/
    └── refresh-events.yml    # 15-min cron → Vercel Blob
```

---

## API

**GET /api/events**
```bash
curl "http://localhost:3001/api/events?limit=100&days=7"
```

**GET /api/brief/:country** *(CDN-cached 30min)*
```bash
curl "https://argusosint.vercel.app/api/brief/Ukraine"
```

**POST /api/events/:id/dismiss** — Mark event as noise

**POST /api/events/:id/confirm** — Confirm event as valid signal

---

## Technologies

- **Frontend**: React 19, Vite, Mapbox GL JS, Recharts
- **Backend**: Express.js + Vercel serverless functions
- **AI**: Claude Haiku — structured event classification + country SITREP generation
- **Cache**: Vercel Blob (written by GitHub Actions, read by frontend)
- **Pipeline**: Node.js + Python 3
- **Design**: Blueprint dark theme color system, JetBrains Mono + Inter
