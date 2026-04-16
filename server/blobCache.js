/**
 * blobCache.js
 * ------------
 * Thin abstraction over Vercel Blob for caching Argus events.
 *
 * The refresh-events workflow writes a single JSON file to Blob storage.
 * api/events.js reads it back for fast serving.
 *
 * Blob key: "events.json" (public, no random suffix)
 */

import { put, list, getDownloadUrl } from '@vercel/blob';

const BLOB_KEY             = 'events.json';
const HAIKU_CACHE_KEY      = 'haiku-classifications.json';
const HAIKU_CACHE_MAX_DAYS = 8; // prune entries older than this (matches GDELT 7-day window + buffer)

/**
 * Returns true if BLOB_READ_WRITE_TOKEN is present in the environment.
 */
export function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Read the cached events payload from Blob storage.
 * Returns { events: Array, fetchedAt: number } or null if Blob is
 * empty, not configured, or on any error.
 */
export async function getEventsFromBlob() {
  if (!isBlobConfigured()) return null;

  try {
    // head() requires a full blob URL, not a pathname — use list() to resolve
    // the pathname to its full public URL before fetching.
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
    if (!blobs[0]?.url) return null;

    // Private store: generate a signed download URL before fetching
    const downloadUrl = await getDownloadUrl(blobs[0].url);
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      console.warn(`[blobCache] fetch from blob URL failed: ${res.status}`);
      return null;
    }

    const payload = await res.json();

    // Validate shape
    if (!Array.isArray(payload?.events)) {
      console.warn('[blobCache] invalid payload shape in blob');
      return null;
    }

    // Check staleness — reject data older than 2 hours
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    if (payload.fetchedAt && Date.now() - payload.fetchedAt > TWO_HOURS_MS) {
      console.warn('[blobCache] blob data is older than 2 hours — treating as stale');
      return null;
    }

    return { events: payload.events, fetchedAt: payload.fetchedAt };
  } catch (err) {
    console.warn('[blobCache] getEventsFromBlob error:', err.message);
    return null;
  }
}

/**
 * Load the persisted Haiku classification cache from Blob.
 * Returns a plain object: { [event_id_cnty]: { include, score, breakdown,
 *                                               reasoning, tags, confidence,
 *                                               classifiedAt } }
 * Returns an empty object on any failure so the caller degrades gracefully.
 */
export async function getClassificationCache() {
  if (!isBlobConfigured()) return {};
  try {
    const { blobs } = await list({ prefix: HAIKU_CACHE_KEY, limit: 1 });
    if (!blobs[0]?.url) return {};
    const downloadUrl = await getDownloadUrl(blobs[0].url);
    const res = await fetch(downloadUrl);
    if (!res.ok) return {};
    const data = await res.json();
    if (typeof data !== 'object' || Array.isArray(data)) return {};
    console.log(`[blobCache] loaded ${Object.keys(data).length} cached Haiku classifications`);
    return data;
  } catch (err) {
    console.warn('[blobCache] getClassificationCache error:', err.message);
    return {};
  }
}

/**
 * Persist the Haiku classification cache to Blob, pruning entries older than
 * HAIKU_CACHE_MAX_DAYS so the blob doesn't grow unbounded.
 *
 * @param {Object} cache - { [event_id_cnty]: { ..., classifiedAt: number } }
 */
export async function saveClassificationCache(cache) {
  if (!isBlobConfigured()) return;
  const cutoffMs = Date.now() - HAIKU_CACHE_MAX_DAYS * 24 * 60 * 60 * 1000;
  const pruned   = {};
  for (const [id, entry] of Object.entries(cache)) {
    if (entry.classifiedAt >= cutoffMs) pruned[id] = entry;
  }
  try {
    await put(HAIKU_CACHE_KEY, JSON.stringify(pruned), {
      access:           'private',
      addRandomSuffix:  false,
      contentType:      'application/json',
    });
    const pruneCount = Object.keys(cache).length - Object.keys(pruned).length;
    console.log(
      `[blobCache] saved ${Object.keys(pruned).length} Haiku classifications` +
      (pruneCount > 0 ? ` (pruned ${pruneCount} stale entries)` : '')
    );
  } catch (err) {
    console.warn('[blobCache] saveClassificationCache error:', err.message);
  }
}

/**
 * Write the events array + metadata to Blob storage.
 */
export async function setEventsInBlob(events, fetchedAt) {
  if (!isBlobConfigured()) {
    console.warn('[blobCache] BLOB_READ_WRITE_TOKEN not set — skipping write');
    return;
  }

  try {
    const payload = JSON.stringify({ events, fetchedAt });
    await put(BLOB_KEY, payload, {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
    });
    console.log(`[blobCache] wrote ${events.length} events to blob`);
  } catch (err) {
    console.warn('[blobCache] setEventsInBlob error:', err.message);
  }
}
