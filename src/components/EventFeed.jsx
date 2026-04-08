import React from 'react';
import { EVENT_TYPES } from '../utils/constants';

const COL_LABEL = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '10px',
  fontWeight:    500,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color:         '#6b7280',
  padding:       '0 8px',
  whiteSpace:    'nowrap',
};

/**
 * EventFeed — scrollable event table, bottom-left panel.
 * Columns: DATE | TYPE | LOCATION | ENTITY | IMP
 *
 * IMP = impact_score (0–10 derived from inverted Goldstein Scale).
 * Color coding: ≥8 red, ≥5 yellow, <5 gray.
 */
export function EventFeed({ events, onEventClick }) {
  const sorted = [...events].sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

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
        padding:        '0 16px',
        height:         '36px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        borderBottom:   '1px solid #1e1e30',
        flexShrink:     0,
      }}>
        <span style={{
          fontFamily:    'Inter, sans-serif',
          fontSize:      '10px',
          fontWeight:    600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color:         '#6b7280',
        }}>
          EVENT FEED
        </span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize:   '10px',
          color:      '#6b7280',
        }}>
          RECORDS: {events.length}
        </span>
      </div>

      {/* Column headers */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: '90px 30px 1fr 1fr 36px 28px',
        height:              '24px',
        alignItems:          'center',
        borderBottom:        '1px solid #1e1e30',
        background:          '#0a0a0f',
        flexShrink:          0,
      }}>
        <span style={COL_LABEL}>DATE/TIME</span>
        <span style={COL_LABEL}></span>
        <span style={COL_LABEL}>SECTOR</span>
        <span style={COL_LABEL}>ENTITY</span>
        <span style={{ ...COL_LABEL, textAlign: 'right' }}>IMP</span>
        <span style={COL_LABEL}></span>
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.length === 0 ? (
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            height:         '100%',
            fontFamily:     'Inter',
            fontSize:       '11px',
            color:          '#4a4a5a',
          }}>
            NO EVENTS MATCH CURRENT PARAMETERS
          </div>
        ) : (
          sorted.map((event) => (
            <EventRow
              key={event.event_id_cnty}
              event={event}
              onClick={() => onEventClick?.(event)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EventRow({ event, onClick }) {
  const [hovered, setHovered] = React.useState(false);
  const eventType = EVENT_TYPES[event.event_type];

  // Impact score color: 8–10 = red, 5–7 = yellow, 0–4 = gray
  const score = event.impact_score ?? 0;
  const impactColor =
    score >= 8 ? '#ef4444' :
    score >= 5 ? '#eab308' :
                 '#6b7280';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:             'grid',
        gridTemplateColumns: '90px 30px 1fr 1fr 36px 28px',
        minHeight:           '32px',
        alignItems:          'center',
        borderBottom:        '1px solid #1e1e30',
        background:          hovered ? '#16161d' : 'transparent',
        cursor:              'pointer',
        transition:          'background 0.1s',
      }}
    >
      {/* Date */}
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize:   '11px',
        color:      '#9ca3af',
        padding:    '0 8px',
        whiteSpace: 'nowrap',
      }}>
        {event.event_date}
      </span>

      {/* Type diamond */}
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          width:       '6px',
          height:      '6px',
          background:  eventType?.color || '#9ca3af',
          transform:   'rotate(45deg)',
          display:     'inline-block',
          flexShrink:  0,
        }} />
      </span>

      {/* Location */}
      <span style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '12px',
        color:         '#e2e4e9',
        padding:       '0 8px',
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        whiteSpace:    'nowrap',
      }}>
        {event.location}
      </span>

      {/* Actor — fall back to actor2 or country if actor1 is Unknown */}
      <span style={{
        fontFamily:   'Inter, sans-serif',
        fontSize:     '11px',
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
        fontFamily: 'JetBrains Mono, monospace',
        fontSize:   '11px',
        fontWeight: 500,
        color:      impactColor,
        padding:    '0 8px',
        textAlign:  'right',
      }}>
        {score}
      </span>

      {/* Source link — ↗ opens primary source URL in new tab */}
      <span
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          paddingRight:   '6px',
        }}
        onClick={(e) => e.stopPropagation()} // don't fire map-select
      >
        {event.source_url ? (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open primary source"
            style={{
              fontFamily:  'Inter, sans-serif',
              fontSize:    '11px',
              color:       '#3b5a8a',
              lineHeight:  1,
              textDecoration: 'none',
              transition:  'color 0.1s',
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
