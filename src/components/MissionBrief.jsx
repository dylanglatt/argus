import React, { useState, useEffect } from 'react';

/**
 * WelcomeOverlay — simple orientation screen shown once after boot.
 *
 * No jargon, no hover-to-reveal. Just a clean vertical list explaining
 * what each part of the screen does, readable by anyone.
 * Dismissed via button, ESC, or clicking the backdrop.
 * Persisted to sessionStorage so it only shows once.
 */

const STORAGE_KEY = 'argus_welcome_dismissed';

const SECTIONS = [
  {
    icon:  '◉',
    title: 'Map',
    desc:  'Each dot is a conflict event. Bigger dots are more severe. Colors show the type — red for battles, orange for explosions, and so on. Zoom in to see individual events.',
    color: '#ec9a3c',
  },
  {
    icon:  '☰',
    title: 'Event Feed',
    desc:  'A list of every event on the map. Click any row to see full details — who was involved, where it happened, and how severe it was.',
    color: '#bdadff',
  },
  {
    icon:  '▐',
    title: 'Filters',
    desc:  'The left sidebar lets you narrow things down — by country, event type, date, or severity. Use it to focus on what matters to you.',
    color: '#72ca9b',
  },
  {
    icon:  '▤',
    title: 'Timeline',
    desc:  'The bar chart at the bottom shows how many events happened over time, broken out by type. Useful for spotting surges.',
    color: '#fbb360',
  },
  {
    icon:  '▲',
    title: 'Alerts',
    desc:  'A red banner appears at the top when a country has a sudden spike in conflict. Click the country name to get an AI-generated summary.',
    color: '#e76a6e',
  },
  {
    icon:  '●',
    title: 'Stats',
    desc:  'The header bar shows live numbers — total events, countries affected, and overall conflict tone. Look for the small ? icons to learn what each stat means.',
    color: '#4c90f0',
  },
];

export function MissionBrief({ onDismiss }) {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut]  = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    setFadeOut(true);
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setTimeout(() => onDismiss(), 280);
  };

  return (
    <div
      onClick={handleDismiss}
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         9000,
        background:     'rgba(17, 20, 24, 0.88)',
        backdropFilter: 'blur(6px)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        opacity:        visible && !fadeOut ? 1 : 0,
        transition:     'opacity 0.28s ease',
        cursor:         'pointer',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width:         'min(520px, calc(100vw - 40px))',
          maxHeight:     'calc(100vh - 60px)',
          background:    '#1c2127',
          border:        '1px solid #2f343c',
          borderRadius:  '4px',
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          transform:     visible && !fadeOut ? 'translateY(0)' : 'translateY(10px)',
          transition:    'transform 0.28s ease',
          boxShadow:     '0 16px 48px rgba(0,0,0,0.6)',
          cursor:        'default',
        }}
      >
        {/* Header */}
        <div style={{
          padding:       '20px 24px 16px',
          borderBottom:  '1px solid #2f343c',
        }}>
          <div style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '18px',
            fontWeight:    700,
            color:         '#f6f7f9',
            marginBottom:  '6px',
          }}>
            Welcome to Argus
          </div>
          <div style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   '13px',
            color:      '#8492a6',
            lineHeight: 1.5,
          }}>
            A real-time map of armed conflict around the world. Here's how the screen is organized.
          </div>
        </div>

        {/* Sections */}
        <div style={{
          padding:   '8px 24px 16px',
          overflowY: 'auto',
          flex:      1,
        }}>
          {SECTIONS.map((s, i) => (
            <div
              key={s.title}
              style={{
                display:     'flex',
                gap:         '14px',
                padding:     '14px 0',
                borderBottom: i < SECTIONS.length - 1 ? '1px solid #252a31' : 'none',
              }}
            >
              {/* Color icon */}
              <span style={{
                fontSize:   '14px',
                lineHeight: '22px',
                color:      s.color,
                flexShrink: 0,
                width:      '18px',
                textAlign:  'center',
              }}>
                {s.icon}
              </span>

              <div>
                <div style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize:   '13px',
                  fontWeight: 600,
                  color:      '#f6f7f9',
                  marginBottom: '3px',
                }}>
                  {s.title}
                </div>
                <div style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize:   '12px',
                  color:      '#9caabb',
                  lineHeight: 1.55,
                }}>
                  {s.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding:       '14px 24px',
          borderTop:     '1px solid #2f343c',
          display:       'flex',
          alignItems:    'center',
          justifyContent:'space-between',
        }}>
          <span style={{
            fontFamily:  'Inter, sans-serif',
            fontSize:    '12px',
            fontWeight:  500,
            color:       '#c5cdd9',
            display:     'flex',
            alignItems:  'center',
            gap:         '6px',
          }}>
            <span style={{
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              width:          '16px',
              height:         '16px',
              borderRadius:   '50%',
              border:         '1px solid #4c90f0',
              color:          '#4c90f0',
              fontSize:       '10px',
              fontWeight:     700,
              flexShrink:     0,
            }}>?</span>
            Look for these icons throughout the app for more detail
          </span>

          <button
            onClick={handleDismiss}
            style={{
              background:   '#215db0',
              border:       '1px solid #4c90f040',
              borderRadius: '3px',
              padding:      '8px 20px',
              fontFamily:   'Inter, sans-serif',
              fontSize:     '12px',
              fontWeight:   600,
              color:        '#f6f7f9',
              cursor:       'pointer',
              transition:   'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#2b6ec2'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#215db0'; }}
          >
            Got it
          </button>
        </div>
      </div>

      <EscListener onEsc={handleDismiss} />
    </div>
  );
}

function EscListener({ onEsc }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onEsc(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEsc]);
  return null;
}

export function shouldShowMissionBrief() {
  try {
    return !sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return true;
  }
}
