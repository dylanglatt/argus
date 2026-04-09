import React, { useState } from 'react';
import { useEventData } from './hooks/useEventData';
import { Header } from './components/Header';
import { FilterPanel } from './components/FilterPanel';
import { MapView } from './components/MapView';
import { EventFeed } from './components/EventFeed';
import { TimeChart } from './components/TimeChart';
import { EventDetailPanel } from './components/EventDetailPanel';

/**
 * App — single-viewport layout.
 *
 * mapFocus=false (default):
 * ┌─────────────────────────────────┐  ← Header 52px
 * ├──────────┬──────────────────────┤
 * │          │     MAP (65%)        │
 * │  FILTER  ├──────────┬───────────┤
 * │  280px   │ EVT FEED │ T.CHART  │  ← bottom 35%
 * └──────────┴──────────┴───────────┘
 *
 * mapFocus=true:
 * ┌─────────────────────────────────┐  ← Header 52px
 * ├──────────┬──────────────────────┤
 * │  FILTER  │     MAP (100%)       │
 * └──────────┴──────────────────────┘
 */
export default function App() {
  const [filters, setFilters] = useState({
    eventTypes:  [],
    countries:   [],
    dateRange:   { start: null, end: null },
    impactMin:   0,
    searchQuery: '',
  });

  const [selectedEvent,  setSelectedEvent]  = useState(null);
  const [mapFocus,       setMapFocus]       = useState(false);
  const [briefCountry,   setBriefCountry]   = useState(null);

  const { events, filteredEvents, availableCountries, stats, dataSource, fetchedAt } = useEventData(filters);

  const handleEventClick = (event) => {
    setSelectedEvent((prev) =>
      prev?.event_id_cnty === event.event_id_cnty ? null : event
    );
  };

  return (
    <div style={{
      width:         '100vw',
      height:        '100vh',
      display:       'flex',
      flexDirection: 'column',
      background:    '#0a0a0f',
      overflow:      'hidden',
    }}>
      {/* Header — 52px */}
      <Header stats={stats} fetchedAt={fetchedAt} mapFocus={mapFocus} onToggleMapFocus={() => setMapFocus(f => !f)} />

      {/* Main workspace */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Filter panel — 280px */}
        <FilterPanel
          filters={filters}
          onFilterChange={setFilters}
          availableCountries={availableCountries}
          allEvents={events}
          briefCountry={briefCountry}
          onSelectCountry={setBriefCountry}
          onCloseBrief={() => setBriefCountry(null)}
        />

        {/* Content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Map — fills all space in focus mode, 65% otherwise */}
          <div style={{
            flex:     mapFocus ? '1 1 auto' : '0 0 65%',
            display:  'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'flex 0.3s ease',
          }}>
            <MapView
              events={filteredEvents}
              onEventClick={handleEventClick}
              selectedEventId={selectedEvent?.event_id_cnty}
            />
          </div>

          {/* Bottom panel — hidden in map focus mode */}
          {!mapFocus && (
            <div style={{ flex: '0 0 35%', display: 'flex', overflow: 'hidden', position: 'relative' }}>
              <EventFeed
                events={filteredEvents}
                onEventClick={handleEventClick}
                selectedEventId={selectedEvent?.event_id_cnty}
              />
              <TimeChart events={filteredEvents} />

              {/* Detail panel — absolute overlay, slides over TimeChart */}
              <EventDetailPanel
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Status bar — 28px */}
      <StatusBar dataSource={dataSource} />
    </div>
  );
}

function StatusBar({ dataSource }) {
  const sourceLabel = dataSource === 'gdelt' ? 'GDELT 2.0 EVENT DATABASE' : 'MOCK DATA';
  const sourceColor = dataSource === 'gdelt' ? '#10b981' : '#4a4a6a';

  return (
    <div style={{
      height:         '28px',
      minHeight:      '28px',
      background:     '#0a0a0f',
      borderTop:      '1px solid #1e1e30',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '0 16px',
      flexShrink:     0,
    }}>
      <span style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '9px',
        fontWeight:    700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color:         sourceColor,
      }}>
        DATA: {sourceLabel}
      </span>
      <span style={{
        fontFamily:    'JetBrains Mono, monospace',
        fontSize:      '9px',
        color:         '#2a2a3a',
        letterSpacing: '0.04em',
      }}>
        ARGUS v2.0
      </span>
    </div>
  );
}
