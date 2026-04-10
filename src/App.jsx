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
 * Blueprint dark theme: pageBg (#111418) behind all panels.
 * Panels carry panelBg (#1c2127) to create surface elevation.
 *
 * mapFocus=false (default):
 * ┌──────────────────────────────────┐  ← Header 50px (Blueprint navbar height)
 * ├──────────┬───────────────────────┤
 * │          │     MAP (65%)         │
 * │  FILTER  ├──────────┬────────────┤
 * │  280px   │ EVT FEED │ T.CHART   │  ← bottom 35%
 * └──────────┴──────────┴────────────┘
 *
 * mapFocus=true:
 * ┌──────────────────────────────────┐
 * ├──────────┬───────────────────────┤
 * │  FILTER  │     MAP (100%)        │
 * └──────────┴───────────────────────┘
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

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [mapFocus,      setMapFocus]      = useState(false);
  const [briefCountry,  setBriefCountry]  = useState(null);
  const [showThermal,   setShowThermal]   = useState(false);

  const {
    events, filteredEvents, availableCountries,
    stats, dataSource, fetchedAt, dismissEvent, confirmEvent, loading,
  } = useEventData(filters);

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
      background:    '#111418',    // Blueprint pageBg
      overflow:      'hidden',
    }}>
      {/* Header — 50px (Blueprint navbar) */}
      <Header
        stats={stats}
        fetchedAt={fetchedAt}
        mapFocus={mapFocus}
        onToggleMapFocus={() => setMapFocus(f => !f)}
      />

      {/* Escalation banner — hidden when no active escalations */}
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

          {/* Map + time window strip */}
          <div style={{
            flex:      mapFocus ? '1 1 auto' : '0 0 65%',
            display:   'flex',
            flexDirection: 'column',
            overflow:  'hidden',
            transition: 'flex 0.3s ease',
          }}>
            <TimeWindowBar
              value={filters.timeWindow}
              onChange={(tw) => setFilters((f) => ({ ...f, timeWindow: tw }))}
              eventCount={filteredEvents.length}
              showThermal={showThermal}
              onToggleThermal={() => setShowThermal((v) => !v)}
            />
            <MapView
              events={filteredEvents}
              onEventClick={handleEventClick}
              selectedEventId={selectedEvent?.event_id_cnty}
              onOpenCountryBrief={setBriefCountry}
              showThermal={showThermal}
              onConfirm={confirmEvent}
              onDismiss={(id) => dismissEvent(id)}
            />
          </div>

          {/* Bottom panel — hidden in map focus mode */}
          {!mapFocus && (
            <div style={{
              flex:     '0 0 35%',
              display:  'flex',
              overflow: 'hidden',
              position: 'relative',
              borderTop: '1px solid #2f343c',
            }}>
              <EventFeed
                events={filteredEvents}
                onEventClick={handleEventClick}
                selectedEventId={selectedEvent?.event_id_cnty}
                onDismiss={dismissEvent}
              />
              <TimeChart events={filteredEvents} />

              {/* Detail panel — absolute overlay */}
              <EventDetailPanel
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
                onConfirm={confirmEvent}
                onDismiss={(id) => { dismissEvent(id); setSelectedEvent(null); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Status bar — 26px */}
      <StatusBar dataSource={dataSource} />
    </div>
  );
}

// ── Time window toggle bar ────────────────────────────────────────────────

const TIME_WINDOWS = ['24H', '48H', '72H', 'ALL'];

function TimeWindowBar({ value, onChange, eventCount, showThermal, onToggleThermal }) {
  return (
    <div style={{
      height:       '28px',
      minHeight:    '28px',
      background:   '#1c2127',       // Blueprint panelBg
      borderBottom: '1px solid #2f343c',
      display:      'flex',
      alignItems:   'center',
      padding:      '0 12px',
      gap:          '4px',
      flexShrink:   0,
    }}>
      <span style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '9px',
        fontWeight:    600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color:         '#5f6b7c',   // Blueprint gray1
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
              background:    active ? '#215db0' : '#252a31',   // Blueprint blue2 active, elevated inactive
              border:        `1px solid ${active ? '#4c90f040' : '#383e47'}`,
              borderRadius:  '2px',
              padding:       '2px 10px',
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    600,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color:         active ? '#f6f7f9' : '#738091',
              cursor:        'pointer',
              transition:    'all 0.12s',
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background  = '#2f343c';
                e.currentTarget.style.color       = '#abb3bf';
                e.currentTarget.style.borderColor = '#404854';
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background  = '#252a31';
                e.currentTarget.style.color       = '#738091';
                e.currentTarget.style.borderColor = '#383e47';
              }
            }}
          >
            {tw}
          </button>
        );
      })}

      {/* Separator */}
      <div style={{
        width:      '1px',
        height:     '14px',
        background: '#383e47',
        marginLeft: '8px',
      }} />

      {/* FIRMS thermal layer toggle */}
      <button
        onClick={onToggleThermal}
        style={{
          background:    showThermal ? '#4a2800' : '#252a31',
          border:        `1px solid ${showThermal ? '#ec9a3c50' : '#383e47'}`,
          borderRadius:  '2px',
          padding:       '2px 10px',
          fontFamily:    'Inter, sans-serif',
          fontSize:      '9px',
          fontWeight:    600,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color:         showThermal ? '#ec9a3c' : '#738091',
          cursor:        'pointer',
          transition:    'all 0.12s',
          display:       'flex',
          alignItems:    'center',
          gap:           '5px',
        }}
        onMouseEnter={(e) => {
          if (!showThermal) {
            e.currentTarget.style.background  = '#2f343c';
            e.currentTarget.style.color       = '#abb3bf';
            e.currentTarget.style.borderColor = '#404854';
          }
        }}
        onMouseLeave={(e) => {
          if (!showThermal) {
            e.currentTarget.style.background  = '#252a31';
            e.currentTarget.style.color       = '#738091';
            e.currentTarget.style.borderColor = '#383e47';
          }
        }}
      >
        <span style={{
          width:        '5px',
          height:       '5px',
          borderRadius: '50%',
          background:   showThermal ? '#ec9a3c' : '#5f6b7c',
          display:      'inline-block',
          boxShadow:    showThermal ? '0 0 4px #ec9a3c' : 'none',
          transition:   'all 0.15s',
        }} />
        SAT
      </button>

      <span style={{
        marginLeft:  'auto',
        fontFamily:  'JetBrains Mono, monospace',
        fontSize:    '10px',
        color:       '#5f6b7c',
      }}>
        {eventCount.toLocaleString()} events
      </span>
    </div>
  );
}

// ── Boot sequence ─────────────────────────────────────────────────────────

const BOOT_STAGES = [
  { id: 'sys',     label: 'SYSTEM INIT',                  ms: 420  },
  { id: 'net',     label: 'NETWORK HANDSHAKE',             ms: 680  },
  { id: 'gdelt',   label: 'GDELT 2.0 ENDPOINT REACHED',   ms: 850  },
  { id: 'stream',  label: 'EVENT STREAM VERIFIED',         ms: 720  },
  { id: 'index',   label: 'CONFLICT INDEX LOADED',         ms: 1050 },
  { id: 'cluster', label: 'CLUSTERING CONFLICT SIGNALS',   ms: 580  },
  { id: 'render',  label: 'BUILDING OPERATIONAL PICTURE',  ms: null }, // holds until data
];

function fmtBootTime(ms) {
  const s  = Math.floor(ms / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(s).padStart(2, '0')}:${String(cs).padStart(2, '0')}`;
}

function BootLine({ label, stampMs, done, active }) {
  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize:   '11px',
      lineHeight: '22px',
      animation:  'bootFadeIn 0.18s ease both',
    }}>
      {/* Timestamp */}
      <span style={{
        color:      '#383e47',   // Blueprint dark-gray4
        minWidth:   '50px',
        marginRight:'10px',
        fontSize:   '10px',
        flexShrink: 0,
      }}>
        [{fmtBootTime(stampMs)}]
      </span>

      {/* Label */}
      <span style={{ color: done ? '#404854' : '#8abbff', flexShrink: 0 }}>
        {label}
      </span>

      {/* Dotted fill */}
      <div style={{
        flex:       1,
        height:     '1px',
        margin:     '0 10px',
        background: 'repeating-linear-gradient(90deg, #252a31 0px, #252a31 2px, transparent 2px, transparent 6px)',
      }} />

      {/* Status */}
      {done ? (
        <span style={{
          color:         '#32a467',  // Blueprint green4
          fontWeight:    700,
          fontSize:      '10px',
          flexShrink:    0,
          letterSpacing: '0.04em',
        }}>
          OK
        </span>
      ) : active ? (
        <span style={{
          color:      '#4c90f0',    // Blueprint blue4
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
  const [lines,      setLines]      = React.useState([{ ...BOOT_STAGES[0], stampMs: 0, done: false }]);
  const [currentIdx, setCurrentIdx] = React.useState(0);
  const [elapsed,    setElapsed]    = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 50);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const stage = BOOT_STAGES[currentIdx];
    if (!stage?.ms) return;
    const t = setTimeout(() => {
      const stamp = Date.now() - startRef.current;
      setLines(prev => {
        const updated = prev.map((l, i) => i === currentIdx ? { ...l, done: true } : l);
        const next    = BOOT_STAGES[currentIdx + 1];
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
      background:     '#111418',    // Blueprint pageBg
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
        backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(255,255,255,0.006) 3px, rgba(255,255,255,0.006) 4px)',
        pointerEvents:   'none',
      }} />

      <div style={{ width: '520px', display: 'flex', flexDirection: 'column', gap: '44px' }}>

        {/* Classification badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ flex: 1, height: '1px', background: '#252a31' }} />
          <span style={{
            fontFamily:    'JetBrains Mono, monospace',
            fontSize:      '9px',
            fontWeight:    600,
            letterSpacing: '0.18em',
            color:         '#383e47',    // Blueprint dark-gray4
            textTransform: 'uppercase',
            flexShrink:    0,
          }}>
            UNCLASSIFIED // FOUO
          </span>
          <div style={{ flex: 1, height: '1px', background: '#252a31' }} />
        </div>

        {/* Wordmark */}
        <div>
          <div style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '34px',
            fontWeight:    800,
            letterSpacing: '0.24em',
            color:         '#f6f7f9',
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
            color:         '#383e47',
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
          <div style={{ position: 'relative', height: '2px', background: '#1c2127', marginBottom: '10px' }}>
            <div style={{
              position:   'absolute',
              top:        0,
              left:       0,
              height:     '100%',
              width:      `${progress}%`,
              background: 'linear-gradient(90deg, #184a90, #4c90f0)',  // Blueprint blue1 → blue4
              transition: 'width 0.45s ease',
            }} />
            {progress > 0 && progress < 100 && (
              <div style={{
                position:   'absolute',
                top:        '-3px',
                left:       `${progress}%`,
                transform:  'translateX(-50%)',
                width:      '6px',
                height:     '8px',
                background: '#4c90f0',
                filter:     'blur(5px)',
                transition: 'left 0.45s ease',
              }} />
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontFamily:    'JetBrains Mono, monospace',
              fontSize:      '9px',
              color:         '#404854',  // Blueprint dark-gray5
              letterSpacing: '0.07em',
            }}>
              {progress}% INITIALIZED
            </span>
            <span style={{
              fontFamily:    'JetBrains Mono, monospace',
              fontSize:      '9px',
              color:         '#404854',
              letterSpacing: '0.07em',
            }}>
              T+{fmtBootTime(elapsed)}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bootFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bootBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Status bar ────────────────────────────────────────────────────────────

function StatusBar({ dataSource }) {
  const isLive = dataSource === 'gdelt' || dataSource === 'gdelt_live' || dataSource === 'kv';
  const sourceLabel =
    dataSource === 'kv'          ? 'GDELT 2.0 · HAIKU FILTERED' :
    dataSource === 'gdelt_live'  ? 'GDELT 2.0 · LIVE' :
    dataSource === 'gdelt'       ? 'GDELT 2.0 EVENT DATABASE' :
                                   'MOCK DATA';
  const sourceColor = isLive ? '#32a467' : '#5f6b7c';  // Blueprint green4 / gray1

  return (
    <div style={{
      height:         '26px',
      minHeight:      '26px',
      background:     '#1c2127',    // Blueprint panelBg — matches header
      borderTop:      '1px solid #2f343c',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '0 16px',
      flexShrink:     0,
    }}>
      <span style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '9px',
        fontWeight:    600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color:         sourceColor,
      }}>
        DATA: {sourceLabel}
      </span>
      <span style={{
        fontFamily:    'JetBrains Mono, monospace',
        fontSize:      '9px',
        color:         '#383e47',
        letterSpacing: '0.04em',
      }}>
        ARGUS v2.0
      </span>
    </div>
  );
}
