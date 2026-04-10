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

// In-memory set — populated from disk on module load
let dismissedIds = new Set();

// ---------------------------------------------------------------------------
// Load from disk on startup
// ---------------------------------------------------------------------------
function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw  = fs.readFileSync(STORE_PATH, 'utf8');
      const data = JSON.parse(raw);
      dismissedIds = new Set((data.dismissed || []).map(String));
      console.log(`[feedback] Loaded ${dismissedIds.size} dismissed event(s) from disk`);
    }
  } catch (err) {
    console.warn('[feedback] Failed to load dismissed_events.json:', err.message);
    dismissedIds = new Set();
  }
}

function persistStore() {
  try {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify({ dismissed: [...dismissedIds] }, null, 2),
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
  dismissedIds.add(String(eventId));
  persistStore();
  console.log(`[feedback] Dismissed event ${eventId} (total dismissed: ${dismissedIds.size})`);
}

/** Undo a dismissal (analyst corrections). Persists to disk. */
export function undismissEvent(eventId) {
  dismissedIds.delete(String(eventId));
  persistStore();
  console.log(`[feedback] Restored event ${eventId} (total dismissed: ${dismissedIds.size})`);
}

/** Fast lookup used in filtering. */
export function isDismissed(eventId) {
  return dismissedIds.has(String(eventId));
}

/** Return all dismissed IDs (used by the frontend to sync state). */
export function getDismissedIds() {
  return [...dismissedIds];
}

/** Remove dismissed events from an array. Used in /api/events. */
export function filterDismissed(events) {
  if (dismissedIds.size === 0) return events;
  return events.filter((e) => !dismissedIds.has(String(e.event_id_cnty)));
}
