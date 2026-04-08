/**
 * Sentinel — constants
 * Strict grayscale UI palette / colorized data only
 */

// UI chrome palette — grayscale only, no color in UI elements
export const COLORS = {
  pageBg:        '#0a0a0f',
  border:        '#1e1e30',
  hoverBg:       '#16161d',
  textPrimary:   '#e2e4e9',
  textSecondary: '#9ca3af',
  textTertiary:  '#6b7280',
};

// Data-only colors — used exclusively on event markers, chart lines, type indicators
export const EVENT_TYPES = {
  'Battles': {
    label: 'Battles',
    color: '#ef4444',
  },
  'Explosions/Remote violence': {
    label: 'Explosions/Remote violence',
    color: '#f97316',
  },
  'Violence against civilians': {
    label: 'Violence against civilians',
    color: '#eab308',
  },
  'Protests': {
    label: 'Protests',
    color: '#3b82f6',
  },
  'Riots': {
    label: 'Riots',
    color: '#8b5cf6',
  },
  'Strategic developments': {
    label: 'Strategic developments',
    color: '#10b981',
  },
};

export const MAP_CONFIG = {
  center: [18, 12],  // Centered on sub-Saharan Africa — balanced global conflict distribution
  zoom: 2.0,
  style: 'mapbox://styles/mapbox/navigation-night-v1',
};

export const COUNTRIES = [
  'Afghanistan',
  'Burkina Faso',
  'Cameroon',
  'Central African Republic',
  'Colombia',
  'DR Congo',
  'Ethiopia',
  'Haiti',
  'Iraq',
  'Libya',
  'Mali',
  'Mexico',
  'Mozambique',
  'Myanmar',
  'Nigeria',
  'Somalia',
  'Sudan',
  'Syria',
  'Ukraine',
  'Yemen',
];
