import React, { useEffect, useState } from 'react';
import { EVENT_TYPES } from '../utils/constants';

/**
 * EventDetailPanel — slide-in drawer from the right edge of the bottom panel.
 * Blueprint dark: elevatedBg (#252a31) surface, Blueprint intent colors.
 * Impact callout uses Blueprint's "callout" pattern (left-border tinted box).
 */
export function EventDetailPanel({ event, onClose, onConfirm, onDismiss }) {
  const [visible,  setVisible]  = useState(false);
  const [feedback, setFeedback] = useState(null); // null | 'confirmed' | 'noise'

  useEffect(() => {
    if (event) {
      requestAnimationFrame(() => setVisible(true));
      setFeedback(null); // reset on new event
    } else {
      setVisible(false);
    }
  }, [event]);

  if (!event) return null;

  const eventType = EVENT_TYPES[event.event_type];
  const score     = event.impact_score ?? 0;

  const impactColor =
    score >= 8 ? '#e76a6e' :  // Blueprint red4
    score >= 5 ? '#fbb360' :  // Blueprint orange5
                 '#738091';   // Blueprint gray2

  const tone      = event.avg_tone ?? 0;
  const toneColor = tone < -5 ? '#e76a6e' : tone < 0 ? '#ec9a3c' : '#32a467';
  const toneStr   = `${tone > 0 ? '+' : ''}${tone.toFixed(1)}`;

  const goldstein = event.goldstein_scale ?? 0;
  const gStr      = `${goldstein > 0 ? '+' : ''}${goldstein.toFixed(1)}`;

  return (
    <div style={{
      position:      'absolute',
      top:           0,
      right:         0,
      bottom:        0,
      width:         '340px',
      background:    '#1c2127',    // Blueprint panelBg
      borderLeft:    '1px solid #2f343c',
      display:       'flex',
      flexDirection: 'column',
      zIndex:        500,
      transform:     visible ? 'translateX(0)' : 'translateX(100%)',
      transition:    'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      overflow:      'hidden',
      boxShadow:     '-4px 0 16px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        height:         '34px',
        minHeight:      '34px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0 12px 0 14px',
        borderBottom:   '1px solid #383e47',
        flexShrink:     0,
        background:     '#1c2127',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div style={{
            width:      '5px',
            height:     '5px',
            background: eventType?.color || '#738091',
            transform:  'rotate(45deg)',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color:         eventType?.color || '#738091',
          }}>
            {event.sub_event_type || event.event_type}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background:   'transparent',
            border:       'none',
            color:        '#738091',
            cursor:       'pointer',
            fontSize:     '16px',
            lineHeight:   1,
            padding:      '0 2px',
            fontFamily:   'Inter, sans-serif',
            transition:   'color 0.15s',
            borderRadius: '2px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#f6f7f9')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#738091')}
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
          color:        '#f6f7f9',
          lineHeight:   1.3,
          marginBottom: '4px',
        }}>
          {event.location}
        </div>
        <div style={{
          fontFamily:    'JetBrains Mono, monospace',
          fontSize:      '10px',
          color:         '#5f6b7c',
          marginBottom:  '16px',
          letterSpacing: '0.04em',
        }}>
          {event.event_date}
          {event.country && event.country !== event.location ? ` · ${event.country}` : ''}
        </div>

        {/* SAT corroboration callout — shown when FIRMS data confirms event */}
        {event.satellite_corroborated && (
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '10px',
            marginBottom: '10px',
            padding:      '10px 12px',
            background:   '#32a4670d',
            border:       '1px solid #32a46725',
            borderLeft:   '3px solid #32a467',
            borderRadius: '2px',
          }}>
            <div>
              <div style={{
                fontFamily:    'Inter, sans-serif',
                fontSize:      '9px',
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color:         '#32a467',
                marginBottom:  '2px',
              }}>
                SAT CORROBORATED
              </div>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize:   '10px',
                color:      '#abb3bf',
                lineHeight: 1.5,
              }}>
                {event.firms_detections} thermal detection{event.firms_detections !== 1 ? 's' : ''} within 25km
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ ...metaLabelStyle, marginBottom: '2px' }}>MAX FRP</div>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize:   '13px',
                fontWeight: 600,
                color:      '#ec9a3c',
              }}>
                {event.firms_max_frp}<span style={{ fontSize: '9px', color: '#5f6b7c' }}> MW</span>
              </div>
            </div>
          </div>
        )}

        {/* Impact callout — Blueprint callout pattern */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '8px',
          marginBottom: '16px',
          padding:      '10px 12px',
          background:   `${impactColor}0d`,    // very subtle tint (5%)
          border:       `1px solid ${impactColor}25`,
          borderLeft:   `3px solid ${impactColor}`,
          borderRadius: '2px',
        }}>
          <div>
            <div style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         '#738091',
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
              {score}<span style={{ fontSize: '12px', color: '#5f6b7c' }}>/10</span>
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
          <MetaField label="MENTIONS"  value={(event.num_mentions ?? 0).toLocaleString()} mono />
          <MetaField label="SOURCES"   value={(event.num_sources ?? 0).toLocaleString()}  mono />
          <MetaField label="AVG TONE"  value={toneStr} mono valueColor={toneColor}
            tooltip="Media tone toward the event. Negative = hostile/conflict framing." />
          <MetaField label="SUB-EVENT" value={event.sub_event_type || '—'} />
        </div>

        {/* Notes — Blueprint callout box */}
        {event.notes && (
          <>
            <SectionLabel>NOTES</SectionLabel>
            <div style={{
              fontFamily:   'Inter, sans-serif',
              fontSize:     '11px',
              color:        '#abb3bf',
              lineHeight:   '1.6',
              marginBottom: '16px',
              padding:      '10px',
              background:   '#252a31',
              border:       '1px solid #383e47',
              borderRadius: '2px',
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
              fontFamily:    'JetBrains Mono, monospace',
              fontSize:      '10px',
              color:         '#5f6b7c',
              marginBottom:  '16px',
              letterSpacing: '0.03em',
            }}>
              {Number(event.latitude).toFixed(4)}° N &nbsp; {Number(event.longitude).toFixed(4)}° E
            </div>
          </>
        )}

        {/* Analyst Feedback */}
        <SectionLabel>ANALYST ASSESSMENT</SectionLabel>
        {feedback ? (
          // Post-submission state — show which verdict was recorded
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '8px',
            marginBottom: '16px',
            padding:      '8px 12px',
            background:   feedback === 'confirmed' ? '#32a4670d' : '#e76a6e0d',
            border:       `1px solid ${feedback === 'confirmed' ? '#32a46725' : '#e76a6e25'}`,
            borderLeft:   `3px solid ${feedback === 'confirmed' ? '#32a467' : '#e76a6e'}`,
            borderRadius: '2px',
          }}>
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         feedback === 'confirmed' ? '#32a467' : '#e76a6e',
            }}>
              {feedback === 'confirmed' ? '✓ CONFIRMED AS VALID SIGNAL' : '✕ MARKED AS NOISE'}
            </span>
            <button
              onClick={() => setFeedback(null)}
              style={{
                marginLeft:   'auto',
                background:   'transparent',
                border:       'none',
                cursor:       'pointer',
                fontFamily:   'Inter, sans-serif',
                fontSize:     '9px',
                color:        '#5f6b7c',
                padding:      '0',
                letterSpacing: '0.04em',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#abb3bf')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#5f6b7c')}
            >
              UNDO
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
            {/* CONFIRM button */}
            <button
              onClick={() => {
                setFeedback('confirmed');
                onConfirm?.(event.event_id_cnty);
              }}
              style={{
                flex:          1,
                display:       'flex',
                alignItems:    'center',
                justifyContent:'center',
                gap:           '5px',
                padding:       '7px 10px',
                background:    '#32a4670d',
                border:        '1px solid #32a46730',
                borderRadius:  '2px',
                cursor:        'pointer',
                fontFamily:    'Inter, sans-serif',
                fontSize:      '9px',
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color:         '#32a467',
                transition:    'all 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background   = '#32a46720';
                e.currentTarget.style.borderColor  = '#32a46750';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background   = '#32a4670d';
                e.currentTarget.style.borderColor  = '#32a46730';
              }}
            >
              <span>✓</span> CONFIRM VALID
            </button>
            {/* NOISE button */}
            <button
              onClick={() => {
                setFeedback('noise');
                onDismiss?.(event.event_id_cnty);
                setTimeout(onClose, 600); // brief pause so user sees the state change
              }}
              style={{
                flex:          1,
                display:       'flex',
                alignItems:    'center',
                justifyContent:'center',
                gap:           '5px',
                padding:       '7px 10px',
                background:    '#e76a6e0d',
                border:        '1px solid #e76a6e30',
                borderRadius:  '2px',
                cursor:        'pointer',
                fontFamily:    'Inter, sans-serif',
                fontSize:      '9px',
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color:         '#e76a6e',
                transition:    'all 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background   = '#e76a6e20';
                e.currentTarget.style.borderColor  = '#e76a6e50';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background   = '#e76a6e0d';
                e.currentTarget.style.borderColor  = '#e76a6e30';
              }}
            >
              <span>✕</span> MARK AS NOISE
            </button>
          </div>
        )}

        {/* Source link — Blueprint "intent" button style */}
        {event.source_url ? (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '8px 12px',
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
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         '#4c90f0',   // Blueprint blue4
            }}>
              VIEW PRIMARY SOURCE
            </span>
            <span style={{ color: '#4c90f0', fontSize: '12px' }}>↗</span>
          </a>
        ) : (
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '8px 12px',
            background:     '#1c2127',
            border:         '1px solid #2f343c',
            borderLeft:     '3px solid #383e47',
            borderRadius:   '2px',
          }}>
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         '#5f6b7c',   // Blueprint gray1 — muted
            }}>
              SOURCE UNAVAILABLE
            </span>
            <span style={{
              fontFamily:  'Inter, sans-serif',
              fontSize:    '8px',
              color:       '#404854',
              letterSpacing: '0.04em',
            }}>
              ROOT DOMAIN ONLY
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const metaLabelStyle = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#738091',
};

function SectionLabel({ children }) {
  return (
    <div style={{
      ...metaLabelStyle,
      marginBottom:  '8px',
      paddingBottom: '5px',
      borderBottom:  '1px solid #383e47',
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
        color:        valueColor || '#abb3bf',
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
