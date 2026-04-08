# Quick Start Guide - Sentinel

## Run the Application

```bash
npm run dev
```

This starts both:
- Frontend on http://localhost:5173
- Backend API on http://localhost:3001

**Done!** The app works immediately with mock data (74 realistic conflict events).

## Features (All Enabled by Default)

### Map
- Click events to see details
- Marker size shows fatality count
- Color shows event type

### Filters (Left Sidebar)
- Search text (actors, locations, notes)
- Event type checkboxes (6 types)
- Country dropdown with search
- Date range picker
- Fatality threshold slider
- Reset button

### Stats Bar (Below Header)
- Total Events
- Total Fatalities
- Countries Affected
- Most Active Actor

### Event Feed (Bottom Left)
- List of events sorted by date
- Click to select
- Color-coded fatality severity

### Time Chart (Bottom Right)
- Monthly event count
- Stacked by event type
- Interactive legend

## Optional: Add Mapbox Token

To enable the interactive map (default shows placeholder):

1. Get a token from https://account.mapbox.com/tokens/
2. Create `.env` file:
   ```
   VITE_MAPBOX_TOKEN=your_token_here
   ```
3. Restart the app (`npm run dev`)

The map will render with actual Mapbox Dark style.

## API Reference

All endpoints return JSON:

```bash
# Server health check
curl http://localhost:3001/api/health

# Get all events
curl http://localhost:3001/api/events

# Filter by event type
curl "http://localhost:3001/api/events?event_type=Battles"

# Filter by country
curl "http://localhost:3001/api/events?country=Syria"

# Filter by both + limit
curl "http://localhost:3001/api/events?event_type=Battles&country=Syria&limit=20"
```

## Project Structure (Quick Reference)

```
sentinel/
├── server/index.js          ← Express API (port 3001)
├── server/mockData.js       ← 74 conflict events
├── src/App.jsx              ← Main component
├── src/components/          ← 6 UI components
├── src/hooks/useEventData.js ← Data fetching
├── src/utils/constants.js   ← Colors, types, regions
├── src/index.css            ← Dark theme styles
└── vite.config.js           ← Build config
```

## What's Included

✓ 74 realistic mock ACLED conflict events
✓ Mapbox GL interactive map (graceful fallback)
✓ Recharts time-series visualization
✓ Event filtering (type, country, date, fatalities, search)
✓ Real-time statistics dashboard
✓ Dark theme (Palantir Gotham style)
✓ Responsive layout
✓ Express backend with CORS

## Keyboard Shortcuts

- Filter panel: Use Tab to navigate, Space to check boxes
- Table: Click rows to select events
- Map: Use arrow keys to pan, +/- to zoom

## Troubleshooting

**Map shows placeholder?**
→ Add VITE_MAPBOX_TOKEN to .env file

**Port 3001 or 5173 already in use?**
→ Kill the process: `lsof -ti:3001 | xargs kill -9`

**Events not loading?**
→ Check backend: `curl http://localhost:3001/api/health`

## Next Steps

- Add live ACLED API integration (add API key to .env)
- Customize event type colors in `src/utils/constants.js`
- Add more filters or visualization types
- Deploy to production with `npm run build`

---

**Built with**: React, Vite, Tailwind, Mapbox GL, Recharts, Express.js
**Status**: Ready for use!
