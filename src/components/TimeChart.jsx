import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { EVENT_TYPES } from '../utils/constants';

/**
 * TimeChart — stacked bar chart of event frequency by 6-hour UTC window.
 * Blueprint dark: panelBg (#1c2127) surface, Blueprint grid/axis colors.
 */
export function TimeChart({ events }) {
  const [mode, setMode] = useState('stacked');

  const chartData = useMemo(() => {
    const windows = {};
    events.forEach((event) => {
      const bucket = event.hour_bucket ?? 0;
      const key    = `${event.event_date}T${String(bucket).padStart(2, '0')}`;
      if (!windows[key]) {
        windows[key] = { key, date: event.event_date, bucket, total: 0 };
        Object.keys(EVENT_TYPES).forEach((t) => { windows[key][t] = 0; });
      }
      if (windows[key][event.event_type] !== undefined) {
        windows[key][event.event_type]++;
        windows[key].total++;
      }
    });
    return Object.values(windows).sort((a, b) => a.key.localeCompare(b.key));
  }, [events]);

  const formatWindow = (val) => {
    if (!val) return '';
    const [datePart, hourPart] = val.split('T');
    if (!datePart) return val;
    const parts  = datePart.split('-');
    if (parts.length < 3) return val;
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const mo     = months[parseInt(parts[1], 10) - 1];
    const day    = parseInt(parts[2], 10);
    const h      = hourPart ? `${hourPart}Z` : '';
    return h ? `${mo}${day} ${h}` : `${mo} ${day}`;
  };

  const totals = useMemo(() => {
    const t = {};
    chartData.forEach((d) => {
      t[d.key] = Object.keys(EVENT_TYPES).reduce((sum, k) => sum + (d[k] || 0), 0);
    });
    return t;
  }, [chartData]);

  // Blueprint tick style
  const tickStyle = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize:   8,
    fill:       '#5f6b7c',   // Blueprint gray1
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const total            = totals[label] || 0;
    const [datePart, hourPart] = (label || '').split('T');
    const parts  = (datePart || '').split('-');
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const mo     = parts[1] ? months[parseInt(parts[1], 10) - 1] : '';
    const day    = parts[2] ? parseInt(parts[2], 10) : '';
    const h0     = hourPart ?? '00';
    const h1     = String((parseInt(h0) + 6) % 24).padStart(2, '0');
    const windowLabel = `${mo} ${day}  ${h0}Z–${h1}Z`;

    return (
      <div style={{
        background:   '#252a31',    // Blueprint elevatedBg
        border:       '1px solid #383e47',
        borderRadius: '2px',
        padding:      '8px 10px',
        fontFamily:   'Inter, sans-serif',
        minWidth:     '175px',
        boxShadow:    '0 4px 12px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          fontSize:      '9px',
          fontWeight:    600,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color:         '#738091',
          marginBottom:  '6px',
        }}>
          {windowLabel} — {total} events
        </div>
        {payload
          .filter((p) => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((p) => (
            <div key={p.dataKey} style={{
              display:        'flex',
              justifyContent: 'space-between',
              gap:            '12px',
              fontSize:       '10px',
              marginBottom:   '2px',
              alignItems:     'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{
                  width:      '5px',
                  height:     '5px',
                  background: p.fill,
                  transform:  'rotate(45deg)',
                  flexShrink: 0,
                }} />
                <span style={{ color: '#abb3bf', fontFamily: 'Inter, sans-serif', fontSize: '10px' }}>
                  {EVENT_TYPES[p.dataKey]?.label || p.dataKey}
                </span>
              </div>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 600,
                color:      p.fill,
                fontSize:   '10px',
              }}>
                {p.value}
              </span>
            </div>
          ))
        }
      </div>
    );
  };

  const isEmpty      = chartData.length === 0;
  const tickInterval = chartData.length > 16 ? 1 : 0;

  // Shared Blueprint button style for mode toggle
  const modeBtn = (active) => ({
    background:    active ? '#252a31' : 'transparent',
    border:        `1px solid ${active ? '#4c90f040' : '#383e47'}`,
    borderRadius:  '2px',
    padding:       '2px 8px',
    fontFamily:    'Inter, sans-serif',
    fontSize:      '8px',
    fontWeight:    600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color:         active ? '#abb3bf' : '#738091',
    cursor:        'pointer',
    transition:    'all 0.12s',
  });

  return (
    <div style={{
      flex:          1,
      display:       'flex',
      flexDirection: 'column',
      minWidth:      0,
      overflow:      'hidden',
      background:    '#1c2127',    // Blueprint panelBg
    }}>
      {/* Panel header */}
      <div style={{
        padding:        '0 12px 0 16px',
        height:         '34px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        borderBottom:   '1px solid #383e47',
        flexShrink:     0,
      }}>
        <span style={{
          fontFamily:    'Inter, sans-serif',
          fontSize:      '9px',
          fontWeight:    600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color:         '#738091',
        }}>
          ACTIVITY — 6H WINDOWS
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
          {(['stacked', 'total']).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={modeBtn(mode === m)}
              onMouseEnter={(e) => { if (mode !== m) { e.currentTarget.style.background = '#252a31'; e.currentTarget.style.color = '#abb3bf'; }}}
              onMouseLeave={(e) => { if (mode !== m) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#738091'; }}}
            >
              {m === 'stacked' ? 'BY TYPE' : 'TOTAL'}
            </button>
          ))}
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize:   '9px',
            color:      '#5f6b7c',
            marginLeft: '4px',
          }}>
            7D · UTC
          </span>
        </div>
      </div>

      {/* Inline legend */}
      {mode === 'stacked' && !isEmpty && (
        <div style={{
          display:      'flex',
          flexWrap:     'wrap',
          gap:          '10px',
          padding:      '5px 14px',
          borderBottom: '1px solid #38404766',
          flexShrink:   0,
        }}>
          {Object.entries(EVENT_TYPES).map(([key, type]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{
                width:      '5px',
                height:     '5px',
                background: type.color,
                transform:  'rotate(45deg)',
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'Inter, sans-serif',
                fontSize:   '9px',
                color:      '#abb3bf',
                whiteSpace: 'nowrap',
              }}>
                {type.label.split('/')[0].trim()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '6px 0 0 0' }}>
        {isEmpty ? (
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            height:         '100%',
            fontFamily:     'Inter, sans-serif',
            fontSize:       '11px',
            color:          '#5f6b7c',
            letterSpacing:  '0.05em',
          }}>
            NO DATA
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 2, right: 12, left: -18, bottom: 34 }}
              barCategoryGap="20%"
            >
              {/* Blueprint grid: dark-gray4 dashes */}
              <CartesianGrid strokeDasharray="2 4" stroke="#383e47" vertical={false} />
              <XAxis
                dataKey="key"
                tickFormatter={formatWindow}
                tick={tickStyle}
                axisLine={{ stroke: '#383e47' }}
                tickLine={false}
                interval={tickInterval}
                angle={-40}
                textAnchor="end"
                height={38}
              />
              <YAxis
                tick={tickStyle}
                axisLine={{ stroke: '#383e47' }}
                tickLine={false}
                width={26}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(76,144,240,0.06)' }} />

              {mode === 'stacked'
                ? Object.entries(EVENT_TYPES).map(([key, type]) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="a"
                      fill={type.color}
                      fillOpacity={0.75}
                      isAnimationActive={false}
                      maxBarSize={40}
                    />
                  ))
                : (
                    <Bar
                      dataKey="total"
                      fill="#4c90f0"          // Blueprint blue4
                      fillOpacity={0.75}
                      isAnimationActive={false}
                      maxBarSize={40}
                      radius={[1, 1, 0, 0]}
                    />
                  )
              }
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
