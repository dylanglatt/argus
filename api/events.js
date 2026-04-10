/**
 * api/events.js
 * -------------
 * Vercel serverless function — GET /api/events
 *
 * Primary path: read Haiku-filtered events from Vercel Blob (written
 * every 30 min by the GitHub Actions refresh-events workflow).
 *
 * Fallback: if Blob is empty (first deploy, workflow hasn't run yet),
 * do a live GDELT fetch without Haiku (30s timeout constraint).
 *
 * Cache strategy: CDN-level response caching via Cache-Control.
 *   s-maxage=900           — Vercel edge caches for 15 min (matches
 *                            the 30-min workflow cadence)
 *   stale-while-revalidate=86400 — serve stale instantly while
 *                                  revalidating in the background
 */

import { fetchConflictEvents, getCacheFetchedAt } from '../server/gdeltFetcher.js';
import { getEventsFromBlob } from '../server/blobCache.js';
import { mockEvents } from '../server/mockData.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const VERCEL_EVENT_CAP = 300;
  const limit = Math.min(parseInt(req.query.limit, 10) || VERCEL_EVENT_CAP, VERCEL_EVENT_CAP);

  let events;
  let source;
  let fetchedAt;
  let kvAgeMinutes = null;

  // 1. Try Blob (Haiku-filtered events from the refresh workflow)
  const blobResult = await getEventsFromBlob();

  if (blobResult) {
    events = blobResult.events;
    source = 'kv';
    fetchedAt = blobResult.fetchedAt;
    kvAgeMinutes = Math.round((Date.now() - fetchedAt) / 60000);
    console.log(`[events] Blob hit — ${events.length} events, age ${kvAgeMinutes}m`);
  } else {
    // 2. Blob miss — fall back to live GDELT (no Haiku, VERCEL env is set)
    console.warn('[events] Blob miss — falling back to live GDELT fetch');
    try {
      events = await fetchConflictEvents({ days: 1, stepHours: 6, limit: VERCEL_EVENT_CAP });
      source = 'gdelt_live';
      fetchedAt = getCacheFetchedAt() || Date.now();
    } catch (err) {
      console.error('[events] GDELT fetch failed, falling back to mock data:', err.message);
      events = [...mockEvents];
      source = 'mock';
      fetchedAt = Date.now();
    }

    if (!events || events.length === 0) {
      console.log('[events] No GDELT events — serving mock data');
      events = [...mockEvents];
      source = 'mock';
      fetchedAt = Date.now();
    }
  }

  // Server-side filter by event_type
  if (req.query.event_type) {
    const types = Array.isArray(req.query.event_type)
      ? req.query.event_type
      : [req.query.event_type];
    events = events.filter((e) => types.includes(e.event_type));
  }

  // Server-side filter by country
  if (req.query.country) {
    const countries = Array.isArray(req.query.country)
      ? req.query.country
      : [req.query.country];
    events = events.filter((e) => countries.includes(e.country));
  }

  events.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

  console.log(`[events] Returning ${Math.min(events.length, limit)} / ${events.length} events (source: ${source})`);

  res.status(200).json({
    data:           events.slice(0, limit),
    count:          events.length,
    source,
    fetchedAt,
    kv_age_minutes: kvAgeMinutes,
  });
}
