import React, { useMemo } from 'react';

/**
 * EscalationBanner
 * ----------------
 * Persistent alert strip surfacing top escalating regions.
 * Blueprint danger callout style: dark red bg, red4 text and borders.
 * Hidden entirely when no regions meet the escalation threshold.
 */
export function EscalationBanner({ events, onSelectCountry }) {
  const hotZones = useMemo(() => {
    if (!events || events.length === 0) return [];

    const now          = new Date();
    const yesterdayStr = new Date(now - 86400000).toISOString().slice(0, 10);
    const dayBeforeStr = new Date(now - 172800000).toISOString().slice(0, 10);

    const recentCounts = {};
    const priorCounts  = {};

    events.forEach((e) => {
      if (!e.country || !e.event_date) return;
      if (e.event_date === yesterdayStr)
        recentCounts[e.country] = (recentCounts[e.country] || 0) + 1;
      else if (e.event_date === dayBeforeStr)
        priorCounts[e.country]  = (priorCounts[e.country]  || 0) + 1;
    });

    return Object.entries(recentCounts)
      .filter(([c, n]) => n >= 2 && (priorCounts[c] || 0) >= 1)
      .map(([country, recentCount]) => ({
        country,
        recentCount,
        pctChange: Math.round(
          ((recentCount - (priorCounts[country] || 1)) / (priorCounts[country] || 1)) * 100
        ),
      }))
      .filter((z) => z.pctChange >= 30)
      .sort((a, b) => b.pctChange - a.pctChange)
      .slice(0, 3);
  }, [events]);

  if (hotZones.length === 0) return null;

  return (
    <div style={{
      height:       '28px',
      minHeight:    '28px',
      background:   '#2a1518',          // dark red — Blueprint danger surface tint
      borderBottom: '1px solid #e76a6e30',
      display:      'flex',
      alignItems:   'center',
      padding:      '0 14px',
      gap:          '16px',
      flexShrink:   0,
      overflow:     'hidden',
    }}>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <div style={{
          width:        '5px',
          height:       '5px',
          borderRadius: '50%',
          background:   '#e76a6e',       // Blueprint red4
          boxShadow:    '0 0 6px #e76a6e80',
        }} />
        <span style={{
          fontFamily:    'Inter, sans-serif',
          fontSize:      '9px',
          fontWeight:    600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color:         '#e76a6e',
        }}>
          ESCALATION ALERT
        </span>
      </div>

      <div style={{ width: '1px', height: '14px', background: '#e76a6e30', flexShrink: 0 }} />

      {/* Region pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
        {hotZones.map(({ country, pctChange }, i) => (
          <React.Fragment key={country}>
            {i > 0 && (
              <span style={{ color: '#e76a6e30', fontSize: '10px', flexShrink: 0 }}>·</span>
            )}
            <button
              onClick={() => onSelectCountry(country)}
              title={`Open ${country} brief`}
              style={{
                background: 'transparent',
                border:     'none',
                padding:    0,
                cursor:     'pointer',
                display:    'flex',
                alignItems: 'center',
                gap:        '5px',
                flexShrink: 0,
              }}
            >
              <span
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 600, color: '#f6f7f9', transition: 'color 0.1s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#e76a6e')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#f6f7f9')}
              >
                {country}
              </span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize:   '10px',
                fontWeight: 700,
                color:      pctChange >= 100 ? '#e76a6e' : '#ec9a3c',  // Blueprint red4 / orange4
              }}>
                ↑{pctChange}%
              </span>
            </button>
          </React.Fragment>
        ))}
      </div>

      <span style={{
        marginLeft:    'auto',
        fontFamily:    'Inter, sans-serif',
        fontSize:      '8px',
        fontWeight:    600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color:         '#e76a6e40',
        flexShrink:    0,
      }}>
        24H ΔDELTA
      </span>
    </div>
  );
}
