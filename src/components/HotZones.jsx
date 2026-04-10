import React, { useMemo } from 'react';

const LABEL_STYLE = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#738091',    // Blueprint gray2
};

/**
 * HotZones
 * --------
 * Escalating regions: yesterday vs day-before, ≥30% increase.
 * Blueprint danger callout style — red left-border, elevated bg.
 */
export function HotZones({ events, onSelectCountry }) {
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
      .map(([country, recentCount]) => {
        const priorCount = priorCounts[country] || 1;
        const pctChange  = Math.round(((recentCount - priorCount) / priorCount) * 100);
        return { country, recentCount, pctChange };
      })
      .filter((z) => z.pctChange >= 30)
      .sort((a, b) => b.pctChange - a.pctChange)
      .slice(0, 5);
  }, [events]);

  if (hotZones.length === 0) return null;

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        ...LABEL_STYLE,
        marginBottom: '8px',
        display:      'flex',
        alignItems:   'center',
        gap:          '6px',
      }}>
        {/* Blueprint danger dot */}
        <div style={{
          width:        '5px',
          height:       '5px',
          borderRadius: '50%',
          background:   '#e76a6e',      // Blueprint red4
          boxShadow:    '0 0 5px #e76a6e80',
          flexShrink:   0,
        }} />
        HOT ZONES
        <span style={{ color: '#e76a6e50', marginLeft: 'auto' }}>24H Δ</span>
      </div>

      {hotZones.map(({ country, recentCount, pctChange }) => (
        <div
          key={country}
          onClick={() => onSelectCountry(country)}
          title={`${recentCount} events yesterday — up ${pctChange}% vs prior day`}
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '5px 8px',
            marginBottom:   '3px',
            background:     '#252a31',
            border:         '1px solid #e76a6e20',
            borderLeft:     '3px solid #e76a6e50',
            borderRadius:   '2px',
            cursor:         'pointer',
            transition:     'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background      = '#2a1c1c';
            e.currentTarget.style.borderColor     = '#e76a6e40';
            e.currentTarget.style.borderLeftColor = '#e76a6e';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background      = '#252a31';
            e.currentTarget.style.borderColor     = '#e76a6e20';
            e.currentTarget.style.borderLeftColor = '#e76a6e50';
          }}
        >
          <span style={{
            fontFamily:   'Inter, sans-serif',
            fontSize:     '11px',
            color:        '#f6f7f9',
            flex:         1,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            marginRight:  '8px',
          }}>
            {country}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   '9px',
              color:      '#5f6b7c',
            }}>
              {recentCount}
            </span>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   '10px',
              fontWeight: 700,
              color:      pctChange >= 100 ? '#e76a6e' : '#ec9a3c',  // Blueprint red4 / orange4
            }}>
              ↑{pctChange}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
