import React, { useMemo } from 'react';

const LABEL_STYLE = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#4a4a6a',
};

/**
 * HotZones
 * --------
 * Detects escalating conflict regions by comparing yesterday's event count
 * against the day before. Countries with ≥30% increase and at least 2 recent
 * events are surfaced as "hot zones" — the analyst's first filter for
 * where to focus attention.
 *
 * Clicking a country row opens its CountryBrief panel.
 */
export function HotZones({ events, onSelectCountry }) {
  const hotZones = useMemo(() => {
    if (!events || events.length === 0) return [];

    const now           = new Date();
    const yesterdayStr  = new Date(now - 1 * 86400000).toISOString().slice(0, 10);
    const dayBeforeStr  = new Date(now - 2 * 86400000).toISOString().slice(0, 10);

    const recentCounts = {};   // yesterday
    const priorCounts  = {};   // day before yesterday

    events.forEach((e) => {
      if (!e.country || !e.event_date) return;
      if (e.event_date === yesterdayStr) {
        recentCounts[e.country] = (recentCounts[e.country] || 0) + 1;
      } else if (e.event_date === dayBeforeStr) {
        priorCounts[e.country]  = (priorCounts[e.country]  || 0) + 1;
      }
    });

    return Object.entries(recentCounts)
      .filter(([country, count]) => count >= 2 && (priorCounts[country] || 0) >= 1)
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
      {/* Section header */}
      <div style={{
        ...LABEL_STYLE,
        marginBottom: '8px',
        display:      'flex',
        alignItems:   'center',
        gap:          '6px',
      }}>
        <div style={{
          width:        '5px',
          height:       '5px',
          borderRadius: '50%',
          background:   '#ef4444',
          boxShadow:    '0 0 5px #ef4444',
          flexShrink:   0,
        }} />
        HOT ZONES
        <span style={{ color: '#ef444460', marginLeft: 'auto' }}>24H ΔDELTA</span>
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
            border:         '1px solid #ef444420',
            borderLeft:     '3px solid #ef444455',
            cursor:         'pointer',
            background:     '#0d0d14',
            transition:     'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background    = '#1a0f0f';
            e.currentTarget.style.borderColor   = '#ef444440';
            e.currentTarget.style.borderLeftColor = '#ef4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background    = '#0d0d14';
            e.currentTarget.style.borderColor   = '#ef444420';
            e.currentTarget.style.borderLeftColor = '#ef444455';
          }}
        >
          <span style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   '11px',
            color:      '#e2e4e9',
            flex:       1,
            overflow:   'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginRight: '8px',
          }}>
            {country}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   '9px',
              color:      '#4a4a6a',
            }}>
              {recentCount}
            </span>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   '10px',
              fontWeight: 700,
              color:      pctChange >= 100 ? '#ef4444' : '#f97316',
            }}>
              ↑{pctChange}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
