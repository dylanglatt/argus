/**
 * api/events.js
 * -------------
 * Vercel serverless function — GET /api/events
 *
 * Fetches conflict events from GDELT 2.0 and returns normalized data.
 * Falls back to mock data if GDELT is unreachable or times out.
 *
 * Cache strategy: CDN-level response caching via Cache-Control.
 *   s-maxage=3600         — Vercel edge caches the response for 1 hour
 *   stale-while-revalidate=86400 — serve stale data instantly while
 *                                  revalidating in the background
 *
 * This means GDELT is only fetched on the first cold request and once
 * per hour thereafter (in the background, never blocking the user).
 *
 * Volume control: Haiku filter is skipped in serverless (30s timeout).
 * We compensate with a tighter fetch window (1 day, 4 GDELT files) and
 * a hard cap of 300 events — enough operational signal without noise.
 */

import { fetchConflictEvents, getCacheFetchedAt } from '../server/gdeltFetcher.js';
import { mockEvents } from '../server/mockData.js';

export default async function handler(req, res) {
  // CDN caches for 1 hour; serves stale while revalidating for 24 hours
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Serverless cap: 300 events max. Haiku is skipped here (30s timeout);
  // structural CAMEO filtering + 1-day window keeps the set operationally dense.
  const VERCEL_EVENT_CAP = 300;
  const limit = Math.min(parseInt(req.query.limit, 10) || VERCEL_EVENT_CAP, VERCEL_EVENT_CAP);

  let events;
  let source;

  try {
    // 1 day / 6-hour steps = 4 GDELT files — fast enough for a 30s function budget.
    events = await fetchConflictEvents({ days: 1, stepHours: 6, limit: VERCEL_EVENT_CAP });
    source = 'gdelt';
  } catch (err) {
    console.error('[events] GDELT fetch failed, falling back to mock data:', err.message);
    events = [...mockEvents];
    source = 'mock';
  }

  if (!events || events.length === 0) {
    console.log('[events] No GDELT events — serving mock data');
    events = [...mockEvents];
    source = 'mock';
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
    data:      events.slice(0, limit),
    count:     events.length,
    source,
    fetchedAt: getCacheFetchedAt(),
  });
}
