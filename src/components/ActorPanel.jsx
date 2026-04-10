import React, { useMemo } from 'react';

const LABEL_STYLE = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#738091',    // Blueprint gray2
};

/**
 * ActorPanel
 * ----------
 * Top actors by event frequency. Clicking an actor name filters the feed
 * to that actor's events.
 *
 * Blueprint style: elevated-bg rows (#252a31), left-border accent on selection,
 * Blueprint blue4 for active state.
 */
export function ActorPanel({ events, searchQuery, onSearch }) {
  const topActors = useMemo(() => {
    if (!events || events.length === 0) return [];

    const counts = {};
    events.forEach((e) => {
      if (e.actor1 && e.actor1 !== 'Unknown')
        counts[e.actor1] = (counts[e.actor1] || 0) + 1;
      if (e.actor2 && e.actor2 !== 'Unknown')
        counts[e.actor2] = (counts[e.actor2] || 0) + 1;
    });

    const sorted   = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const maxCount = sorted[0]?.[1] || 1;
    return sorted.map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / maxCount) * 100),
    }));
  }, [events]);

  if (topActors.length === 0) return null;

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>ACTIVE ENTITIES</div>

      {topActors.map(({ name, count, pct }) => {
        const isActive = searchQuery === name;
        return (
          <div
            key={name}
            onClick={() => onSearch(isActive ? '' : name)}
            title={isActive ? 'Clear actor filter' : `Filter to ${name}`}
            style={{
              padding:      '5px 8px',
              marginBottom: '3px',
              cursor:       'pointer',
              background:   isActive ? '#1e3048' : '#252a31',   // Blueprint elevated / primary tint
              border:       `1px solid ${isActive ? '#4c90f040' : '#383e47'}`,
              borderLeft:   `3px solid ${isActive ? '#4c90f0' : 'transparent'}`,
              borderRadius: '2px',
              transition:   'all 0.12s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background      = '#2f343c';
                e.currentTarget.style.borderLeftColor = '#4c90f040';
                e.currentTarget.style.borderColor     = '#404854';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background      = '#252a31';
                e.currentTarget.style.borderLeftColor = 'transparent';
                e.currentTarget.style.borderColor     = '#383e47';
              }
            }}
          >
            {/* Name + count */}
            <div style={{
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
              marginBottom:   '4px',
            }}>
              <span style={{
                fontFamily:   'Inter, sans-serif',
                fontSize:     '11px',
                color:        isActive ? '#f6f7f9' : '#abb3bf',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
                flex:         1,
                marginRight:  '8px',
              }}>
                {name}
              </span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize:   '9px',
                color:      isActive ? '#4c90f0' : '#5f6b7c',
                flexShrink: 0,
              }}>
                {count}
              </span>
            </div>

            {/* Frequency bar — Blueprint progress track */}
            <div style={{ height: '2px', background: '#383e47', position: 'relative', borderRadius: '1px' }}>
              <div style={{
                position:     'absolute',
                top:          0,
                left:         0,
                height:       '100%',
                width:        `${pct}%`,
                background:   isActive ? '#4c90f0' : '#215db0',  // Blueprint blue4 / blue2
                borderRadius: '1px',
                transition:   'width 0.3s ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
