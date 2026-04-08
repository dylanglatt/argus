import React, { useState, useEffect } from 'react';

/**
 * Header — 52px fixed bar.
 * Top accent line = conflict heat (red when avg Goldstein is deeply negative).
 * Left:  ARGUS wordmark + live indicator.
 * Right: live stats (events, sources, countries, avg tone, zulu time).
 */
export function Header({ stats, fetchedAt, mapFocus, onToggleMapFocus }) {
  const [zuluTime,   setZuluTime]   = useState('');
  const [refreshAge, setRefreshAge] = useState('—');
  const [pulse,      setPulse]      = useState(true);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h   = String(now.getUTCHours()).padStart(2, '0');
      const m   = String(now.getUTCMinutes()).padStart(2, '0');
      const s   = String(now.getUTCSeconds()).padStart(2, '0');
      setZuluTime(`${h}:${m}:${s}Z`);

      if (fetchedAt) {
        const elapsedMs  = Date.now() - fetchedAt;
        const elapsedMin = Math.floor(elapsedMs / 60000);
        const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
        setRefreshAge(elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec}s ago` : `${elapsedSec}s ago`);
      } else {
        setRefreshAge('—');
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  // Pulse the live dot every 2s
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 2000);
    return () => clearInterval(id);
  }, []);

  // Avg Goldstein tone → header accent color + value display
  const avgG = stats?.avgGoldstein ?? 0;
  const toneColor =
    avgG < -5 ? '#ef4444' :
    avgG < -2 ? '#f97316' :
    avgG <  0 ? '#eab308' :
                '#10b981';
  const toneStr = `${avgG > 0 ? '+' : ''}${avgG.toFixed(1)}`;

  // Top accent gradient: color based on threat posture
  const accentColor = avgG < -3 ? '#ef4444' : avgG < 0 ? '#f97316' : '#1e1e30';

  return (
    <div style={{
      height:        '52px',
      minHeight:     '52px',
      background:    '#0a0a0f',
      borderBottom:  '1px solid #1e1e30',
      borderTop:     `2px solid ${accentColor}`,
      display:       'flex',
      alignItems:    'center',
      justifyContent: 'space-between',
      padding:       '0 16px',
      flexShrink:    0,
    }}>
      {/* Left: wordmark + live indicator + focus toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          fontFamily:    'Inter, sans-serif',
          fontSize:      '13px',
          fontWeight:    700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color:         '#e2e4e9',
        }}>
          ARGUS
        </span>
        {/* Live dot */}
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        '5px',
        }}>
          <div style={{
            width:      '6px',
            height:     '6px',
            borderRadius: '50%',
            background: pulse ? '#10b981' : '#10b98166',
            boxShadow:  pulse ? '0 0 6px #10b981' : 'none',
            transition: 'all 0.6s ease',
          }} />
          <span style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color:         '#4a4a6a',
          }}>
            LIVE
          </span>
        </div>

        {/* Map focus toggle */}
        <button
          onClick={onToggleMapFocus}
          title={mapFocus ? 'Show event feed' : 'Map focus mode'}
          style={{
            background:    mapFocus ? '#1a2a1a' : 'transparent',
            border:        `1px solid ${mapFocus ? '#10b98140' : '#1e1e30'}`,
            borderRadius:  0,
            padding:       '3px 9px',
            fontFamily:    'Inter, sans-serif',
            fontSize:      '8px',
            fontWeight:    700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color:         mapFocus ? '#10b981' : '#4a4a6a',
            cursor:        'pointer',
            transition:    'all 0.15s',
          }}
          onMouseEnter={(e) => { if (!mapFocus) { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#3a3a50'; }}}
          onMouseLeave={(e) => { if (!mapFocus) { e.currentTarget.style.color = '#4a4a6a'; e.currentTarget.style.borderColor = '#1e1e30'; }}}
        >
          {mapFocus ? '⊠ MAP FOCUS' : '⊡ MAP FOCUS'}
        </button>
      </div>

      {/* Right stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
        <StatCell label="EVENTS"      value={(stats?.totalEvents ?? 0).toLocaleString()} valueColor="#e2e4e9" />
        <Divider />
        <StatCell label="SOURCES"     value={(stats?.totalSources ?? 0).toLocaleString()} valueColor="#10b981" />
        <Divider />
        <StatCell label="COUNTRIES"   value={stats?.countriesAffected ?? 0}              valueColor="#e2e4e9" />
        <Divider />
        <StatCell label="AVG TONE"    value={toneStr}                                    valueColor={toneColor} mono tooltip="Goldstein Scale avg. Negative = conflict pressure." />
        <Divider />
        <StatCell label="LAST REFRESH" value={refreshAge}                                valueColor="#6b7280" mono />
        <Divider />
        <StatCell label="ZULU TIME"   value={zuluTime}                                   valueColor="#9ca3af" mono />
      </div>
    </div>
  );
}

function StatCell({ label, value, valueColor, mono, tooltip }) {
  return (
    <div
      title={tooltip}
      style={{ padding: '0 16px', textAlign: 'right', cursor: tooltip ? 'help' : 'default' }}
    >
      <div style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '9px',
        fontWeight:    600,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        color:         '#4a4a6a',
        marginBottom:  '2px',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
        fontSize:   '13px',
        fontWeight: 600,
        color:      valueColor,
        lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      width:      '1px',
      height:     '24px',
      background: '#1e1e30',
      flexShrink: 0,
    }} />
  );
}
