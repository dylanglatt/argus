import React, { useState } from 'react';
import { EVENT_TYPES } from '../utils/constants';

// Blueprint-style column label
const COL_LABEL = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color:         '#738091',    // Blueprint gray2
  padding:       '0 8px',
  whiteSpace:    'nowrap',
};

// Blueprint minimal button style — subtle bg, 2px radius
const sortBtn = (active) => ({
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

/**
 * EventFeed — scrollable event table, bottom-left panel.
 * Blueprint dark surface (#1c2127) with inner row borders (#383e47).
 *
 * High-impact rows (score ≥ 8) carry a red left-edge accent.
 * Selected row uses a Blueprint primary blue tint.
 */
export function EventFeed({ events, onEventClick, selectedEventId, onDismiss }) {
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
      borderRight:   '1px solid #2f343c',
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
        background:     '#1c2127',
      }}>
        <span style={{
          fontFamily:    'Inter, sans-serif',
          fontSize:      '9px',
          fontWeight:    600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color:         '#738091',
        }}>
          EVENT FEED
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            style={sortBtn(sortBy === 'impact')}
            onClick={() => setSortBy('impact')}
            onMouseEnter={(e) => { if (sortBy !== 'impact') { e.currentTarget.style.background = '#252a31'; e.currentTarget.style.color = '#abb3bf'; }}}
            onMouseLeave={(e) => { if (sortBy !== 'impact') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#738091'; }}}
          >
            IMPACT
          </button>
          <button
            style={sortBtn(sortBy === 'date')}
            onClick={() => setSortBy('date')}
            onMouseEnter={(e) => { if (sortBy !== 'date') { e.currentTarget.style.background = '#252a31'; e.currentTarget.style.color = '#abb3bf'; }}}
            onMouseLeave={(e) => { if (sortBy !== 'date') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#738091'; }}}
          >
            DATE
          </button>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize:   '10px',
            color:      '#5f6b7c',
            marginLeft: '6px',
          }}>
            {events.length.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Column headers — Blueprint table head style */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: '4px 90px 22px 28px 1fr 1fr 38px 26px 22px',
        height:              '24px',
        alignItems:          'center',
        borderBottom:        '1px solid #383e47',
        background:          '#1c2127',
        flexShrink:          0,
      }}>
        <span />
        <span style={COL_LABEL}>DATE</span>
        <span />
        <span />
        <span style={COL_LABEL}>LOCATION</span>
        <span style={COL_LABEL}>ACTOR</span>
        <span style={{ ...COL_LABEL, textAlign: 'right' }}>SCORE</span>
        <span />
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
            color:          '#5f6b7c',
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
              onDismiss={onDismiss ? () => onDismiss(event.event_id_cnty) : null}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EventRow({ event, onClick, isSelected, onDismiss }) {
  const [hovered, setHovered] = React.useState(false);
  const eventType = EVENT_TYPES[event.event_type];

  const score        = event.impact_score ?? 0;
  const isHighImpact = score >= 8;
  const isMedImpact  = score >= 5;

  // Blueprint intent colors for score
  const impactColor =
    isHighImpact ? '#e76a6e' :  // Blueprint red4
    isMedImpact  ? '#fbb360' :  // Blueprint orange5
                   '#5f6b7c';   // Blueprint gray1

  // Left accent bar color
  const accentColor =
    isSelected   ? '#4c90f0' :   // Blueprint blue4
    isHighImpact ? '#e76a6e80' : // Blueprint red4 @ 50%
    'transparent';

  // Row background — Blueprint table row hover pattern
  const bgColor =
    isSelected   ? '#215db020' :  // Blueprint blue2 @ 12%
    hovered      ? '#2f343c' :    // Blueprint dark-gray3 hover
    isHighImpact ? '#2a1a1a' :    // subtle red tint for high impact
    'transparent';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:             'grid',
        gridTemplateColumns: '4px 90px 22px 28px 1fr 1fr 38px 26px 22px',
        minHeight:           '34px',
        alignItems:          'center',
        borderBottom:        `1px solid #383e4766`,  // Blueprint dark-gray4 at 40%
        background:          bgColor,
        cursor:              'pointer',
        transition:          'background 0.1s',
      }}
    >
      {/* Left accent bar */}
      <div style={{
        width:      '3px',
        height:     '100%',
        minHeight:  '34px',
        background: accentColor,
        transition: 'background 0.15s',
      }} />

      {/* Date — Blueprint monospace dim */}
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize:   '10px',
        color:      '#5f6b7c',   // Blueprint gray1
        padding:    '0 6px',
        whiteSpace: 'nowrap',
      }}>
        {event.event_date}
      </span>

      {/* Type indicator — rotated diamond */}
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          width:      '5px',
          height:     '5px',
          background: eventType?.color || '#738091',
          transform:  'rotate(45deg)',
          display:    'inline-block',
          flexShrink: 0,
        }} />
      </span>

      {/* SAT corroboration badge */}
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {event.satellite_corroborated && (
          <span style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '7px',
            fontWeight:    700,
            letterSpacing: '0.04em',
            color:         '#32a467',
            background:    '#32a4671a',
            border:        '1px solid #32a46730',
            borderRadius:  '2px',
            padding:       '1px 3px',
            lineHeight:    1,
          }}>
            SAT
          </span>
        )}
      </span>

      {/* Location — primary text */}
      <span style={{
        fontFamily:   'Inter, sans-serif',
        fontSize:     '11px',
        fontWeight:   500,
        color:        '#f6f7f9',   // Blueprint light-gray5
        padding:      '0 8px',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        {event.location}
      </span>

      {/* Actor — secondary text */}
      <span style={{
        fontFamily:   'Inter, sans-serif',
        fontSize:     '10px',
        color:        event.actor1 === 'Unknown' ? '#5f6b7c' : '#abb3bf',
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
        fontFamily:    'JetBrains Mono, monospace',
        fontSize:      '11px',
        fontWeight:    600,
        color:         impactColor,
        padding:       '0 4px',
        textAlign:     'right',
        letterSpacing: '0.02em',
      }}>
        {score}
      </span>

      {/* Source link */}
      <span
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingRight: '4px' }}
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
              color:          '#215db0',   // Blueprint blue2
              lineHeight:     1,
              textDecoration: 'none',
              transition:     'color 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#4c90f0')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#215db0')}
          >
            ↗
          </a>
        ) : (
          <span style={{ color: '#2f343c', fontSize: '11px' }}>↗</span>
        )}
      </span>

      {/* Dismiss — hover-reveal */}
      <span
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        {onDismiss && hovered ? (
          <button
            onClick={onDismiss}
            title="Mark as noise — remove from feed"
            style={{
              background:   'transparent',
              border:       'none',
              cursor:       'pointer',
              fontFamily:   'Inter, sans-serif',
              fontSize:     '11px',
              color:        '#738091',
              lineHeight:   1,
              padding:      '2px 3px',
              borderRadius: '2px',
              transition:   'color 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e76a6e')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#738091')}
          >
            ✕
          </button>
        ) : <span />}
      </span>
    </div>
  );
}
