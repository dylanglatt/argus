/**
 * text.js — small display-text helpers.
 */

/**
 * Strip em dashes from any text that reaches the UI. Notes and AI reasoning
 * can arrive from the currently cached data (built before em dashes were
 * removed from the generators) or from model output, so we sanitize at render
 * to guarantee no em dash ever appears in copy. Replaced with a comma.
 */
export function noEmDash(text) {
  if (!text) return text;
  return String(text).replace(/\s*—\s*/g, ', ');
}
