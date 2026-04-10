import React, { useState, useRef, useEffect } from 'react';
import { EVENT_TYPES } from '../utils/constants';
import { HotZones } from './HotZones';
import { CountryBrief } from './CountryBrief';
import { ActorPanel } from './ActorPanel';

// Blueprint-style section label
const LABEL_STYLE = {
  fontFamily:    'Inter, sans-serif',
  fontSize:      '9px',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#738091',    // Blueprint gray2
};

const SECTION_GAP = { marginBottom: '20px' };

// Blueprint dark input style — elevated surface, visible border
const INPUT_STYLE = {
  width:        '100%',
  boxSizing:    'border-box',
  background:   '#252a31',     // Blueprint dark-gray2 (elevated)
  border:       '1px solid #383e47',  // Blueprint dark-gray4
  borderRadius: '2px',
  padding:      '7px 10px',
  fontFamily:   'Inter, sans-serif',
  fontSize:     '11px',
  color:        '#abb3bf',     // Blueprint gray4
  outline:      'none',
  transition:   'border-color 0.15s',
};

/**
 * FilterPanel — 280px left panel.
 * Blueprint dark: panelBg surface (#1c2127), elevatedBg inputs (#252a31).
 *
 * Sections:
 *   - Free-text search
 *   - Event type classification toggles (Blueprint-style left-border rows)
 *   - Region multi-select with pill tags
 *   - Temporal range
 *   - Min severity slider
 *   - Hot Zones escalation list
 *   - Active Entities panel
 *   - Source bias callout (Blueprint callout pattern)
 */
export function FilterPanel({
  filters, onFilterChange, availableCountries = [],
  allEvents = [], briefCountry, onSelectCountry, onCloseBrief,
  fullWidth = false,
}) {
  const [countrySearch,       setCountrySearch]       = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [biasExpanded,        setBiasExpanded]        = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setShowCountryDropdown(false);
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
      eventTypes: [], countries: [],
      dateRange: { start: null, end: null },
      impactMin: 0, searchQuery: '',
    });
    setCountrySearch('');
  };

  const filteredCountries = availableCountries.filter((c) =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const impactMin        = filters.impactMin ?? 0;
  const activeTypeCount  = filters.eventTypes.length;
  const activeRegionCount = filters.countries.length;
  const hasActiveFilters = activeTypeCount > 0 || activeRegionCount > 0 || filters.searchQuery || impactMin > 0;

  return (
    <div style={{
      width:         fullWidth ? '100%' : '280px',
      minWidth:      fullWidth ? 'unset' : '280px',
      background:    '#1c2127',
      borderRight:   fullWidth ? 'none' : '1px solid #2f343c',
      overflowY:     'auto',
      display:       'flex',
      flexDirection: 'column',
      position:      'relative',
    }}>
      {/* Country Brief overlay */}
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
          borderBottom:   '1px solid #383e47',
        }}>
          <span style={{ ...LABEL_STYLE, color: '#abb3bf' }}>PARAMETERS</span>
          {hasActiveFilters && (
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '9px',
              color:         '#4c90f0',         // Blueprint blue4
              background:    '#215db015',        // Blueprint blue2 @ 8%
              border:        '1px solid #4c90f030',
              borderRadius:  '2px',
              padding:       '2px 7px',
              letterSpacing: '0.05em',
              fontWeight:    600,
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
            onFocus={(e)  => (e.target.style.borderColor = '#4c90f0')}
            onBlur={(e)   => (e.target.style.borderColor = '#383e47')}
          />
        </div>

        <div style={{ borderTop: '1px solid #383e47', marginBottom: '20px' }} />

        {/* Event type classifications */}
        <div style={SECTION_GAP}>
          <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>
            CLASSIFICATION
            {activeTypeCount > 0 && (
              <span style={{ color: '#4c90f0', marginLeft: '6px' }}>({activeTypeCount})</span>
            )}
          </div>
          <div>
            {Object.entries(EVENT_TYPES).map(([key, type]) => {
              const isActive   = filters.eventTypes.length === 0 || filters.eventTypes.includes(key);
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
                    background: isSelected ? `${type.color}10` : '#252a31',  // Blueprint elevated bg
                    border:     `1px solid ${isSelected ? type.color + '40' : '#383e47'}`,
                    borderLeft: `3px solid ${isSelected ? type.color : 'transparent'}`,
                    borderRadius: '2px',
                    marginBottom: '3px',
                    opacity:    isActive ? 1 : 0.4,
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = '#2f343c';
                      e.currentTarget.style.borderColor = '#404854';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSelected ? `${type.color}10` : '#252a31';
                    e.currentTarget.style.borderColor = isSelected ? `${type.color}40` : '#383e47';
                  }}
                >
                  <div style={{
                    width:       '5px',
                    height:      '5px',
                    background:  type.color,
                    transform:   'rotate(45deg)',
                    flexShrink:  0,
                    marginRight: '8px',
                  }} />
                  <span style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize:   '11px',
                    fontWeight: isSelected ? 500 : 400,
                    color:      isSelected ? '#f6f7f9' : '#abb3bf',
                    flex:       1,
                  }}>
                    {type.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #383e47', marginBottom: '20px' }} />

        {/* Region focus — Blueprint multi-select with pill tags */}
        <div style={SECTION_GAP} ref={dropdownRef}>
          <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>
            REGION FOCUS
            {activeRegionCount > 0 && (
              <span style={{ color: '#4c90f0', marginLeft: '6px' }}>({activeRegionCount})</span>
            )}
          </div>

          {filters.countries.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
              {filters.countries.map((c) => (
                <span
                  key={c}
                  onClick={() => toggleCountry(c)}
                  style={{
                    fontFamily:   'Inter, sans-serif',
                    fontSize:     '10px',
                    color:        '#abb3bf',
                    background:   '#252a31',
                    border:       '1px solid #4c90f040',
                    borderRadius: '2px',
                    padding:      '2px 7px',
                    cursor:       'pointer',
                    display:      'flex',
                    alignItems:   'center',
                    gap:          '4px',
                    transition:   'all 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4c90f0'; e.currentTarget.style.color = '#f6f7f9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#4c90f040'; e.currentTarget.style.color = '#abb3bf'; }}
                >
                  {c}
                  <span style={{ color: '#5f6b7c', fontSize: '9px' }}>×</span>
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
              onFocus={(e)  => { setShowCountryDropdown(true); e.target.style.borderColor = '#4c90f0'; }}
              onBlur={(e)   => (e.target.style.borderColor = '#383e47')}
            />
            {showCountryDropdown && filteredCountries.length > 0 && (
              <div style={{
                position:  'absolute',
                top:       '100%',
                left:      0,
                right:     0,
                background: '#252a31',
                border:    '1px solid #383e47',
                borderTop: 'none',
                borderRadius: '0 0 2px 2px',
                maxHeight: '160px',
                overflowY: 'auto',
                zIndex:    100,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}>
                {filteredCountries.map((country) => {
                  const selected = filters.countries.includes(country);
                  return (
                    <div
                      key={country}
                      onMouseDown={() => { toggleCountry(country); setCountrySearch(''); }}
                      style={{
                        padding:      '7px 10px',
                        fontFamily:   'Inter, sans-serif',
                        fontSize:     '11px',
                        color:        selected ? '#f6f7f9' : '#abb3bf',
                        background:   selected ? '#2f343c' : 'transparent',
                        cursor:       'pointer',
                        borderBottom: '1px solid #2f343c',
                        display:      'flex',
                        alignItems:   'center',
                        gap:          '7px',
                        transition:   'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#2f343c')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = selected ? '#2f343c' : 'transparent')}
                    >
                      {selected && (
                        <span style={{ color: '#4c90f0', fontSize: '9px', flexShrink: 0 }}>✓</span>
                      )}
                      {country}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #383e47', marginBottom: '20px' }} />

        {/* Temporal range */}
        <div style={SECTION_GAP}>
          <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>TEMPORAL RANGE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <input
              type="date"
              value={filters.dateRange.start || ''}
              onChange={(e) => onFilterChange({ ...filters, dateRange: { ...filters.dateRange, start: e.target.value } })}
              style={{ ...INPUT_STYLE, fontFamily: 'JetBrains Mono, monospace', colorScheme: 'dark' }}
              onFocus={(e)  => (e.target.style.borderColor = '#4c90f0')}
              onBlur={(e)   => (e.target.style.borderColor = '#383e47')}
            />
            <input
              type="date"
              value={filters.dateRange.end || ''}
              onChange={(e) => onFilterChange({ ...filters, dateRange: { ...filters.dateRange, end: e.target.value } })}
              style={{ ...INPUT_STYLE, fontFamily: 'JetBrains Mono, monospace', colorScheme: 'dark' }}
              onFocus={(e)  => (e.target.style.borderColor = '#4c90f0')}
              onBlur={(e)   => (e.target.style.borderColor = '#383e47')}
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #383e47', marginBottom: '20px' }} />

        {/* Min severity slider */}
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
              fontFamily:   'JetBrains Mono, monospace',
              fontSize:     '10px',
              color:        impactMin >= 7 ? '#e76a6e' : impactMin >= 4 ? '#fbb360' : '#738091',
              background:   '#252a31',
              border:       '1px solid #383e47',
              borderRadius: '2px',
              padding:      '1px 6px',
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
            style={{ width: '100%', accentColor: '#4c90f0' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ ...LABEL_STYLE, fontSize: '9px', color: '#5f6b7c' }}>LOW</span>
            <span style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color:         '#e76a6e50',
            }}>
              GOLDSTEIN SCALE
            </span>
            <span style={{ ...LABEL_STYLE, fontSize: '9px', color: '#e76a6e80' }}>HIGH</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #383e47', marginBottom: '20px' }} />

        {/* Hot Zones */}
        <HotZones events={allEvents} onSelectCountry={onSelectCountry} />

        <div style={{ borderTop: '1px solid #383e47', marginBottom: '20px' }} />

        {/* Active Entities */}
        <ActorPanel
          events={allEvents}
          searchQuery={filters.searchQuery}
          onSearch={(q) => onFilterChange({ ...filters, searchQuery: q })}
        />

        {/* Reset — Blueprint minimal button */}
        <button
          onClick={handleReset}
          style={{
            width:         '100%',
            background:    '#252a31',
            border:        '1px solid #383e47',
            borderRadius:  '2px',
            padding:       '8px',
            fontFamily:    'Inter, sans-serif',
            fontSize:      '9px',
            fontWeight:    600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color:         '#738091',
            cursor:        'pointer',
            transition:    'all 0.15s',
            marginBottom:  '16px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background   = '#2f343c';
            e.currentTarget.style.color        = '#f6f7f9';
            e.currentTarget.style.borderColor  = '#404854';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background  = '#252a31';
            e.currentTarget.style.color       = '#738091';
            e.currentTarget.style.borderColor = '#383e47';
          }}
        >
          RESET ALL FILTERS
        </button>

        {/* Source bias — Blueprint callout pattern */}
        <div style={{
          border:       '1px solid #383e47',
          borderLeft:   '3px solid #fbb360',    // Blueprint orange5 — warning callout
          background:   '#252a31',
          borderRadius: '2px',
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
              fontWeight:    600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         '#fbb360',    // Blueprint orange5
            }}>
              ⚠ SOURCE BIAS
            </span>
            <span style={{ color: '#738091', fontSize: '10px' }}>
              {biasExpanded ? '▲' : '▼'}
            </span>
          </div>
          {biasExpanded && (
            <div style={{
              padding:    '0 10px 10px',
              fontFamily: 'Inter, sans-serif',
              fontSize:   '10px',
              color:      '#abb3bf',
              lineHeight: '1.55',
              borderTop:  '1px solid #383e47',
              paddingTop: '8px',
            }}>
              GDELT indexes English-language news. US, UK, and Western Europe events are
              overrepresented relative to ground truth. Cross-reference primary sources when
              assessing event density in underreported regions.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
