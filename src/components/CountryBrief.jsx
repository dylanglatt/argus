import React, { useMemo } from 'react';
import { EVENT_TYPES } from '../utils/constants';

const LABEL_STYLE = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#4a4a6a',
};

/**
 * CountryBrief
 * ------------
 * Intelligence summary panel for a selected country. Overlays the FilterPanel.
 *
 * Displays:
 *   - Total events in the available data window
 *   - Avg Goldstein Scale (conflict pressure)
 *   - Trend direction: recent 36h vs prior 36h (deteriorating / stable / stabilizing)
 *   - Most active actor
 *   - Event type breakdown with proportional bars
 *
 * Trend is computed by comparing the Goldstein average for the most recent
 * half of the data window vs the prior half. A more negative recent average
 * means conflict is intensifying ("DETERIORATING").
 */
export function CountryBrief({ country, events, onClose }) {
  const brief = useMemo(() => {
    if (!country || !events || events.length === 0) return null;

    const countryEvents = events.filter((e) => e.country === country);
    if (countryEvents.length === 0) return null;

    // Split into recent / prior halves for trend
    const sorted = [...countryEvents].sort((a, b) =>
      a.event_date < b.event_date ? -1 : 1
    );
    const mid        = Math.floor(sorted.length / 2);
    const priorHalf  = sorted.slice(0, mid);
    const recentHalf = sorted.slice(mid);

    const avg = (arr) =>
      arr.length === 0
        ? 0
        : arr.reduce((s, e) => s + (e.goldstein_scale || 0), 0) / arr.length;

    const recentAvg = avg(recentHalf);
    const priorAvg  = avg(priorHalf);
    const trendDiff = recentAvg - priorAvg; // negative = more conflict recently

    // Actor frequency
    const actorCounts = {};
    countryEvents.forEach((e) => {
      if (e.actor1 && e.actor1 !== 'Unknown')
        actorCounts[e.actor1] = (actorCounts[e.actor1] || 0) + 1;
      if (e.actor2 && e.actor2 !== 'Unknown')
        actorCounts[e.actor2] = (actorCounts[e.actor2] || 0) + 1;
    });
    const topActors = Object.entries(actorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([name]) => name);

    // Event type breakdown
    const typeCounts = {};
    countryEvents.forEach((e) => {
      if (e.event_type)
        typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1;
    });
    const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

    // Date window label
    const dates = countryEvents.map((e) => e.event_date).sort();
    const windowStart = dates[0];
    const windowEnd   = dates[dates.length - 1];

    return {
      totalEvents:  countryEvents.length,
      avgGoldstein: Math.round(avg(countryEvents) * 10) / 10,
      trendDiff:    Math.round(trendDiff * 10) / 10,
      topActors,
      sortedTypes,
      windowStart,
      windowEnd,
    };
  }, [country, events]);

  if (!brief) return null;

  // Goldstein color (negative = more conflict = warmer)
  const goldsteinColor =
    brief.avgGoldstein < -5 ? '#ef4444' :
    brief.avgGoldstein < -2 ? '#f97316' :
    brief.avgGoldstein <  0 ? '#eab308' :
                               '#10b981';

  // Trend label and color
  const trendLabel =
    brief.trendDiff < -0.5 ? 'DETERIORATING' :
    brief.trendDiff >  0.5 ? 'STABILIZING'   :
                              'STABLE';
  const trendColor =
    brief.trendDiff < -0.5 ? '#ef4444' :
    brief.trendDiff >  0.5 ? '#10b981' :
                              '#eab308';
  const trendArrow =
    brief.trendDiff < -0.5 ? '↓' :
    brief.trendDiff >  0.5 ? '↑' :
                              '→';

  return (
    <div style={{
      position:      'absolute',
      inset:         0,
      background:    '#0a0a0f',
      borderRight:   '1px solid #1e1e30',
      overflowY:     'auto',
      zIndex:        20,
      display:       'flex',
      flexDirection: 'column',
    }}>
      <div style={{ padding: '14px' }}>

        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'flex-start',
          justifyContent: 'space-between',
          marginBottom:   '14px',
          paddingBottom:  '10px',
          borderBottom:   '1px solid #1e1e30',
        }}>
          <div>
            <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>COUNTRY BRIEF</div>
            <div style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '15px',
              fontWeight:    700,
              color:         '#e2e4e9',
              letterSpacing: '0.04em',
            }}>
              {country.toUpperCase()}
            </div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   '9px',
              color:      '#4a4a6a',
              marginTop:  '3px',
            }}>
              {brief.windowStart} → {brief.windowEnd}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background:    'transparent',
              border:        '1px solid #1e1e30',
              color:         '#4a4a6a',
              padding:       '4px 8px',
              cursor:        'pointer',
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    700,
              letterSpacing: '0.06em',
              flexShrink:    0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e2e4e9'; e.currentTarget.style.borderColor = '#3a3a50'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#4a4a6a'; e.currentTarget.style.borderColor = '#1e1e30'; }}
          >
            ← BACK
          </button>
        </div>

        {/* Key metrics grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '14px' }}>
          <Metric label="TOTAL EVENTS"   value={brief.totalEvents}                               mono />
          <Metric
            label="AVG GOLDSTEIN"
            value={`${brief.avgGoldstein > 0 ? '+' : ''}${brief.avgGoldstein}`}
            mono
            valueColor={goldsteinColor}
            tooltip="Goldstein Scale avg. Negative = conflict pressure."
          />
          <Metric
            label="TREND"
            value={`${trendArrow} ${trendLabel}`}
            valueColor={trendColor}
            small
          />
          <Metric
            label="TOP ACTOR"
            value={brief.topActors[0] || 'Unknown'}
            small
          />
        </div>

        {brief.topActors.length > 1 && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ ...LABEL_STYLE, marginBottom: '5px' }}>KEY ACTORS</div>
            {brief.topActors.map((actor) => (
              <div key={actor} style={{
                fontFamily:   'Inter, sans-serif',
                fontSize:     '11px',
                color:        '#9ca3af',
                padding:      '4px 8px',
                borderLeft:   '2px solid #1e1e30',
                marginBottom: '3px',
              }}>
                {actor}
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid #1e1e30', marginBottom: '14px' }} />

        {/* Event type breakdown */}
        <div style={{ ...LABEL_STYLE, marginBottom: '10px' }}>EVENT BREAKDOWN</div>
        {brief.sortedTypes.map(([type, count]) => {
          const typeInfo = EVENT_TYPES[type];
          const pct      = Math.round((count / brief.totalEvents) * 100);
          return (
            <div key={type} style={{ marginBottom: '8px' }}>
              <div style={{
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'center',
                marginBottom:   '3px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{
                    width:      '5px',
                    height:     '5px',
                    background: typeInfo?.color || '#9ca3af',
                    transform:  'rotate(45deg)',
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize:   '10px',
                    color:      '#9ca3af',
                  }}>
                    {type.split('/')[0].trim()}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize:   '9px',
                    color:      '#4a4a6a',
                  }}>
                    {pct}%
                  </span>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize:   '9px',
                    color:      '#2a2a3a',
                  }}>
                    {count}
                  </span>
                </div>
              </div>
              {/* Proportional bar */}
              <div style={{ height: '2px', background: '#1e1e30', position: 'relative' }}>
                <div style={{
                  position:   'absolute',
                  top:        0,
                  left:       0,
                  height:     '100%',
                  width:      `${pct}%`,
                  background: typeInfo?.color || '#9ca3af',
                  opacity:    0.65,
                }} />
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}

function Metric({ label, value, mono, valueColor, small, tooltip }) {
  return (
    <div
      title={tooltip}
      style={{
        background:  '#0d0d14',
        border:      '1px solid #1e1e30',
        padding:     '8px 10px',
        cursor:      tooltip ? 'help' : 'default',
      }}
    >
      <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>{label}</div>
      <div style={{
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
        fontSize:   small ? '10px' : '13px',
        fontWeight: 600,
        color:      valueColor || '#e2e4e9',
        lineHeight: 1.2,
        overflow:   'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
    </div>
  );
}
