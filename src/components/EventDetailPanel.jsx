import React, { useEffect, useState } from 'react';
import { EVENT_TYPES } from '../utils/constants';

/**
 * EventDetailPanel — slide-in drawer from the right edge of the bottom panel.
 * Opens when an event row is clicked. Overlays the TimeChart.
 *
 * Shows full event detail: type, location, actors, scores, notes, source link.
 */
export function EventDetailPanel({ event, onClose }) {
  const [visible, setVisible] = useState(false);

  // Trigger CSS slide-in after mount
  useEffect(() => {
    if (event) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [event]);

  if (!event) return null;

  const eventType = EVENT_TYPES[event.event_type];
  const score     = event.impact_score ?? 0;

  const impactColor =
    score >= 8 ? '#ef4444' :
    score >= 5 ? '#eab308' :
                 '#6b7280';

  const tone     = event.avg_tone ?? 0;
  const toneColor = tone < -5 ? '#ef4444' : tone < 0 ? '#eab308' : '#10b981';
  const toneStr   = `${tone > 0 ? '+' : ''}${tone.toFixed(1)}`;

  const goldstein = event.goldstein_scale ?? 0;
  const gStr      = `${goldstein > 0 ? '+' : ''}${goldstein.toFixed(1)}`;

  return (
    <div style={{
      position:    'absolute',
      top:         0,
      right:       0,
      bottom:      0,
      width:       '340px',
      background:  '#0a0a0f',
      borderLeft:  '1px solid #1e1e30',
      display:     'flex',
      flexDirection: 'column',
      zIndex:      500,
      transform:   visible ? 'translateX(0)' : 'translateX(100%)',
      transition:  'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      overflow:    'hidden',
    }}>
      {/* Header */}
      <div style={{
        height:         '36px',
        minHeight:      '36px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0 12px 0 14px',
        borderBottom:   '1px solid #1e1e30',
        flexShrink:     0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div style={{
            width:      '5px',
            height:     '5px',
            background: eventType?.color || '#9ca3af',
            transform:  'rotate(45deg)',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color:         eventType?.color || '#6b7280',
          }}>
            {event.sub_event_type || event.event_type}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background:  'transparent',
            border:      'none',
            color:       '#4a4a6a',
            cursor:      'pointer',
            fontSize:    '16px',
            lineHeight:  1,
            padding:     '0 2px',
            fontFamily:  'Inter, sans-serif',
            transition:  'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#e2e4e9')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#4a4a6a')}
        >
          ×
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

        {/* Location */}
        <div style={{
          fontFamily:   'Inter, sans-serif',
          fontSize:     '15px',
          fontWeight:   600,
          color:        '#e2e4e9',
          lineHeight:   1.3,
          marginBottom: '4px',
        }}>
          {event.location}
        </div>
        <div style={{
          fontFamily:    'JetBrains Mono, monospace',
          fontSize:      '10px',
          color:         '#4a4a6a',
          marginBottom:  '16px',
          letterSpacing: '0.04em',
        }}>
          {event.event_date}
          {event.country && event.country !== event.location
            ? ` · ${event.country}`
            : ''}
        </div>

        {/* Impact score — prominent */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '8px',
          marginBottom: '16px',
          padding:      '10px 12px',
          border:       `1px solid ${impactColor}30`,
          background:   `${impactColor}08`,
          borderLeft:   `3px solid ${impactColor}`,
        }}>
          <div>
            <div style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         '#4a4a6a',
              marginBottom:  '2px',
            }}>
              CONFLICT SEVERITY
            </div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   '22px',
              fontWeight: 700,
              color:      impactColor,
              lineHeight: 1,
            }}>
              {score}<span style={{ fontSize: '12px', color: '#4a4a6a' }}>/10</span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ ...metaLabelStyle, marginBottom: '2px' }}>GOLDSTEIN</div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   '13px',
              fontWeight: 600,
              color:      impactColor,
            }}>
              {gStr}
            </div>
          </div>
        </div>

        {/* Actors */}
        <SectionLabel>ACTORS</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          <MetaField label="ACTOR 1" value={event.actor1 !== 'Unknown' ? event.actor1 : '—'} />
          <MetaField label="ACTOR 2" value={(event.actor2 && event.actor2 !== 'Unknown') ? event.actor2 : '—'} />
        </div>

        {/* Signal intelligence */}
        <SectionLabel>SIGNAL INTELLIGENCE</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          <MetaField label="MENTIONS"   value={(event.num_mentions ?? 0).toLocaleString()} mono />
          <MetaField label="SOURCES"    value={(event.num_sources ?? 0).toLocaleString()}  mono />
          <MetaField label="AVG TONE"   value={toneStr}  mono valueColor={toneColor}
            tooltip="Media tone toward the event. Negative = hostile/conflict framing." />
          <MetaField label="SUB-EVENT"  value={event.sub_event_type || '—'} />
        </div>

        {/* Notes */}
        {event.notes && (
          <>
            <SectionLabel>NOTES</SectionLabel>
            <div style={{
              fontFamily:   'Inter, sans-serif',
              fontSize:     '11px',
              color:        '#9ca3af',
              lineHeight:   '1.6',
              marginBottom: '16px',
              padding:      '10px',
              background:   '#0d0d14',
              border:       '1px solid #1e1e30',
            }}>
              {event.notes}
            </div>
          </>
        )}

        {/* Coordinates */}
        {event.latitude && event.longitude && (
          <>
            <SectionLabel>COORDINATES</SectionLabel>
            <div style={{
              fontFamily:   'JetBrains Mono, monospace',
              fontSize:     '10px',
              color:        '#4a4a6a',
              marginBottom: '16px',
              letterSpacing: '0.03em',
            }}>
              {Number(event.latitude).toFixed(4)}° N &nbsp; {Number(event.longitude).toFixed(4)}° E
            </div>
          </>
        )}

        {/* Source link */}
        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '8px 12px',
              border:         '1px solid #1e1e30',
              background:     '#0d0d14',
              textDecoration: 'none',
              transition:     'border-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e1e30')}
          >
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         '#3b82f6',
            }}>
              VIEW PRIMARY SOURCE
            </span>
            <span style={{ color: '#3b82f6', fontSize: '12px' }}>↗</span>
          </a>
        )}
      </div>
    </div>
  );
}

const metaLabelStyle = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#4a4a6a',
};

function SectionLabel({ children }) {
  return (
    <div style={{
      ...metaLabelStyle,
      marginBottom:  '8px',
      paddingBottom: '5px',
      borderBottom:  '1px solid #1e1e30',
    }}>
      {children}
    </div>
  );
}

function MetaField({ label, value, mono, valueColor, tooltip }) {
  return (
    <div title={tooltip} style={{ cursor: tooltip ? 'help' : 'default' }}>
      <div style={{ ...metaLabelStyle, marginBottom: '2px' }}>{label}</div>
      <div style={{
        fontFamily:   mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
        fontSize:     '11px',
        color:        valueColor || '#9ca3af',
        fontWeight:   mono ? 500 : 400,
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        {value || '—'}
      </div>
    </div>
  );
}
