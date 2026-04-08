# SENTINEL - Global Conflict Event Tracker

A dense, information-rich OSINT dashboard for tracking global conflict events in real-time. Built with React, Mapbox GL, and Recharts, styled as a Palantir Gotham / Bloomberg Terminal-style analytics tool.

## Quick Start

### Installation
Dependencies are already installed. If needed, run:
```bash
npm install
```

### Development
Start both the Vite dev server and Express backend with one command:
```bash
npm run dev
```

Or run them separately:
```bash
npm run dev:client  # Vite on localhost:5173
npm run dev:server  # Express on localhost:3001
```

### Configuration
Copy `.env.example` to `.env` and configure:
```env
ACLED_API_KEY=          # Optional: ACLED API key for live data
ACLED_EMAIL=            # Optional: ACLED email
VITE_MAPBOX_TOKEN=      # Optional: Mapbox GL token (map will show placeholder if missing)
```

The app works perfectly with mock data if no API keys are configured.

## Features

- **Interactive Map**: Mapbox GL map with conflict event markers, color-coded by event type
- **Event Feed**: Sortable table of recent events with key metrics
- **Time Series Chart**: Monthly event count trends grouped by event type
- **Smart Filtering**: Event type, country/region, date range, fatality threshold, full-text search
- **Statistics Dashboard**: Real-time stats (total events, fatalities, affected countries, most active actors)
- **Dark Theme**: Palantir Gotham-inspired UI with monospace data display

## Project Structure

```
sentinel/
├── server/
│   ├── index.js          # Express backend + ACLED proxy
│   └── mockData.js       # ~74 realistic mock conflict events
├── src/
│   ├── main.jsx
│   ├── App.jsx           # Main layout and state management
│   ├── index.css         # Dark theme with Tailwind + custom styles
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── StatsBar.jsx
│   │   ├── FilterPanel.jsx
│   │   ├── MapView.jsx
│   │   ├── EventFeed.jsx
│   │   └── TimeChart.jsx
│   ├── hooks/
│   │   └── useEventData.js
│   └── utils/
│       └── constants.js
├── vite.config.js
└── package.json
```

## API

### Backend Endpoints

**GET /api/health**
```bash
curl http://localhost:3001/api/health
```

**GET /api/events**
Fetch conflict events with optional filtering:
```bash
curl "http://localhost:3001/api/events?limit=100&event_type=Battles&country=Syria"
```

Query parameters:
- `limit` - Max results (default: 100)
- `event_type` - Filter by event type
- `country` - Filter by country

### Mock Data

The app includes 74 realistic ACLED-format events spanning 2024 across 20+ countries including Syria, Ukraine, Myanmar, Sudan, Nigeria, Somalia, and others.

## Technologies

- **Frontend**: React 19, Vite, Tailwind CSS
- **Maps**: Mapbox GL, react-map-gl
- **Charts**: Recharts
- **Backend**: Express.js, CORS
- **Styling**: Tailwind + custom dark theme, JetBrains Mono + Inter fonts

## Design Philosophy

- Dense, analytical layout optimized for information density
- No rounded corners or soft UI — sharp, functional design
- Dark theme with muted colors and bright data accents
- Monospace fonts for numerical data
- Color-coded event types (battles, explosions, violence, protests, riots, strategic)
- Inspired by Palantir Gotham, Bloomberg Terminal, military C2 dashboards

## Build

```bash
npm run build   # Production build
npm run preview # Preview built app
```
