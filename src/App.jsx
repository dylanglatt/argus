import React, { useState } from 'react';
import { useEventData } from './hooks/useEventData';
import { Header } from './components/Header';
import { FilterPanel } from './components/FilterPanel';
import { MapView } from './components/MapView';
import { EventFeed } from './components/EventFeed';
import { TimeChart } from './components/TimeChart';

/**
 * App — single-viewport layout.
 *
 * ┌─────────────────────────────────┐  ← Header 48px
 * ├──────────┬──────────────────────┤
 * │          │     MAP (60%)        │
 * │  FILTER  ├──────────┬───────────┤
 * │  320px   │ EVT FEED │ T.CHART  │  ← bottom 40%
 * └──────────┴──────────┴───────────┘
 * ├─────────────────────────────────┤  ← Status bar 32px
 */
export default function App() {
  const [filters, setFilters] = useState({
    eventTypes:  [],
    countries:   [],
    dateRange:   { start: null, end: null },
    impactMin:   0,    // 0–10 min conflict severity (inverted Goldstein)
    searchQuery: '',
  });

  const { filteredEvents, availableCountries, stats, dataSource, fetchedAt } = useEventData(filters);

  return (
    <div style={{
      width:      '100vw',
      height:     '100vh',
      display:    'flex',
      flexDirection: 'column',
      background: '#0a0a0f',
      overflow:   'hidden',
    }}>
      {/* Header — 48px */}
      <Header stats={stats} fetchedAt={fetchedAt} />

      {/* Main workspace */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Filter panel — 320px */}
        <FilterPanel
          filters={filters}
          onFilterChange={setFilters}
          availableCountries={availableCountries}
        />

        {/* Content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Map — 60% */}
          <div style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <MapView events={filteredEvents} />
          </div>

          {/* Bottom panel — 40% */}
          <div style={{ flex: '0 0 40%', display: 'flex', overflow: 'hidden' }}>
            <EventFeed events={filteredEvents} onEventClick={() => {}} />
            <TimeChart events={filteredEvents} />
          </div>
        </div>
      </div>

      {/* Status bar — 32px */}
      <StatusBar dataSource={dataSource} />
    </div>
  );
}

function StatusBar({ dataSource }) {
  const sourceLabel = dataSource === 'gdelt' ? 'GDELT 2.0 EVENT DATABASE' : 'MOCK DATA';
  const sourceColor = dataSource === 'gdelt' ? '#10b981' : '#6b7280';

  return (
    <div style={{
      height:     '32px',
      minHeight:  '32px',
      background: '#0a0a0f',
      borderTop:  '1px solid #1e1e30',
      display:    'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding:    '0 16px',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '10px',
        fontWeight:    500,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color:         sourceColor,
      }}>
        DATA: {sourceLabel}
      </span>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize:   '10px',
        color:      '#4a4a5a',
      }}>
        LAT 20.0000° N  |  LNG 10.0000° E
      </span>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize:   '10px',
        color:      '#4a4a5a',
      }}>
        ARGUS v2.0
      </span>
    </div>
  );
}
