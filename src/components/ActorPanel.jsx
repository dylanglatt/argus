import React, { useMemo } from 'react';

const LABEL_STYLE = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#4a4a6a',
};

/**
 * ActorPanel
 * ----------
 * Surfaces the most frequently appearing actors in the current filtered
 * event set. Clicking an actor name adds it to the search query, letting
 * the analyst drill into that actor's activity instantly.
 *
 * Entity-level intelligence on top of event-level data — the analyst can
 * see at a glance who is most active, not just where events are occurring.
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

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);

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
      <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>
        ACTIVE ENTITIES
      </div>

      {topActors.map(({ name, count, pct }) => {
        const isActive = searchQuery === name;
        return (
          <div
            key={name}
            onClick={() => onSearch(isActive ? '' : name)}
            title={isActive ? 'Clear actor filter' : `Filter to ${name}`}
            style={{
              padding:      '4px 8px',
              marginBottom: '3px',
              cursor:       'pointer',
              border:       `1px solid ${isActive ? '#3b82f640' : '#1e1e30'}`,
              borderLeft:   `3px solid ${isActive ? '#3b82f6' : 'transparent'}`,
              background:   isActive ? '#0d1526' : '#0d0d14',
              transition:   'all 0.12s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background    = '#16161d';
                e.currentTarget.style.borderLeftColor = '#3b82f640';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background    = '#0d0d14';
                e.currentTarget.style.borderLeftColor = 'transparent';
              }
            }}
          >
            {/* Name + count */}
            <div style={{
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
              marginBottom:   '3px',
            }}>
              <span style={{
                fontFamily:   'Inter, sans-serif',
                fontSize:     '11px',
                color:        isActive ? '#e2e4e9' : '#9ca3af',
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
                color:      isActive ? '#3b82f6' : '#4a4a6a',
                flexShrink: 0,
              }}>
                {count}
              </span>
            </div>
            {/* Frequency bar */}
            <div style={{ height: '2px', background: '#1e1e30', position: 'relative' }}>
              <div style={{
                position:   'absolute',
                top:        0,
                left:       0,
                height:     '100%',
                width:      `${pct}%`,
                background: isActive ? '#3b82f6' : '#2a3a5a',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
