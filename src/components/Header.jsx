import React, { useState, useEffect } from 'react';

/**
 * Header — 48px fixed bar.
 * Left:  ARGUS wordmark.
 * Right: live stats (events, sources, countries) + zulu timestamp.
 *
 * GDELT does not publish fatality counts; we surface media source count
 * instead — the density of independent outlets corroborates event severity
 * and reflects OSINT tradecraft (triangulating across sources).
 */
export function Header({ stats, fetchedAt }) {
  const [zuluTime,   setZuluTime]   = useState('');
  const [refreshAge, setRefreshAge] = useState('—');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h   = String(now.getUTCHours()).padStart(2, '0');
      const m   = String(now.getUTCMinutes()).padStart(2, '0');
      const s   = String(now.getUTCSeconds()).padStart(2, '0');
      setZuluTime(`${h}:${m}:${s}Z`);

      // Compute time since last GDELT cache fill
      if (fetchedAt) {
        const elapsedMs  = Date.now() - fetchedAt;
        const elapsedMin = Math.floor(elapsedMs / 60000);
        const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
        setRefreshAge(elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec}s ago` : `${elapsedSec}s ago`);
      } else {
        setRefreshAge('—');
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  return (
    <div style={{
      height:     '48px',
      minHeight:  '48px',
      background: '#0a0a0f',
      borderBottom: '1px solid #1e1e30',
      display:    'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding:    '0 16px',
      flexShrink: 0,
    }}>
      {/* Wordmark */}
      <span style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '14px',
        fontWeight:    600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color:         '#e2e4e9',
      }}>
        ARGUS
      </span>

      {/* Right stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
        <StatCell label="EVENTS"      value={(stats?.totalEvents ?? 0).toLocaleString()} valueColor="#e2e4e9" />
        <Divider />
        <StatCell label="SOURCES"     value={(stats?.totalSources ?? 0).toLocaleString()} valueColor="#10b981" />
        <Divider />
        <StatCell label="COUNTRIES"   value={stats?.countriesAffected ?? 0}              valueColor="#e2e4e9" />
        <Divider />
        <StatCell label="LAST REFRESH" value={refreshAge}                                valueColor="#6b7280" mono />
        <Divider />
        <StatCell label="ZULU TIME"   value={zuluTime}                                   valueColor="#9ca3af" mono />
      </div>
    </div>
  );
}

function StatCell({ label, value, valueColor, mono }) {
  return (
    <div style={{ padding: '0 16px', textAlign: 'right' }}>
      <div style={{
        fontFamily:    'Inter, sans-serif',
        fontSize:      '10px',
        fontWeight:    500,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color:         '#6b7280',
        marginBottom:  '1px',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize:   '13px',
        fontWeight: 600,
        color:      valueColor,
      }}>
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      width:      '1px',
      height:     '28px',
      background: '#1e1e30',
      flexShrink: 0,
    }} />
  );
}
