import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { EVENT_TYPES } from '../utils/constants';

/**
 * TimeChart — stacked bar chart of event frequency by 6-hour UTC window.
 * Bottom-right panel.
 *
 * Each bar represents a 6-hour window (00Z, 06Z, 12Z, 18Z) derived from
 * the GDELT export file timestamp. This reveals intraday rhythm: conflict
 * reporting clusters around morning/evening news cycles and breaks around
 * local dawn in the relevant theater. Operationally more useful than daily
 * aggregation — you can spot escalation within the same calendar day.
 *
 * Events from mock data (hour_bucket absent) default to the 00Z window of
 * their event_date, which collapses cleanly to daily-style bars.
 */
export function TimeChart({ events }) {
  // Group events into YYYY-MM-DD-HH buckets (HH = 0, 6, 12, 18)
  const chartData = useMemo(() => {
    const windows = {};

    events.forEach((event) => {
      const bucket = event.hour_bucket ?? 0;
      const key    = `${event.event_date}T${String(bucket).padStart(2, '0')}`;

      if (!windows[key]) {
        windows[key] = { key, date: event.event_date, bucket };
        Object.keys(EVENT_TYPES).forEach((t) => { windows[key][t] = 0; });
      }

      if (windows[key][event.event_type] !== undefined) {
        windows[key][event.event_type]++;
      }
    });

    return Object.values(windows).sort((a, b) => a.key.localeCompare(b.key));
  }, [events]);

  // "APR 7 06Z" — short label for each 6-hour window
  const formatWindow = (val) => {
    if (!val) return '';
    // val = "2026-04-07T06"
    const [datePart, hourPart] = val.split('T');
    if (!datePart) return val;
    const parts = datePart.split('-');
    if (parts.length < 3) return val;
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const mo  = months[parseInt(parts[1], 10) - 1];
    const day = parseInt(parts[2], 10);
    const h   = hourPart ? `${hourPart}Z` : '00Z';
    return `${mo}${day} ${h}`;
  };

  // Per-window total (for tooltip header)
  const totals = useMemo(() => {
    const t = {};
    chartData.forEach((d) => {
      t[d.key] = Object.keys(EVENT_TYPES).reduce((sum, k) => sum + (d[k] || 0), 0);
    });
    return t;
  }, [chartData]);

  const tickStyle = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 8,
    fill: '#6b7280',
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const total = totals[label] || 0;
    // label = "2026-04-07T06" — build human-readable header
    const [datePart, hourPart] = (label || '').split('T');
    const parts = (datePart || '').split('-');
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const mo  = parts[1] ? months[parseInt(parts[1], 10) - 1] : '';
    const day = parts[2] ? parseInt(parts[2], 10) : '';
    const windowLabel = `${mo} ${day} ${hourPart ?? '00'}Z–${String((parseInt(hourPart ?? 0) + 6) % 24).padStart(2,'0')}Z`;

    return (
      <div style={{
        background: '#0a0a0f',
        border: '1px solid #1e1e30',
        padding: '8px 10px',
        fontFamily: 'Inter, sans-serif',
        minWidth: '175px',
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#9ca3af',
          marginBottom: '6px',
        }}>
          {windowLabel} — {total} events
        </div>
        {payload
          .filter((p) => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((p) => (
            <div key={p.dataKey} style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '10px',
              fontFamily: 'JetBrains Mono, monospace',
              color: p.fill,
              marginBottom: '2px',
            }}>
              <span style={{ color: '#9ca3af', fontFamily: 'Inter, sans-serif', fontSize: '10px' }}>
                {EVENT_TYPES[p.dataKey]?.label || p.dataKey}
              </span>
              <span style={{ fontWeight: 500 }}>{p.value}</span>
            </div>
          ))
        }
      </div>
    );
  };

  const isEmpty = chartData.length === 0;

  // Show max ~28 ticks (7 days × 4 windows); only label every other bar if dense
  const tickInterval = chartData.length > 16 ? 1 : 0;

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '0 16px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #1e1e30',
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#6b7280',
        }}>
          ACTIVITY — 6H WINDOWS
        </span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '9px',
          color: '#4a4a5a',
        }}>
          7D · UTC
        </span>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '8px 0 0 0' }}>
        {isEmpty ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', fontFamily: 'Inter', fontSize: '11px', color: '#4a4a5a',
          }}>
            NO DATA
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 12, left: -16, bottom: 36 }}
              barCategoryGap="15%"
            >
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="#1e1e30"
                vertical={false}
              />
              <XAxis
                dataKey="key"
                tickFormatter={formatWindow}
                tick={tickStyle}
                axisLine={{ stroke: '#1e1e30' }}
                tickLine={false}
                interval={tickInterval}
                angle={-45}
                textAnchor="end"
                height={40}
              />
              <YAxis
                tick={tickStyle}
                axisLine={{ stroke: '#1e1e30' }}
                tickLine={false}
                width={28}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Legend
                wrapperStyle={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '9px',
                  paddingTop: '4px',
                  color: '#6b7280',
                }}
                iconType="square"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ color: '#6b7280' }}>
                    {EVENT_TYPES[value]?.label || value}
                  </span>
                )}
              />
              {Object.entries(EVENT_TYPES).map(([key, type]) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={type.color}
                  isAnimationActive={false}
                  maxBarSize={40}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
