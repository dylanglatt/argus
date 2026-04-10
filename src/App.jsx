import React, { useState } from 'react';
import { useEventData } from './hooks/useEventData';
import { Header } from './components/Header';
import { FilterPanel } from './components/FilterPanel';
import { MapView } from './components/MapView';
import { EventFeed } from './components/EventFeed';
import { TimeChart } from './components/TimeChart';
import { EventDetailPanel } from './components/EventDetailPanel';
import { EscalationBanner } from './components/EscalationBanner';

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
    timeWindow:  'ALL',
  });

  const [selectedEvent,  setSelectedEvent]  = useState(null);
  const [mapFocus,       setMapFocus]       = useState(false);
  const [briefCountry,   setBriefCountry]   = useState(null);

  const { events, filteredEvents, availableCountries, stats, dataSource, fetchedAt, dismissEvent, loading } = useEventData(filters);

  const handleEventClick = (event) => {
    setSelectedEvent((prev) =>
      prev?.event_id_cnty === event.event_id_cnty ? null : event
    );
  };

  if (loading) return <InitScreen />;

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

      {/* Escalation banner — only visible when regions are escalating */}
      <EscalationBanner events={events} onSelectCountry={setBriefCountry} />

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
            {/* Time window toggle strip */}
            <TimeWindowBar
              value={filters.timeWindow}
              onChange={(tw) => setFilters((f) => ({ ...f, timeWindow: tw }))}
              eventCount={filteredEvents.length}
            />
            <MapView
              events={filteredEvents}
              onEventClick={handleEventClick}
              selectedEventId={selectedEvent?.event_id_cnty}
              onOpenCountryBrief={setBriefCountry}
            />
          </div>

          {/* Bottom panel — hidden in map focus mode */}
          {!mapFocus && (
            <div style={{ flex: '0 0 35%', display: 'flex', overflow: 'hidden', position: 'relative' }}>
              <EventFeed
                events={filteredEvents}
                onEventClick={handleEventClick}
                selectedEventId={selectedEvent?.event_id_cnty}
                onDismiss={dismissEvent}
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

const TIME_WINDOWS = ['24H', '48H', '72H', 'ALL'];

function TimeWindowBar({ value, onChange, eventCount }) {
  return (
    <div style={{
      height:          '30px',
      minHeight:       '30px',
      background:      '#0a0a0f',
      borderBottom:    '1px solid #1e1e30',
      display:         'flex',
      alignItems:      'center',
      padding:         '0 12px',
      gap:             '4px',
      flexShrink:      0,
    }}>
      <span style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '9px',
        fontWeight:    700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color:         '#4a4a6a',
        marginRight:   '8px',
      }}>
        WINDOW
      </span>
      {TIME_WINDOWS.map((tw) => {
        const active = value === tw;
        return (
          <button
            key={tw}
            onClick={() => onChange(tw)}
            style={{
              background:    active ? '#1e1e30' : 'transparent',
              border:        `1px solid ${active ? '#3b82f660' : '#1e1e30'}`,
              borderRadius:  0,
              padding:       '2px 10px',
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color:         active ? '#e2e4e9' : '#4a4a6a',
              cursor:        'pointer',
              transition:    'all 0.12s',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#9ca3af'; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#4a4a6a'; }}
          >
            {tw}
          </button>
        );
      })}
      <span style={{
        marginLeft:  'auto',
        fontFamily:  'JetBrains Mono, monospace',
        fontSize:    '10px',
        color:       '#4a4a6a',
      }}>
        {eventCount.toLocaleString()} events
      </span>
    </div>
  );
}

/* ─── Boot sequence stages ────────────────────────────────── */
const BOOT_STAGES = [
  { id: 'sys',     label: 'SYSTEM INIT',                  ms: 420  },
  { id: 'net',     label: 'NETWORK HANDSHAKE',             ms: 680  },
  { id: 'gdelt',   label: 'GDELT 2.0 ENDPOINT REACHED',   ms: 850  },
  { id: 'stream',  label: 'EVENT STREAM VERIFIED',         ms: 720  },
  { id: 'index',   label: 'CONFLICT INDEX LOADED',         ms: 1050 },
  { id: 'cluster', label: 'CLUSTERING CONFLICT SIGNALS',   ms: 580  },
  { id: 'render',  label: 'BUILDING OPERATIONAL PICTURE',  ms: null }, // holds until real data
];

function fmtBootTime(ms) {
  const s  = Math.floor(ms / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(s).padStart(2, '0')}:${String(cs).padStart(2, '0')}`;
}

function BootLine({ label, stampMs, done, active }) {
  return (
    <div style={{
      display:     'flex',
      alignItems:  'center',
      fontFamily:  'JetBrains Mono, monospace',
      fontSize:    '11px',
      lineHeight:  '22px',
      animation:   'bootFadeIn 0.18s ease both',
    }}>
      {/* Timestamp */}
      <span style={{
        color:      '#252540',
        minWidth:   '50px',
        marginRight:'10px',
        fontSize:   '10px',
        flexShrink: 0,
      }}>
        [{fmtBootTime(stampMs)}]
      </span>

      {/* Label */}
      <span style={{ color: done ? '#364d68' : '#6a90b0', flexShrink: 0 }}>
        {label}
      </span>

      {/* Dotted fill */}
      <div style={{
        flex:       1,
        height:     '1px',
        margin:     '0 10px',
        background: 'repeating-linear-gradient(90deg, #18182e 0px, #18182e 2px, transparent 2px, transparent 6px)',
      }} />

      {/* Status */}
      {done ? (
        <span style={{
          color:      '#10b981',
          fontWeight: 700,
          fontSize:   '10px',
          flexShrink: 0,
          letterSpacing: '0.04em',
        }}>
          OK
        </span>
      ) : active ? (
        <span style={{
          color:      '#3b82f6',
          fontSize:   '14px',
          lineHeight: '11px',
          flexShrink: 0,
          animation:  'bootBlink 0.9s step-end infinite',
        }}>
          ▋
        </span>
      ) : null}
    </div>
  );
}

function InitScreen() {
  const startRef = React.useRef(Date.now());

  // Each entry: { ...stage, stampMs, done }
  const [lines, setLines] = React.useState([
    { ...BOOT_STAGES[0], stampMs: 0, done: false },
  ]);
  const [currentIdx, setCurrentIdx] = React.useState(0);
  const [elapsed, setElapsed]       = React.useState(0);

  // Live clock
  React.useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 50);
    return () => clearInterval(t);
  }, []);

  // Stage progression
  React.useEffect(() => {
    const stage = BOOT_STAGES[currentIdx];
    if (!stage?.ms) return;
    const t = setTimeout(() => {
      const now   = Date.now();
      const stamp = now - startRef.current;
      setLines(prev => {
        const updated = prev.map((l, i) =>
          i === currentIdx ? { ...l, done: true } : l
        );
        const next = BOOT_STAGES[currentIdx + 1];
        if (next) updated.push({ ...next, stampMs: stamp, done: false });
        return updated;
      });
      setCurrentIdx(i => i + 1);
    }, stage.ms);
    return () => clearTimeout(t);
  }, [currentIdx]);

  const doneCount = lines.filter(l => l.done).length;
  const progress  = Math.round((doneCount / BOOT_STAGES.length) * 100);

  return (
    <div style={{
      width:          '100vw',
      height:         '100vh',
      background:     '#0a0a0f',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      position:       'relative',
      overflow:       'hidden',
    }}>

      {/* Subtle scanlines */}
      <div style={{
        position:        'absolute',
        inset:           0,
        backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(255,255,255,0.007) 3px, rgba(255,255,255,0.007) 4px)',
        pointerEvents:   'none',
      }} />

      {/* Main container */}
      <div style={{ width: '520px', display: 'flex', flexDirection: 'column', gap: '44px' }}>

        {/* Classification badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ flex: 1, height: '1px', background: '#16162a' }} />
          <span style={{
            fontFamily:    'JetBrains Mono, monospace',
            fontSize:      '9px',
            fontWeight:    600,
            letterSpacing: '0.18em',
            color:         '#252540',
            textTransform: 'uppercase',
            flexShrink:    0,
          }}>
            UNCLASSIFIED // FOUO
          </span>
          <div style={{ flex: 1, height: '1px', background: '#16162a' }} />
        </div>

        {/* Wordmark */}
        <div>
          <div style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '34px',
            fontWeight:    800,
            letterSpacing: '0.24em',
            color:         '#e2e4e9',
            lineHeight:    1,
            marginBottom:  '8px',
          }}>
            ARGUS
          </div>
          <div style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    600,
            letterSpacing: '0.16em',
            color:         '#252545',
            textTransform: 'uppercase',
          }}>
            Global Conflict Intelligence Platform
          </div>
        </div>

        {/* Boot log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {lines.map((line, i) => (
            <BootLine
              key={line.id}
              label={line.label}
              stampMs={line.stampMs}
              done={line.done}
              active={!line.done}
            />
          ))}
        </div>

        {/* Progress bar + metadata */}
        <div>
          {/* Bar */}
          <div style={{ position: 'relative', height: '2px', background: '#14142a', marginBottom: '10px' }}>
            <div style={{
              position:   'absolute',
              top:        0,
              left:       0,
              height:     '100%',
              width:      `${progress}%`,
              background: 'linear-gradient(90deg, #1b3a60, #3b82f6)',
              transition: 'width 0.45s ease',
            }} />
            {/* Glow head */}
            {progress > 0 && progress < 100 && (
              <div style={{
                position:   'absolute',
                top:        '-3px',
                left:       `${progress}%`,
                transform:  'translateX(-50%)',
                width:      '6px',
                height:     '8px',
                background: '#3b82f6',
                filter:     'blur(5px)',
                transition: 'left 0.45s ease',
              }} />
            )}
          </div>

          {/* Metadata row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontFamily:    'JetBrains Mono, monospace',
              fontSize:      '9px',
              color:         '#252545',
              letterSpacing: '0.07em',
            }}>
              {progress}% INITIALIZED
            </span>
            <span style={{
              fontFamily:    'JetBrains Mono, monospace',
              fontSize:      '9px',
              color:         '#252545',
              letterSpacing: '0.07em',
            }}>
              T+{fmtBootTime(elapsed)}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bootFadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes bootBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
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
