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
const SITREP_CACHE_KEY     = 'sitrep-cache.json';
const SITREP_TTL_MS        = 24 * 60 * 60 * 1000; // sitreps are narrative summaries — 24h is plenty
const SPEND_KEY            = 'haiku-spend.json';

// Hard per-day spend ceiling for Haiku (USD). Argus is a portfolio/demo
// project — any run that trips this cap has a bug, not a legitimate need.
// Override via env if you intentionally want to burn more during a demo.
const DAILY_BUDGET_USD     = Number(process.env.HAIKU_DAILY_BUDGET_USD || 0.05);

// Haiku 4.5 pricing (per million tokens). Used to estimate spend per call.
// If pricing changes we'll under/over-estimate slightly — fine for a safety cap.
const HAIKU_INPUT_PER_MTOK  = 1.0;
const HAIKU_OUTPUT_PER_MTOK = 5.0;

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

// ---------------------------------------------------------------------------
// Sitrep cache — persistent per-country cache for /api/brief/:country
// CDN caching alone resets on every cold start; blob-level cache survives
// deploys, cold starts, and region swaps. Entries TTL'd at 24h.
// ---------------------------------------------------------------------------
export async function getCachedSitrep(country) {
  if (!isBlobConfigured() || !country) return null;
  try {
    const { blobs } = await list({ prefix: SITREP_CACHE_KEY, limit: 1 });
    if (!blobs[0]?.url) return null;
    const downloadUrl = await getDownloadUrl(blobs[0].url);
    const res = await fetch(downloadUrl);
    if (!res.ok) return null;
    const cache = await res.json();
    const entry = cache?.[country.toLowerCase()];
    if (!entry) return null;
    if (Date.now() - entry.generated_at > SITREP_TTL_MS) return null;
    return entry;
  } catch (err) {
    console.warn('[blobCache] getCachedSitrep error:', err.message);
    return null;
  }
}

export async function saveCachedSitrep(country, entry) {
  if (!isBlobConfigured() || !country) return;
  try {
    // Read current cache, merge in new entry, drop expired entries
    let cache = {};
    try {
      const { blobs } = await list({ prefix: SITREP_CACHE_KEY, limit: 1 });
      if (blobs[0]?.url) {
        const downloadUrl = await getDownloadUrl(blobs[0].url);
        const res = await fetch(downloadUrl);
        if (res.ok) cache = await res.json();
        if (typeof cache !== 'object' || Array.isArray(cache)) cache = {};
      }
    } catch { cache = {}; }

    const now = Date.now();
    const fresh = {};
    for (const [k, v] of Object.entries(cache)) {
      if (v?.generated_at && now - v.generated_at < SITREP_TTL_MS) fresh[k] = v;
    }
    fresh[country.toLowerCase()] = { ...entry, generated_at: now };

    await put(SITREP_CACHE_KEY, JSON.stringify(fresh), {
      access:          'private',
      addRandomSuffix: false,
      contentType:     'application/json',
    });
  } catch (err) {
    console.warn('[blobCache] saveCachedSitrep error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Daily-spend ledger for Haiku. Returns { usd, date } for the current UTC day.
// Any call that would push today's spend past DAILY_BUDGET_USD should be
// skipped by the caller. This is a cost *safety net*, not the primary lever
// — the primary lever is the daily (not 15-min) refresh cadence.
// ---------------------------------------------------------------------------
function utcDateStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export async function getHaikuSpendToday() {
  if (!isBlobConfigured()) return { usd: 0, date: utcDateStr() };
  try {
    const { blobs } = await list({ prefix: SPEND_KEY, limit: 1 });
    if (!blobs[0]?.url) return { usd: 0, date: utcDateStr() };
    const downloadUrl = await getDownloadUrl(blobs[0].url);
    const res = await fetch(downloadUrl);
    if (!res.ok) return { usd: 0, date: utcDateStr() };
    const ledger = await res.json();
    if (ledger?.date !== utcDateStr()) return { usd: 0, date: utcDateStr() };
    return { usd: Number(ledger.usd) || 0, date: ledger.date };
  } catch {
    return { usd: 0, date: utcDateStr() };
  }
}

export async function addHaikuSpend(inputTokens, outputTokens) {
  const delta =
    (inputTokens  * HAIKU_INPUT_PER_MTOK  / 1_000_000) +
    (outputTokens * HAIKU_OUTPUT_PER_MTOK / 1_000_000);
  if (!isBlobConfigured() || delta <= 0) return delta;
  try {
    const current = await getHaikuSpendToday();
    const next    = { usd: current.usd + delta, date: utcDateStr() };
    await put(SPEND_KEY, JSON.stringify(next), {
      access:          'private',
      addRandomSuffix: false,
      contentType:     'application/json',
    });
    return delta;
  } catch (err) {
    console.warn('[blobCache] addHaikuSpend error:', err.message);
    return delta;
  }
}

export function getDailyBudgetUsd() {
  return DAILY_BUDGET_USD;
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
