import React from 'react';

export function StatsBar({ stats }) {
  const statCells = [
    {
      label: 'Total Events',
      value: stats.totalEvents || 0,
      color: 'text-slate-100',
    },
    {
      label: 'Total Fatalities',
      value: stats.totalFatalities || 0,
      color: 'text-red-400',
    },
    {
      label: 'Countries Affected',
      value: stats.countriesAffected || 0,
      color: 'text-blue-400',
    },
    {
      label: 'Most Active Actor',
      value: stats.mostActiveActor || 'N/A',
      color: 'text-amber-400',
      truncate: true,
    },
  ];

  return (
    <div className="flex border-b border-slate-800 bg-slate-950">
      {statCells.map((stat, idx) => (
        <div
          key={idx}
          className={`flex-1 border-r border-slate-800 px-6 py-3 last:border-r-0 ${
            idx === statCells.length - 1 ? '' : ''
          }`}
        >
          <div className="text-xs uppercase tracking-widest text-slate-400">
            {stat.label}
          </div>
          <div
            className={`mt-1 font-mono text-lg font-semibold ${stat.color} ${
              stat.truncate ? 'truncate' : ''
            }`}
            title={stat.truncate && typeof stat.value === 'string' ? stat.value : ''}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
