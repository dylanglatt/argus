import React, { useState, useEffect, useRef } from 'react';

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
  const [showAbout,  setShowAbout]  = useState(false);
  const aboutRef = useRef(null);

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

  // Close about popover on outside click
  useEffect(() => {
    if (!showAbout) return;
    const handler = (e) => {
      if (aboutRef.current && !aboutRef.current.contains(e.target)) {
        setShowAbout(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAbout]);

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
            color:         '#9caabb',  // Blueprint gray2
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
            color:         mapFocus ? '#32a467' : '#9caabb',
            cursor:        'pointer',
            transition:    'all 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!mapFocus) {
              e.currentTarget.style.background   = '#2f343c';
              e.currentTarget.style.color        = '#c5cdd9';
              e.currentTarget.style.borderColor  = '#404854';
            }
          }}
          onMouseLeave={(e) => {
            if (!mapFocus) {
              e.currentTarget.style.background  = '#252a31';
              e.currentTarget.style.color       = '#9caabb';
              e.currentTarget.style.borderColor = '#383e47';
            }
          }}
        >
          {mapFocus ? '⊠ MAP FOCUS' : '⊡ MAP FOCUS'}
        </button>

        {/* About popover anchor */}
        <div ref={aboutRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAbout((v) => !v)}
            title="About Argus"
            style={{
              background:    showAbout ? '#252a31' : 'transparent',
              border:        `1px solid ${showAbout ? '#4c90f040' : '#383e47'}`,
              borderRadius:  '50%',
              width:         '20px',
              height:        '20px',
              display:       'flex',
              alignItems:    'center',
              justifyContent:'center',
              fontFamily:    'Inter, sans-serif',
              fontSize:      '10px',
              fontWeight:    600,
              color:         showAbout ? '#4c90f0' : '#9caabb',
              cursor:        'pointer',
              transition:    'all 0.15s',
              flexShrink:    0,
            }}
            onMouseEnter={(e) => { if (!showAbout) { e.currentTarget.style.color = '#c5cdd9'; e.currentTarget.style.borderColor = '#404854'; }}}
            onMouseLeave={(e) => { if (!showAbout) { e.currentTarget.style.color = '#9caabb'; e.currentTarget.style.borderColor = '#383e47'; }}}
          >
            ?
          </button>

          {showAbout && (
            <div style={{
              position:     'absolute',
              top:          'calc(100% + 10px)',
              left:         0,
              width:        '280px',
              background:   '#252a31',
              border:       '1px solid #383e47',
              borderRadius: '3px',
              padding:      '14px 16px',
              zIndex:       1000,
              boxShadow:    '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              {/* Triangle pointer */}
              <div style={{
                position:    'absolute',
                top:         '-5px',
                left:        '7px',
                width:       '8px',
                height:      '8px',
                background:  '#252a31',
                border:      '1px solid #383e47',
                borderRight: 'none',
                borderBottom:'none',
                transform:   'rotate(45deg)',
              }} />
              <div style={{
                fontFamily:    'Inter, sans-serif',
                fontSize:      '11px',
                fontWeight:    700,
                color:         '#f6f7f9',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom:  '8px',
              }}>
                About Argus
              </div>
              <div style={{
                fontFamily:  'Inter, sans-serif',
                fontSize:    '11px',
                color:       '#c5cdd9',
                lineHeight:  1.6,
                marginBottom:'12px',
              }}>
                Real-time global conflict intelligence dashboard. Fuses live{' '}
                <span style={{ color: '#f6f7f9', fontWeight: 600 }}>GDELT 2.0</span> NLP signals
                with <span style={{ color: '#f6f7f9', fontWeight: 600 }}>UCDP GED</span> validated
                data — event classification, severity scoring, Goldstein scale, and operational
                trend analysis across active theaters.
              </div>
              <div style={{
                display:     'flex',
                alignItems:  'center',
                justifyContent: 'space-between',
                paddingTop:  '10px',
                borderTop:   '1px solid #383e47',
              }}>
                <span style={{
                  fontFamily:    'Inter, sans-serif',
                  fontSize:      '10px',
                  color:         '#8492a6',
                  letterSpacing: '0.04em',
                }}>
                  Built by <span style={{ color: '#c5cdd9', fontWeight: 600 }}>Dylan Glatt</span>
                </span>
                <a
                  href="https://github.com/dylanglatt/argus"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    gap:            '5px',
                    fontFamily:     'Inter, sans-serif',
                    fontSize:       '9px',
                    fontWeight:     600,
                    textTransform:  'uppercase',
                    letterSpacing:  '0.07em',
                    color:          '#4c90f0',
                    textDecoration: 'none',
                    transition:     'color 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#8abbff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#4c90f0'; }}
                >
                  {/* GitHub icon */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                  GitHub ↗
                </a>
              </div>
            </div>
          )}
        </div>
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
          <StatCell
            label="KIA (UCDP)"
            value={stats?.totalFatalities > 0 ? (stats.totalFatalities).toLocaleString() : 'N/A'}
            valueColor={stats?.totalFatalities > 0 ? '#e76a6e' : '#6a7585'}
            tooltip="Confirmed fatality estimates from UCDP validated events only. Shows N/A when no UCDP events are in the current filter window."
          />
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
          <StatCell label="LAST REFRESH" value={refreshAge} valueColor="#8492a6" mono />
          <Divider />
          <StatCell label="ZULU TIME"    value={zuluTime}   valueColor="#c5cdd9" mono />
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
        color:         '#9caabb',   // Blueprint gray2
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
