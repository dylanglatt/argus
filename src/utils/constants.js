/**
 * Argus — Design tokens (Blueprint-derived dark theme)
 *
 * Color palette sourced from palantir/blueprint packages/colors.
 * Blueprint dark theme reference:
 *   black:       #111418
 *   dark-gray1:  #1c2127   ← panel surfaces
 *   dark-gray2:  #252a31   ← elevated (inputs, cards, dropdowns)
 *   dark-gray3:  #2f343c   ← panel borders
 *   dark-gray4:  #383e47   ← dividers / inner borders
 *   dark-gray5:  #404854   ← secondary borders / disabled
 *   gray1:       #5f6b7c   ← very muted text
 *   gray2:       #738091   ← muted labels
 *   gray4:       #abb3bf   ← secondary text
 *   light-gray5: #f6f7f9   ← primary text
 */

// ── Page / chrome palette ──────────────────────────────────────────────────
export const COLORS = {
  // Surfaces
  pageBg:          '#111418',   // Blueprint black — outermost background
  panelBg:         '#1c2127',   // Blueprint dark-gray1 — sidebar, panel bg
  elevatedBg:      '#252a31',   // Blueprint dark-gray2 — inputs, cards, dropdowns
  hoverBg:         '#2f343c',   // Blueprint dark-gray3 — hover state

  // Borders
  border:          '#2f343c',   // Blueprint dark-gray3 — panel/component outlines
  borderInner:     '#383e47',   // Blueprint dark-gray4 — row dividers, section separators

  // Text hierarchy
  textPrimary:     '#f6f7f9',   // Blueprint light-gray5
  textSecondary:   '#abb3bf',   // Blueprint gray4
  textMuted:       '#738091',   // Blueprint gray2 — labels, column headers
  textDim:         '#5f6b7c',   // Blueprint gray1 — very muted / timestamps

  // Intent colors (Blueprint dark theme)
  blue:            '#4c90f0',   // Blueprint blue4 — primary accent / focus
  blueDim:         '#215db0',   // Blueprint blue2 — dim links / inactive accent
  green:           '#32a467',   // Blueprint green4 — success / live indicators
  red:             '#e76a6e',   // Blueprint red4 — danger / high-impact
  orange:          '#ec9a3c',   // Blueprint orange4 — warning / medium impact
  gold:            '#fbb360',   // Blueprint orange5 — low-impact warning
};

// ── Event type palette ─────────────────────────────────────────────────────
// Data-only colors — used exclusively on event markers, chart bars, type indicators.
// Mapped to Blueprint semantic intent colors for visual consistency.
export const EVENT_TYPES = {
  'Battles': {
    label: 'Battles',
    color: '#e76a6e',   // Blueprint red4
  },
  'Explosions/Remote violence': {
    label: 'Explosions/Remote violence',
    color: '#ec9a3c',   // Blueprint orange4
  },
  'Violence against civilians': {
    label: 'Violence against civilians',
    color: '#fbb360',   // Blueprint orange5
  },
  'Riots': {
    label: 'Riots',
    color: '#bdadff',   // Blueprint indigo5
  },
  'Strategic developments': {
    label: 'Strategic developments',
    color: '#72ca9b',   // Blueprint green5
  },
};

// ── Map configuration ──────────────────────────────────────────────────────
export const MAP_CONFIG = {
  center: [18, 12],
  zoom:   2.0,
  style:  'mapbox://styles/mapbox/navigation-night-v1',
};

// ── Legacy country list (static fallback) ─────────────────────────────────
export const COUNTRIES = [
  'Afghanistan', 'Burkina Faso', 'Cameroon', 'Central African Republic',
  'Colombia', 'DR Congo', 'Ethiopia', 'Haiti', 'Iraq', 'Libya',
  'Mali', 'Mexico', 'Mozambique', 'Myanmar', 'Nigeria', 'Somalia',
  'Sudan', 'Syria', 'Ukraine', 'Yemen',
];
