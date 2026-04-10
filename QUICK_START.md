# Quick Start — Argus

## Run the Application

```bash
npm run dev
```

Starts both:
- Frontend on http://localhost:5173
- Backend API on http://localhost:3001

The app works immediately with mock data. No API keys required to run locally.

## Configuration

Copy `.env.example` to `.env.local` and fill in keys as needed:

```env
VITE_MAPBOX_TOKEN=   # Required for live map tiles (get one free at mapbox.com)
FIRMS_MAP_KEY=       # Optional — NASA FIRMS thermal anomaly layer
ANTHROPIC_API_KEY=   # Optional — enables Haiku classification gate for data quality
```

The app falls back gracefully if tokens are missing:
- No Mapbox token → map placeholder shown
- No FIRMS key → thermal layer disabled
- No Anthropic key → Haiku filter skipped, structural CAMEO filters still apply

## Features

### Map
- Clustered conflict event markers, color-coded by event type and severity
- Optional NASA FIRMS thermal anomaly overlay (satellite corroboration)
- Click any marker or cluster to inspect events

### Filters (Left Sidebar)
- Event type, country/region, date range, impact score threshold
- Text search across actors, locations, and notes

### Stats Bar
- Total events, countries affected, highest-impact event, most active actor

### Escalation Banner
- Auto-surfaces regions with ≥30% event count increase vs. prior 24h

### Event Feed
- Sortable, filterable table of recent events
- Impact score, media mentions, CAMEO codes, source links

### Event Detail Panel
- Full event breakdown: actors, Goldstein score, CAMEO codes, source URL
- Satellite corroboration callout when FIRMS data confirms nearby thermal activity

### Time Series Chart
- Event count trend over time, grouped by event type

## API Reference

```bash
# Health check
curl http://localhost:3001/api/health

# Fetch events (with optional filters)
curl "http://localhost:3001/api/events?limit=100&days=7"
curl "http://localhost:3001/api/events?event_type=Battles&country=Ukraine"
```

## Project Structure

```
argus/
├── api/                        # Vercel serverless functions
│   ├── events.js
│   └── firms/
├── server/
│   ├── index.js                # Express backend (local dev)
│   ├── gdeltFetcher.js         # GDELT 2.0 ZIP/CSV downloader + parser
│   ├── firmsService.js         # NASA FIRMS thermal data
│   ├── haikuFilter.js          # Claude Haiku classification gate
│   ├── reliefwebService.js     # ReliefWeb humanitarian context
│   └── mockData.js             # Fallback mock events (GDELT-format)
├── src/
│   ├── App.jsx
│   ├── components/
│   └── hooks/useEventData.js
├── vercel.json
└── vite.config.js
```

## Build

```bash
npm run build    # Production build
npm run preview  # Preview built app
```

## Troubleshooting

**Map shows placeholder?**
→ Add `VITE_MAPBOX_TOKEN` to `.env.local`

**Port already in use?**
→ `lsof -ti:3001 | xargs kill -9`

**Events not loading?**
→ `curl http://localhost:3001/api/health`

---

**Data**: GDELT 2.0 Event Database — public, no auth required, updates every 15 minutes
**Stack**: React 19, Vite, Tailwind CSS v4, Mapbox GL JS, Recharts, Express.js
