import React, { useState, useRef, useEffect } from 'react';
import { EVENT_TYPES } from '../utils/constants';

const LABEL_STYLE = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '10px',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color:         '#6b7280',
};

const SECTION_GAP = { marginBottom: '20px' };

/**
 * FilterPanel — 320px fixed left panel.
 *
 * Filters:
 *   - Free-text search (location, actor, notes, country)
 *   - Event type classification toggles
 *   - Region / country multi-select (derived dynamically from event data)
 *   - Temporal range (date pickers)
 *   - Min conflict severity (0–10, inverted Goldstein Scale)
 *
 * Props:
 *   filters            - current filter state
 *   onFilterChange     - (newFilters) => void
 *   availableCountries - string[] derived from loaded events
 */
export function FilterPanel({ filters, onFilterChange, availableCountries = [] }) {
  const [countrySearch,       setCountrySearch]       = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowCountryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleEventType = (key) => {
    const next = filters.eventTypes.includes(key)
      ? filters.eventTypes.filter((t) => t !== key)
      : [...filters.eventTypes, key];
    onFilterChange({ ...filters, eventTypes: next });
  };

  const toggleCountry = (country) => {
    const next = filters.countries.includes(country)
      ? filters.countries.filter((c) => c !== country)
      : [...filters.countries, country];
    onFilterChange({ ...filters, countries: next });
  };

  const handleReset = () => {
    onFilterChange({
      eventTypes:  [],
      countries:   [],
      dateRange:   { start: null, end: null },
      impactMin:   0,
      searchQuery: '',
    });
    setCountrySearch('');
  };

  const filteredCountries = availableCountries.filter((c) =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const impactMin = filters.impactMin ?? 0;

  return (
    <div style={{
      width:         '320px',
      minWidth:      '320px',
      background:    '#0a0a0f',
      borderRight:   '1px solid #1e1e30',
      overflowY:     'auto',
      display:       'flex',
      flexDirection: 'column',
    }}>
      <div style={{ padding: '16px' }}>

        {/* Panel header */}
        <div style={{ ...LABEL_STYLE, marginBottom: '16px' }}>PARAMETERS</div>

        {/* Search */}
        <div style={SECTION_GAP}>
          <input
            type="text"
            placeholder="QUERY TARGET..."
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
            style={{
              width:         '100%',
              boxSizing:     'border-box',
              background:    '#0d0d14',
              border:        '1px solid #1e1e30',
              borderRadius:  0,
              padding:       '7px 10px',
              fontFamily:    'Inter, sans-serif',
              fontSize:      '11px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color:         '#9ca3af',
              outline:       'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
            onBlur={(e)  => (e.target.style.borderColor = '#1e1e30')}
          />
        </div>

        {/* Classifications */}
        <div style={SECTION_GAP}>
          <div style={{ ...LABEL_STYLE, marginBottom: '10px' }}>CLASSIFICATIONS</div>
          <div>
            {Object.entries(EVENT_TYPES).map(([key, type]) => {
              const active = filters.eventTypes.length === 0 || filters.eventTypes.includes(key);
              return (
                <div
                  key={key}
                  onClick={() => toggleEventType(key)}
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'space-between',
                    height:         '32px',
                    padding:        '0 8px',
                    cursor:         'pointer',
                    border:         '1px solid #1e1e30',
                    marginBottom:   '4px',
                    opacity:        active ? 1 : 0.35,
                    transition:     'opacity 0.15s, background 0.15s',
                    background:     filters.eventTypes.includes(key) ? '#16161d' : 'transparent',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#16161d')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = filters.eventTypes.includes(key) ? '#16161d' : 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width:      '6px',
                      height:     '6px',
                      background: type.color,
                      transform:  'rotate(45deg)',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize:   '12px',
                      fontWeight: 400,
                      color:      '#e2e4e9',
                    }}>
                      {type.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Regions */}
        <div style={SECTION_GAP} ref={dropdownRef}>
          <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>
            REGIONS ({filters.countries.length})
          </div>

          {/* Selected country pills */}
          {filters.countries.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {filters.countries.map((c) => (
                <span
                  key={c}
                  onClick={() => toggleCountry(c)}
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize:   '10px',
                    color:      '#9ca3af',
                    border:     '1px solid #1e1e30',
                    padding:    '2px 6px',
                    cursor:     'pointer',
                    background: '#16161d',
                  }}
                >
                  {c} ×
                </span>
              ))}
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Add region..."
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              style={{
                width:        '100%',
                boxSizing:    'border-box',
                background:   '#0d0d14',
                border:       '1px solid #1e1e30',
                borderRadius: 0,
                padding:      '7px 10px',
                fontFamily:   'Inter, sans-serif',
                fontSize:     '11px',
                color:        '#9ca3af',
                outline:      'none',
              }}
              onFocus={(e) => { setShowCountryDropdown(true); e.target.style.borderColor = '#3b82f6'; }}
              onBlur={(e)  => (e.target.style.borderColor = '#1e1e30')}
            />
            {showCountryDropdown && filteredCountries.length > 0 && (
              <div style={{
                position:  'absolute',
                top:       '100%',
                left:      0,
                right:     0,
                background: '#0d0d14',
                border:    '1px solid #1e1e30',
                borderTop: 'none',
                maxHeight: '160px',
                overflowY: 'auto',
                zIndex:    100,
              }}>
                {filteredCountries.map((country) => (
                  <div
                    key={country}
                    onClick={() => { toggleCountry(country); setCountrySearch(''); }}
                    style={{
                      padding:      '6px 10px',
                      fontFamily:   'Inter, sans-serif',
                      fontSize:     '11px',
                      color:        filters.countries.includes(country) ? '#e2e4e9' : '#9ca3af',
                      background:   filters.countries.includes(country) ? '#16161d' : 'transparent',
                      cursor:       'pointer',
                      borderBottom: '1px solid #1e1e30',
                      display:      'flex',
                      alignItems:   'center',
                      gap:          '6px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#16161d')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = filters.countries.includes(country) ? '#16161d' : 'transparent')}
                  >
                    {filters.countries.includes(country) && (
                      <span style={{ color: '#3b82f6', fontSize: '9px' }}>✓</span>
                    )}
                    {country}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Date Range */}
        <div style={SECTION_GAP}>
          <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>TEMPORAL RANGE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <input
              type="date"
              value={filters.dateRange.start || ''}
              onChange={(e) => onFilterChange({ ...filters, dateRange: { ...filters.dateRange, start: e.target.value } })}
              style={{
                width:        '100%',
                boxSizing:    'border-box',
                background:   '#0d0d14',
                border:       '1px solid #1e1e30',
                borderRadius: 0,
                padding:      '7px 10px',
                fontFamily:   'JetBrains Mono, monospace',
                fontSize:     '11px',
                color:        '#9ca3af',
                outline:      'none',
                colorScheme:  'dark',
              }}
            />
            <input
              type="date"
              value={filters.dateRange.end || ''}
              onChange={(e) => onFilterChange({ ...filters, dateRange: { ...filters.dateRange, end: e.target.value } })}
              style={{
                width:        '100%',
                boxSizing:    'border-box',
                background:   '#0d0d14',
                border:       '1px solid #1e1e30',
                borderRadius: 0,
                padding:      '7px 10px',
                fontFamily:   'JetBrains Mono, monospace',
                fontSize:     '11px',
                color:        '#9ca3af',
                outline:      'none',
                colorScheme:  'dark',
              }}
            />
          </div>
        </div>

        {/* Min conflict severity (Goldstein-derived impact score 0–10) */}
        <div style={SECTION_GAP}>
          <div style={{
            ...LABEL_STYLE,
            marginBottom: '8px',
            display:      'flex',
            justifyContent: 'space-between',
            alignItems:   'center',
          }}>
            <span>MIN CONFLICT SEVERITY</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#e2e4e9' }}>
              {impactMin}/10
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="1"
            value={impactMin}
            onChange={(e) => onFilterChange({ ...filters, impactMin: parseInt(e.target.value, 10) || 0 })}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color:         '#6b7280',
            }}>
              LOW
            </span>
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color:         '#ef4444',
              border:        '1px solid #ef444440',
              padding:       '1px 5px',
            }}>
              GOLDSTEIN SCALE
            </span>
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color:         '#6b7280',
            }}>
              HIGH
            </span>
          </div>
        </div>

        {/* Reset */}
        <button
          onClick={handleReset}
          style={{
            width:         '100%',
            background:    '#0d0d14',
            border:        '1px solid #1e1e30',
            borderRadius:  0,
            padding:       '8px',
            fontFamily:    'Inter, sans-serif',
            fontSize:      '10px',
            fontWeight:    600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color:         '#6b7280',
            cursor:        'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e2e4e9'; e.currentTarget.style.borderColor = '#3a3a50'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = '#1e1e30'; }}
        >
          RESET ALL FILTERS
        </button>

        {/* Source bias notice */}
        <div style={{
          marginTop:  '20px',
          padding:    '8px 10px',
          border:     '1px solid #1e1e3088',
          background: '#0d0d1488',
        }}>
          <div style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color:         '#4a4a6a',
            marginBottom:  '4px',
          }}>
            SOURCE BIAS NOTICE
          </div>
          <div style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   '10px',
            color:      '#4a4a5a',
            lineHeight: '1.5',
          }}>
            GDELT indexes English-language news. US, UK, and Western Europe events are overrepresented relative to ground truth. Filter by region and cross-reference primary sources when assessing event density.
          </div>
        </div>

      </div>
    </div>
  );
}
