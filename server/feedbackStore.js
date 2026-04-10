/**
 * feedbackStore.js
 * ----------------
 * Persists analyst-dismissed events across server restarts.
 *
 * When an analyst marks an event as noise in the UI, that dismissal is:
 *   1. Written to disk at server/dismissed_events.json
 *   2. Held in an in-memory Set for fast O(1) filtering on every /api/events call
 *
 * This is the analyst-in-the-loop feedback mechanism: over time, dismissed
 * events accumulate and can be used to audit Haiku's prompt or GDELT filters.
 *
 * The store is intentionally simple — no TTL, no ML, no clustering.
 * The value is in the accumulation pattern, not the lookup speed.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, 'dismissed_events.json');

// In-memory sets — populated from disk on module load
let dismissedIds  = new Set();
let confirmedIds  = new Set();

// ---------------------------------------------------------------------------
// Load from disk on startup
// ---------------------------------------------------------------------------
function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw  = fs.readFileSync(STORE_PATH, 'utf8');
      const data = JSON.parse(raw);
      dismissedIds = new Set((data.dismissed  || []).map(String));
      confirmedIds = new Set((data.confirmed  || []).map(String));
      console.log(`[feedback] Loaded ${dismissedIds.size} dismissed / ${confirmedIds.size} confirmed event(s) from disk`);
    }
  } catch (err) {
    console.warn('[feedback] Failed to load dismissed_events.json:', err.message);
    dismissedIds = new Set();
    confirmedIds = new Set();
  }
}

function persistStore() {
  // Note: on Vercel (read-only filesystem), writes will fail silently.
  // Feedback is optimistically applied in the UI within the session;
  // durable persistence would require moving this to Vercel Blob/KV.
  try {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify({ dismissed: [...dismissedIds], confirmed: [...confirmedIds] }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn('[feedback] Failed to write dismissed_events.json:', err.message);
  }
}

// Initialize on import
loadStore();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Mark an event as analyst-dismissed noise. Persists to disk. */
export function dismissEvent(eventId) {
  const id = String(eventId);
  dismissedIds.add(id);
  confirmedIds.delete(id);   // can't be both
  persistStore();
  console.log(`[feedback] Dismissed event ${id} (total dismissed: ${dismissedIds.size})`);
}

/** Undo a dismissal (analyst corrections). Persists to disk. */
export function undismissEvent(eventId) {
  dismissedIds.delete(String(eventId));
  persistStore();
  console.log(`[feedback] Restored event ${eventId} (total dismissed: ${dismissedIds.size})`);
}

/** Mark an event as analyst-confirmed valid signal. Persists to disk. */
export function confirmEvent(eventId) {
  const id = String(eventId);
  confirmedIds.add(id);
  dismissedIds.delete(id);   // can't be both
  persistStore();
  console.log(`[feedback] Confirmed event ${id} (total confirmed: ${confirmedIds.size})`);
}

/** Undo a confirmation. Persists to disk. */
export function unconfirmEvent(eventId) {
  confirmedIds.delete(String(eventId));
  persistStore();
}

/** Fast lookups used in filtering / response. */
export function isDismissed(eventId)  { return dismissedIds.has(String(eventId)); }
export function isConfirmed(eventId)  { return confirmedIds.has(String(eventId)); }

/** Return all dismissed IDs (used by the frontend to sync state). */
export function getDismissedIds() { return [...dismissedIds]; }
export function getConfirmedIds() { return [...confirmedIds]; }

/** Remove dismissed events from an array. Used in /api/events. */
export function filterDismissed(events) {
  if (dismissedIds.size === 0) return events;
  return events.filter((e) => !dismissedIds.has(String(e.event_id_cnty)));
}
