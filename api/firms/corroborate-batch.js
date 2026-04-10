/**
 * api/firms/corroborate-batch.js
 * --------------------------------
 * Vercel serverless function — POST /api/firms/corroborate-batch
 *
 * Batch satellite corroboration — checks NASA FIRMS thermal anomaly data
 * against a set of conflict events and flags those with nearby detections.
 *
 * Request body: { events: [{ id, lat, lon, date }] }
 * Response:     { results: { [id]: { corroborated, detections, maxFRP, nearestKm } } }
 */

import { corroborateBatch } from '../../server/firmsService.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { events: evts } = req.body || {};
  if (!Array.isArray(evts)) {
    return res.status(400).json({ error: 'Expected events array' });
  }

  try {
    const results = await corroborateBatch(evts);
    res.status(200).json({ results });
  } catch (err) {
    console.error('[firms] Batch corroborate error:', err.message);
    res.status(200).json({ results: {} });
  }
}
