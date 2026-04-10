import React, { useMemo, useState, useEffect } from 'react';
import { EVENT_TYPES } from '../utils/constants';

const LABEL_STYLE = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#738091',    // Blueprint gray2
};

/**
 * CountryBrief
 * ------------
 * Intelligence summary panel for a selected country. Overlays the FilterPanel.
 * Blueprint dark panel: panelBg surface, metric cards using elevatedBg.
 */
function relativeDate(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diffMs = now - then;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1mo ago' : `${months}mo ago`;
}

export function CountryBrief({ country, events, onClose }) {
  const [reports, setReports]       = useState(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Fetch ReliefWeb reports when country changes
  useEffect(() => {
    if (!country) return;
    let cancelled = false;
    setReports(null);
    setReportsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/reliefweb/${encodeURIComponent(country)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setReports(json.data || []);
      } catch (err) {
        console.warn('[CountryBrief] ReliefWeb fetch failed:', err.message);
        if (!cancelled) setReports([]);
      } finally {
        if (!cancelled) setReportsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [country]);

  const brief = useMemo(() => {
    if (!country || !events || events.length === 0) return null;

    const countryEvents = events.filter((e) => e.country === country);
    if (countryEvents.length === 0) return null;

    const sorted    = [...countryEvents].sort((a, b) => a.event_date < b.event_date ? -1 : 1);
    const mid       = Math.floor(sorted.length / 2);
    const priorHalf = sorted.slice(0, mid);
    const recentHalf = sorted.slice(mid);

    const avg = (arr) =>
      arr.length === 0 ? 0
        : arr.reduce((s, e) => s + (e.goldstein_scale || 0), 0) / arr.length;

    const trendDiff = avg(recentHalf) - avg(priorHalf);

    const actorCounts = {};
    countryEvents.forEach((e) => {
      if (e.actor1 && e.actor1 !== 'Unknown') actorCounts[e.actor1] = (actorCounts[e.actor1] || 0) + 1;
      if (e.actor2 && e.actor2 !== 'Unknown') actorCounts[e.actor2] = (actorCounts[e.actor2] || 0) + 1;
    });
    const topActors = Object.entries(actorCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name]) => name);

    const typeCounts = {};
    countryEvents.forEach((e) => {
      if (e.event_type) typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1;
    });
    const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

    const dates       = countryEvents.map((e) => e.event_date).sort();
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

  // Blueprint intent colors for Goldstein
  const goldsteinColor =
    brief.avgGoldstein < -5 ? '#e76a6e' :
    brief.avgGoldstein < -2 ? '#ec9a3c' :
    brief.avgGoldstein <  0 ? '#fbb360' :
                               '#32a467';

  const trendLabel =
    brief.trendDiff < -0.5 ? 'DETERIORATING' :
    brief.trendDiff >  0.5 ? 'STABILIZING'   :
                              'STABLE';
  const trendColor =
    brief.trendDiff < -0.5 ? '#e76a6e' :
    brief.trendDiff >  0.5 ? '#32a467' :
                              '#fbb360';
  const trendArrow =
    brief.trendDiff < -0.5 ? '↓' :
    brief.trendDiff >  0.5 ? '↑' :
                              '→';

  return (
    <div style={{
      position:      'absolute',
      inset:         0,
      background:    '#1c2127',    // Blueprint panelBg
      borderRight:   '1px solid #2f343c',
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
          borderBottom:   '1px solid #383e47',
        }}>
          <div>
            <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>COUNTRY BRIEF</div>
            <div style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '15px',
              fontWeight:    700,
              color:         '#f6f7f9',
              letterSpacing: '0.04em',
            }}>
              {country.toUpperCase()}
            </div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   '9px',
              color:      '#5f6b7c',
              marginTop:  '3px',
            }}>
              {brief.windowStart} → {brief.windowEnd}
            </div>
          </div>

          {/* Blueprint minimal back button */}
          <button
            onClick={onClose}
            style={{
              background:    '#252a31',
              border:        '1px solid #383e47',
              borderRadius:  '2px',
              color:         '#738091',
              padding:       '4px 10px',
              cursor:        'pointer',
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    600,
              letterSpacing: '0.06em',
              flexShrink:    0,
              transition:    'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color       = '#f6f7f9';
              e.currentTarget.style.background  = '#2f343c';
              e.currentTarget.style.borderColor = '#404854';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color       = '#738091';
              e.currentTarget.style.background  = '#252a31';
              e.currentTarget.style.borderColor = '#383e47';
            }}
          >
            ← BACK
          </button>
        </div>

        {/* Key metrics — Blueprint card grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '14px' }}>
          <Metric label="TOTAL EVENTS"   value={brief.totalEvents} mono />
          <Metric
            label="AVG GOLDSTEIN"
            value={`${brief.avgGoldstein > 0 ? '+' : ''}${brief.avgGoldstein}`}
            mono valueColor={goldsteinColor}
            tooltip="Goldstein Scale avg. Negative = conflict pressure."
          />
          <Metric label="TREND" value={`${trendArrow} ${trendLabel}`} valueColor={trendColor} small />
          <Metric label="TOP ACTOR" value={brief.topActors[0] || 'Unknown'} small />
        </div>

        {brief.topActors.length > 1 && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ ...LABEL_STYLE, marginBottom: '5px' }}>KEY ACTORS</div>
            {brief.topActors.map((actor) => (
              <div key={actor} style={{
                fontFamily:   'Inter, sans-serif',
                fontSize:     '11px',
                color:        '#abb3bf',
                padding:      '4px 8px',
                borderLeft:   '2px solid #383e47',
                marginBottom: '3px',
              }}>
                {actor}
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid #383e47', marginBottom: '14px' }} />

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
                    background: typeInfo?.color || '#738091',
                    transform:  'rotate(45deg)',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#abb3bf' }}>
                    {type.split('/')[0].trim()}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#738091' }}>
                    {pct}%
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#383e47' }}>
                    {count}
                  </span>
                </div>
              </div>
              <div style={{ height: '2px', background: '#383e47', position: 'relative', borderRadius: '1px' }}>
                <div style={{
                  position:     'absolute',
                  top:          0,
                  left:         0,
                  height:       '100%',
                  width:        `${pct}%`,
                  background:   typeInfo?.color || '#738091',
                  opacity:      0.75,
                  borderRadius: '1px',
                }} />
              </div>
            </div>
          );
        })}

        {/* Humanitarian reports — ReliefWeb */}
        <div style={{ borderTop: '1px solid #383e47', marginTop: '6px', marginBottom: '14px' }} />
        <div style={{ ...LABEL_STYLE, marginBottom: '10px' }}>HUMANITARIAN REPORTS</div>

        {reportsLoading && (
          <div style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            color:         '#5f6b7c',
            letterSpacing: '0.05em',
            marginBottom:  '10px',
          }}>
            LOADING...
          </div>
        )}

        {!reportsLoading && reports && reports.length === 0 && (
          <div style={{
            fontFamily:   'Inter, sans-serif',
            fontSize:     '10px',
            color:        '#5f6b7c',
            marginBottom: '10px',
          }}>
            No recent reports
          </div>
        )}

        {!reportsLoading && reports && reports.length > 0 && reports.map((report) => (
          <a
            key={report.id}
            href={report.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'block',
              padding:        '7px 8px',
              marginBottom:   '4px',
              background:     '#252a31',
              border:         '1px solid #383e47',
              borderRadius:   '2px',
              textDecoration: 'none',
              transition:     'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#4c90f0';
              e.currentTarget.style.background  = '#1e3048';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#383e47';
              e.currentTarget.style.background  = '#252a31';
            }}
          >
            <div style={{
              fontFamily:      'Inter, sans-serif',
              fontSize:        '10px',
              color:           '#abb3bf',
              lineHeight:      1.4,
              overflow:        'hidden',
              textOverflow:    'ellipsis',
              whiteSpace:      'nowrap',
              marginBottom:    '3px',
            }}>
              {report.title.length > 80 ? report.title.slice(0, 80) + '...' : report.title}
            </div>
            <div style={{
              display:    'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{
                fontFamily: 'Inter, sans-serif',
                fontSize:   '9px',
                color:      '#738091',
              }}>
                {report.source}
              </span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize:   '9px',
                color:      '#5f6b7c',
              }}>
                {relativeDate(report.date)}
              </span>
            </div>
          </a>
        ))}

      </div>
    </div>
  );
}

// Blueprint-style metric card
function Metric({ label, value, mono, valueColor, small, tooltip }) {
  return (
    <div
      title={tooltip}
      style={{
        background:   '#252a31',    // Blueprint elevatedBg
        border:       '1px solid #383e47',
        borderRadius: '2px',
        padding:      '8px 10px',
        cursor:       tooltip ? 'help' : 'default',
      }}
    >
      <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>{label}</div>
      <div style={{
        fontFamily:   mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
        fontSize:     small ? '10px' : '13px',
        fontWeight:   600,
        color:        valueColor || '#f6f7f9',
        lineHeight:   1.2,
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        {value}
      </div>
    </div>
  );
}
