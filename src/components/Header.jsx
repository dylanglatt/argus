import React, { useState, useEffect } from 'react';

/**
 * Header — 50px fixed bar (Blueprint navbar height).
 *
 * Blueprint dark navbar:
 *   - Surface: panelBg (#1c2127) — distinct from page background
 *   - Bottom border: border (#2f343c)
 *   - Top accent: conflict heat indicator (Blueprint intent colors)
 *
 * Left:  ARGUS wordmark + live indicator + map focus toggle
 * Right: live stats (events, sources, countries, Goldstein, trend, refresh, Zulu)
 */
export function Header({ stats, fetchedAt, mapFocus, onToggleMapFocus, isMobile }) {
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

  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 2000);
    return () => clearInterval(id);
  }, []);

  // Goldstein tone → Blueprint intent color
  const avgG = stats?.avgGoldstein ?? 0;
  const toneColor =
    avgG < -5 ? '#e76a6e' :  // Blueprint red4
    avgG < -2 ? '#ec9a3c' :  // Blueprint orange4
    avgG <  0 ? '#fbb360' :  // Blueprint orange5
                '#32a467';   // Blueprint green4
  const toneStr = `${avgG > 0 ? '+' : ''}${avgG.toFixed(1)}`;

  // Top accent line: conflict heat
  const accentColor =
    avgG < -3 ? '#e76a6e' :
    avgG <  0 ? '#ec9a3c' :
                '#2f343c';   // neutral — just a border when calm

  return (
    <div style={{
      height:         '50px',
      minHeight:      '50px',
      background:     '#1c2127',          // Blueprint panelBg — distinct from page
      borderBottom:   '1px solid #2f343c',
      borderTop:      `2px solid ${accentColor}`,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '0 16px',
      flexShrink:     0,
    }}>
      {/* Left: wordmark + live indicator + focus toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Argus eye/reticle icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="20" height="20" style={{ flexShrink: 0 }}>
          <line x1="100" y1="0"   x2="100" y2="200" stroke="#f6f7f9" strokeWidth="2.8"/>
          <line x1="0"   y1="100" x2="200" y2="100" stroke="#f6f7f9" strokeWidth="2.8"/>
          <circle cx="100" cy="100" r="82" fill="none" stroke="#f6f7f9" strokeWidth="3.5"/>
          <path d="M 18,100 A 100,100 0 0,1 182,100" fill="none" stroke="#f6f7f9" strokeWidth="3.5"/>
          <path d="M 182,100 A 100,100 0 0,1 18,100"  fill="none" stroke="#f6f7f9" strokeWidth="3.5"/>
          <circle cx="100" cy="100" r="28" fill="none" stroke="#f6f7f9" strokeWidth="3.5"/>
          <circle cx="100" cy="100" r="5.5" fill="#f6f7f9"/>
        </svg>

        <span style={{
          fontFamily:    'Inter, sans-serif',
          fontSize:      '13px',
          fontWeight:    700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color:         '#f6f7f9',
        }}>
          ARGUS
        </span>

        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{
            width:        '6px',
            height:       '6px',
            borderRadius: '50%',
            background:   pulse ? '#32a467' : '#32a46766',  // Blueprint green4
            boxShadow:    pulse ? '0 0 6px #32a467' : 'none',
            transition:   'all 0.6s ease',
          }} />
          <span style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color:         '#738091',  // Blueprint gray2
          }}>
            LIVE
          </span>
        </div>

        {/* Map focus toggle — Blueprint minimal button style */}
        <button
          onClick={onToggleMapFocus}
          title={mapFocus ? 'Show event feed' : 'Map focus mode'}
          style={{
            background:    mapFocus ? '#1a3a20' : '#252a31',  // Blueprint elevated bg when inactive
            border:        `1px solid ${mapFocus ? '#32a46740' : '#383e47'}`,
            borderRadius:  '2px',
            padding:       '3px 10px',
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color:         mapFocus ? '#32a467' : '#738091',
            cursor:        'pointer',
            transition:    'all 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!mapFocus) {
              e.currentTarget.style.background   = '#2f343c';
              e.currentTarget.style.color        = '#abb3bf';
              e.currentTarget.style.borderColor  = '#404854';
            }
          }}
          onMouseLeave={(e) => {
            if (!mapFocus) {
              e.currentTarget.style.background  = '#252a31';
              e.currentTarget.style.color       = '#738091';
              e.currentTarget.style.borderColor = '#383e47';
            }
          }}
        >
          {mapFocus ? '⊠ MAP FOCUS' : '⊡ MAP FOCUS'}
        </button>
      </div>

      {/* Right: stats */}
      {isMobile ? (
        /* Mobile: condensed — just events + countries + tone */
        <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
          <StatCell label="EVENTS"    value={(stats?.totalEvents ?? 0).toLocaleString()} valueColor="#f6f7f9" />
          <Divider />
          <StatCell label="COUNTRIES" value={stats?.countriesAffected ?? 0}              valueColor="#f6f7f9" />
          <Divider />
          <StatCell label="TONE"      value={toneStr} valueColor={toneColor} mono
            tooltip="Goldstein Scale average. Negative = conflict pressure." />
        </div>
      ) : (
        /* Desktop: full stats row */
        <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
          <StatCell label="EVENTS"       value={(stats?.totalEvents ?? 0).toLocaleString()} valueColor="#f6f7f9" />
          <Divider />
          <StatCell label="SOURCES"      value={(stats?.totalSources ?? 0).toLocaleString()} valueColor="#32a467" />
          <Divider />
          <StatCell label="COUNTRIES"    value={stats?.countriesAffected ?? 0}               valueColor="#f6f7f9" />
          <Divider />
          <StatCell label="AVG TONE"     value={toneStr}  valueColor={toneColor} mono
            tooltip="Goldstein Scale average. Negative = conflict pressure." />
          <Divider />
          <StatCell
            label="TREND"
            value={
              stats?.trend === 'ESCALATING'    ? '↑ ESCALATING'    :
              stats?.trend === 'DE-ESCALATING' ? '↓ DE-ESCALATING' :
                                                 '→ STABLE'
            }
            valueColor={
              stats?.trend === 'ESCALATING'    ? '#e76a6e' :
              stats?.trend === 'DE-ESCALATING' ? '#32a467' :
                                                 '#fbb360'
            }
            tooltip="Conflict trend: compares Goldstein avg of recent vs prior events."
          />
          <Divider />
          <StatCell label="LAST REFRESH" value={refreshAge} valueColor="#5f6b7c" mono />
          <Divider />
          <StatCell label="ZULU TIME"    value={zuluTime}   valueColor="#abb3bf" mono />
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, valueColor, mono, tooltip }) {
  return (
    <div
      title={tooltip}
      style={{ padding: '0 14px', textAlign: 'right', cursor: tooltip ? 'help' : 'default' }}
    >
      <div style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '9px',
        fontWeight:    600,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        color:         '#738091',   // Blueprint gray2
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
      height:     '22px',
      background: '#383e47',   // Blueprint dark-gray4 — inner divider
      flexShrink: 0,
    }} />
  );
}
