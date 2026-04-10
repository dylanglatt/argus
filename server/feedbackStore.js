/**
 * feedbackStore.js
 * ----------------
 * Persists analyst feedback (dismissed / confirmed events) across deploys
 * using Vercel Blob storage.
 *
 * Architecture:
 *   - In-memory Sets are the fast-path for all O(1) lookups at request time.
 *   - Blob storage is the durable backing store — a single feedback.json file
 *     is read once on startup (initFeedbackStore) and overwritten on every
 *     dismiss or confirm action.
 *
 * Degradation:
 *   - If BLOB_READ_WRITE_TOKEN is absent (local dev without .env), the store
 *     operates in-memory only — feedback survives the session but not restarts.
 *   - Blob write failures are logged and swallowed — the in-memory state is
 *     always authoritative for the current process.
 *
 * Blob key: "feedback.json" (no random suffix — always overwrites in place)
 */

import { put, head } from '@vercel/blob';

const BLOB_KEY = 'feedback.json';

// In-memory sets — the hot path for all /api/events filtering
let dismissedIds = new Set();
let confirmedIds = new Set();

// ---------------------------------------------------------------------------
// Blob I/O helpers
// ---------------------------------------------------------------------------

async function loadFromBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const meta = await head(BLOB_KEY);
    if (!meta?.url) return;
    const res = await fetch(meta.url);
    if (!res.ok) return;
    const data = await res.json();
    dismissedIds = new Set((data.dismissed || []).map(String));
    confirmedIds = new Set((data.confirmed || []).map(String));
    console.log(`[feedback] Loaded ${dismissedIds.size} dismissed / ${confirmedIds.size} confirmed from Blob`);
  } catch (err) {
    // BlobNotFoundError on first deploy is expected — not a real error
    if (!err.message?.includes('not found')) {
      console.warn('[feedback] Failed to load from Blob:', err.message);
    }
  }
}

async function persistToBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await put(
      BLOB_KEY,
      JSON.stringify({ dismissed: [...dismissedIds], confirmed: [...confirmedIds] }),
      { access: 'public', addRandomSuffix: false, contentType: 'application/json' }
    );
  } catch (err) {
    console.warn('[feedback] Failed to persist to Blob:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Initialization — called once at server startup, before the cache warms.
// ---------------------------------------------------------------------------
export async function initFeedbackStore() {
  await loadFromBlob();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Mark an event as analyst-dismissed noise. Persists to Blob. */
export async function dismissEvent(eventId) {
  const id = String(eventId);
  dismissedIds.add(id);
  confirmedIds.delete(id);   // can't be both
  console.log(`[feedback] Dismissed ${id} (total dismissed: ${dismissedIds.size})`);
  await persistToBlob();
}

/** Undo a dismissal. Persists to Blob. */
export async function undismissEvent(eventId) {
  dismissedIds.delete(String(eventId));
  console.log(`[feedback] Restored ${eventId} (total dismissed: ${dismissedIds.size})`);
  await persistToBlob();
}

/** Mark an event as analyst-confirmed valid signal. Persists to Blob. */
export async function confirmEvent(eventId) {
  const id = String(eventId);
  confirmedIds.add(id);
  dismissedIds.delete(id);   // can't be both
  console.log(`[feedback] Confirmed ${id} (total confirmed: ${confirmedIds.size})`);
  await persistToBlob();
}

/** Undo a confirmation. Persists to Blob. */
export async function unconfirmEvent(eventId) {
  confirmedIds.delete(String(eventId));
  await persistToBlob();
}

/** Fast lookups used in filtering / response enrichment. */
export function isDismissed(eventId) { return dismissedIds.has(String(eventId)); }
export function isConfirmed(eventId) { return confirmedIds.has(String(eventId)); }

/** Return all IDs for frontend sync on load. */
export function getDismissedIds() { return [...dismissedIds]; }
export function getConfirmedIds() { return [...confirmedIds]; }

/** Remove dismissed events from an array. Called in /api/events before serving. */
export function filterDismissed(events) {
  if (dismissedIds.size === 0) return events;
  return events.filter((e) => !dismissedIds.has(String(e.event_id_cnty)));
}
