import React, { useMemo } from 'react';

/**
 * EscalationBanner
 * ----------------
 * Persistent alert strip above the map. Proactively surfaces the top
 * escalating regions — the analyst sees it without any interaction.
 *
 * Compares yesterday vs day-before-yesterday per country (same logic as
 * HotZones) and shows the top 3 results inline. Clicking a region name
 * opens its Country Brief.
 *
 * Hidden entirely when no regions meet the escalation threshold.
 */
export function EscalationBanner({ events, onSelectCountry }) {
  const hotZones = useMemo(() => {
    if (!events || events.length === 0) return [];

    const now          = new Date();
    const yesterdayStr = new Date(now - 1 * 86400000).toISOString().slice(0, 10);
    const dayBeforeStr = new Date(now - 2 * 86400000).toISOString().slice(0, 10);

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
      height:          '28px',
      minHeight:       '28px',
      background:      '#1a0808',
      borderBottom:    '1px solid #ef444430',
      display:         'flex',
      alignItems:      'center',
      padding:         '0 14px',
      gap:             '16px',
      flexShrink:      0,
      overflow:        'hidden',
    }}>
      {/* Label */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        '6px',
        flexShrink: 0,
      }}>
        <div style={{
          width:        '5px',
          height:       '5px',
          borderRadius: '50%',
          background:   '#ef4444',
          boxShadow:    '0 0 6px #ef4444',
        }} />
        <span style={{
          fontFamily:    'Inter, sans-serif',
          fontSize:      '9px',
          fontWeight:    700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color:         '#ef4444',
        }}>
          ESCALATION ALERT
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '14px', background: '#ef444430', flexShrink: 0 }} />

      {/* Region pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
        {hotZones.map(({ country, pctChange }, i) => (
          <React.Fragment key={country}>
            {i > 0 && (
              <span style={{ color: '#ef444430', fontSize: '10px', flexShrink: 0 }}>·</span>
            )}
            <button
              onClick={() => onSelectCountry(country)}
              title={`Open ${country} brief`}
              style={{
                background:    'transparent',
                border:        'none',
                padding:       0,
                cursor:        'pointer',
                display:       'flex',
                alignItems:    'center',
                gap:           '5px',
                flexShrink:    0,
              }}
            >
              <span style={{
                fontFamily:  'Inter, sans-serif',
                fontSize:    '11px',
                fontWeight:  600,
                color:       '#e2e4e9',
                transition:  'color 0.1s',
              }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#e2e4e9')}
              >
                {country}
              </span>
              <span style={{
                fontFamily:  'JetBrains Mono, monospace',
                fontSize:    '10px',
                fontWeight:  700,
                color:       pctChange >= 100 ? '#ef4444' : '#f97316',
              }}>
                ↑{pctChange}%
              </span>
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Right: 24H DELTA label */}
      <span style={{
        marginLeft:    'auto',
        fontFamily:    'Inter, sans-serif',
        fontSize:      '8px',
        fontWeight:    600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color:         '#ef444450',
        flexShrink:    0,
      }}>
        24H ΔDELTA
      </span>
    </div>
  );
}
