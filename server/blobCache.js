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

import { put, head } from '@vercel/blob';

const BLOB_KEY = 'events.json';

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
    const meta = await head(BLOB_KEY);
    if (!meta?.url) return null;

    const res = await fetch(meta.url);
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
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    });
    console.log(`[blobCache] wrote ${events.length} events to blob`);
  } catch (err) {
    console.warn('[blobCache] setEventsInBlob error:', err.message);
  }
}
