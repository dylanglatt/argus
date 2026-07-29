import React, { useState, useRef, useEffect } from 'react';

/**
 * InfoHint, contextual tooltip attached to any UI element.
 *
 * Renders a small "?" badge. On hover (desktop) or tap (mobile), a compact
 * tooltip appears with a one-liner explanation. Tooltip auto-positions to
 * avoid overflowing the viewport.
 *
 * Blueprint dark theme: elevated surface (#252a31), border (#383e47),
 * blue accent on active state.
 */
export function InfoHint({ text, position = 'above', width = 220 }) {
  const [show, setShow]       = useState(false);
  const [coords, setCoords]   = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  // Reposition tooltip using fixed viewport coords, escapes all overflow:hidden parents
  useEffect(() => {
    if (!show || !triggerRef.current || !tooltipRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const pad     = 8;

    let top, left;

    if (position === 'above') {
      top  = trigger.top - tooltip.height - 8;
      left = trigger.left + trigger.width / 2 - tooltip.width / 2;
    } else if (position === 'below') {
      top  = trigger.bottom + 8;
      left = trigger.left + trigger.width / 2 - tooltip.width / 2;
    } else if (position === 'left') {
      top  = trigger.top + trigger.height / 2 - tooltip.height / 2;
      left = trigger.left - tooltip.width - 8;
    } else { // right
      top  = trigger.top + trigger.height / 2 - tooltip.height / 2;
      left = trigger.right + 8;
    }

    // Clamp to viewport edges
    if (left < pad) left = pad;
    if (left + tooltip.width > window.innerWidth - pad)
      left = window.innerWidth - tooltip.width - pad;
    if (top < pad) top = pad;
    if (top + tooltip.height > window.innerHeight - pad)
      top = window.innerHeight - tooltip.height - pad;

    setCoords({ top, left });
  }, [show, position]);

  return (
    <span
      ref={triggerRef}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }}
      style={{
        position:      'relative',
        display:       'inline-flex',
        alignItems:    'center',
        justifyContent:'center',
        width:         '18px',
        height:        '18px',
        borderRadius:  '50%',
        background:    show ? '#215db040' : '#215db018',
        border:        `1px solid ${show ? '#4c90f0' : '#4c90f055'}`,
        cursor:        'help',
        transition:    'all 0.15s',
        flexShrink:    0,
        marginLeft:    '5px',
        verticalAlign: 'middle',
        boxShadow:     show ? '0 0 6px #4c90f040' : 'none',
      }}
    >
      {/* Question mark */}
      <span style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '10px',
        fontWeight:    700,
        color:         show ? '#8abbff' : '#4c90f0',
        lineHeight:    1,
        transition:    'color 0.15s',
        userSelect:    'none',
      }}>
        ?
      </span>

      {/* Tooltip */}
      {show && (
        <div
          ref={tooltipRef}
          style={{
            position:     'fixed',
            top:          `${coords.top}px`,
            left:         `${coords.left}px`,
            width:        `${width}px`,
            background:   '#252a31',
            border:       '1px solid #383e47',
            borderRadius: '3px',
            padding:      '8px 10px',
            boxShadow:    '0 6px 20px rgba(0,0,0,0.5)',
            zIndex:       8000,
            pointerEvents:'none',
            animation:    'infoHintFadeIn 0.15s ease both',
          }}
        >
          <div style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   '10px',
            fontWeight: 400,
            color:      '#c5cdd9',
            lineHeight: 1.55,
          }}>
            {text}
          </div>
        </div>
      )}

      <style>{`
        @keyframes infoHintFadeIn {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </span>
  );
}
