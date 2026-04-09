import React, { useState, useRef, useEffect } from 'react';
import { EVENT_TYPES } from '../utils/constants';
import { HotZones } from './HotZones';
import { CountryBrief } from './CountryBrief';

const LABEL_STYLE = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#4a4a6a',
};

const SECTION_GAP = { marginBottom: '20px' };

const INPUT_STYLE = {
  width:         '100%',
  boxSizing:     'border-box',
  background:    '#0d0d14',
  border:        '1px solid #1e1e30',
  borderRadius:  0,
  padding:       '7px 10px',
  fontFamily:    'Inter, sans-serif',
  fontSize:      '11px',
  color:         '#9ca3af',
  outline:       'none',
};

/**
 * FilterPanel — 280px fixed left panel.
 *
 * Filters:
 *   - Free-text search (location, actor, notes, country)
 *   - Event type classification toggles
 *   - Region / country multi-select (derived dynamically from event data)
 *   - Temporal range (date pickers)
 *   - Min conflict severity (0–10, inverted Goldstein Scale)
 */
export function FilterPanel({ filters, onFilterChange, availableCountries = [], allEvents = [], briefCountry, onSelectCountry, onCloseBrief }) {
  const [countrySearch,       setCountrySearch]       = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [biasExpanded,        setBiasExpanded]        = useState(false);
  const dropdownRef = useRef(null);

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
  const activeTypeCount = filters.eventTypes.length;
  const activeRegionCount = filters.countries.length;

  return (
    <div style={{
      width:         '280px',
      minWidth:      '280px',
      background:    '#0a0a0f',
      borderRight:   '1px solid #1e1e30',
      overflowY:     'auto',
      display:       'flex',
      flexDirection: 'column',
      position:      'relative',
    }}>

      {/* Country Brief overlay — slides over filter content when a country is selected */}
      {briefCountry && (
        <CountryBrief
          country={briefCountry}
          events={allEvents}
          onClose={onCloseBrief}
        />
      )}
      <div style={{ padding: '14px 14px 20px' }}>

        {/* Panel header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   '16px',
          paddingBottom:  '10px',
          borderBottom:   '1px solid #1e1e30',
        }}>
          <span style={{ ...LABEL_STYLE, color: '#6b7280' }}>PARAMETERS</span>
          {(activeTypeCount > 0 || activeRegionCount > 0 || filters.searchQuery || impactMin > 0) && (
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              color:         '#3b82f6',
              border:        '1px solid #3b82f640',
              padding:       '2px 6px',
              letterSpacing: '0.05em',
            }}>
              FILTERED
            </span>
          )}
        </div>

        {/* Search */}
        <div style={SECTION_GAP}>
          <div style={{ ...LABEL_STYLE, marginBottom: '6px' }}>SEARCH</div>
          <input
            type="text"
            placeholder="Locations, actors, keywords..."
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
            style={{ ...INPUT_STYLE, letterSpacing: '0' }}
            onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
            onBlur={(e)  => (e.target.style.borderColor = '#1e1e30')}
          />
        </div>

        {/* Separator */}
        <div style={{ borderTop: '1px solid #1e1e30', marginBottom: '20px' }} />

        {/* Classifications */}
        <div style={SECTION_GAP}>
          <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>
            CLASSIFICATION
            {activeTypeCount > 0 && (
              <span style={{ color: '#3b82f6', marginLeft: '6px' }}>({activeTypeCount})</span>
            )}
          </div>
          <div>
            {Object.entries(EVENT_TYPES).map(([key, type]) => {
              const isActive = filters.eventTypes.length === 0 || filters.eventTypes.includes(key);
              const isSelected = filters.eventTypes.includes(key);
              return (
                <div
                  key={key}
                  onClick={() => toggleEventType(key)}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    height:     '30px',
                    padding:    '0 8px',
                    cursor:     'pointer',
                    border:     `1px solid ${isSelected ? type.color + '40' : '#1e1e30'}`,
                    borderLeft: `3px solid ${isSelected ? type.color : 'transparent'}`,
                    marginBottom: '3px',
                    opacity:    isActive ? 1 : 0.3,
                    transition: 'all 0.15s',
                    background: isSelected ? `${type.color}10` : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#16161d'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? `${type.color}10` : 'transparent'; }}
                >
                  <div style={{
                    width:      '5px',
                    height:     '5px',
                    background: type.color,
                    transform:  'rotate(45deg)',
                    flexShrink: 0,
                    marginRight: '8px',
                  }} />
                  <span style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize:   '11px',
                    fontWeight: isSelected ? 500 : 400,
                    color:      isSelected ? '#e2e4e9' : '#9ca3af',
                    flex:       1,
                  }}>
                    {type.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Separator */}
        <div style={{ borderTop: '1px solid #1e1e30', marginBottom: '20px' }} />

        {/* Regions */}
        <div style={SECTION_GAP} ref={dropdownRef}>
          <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>
            REGION FOCUS
            {activeRegionCount > 0 && (
              <span style={{ color: '#3b82f6', marginLeft: '6px' }}>({activeRegionCount})</span>
            )}
          </div>

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
                    border:     '1px solid #3b82f640',
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
              placeholder="Add country..."
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              style={{ ...INPUT_STYLE }}
              onFocus={(e) => { setShowCountryDropdown(true); e.target.style.borderColor = '#3b82f6'; }}
              onBlur={(e)  => (e.target.style.borderColor = '#1e1e30')}
            />
            {showCountryDropdown && filteredCountries.length > 0 && (
              <div style={{
                position:   'absolute',
                top:        '100%',
                left:       0,
                right:      0,
                background: '#0d0d14',
                border:     '1px solid #1e1e30',
                borderTop:  'none',
                maxHeight:  '160px',
                overflowY:  'auto',
                zIndex:     100,
              }}>
                {filteredCountries.map((country) => (
                  <div
                    key={country}
                    onMouseDown={() => { toggleCountry(country); setCountrySearch(''); }}
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

        {/* Separator */}
        <div style={{ borderTop: '1px solid #1e1e30', marginBottom: '20px' }} />

        {/* Date Range */}
        <div style={SECTION_GAP}>
          <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>TEMPORAL RANGE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <input
              type="date"
              value={filters.dateRange.start || ''}
              onChange={(e) => onFilterChange({ ...filters, dateRange: { ...filters.dateRange, start: e.target.value } })}
              style={{ ...INPUT_STYLE, fontFamily: 'JetBrains Mono, monospace', colorScheme: 'dark' }}
            />
            <input
              type="date"
              value={filters.dateRange.end || ''}
              onChange={(e) => onFilterChange({ ...filters, dateRange: { ...filters.dateRange, end: e.target.value } })}
              style={{ ...INPUT_STYLE, fontFamily: 'JetBrains Mono, monospace', colorScheme: 'dark' }}
            />
          </div>
        </div>

        {/* Separator */}
        <div style={{ borderTop: '1px solid #1e1e30', marginBottom: '20px' }} />

        {/* Min conflict severity */}
        <div style={SECTION_GAP}>
          <div style={{
            ...LABEL_STYLE,
            marginBottom:   '8px',
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'center',
          }}>
            <span>MIN SEVERITY</span>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   '10px',
              color:      impactMin >= 7 ? '#ef4444' : impactMin >= 4 ? '#eab308' : '#6b7280',
              border:     '1px solid #1e1e30',
              padding:    '1px 5px',
            }}>
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
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ ...LABEL_STYLE, fontSize: '9px' }}>LOW</span>
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color:         '#ef444460',
            }}>
              GOLDSTEIN SCALE
            </span>
            <span style={{ ...LABEL_STYLE, fontSize: '9px', color: '#ef444499' }}>HIGH</span>
          </div>
        </div>

        {/* Separator */}
        <div style={{ borderTop: '1px solid #1e1e30', marginBottom: '20px' }} />

        {/* Hot Zones — escalation detection */}
        <HotZones events={allEvents} onSelectCountry={onSelectCountry} />

        {/* Reset */}
        <button
          onClick={handleReset}
          style={{
            width:         '100%',
            background:    'transparent',
            border:        '1px solid #1e1e30',
            borderRadius:  0,
            padding:       '8px',
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color:         '#4a4a6a',
            cursor:        'pointer',
            transition:    'all 0.15s',
            marginBottom:  '16px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e2e4e9'; e.currentTarget.style.borderColor = '#3a3a50'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#4a4a6a'; e.currentTarget.style.borderColor = '#1e1e30'; }}
        >
          RESET ALL FILTERS
        </button>

        {/* Source bias notice — collapsible */}
        <div style={{
          border:     '1px solid #1e1e30',
          background: '#0d0d14',
        }}>
          <div
            onClick={() => setBiasExpanded((v) => !v)}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '7px 10px',
              cursor:         'pointer',
            }}
          >
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         '#4a4a6a',
            }}>
              ⚠ SOURCE BIAS
            </span>
            <span style={{ color: '#4a4a6a', fontSize: '10px' }}>
              {biasExpanded ? '▲' : '▼'}
            </span>
          </div>
          {biasExpanded && (
            <div style={{
              padding:    '0 10px 9px',
              fontFamily: 'Inter, sans-serif',
              fontSize:   '10px',
              color:      '#6b7280',
              lineHeight: '1.55',
              borderTop:  '1px solid #1e1e30',
              paddingTop: '8px',
            }}>
              GDELT indexes English-language news. US, UK, and Western Europe events are overrepresented relative to ground truth. Cross-reference primary sources when assessing event density in underreported regions.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
