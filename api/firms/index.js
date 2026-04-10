/**
 * api/firms/index.js
 * ------------------
 * Vercel serverless function — GET /api/firms
 *
 * Returns NASA FIRMS thermal anomaly data for the conflict-relevant
 * bounding box (Africa, Middle East, Central/South Asia).
 *
 * Cache strategy: CDN edge cache for 1 hour (FIRMS updates ~60 min).
 */

import { getFirmsData } from '../../server/firmsService.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const data = await getFirmsData();
    res.status(200).json({ data, count: data.length });
  } catch (err) {
    console.error('[firms] Route error:', err.message);
    res.status(200).json({ data: [], count: 0 });
  }
}
