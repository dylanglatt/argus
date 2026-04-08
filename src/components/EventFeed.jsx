import React, { useState } from 'react';
import { EVENT_TYPES } from '../utils/constants';

const COL_LABEL = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color:         '#4a4a6a',
  padding:       '0 8px',
  whiteSpace:    'nowrap',
};

const SORT_BTN = (active) => ({
  background:    active ? '#16161d' : 'transparent',
  border:        `1px solid ${active ? '#3b82f640' : '#1e1e30'}`,
  borderRadius:  0,
  padding:       '2px 7px',
  fontFamily:    'Inter, sans-serif',
  fontSize:      '8px',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color:         active ? '#9ca3af' : '#4a4a6a',
  cursor:        'pointer',
});

/**
 * EventFeed — scrollable event table, bottom-left panel.
 * Columns: DATE | TYPE | LOCATION | ACTOR | SCORE | SOURCE
 *
 * High-impact events (score ≥ 8) get a red left-edge accent bar.
 * Selected event row is highlighted with a blue accent.
 * Default sort: by impact score (highest first) so meaningful events surface.
 */
export function EventFeed({ events, onEventClick, selectedEventId }) {
  const [sortBy, setSortBy] = useState('impact'); // 'impact' | 'date'

  const sorted = [...events].sort((a, b) =>
    sortBy === 'impact'
      ? (b.impact_score ?? 0) - (a.impact_score ?? 0)
      : new Date(b.event_date) - new Date(a.event_date)
  );

  return (
    <div style={{
      flex:          1,
      display:       'flex',
      flexDirection: 'column',
      borderRight:   '1px solid #1e1e30',
      minWidth:      0,
      overflow:      'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        padding:        '0 12px 0 16px',
        height:         '36px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        borderBottom:   '1px solid #1e1e30',
        flexShrink:     0,
      }}>
        <span style={{
          fontFamily:    'Inter, sans-serif',
          fontSize:      '9px',
          fontWeight:    700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color:         '#4a4a6a',
        }}>
          EVENT FEED
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button style={SORT_BTN(sortBy === 'impact')} onClick={() => setSortBy('impact')}>IMPACT</button>
          <button style={SORT_BTN(sortBy === 'date')}   onClick={() => setSortBy('date')}>DATE</button>
          <span style={{
            fontFamily:  'JetBrains Mono, monospace',
            fontSize:    '10px',
            color:       '#4a4a6a',
            marginLeft:  '6px',
          }}>
            {events.length.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: '4px 90px 22px 1fr 1fr 38px 26px',
        height:              '24px',
        alignItems:          'center',
        borderBottom:        '1px solid #1e1e30',
        background:          '#0a0a0f',
        flexShrink:          0,
      }}>
        <span />
        <span style={COL_LABEL}>DATE</span>
        <span />
        <span style={COL_LABEL}>LOCATION</span>
        <span style={COL_LABEL}>ACTOR</span>
        <span style={{ ...COL_LABEL, textAlign: 'right' }}>SCORE</span>
        <span />
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.length === 0 ? (
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            height:         '100%',
            fontFamily:     'Inter, sans-serif',
            fontSize:       '11px',
            color:          '#4a4a5a',
            letterSpacing:  '0.05em',
          }}>
            NO EVENTS MATCH CURRENT PARAMETERS
          </div>
        ) : (
          sorted.map((event) => (
            <EventRow
              key={event.event_id_cnty}
              event={event}
              isSelected={selectedEventId === event.event_id_cnty}
              onClick={() => onEventClick?.(event)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EventRow({ event, onClick, isSelected }) {
  const [hovered, setHovered] = React.useState(false);
  const eventType = EVENT_TYPES[event.event_type];

  const score = event.impact_score ?? 0;
  const isHighImpact = score >= 8;
  const isMedImpact  = score >= 5;

  const impactColor =
    isHighImpact ? '#ef4444' :
    isMedImpact  ? '#eab308' :
                   '#4a4a6a';

  const accentColor =
    isSelected    ? '#3b82f6' :
    isHighImpact  ? '#ef444480' :
    'transparent';

  const bgColor =
    isSelected  ? '#16213e' :
    hovered     ? '#16161d' :
    isHighImpact ? '#1a0e0e' :
    'transparent';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:             'grid',
        gridTemplateColumns: '4px 90px 22px 1fr 1fr 38px 26px',
        minHeight:           '34px',
        alignItems:          'center',
        borderBottom:        '1px solid #1e1e3066',
        background:          bgColor,
        cursor:              'pointer',
        transition:          'background 0.1s',
      }}
    >
      {/* Left accent bar */}
      <div style={{
        width:      '4px',
        height:     '100%',
        minHeight:  '34px',
        background: accentColor,
        transition: 'background 0.15s',
      }} />

      {/* Date */}
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize:   '10px',
        color:      '#8a8fa8',
        padding:    '0 6px',
        whiteSpace: 'nowrap',
      }}>
        {event.event_date}
      </span>

      {/* Type diamond */}
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          width:      '5px',
          height:     '5px',
          background: eventType?.color || '#9ca3af',
          transform:  'rotate(45deg)',
          display:    'inline-block',
          flexShrink: 0,
        }} />
      </span>

      {/* Location */}
      <span style={{
        fontFamily:   'Inter, sans-serif',
        fontSize:     '11px',
        fontWeight:   500,
        color:        '#e2e4e9',
        padding:      '0 8px',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        {event.location}
      </span>

      {/* Actor */}
      <span style={{
        fontFamily:   'Inter, sans-serif',
        fontSize:     '10px',
        color:        event.actor1 === 'Unknown' ? '#4a4a5a' : '#9ca3af',
        padding:      '0 8px',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
        fontStyle:    event.actor1 === 'Unknown' ? 'italic' : 'normal',
      }}>
        {event.actor1 !== 'Unknown'
          ? event.actor1
          : (event.actor2 !== 'Unknown' ? event.actor2 : event.country)}
      </span>

      {/* Impact score */}
      <span style={{
        fontFamily:  'JetBrains Mono, monospace',
        fontSize:    '11px',
        fontWeight:  600,
        color:       impactColor,
        padding:     '0 4px',
        textAlign:   'right',
        letterSpacing: '0.02em',
      }}>
        {score}
      </span>

      {/* Source link */}
      <span
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          paddingRight:   '4px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {event.source_url ? (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open primary source"
            style={{
              fontFamily:     'Inter, sans-serif',
              fontSize:       '11px',
              color:          '#3b5a8a',
              lineHeight:     1,
              textDecoration: 'none',
              transition:     'color 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#3b82f6')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#3b5a8a')}
          >
            ↗
          </a>
        ) : (
          <span style={{ color: '#1e1e30', fontSize: '11px' }}>↗</span>
        )}
      </span>
    </div>
  );
}
