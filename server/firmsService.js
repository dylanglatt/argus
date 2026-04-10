/**
 * firmsService.js
 * ---------------
 * Fetches NASA FIRMS (Fire Information for Resource Management System)
 * thermal anomaly data via the VIIRS SNPP satellite. Provides near-real-time
 * fire/explosion detections that can corroborate media-reported conflict events.
 *
 * Exports:
 *   getFirmsData()              — returns all cached thermal anomalies
 *   corroborateEvent(lat, lon, dateStr) — checks for nearby detections
 *   corroborateBatch(events)    — batch corroboration for multiple events
 */

import https from 'https';

// ---------------------------------------------------------------------------
// Cache — 1 hour TTL (FIRMS updates every ~60 minutes)
// ---------------------------------------------------------------------------
let cache = { data: null, fetchedAt: 0, ttlMs: 60 * 60 * 1000 };
let fetchInFlight = null;

// Broad conflict-relevant bounding box: Africa, Middle East, Central/South Asia
const BBOX = '-20,-40,80,60';
const DAYS = 3;

function isCacheValid() {
  return cache.data && (Date.now() - cache.fetchedAt < cache.ttlMs);
}

// ---------------------------------------------------------------------------
// HTTP fetch helper — uses built-in https module (same pattern as gdeltFetcher)
// ---------------------------------------------------------------------------
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`FIRMS HTTP ${res.statusCode}`));
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('FIRMS request timeout')); });
  });
}

// ---------------------------------------------------------------------------
// CSV parser — FIRMS returns CSV with a header row
// ---------------------------------------------------------------------------
function parseFirmsCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    if (vals.length < headers.length) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx]?.trim(); });

    // VIIRS confidence is a single-letter code: "l" (low), "n" (nominal), "h" (high)
    // MODIS confidence is numeric 0–100. Handle both.
    const rawConf = (row.confidence || '').trim().toLowerCase();
    const confidence =
      rawConf === 'l' || rawConf === 'low'         ? 30 :
      rawConf === 'n' || rawConf === 'nominal'      ? 60 :
      rawConf === 'h' || rawConf === 'high'         ? 90 :
      parseInt(rawConf, 10);
    if (isNaN(confidence) || confidence < 60) continue; // drop low-confidence detections

    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;

    results.push({
      latitude:   lat,
      longitude:  lon,
      confidence, // normalized to numeric (30/60/90 for VIIRS, raw int for MODIS)
      frp:        parseFloat(row.frp) || 0,
      bright_ti4: parseFloat(row.bright_ti4) || 0,
      acq_date:   row.acq_date || '',
      acq_time:   row.acq_time || '',
      satellite:  row.satellite || 'VIIRS',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Fetch FIRMS data (with cache + in-flight guard)
// ---------------------------------------------------------------------------
async function fetchFirmsData() {
  if (isCacheValid()) return cache.data;
  if (fetchInFlight) return fetchInFlight;

  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) {
    console.warn('[firms] FIRMS_MAP_KEY not set — skipping FIRMS fetch');
    return [];
  }

  fetchInFlight = (async () => {
    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/VIIRS_SNPP_NRT/${BBOX}/${DAYS}`;
      console.log(`[firms] Fetching VIIRS thermal anomalies (${DAYS}d, bbox=${BBOX})...`);
      const csv = await httpsGet(url);
      const data = parseFirmsCsv(csv);
      cache = { data, fetchedAt: Date.now(), ttlMs: cache.ttlMs };
      console.log(`[firms] Cached ${data.length} high-confidence detections`);
      return data;
    } catch (err) {
      console.error('[firms] Fetch failed:', err.message);
      return cache.data || [];
    } finally {
      fetchInFlight = null;
    }
  })();

  return fetchInFlight;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all cached FIRMS thermal anomalies (confidence > 70).
 */
export async function getFirmsData() {
  return fetchFirmsData();
}

/**
 * Haversine distance in km between two lat/lon points.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if a single event is corroborated by FIRMS detections.
 * Looks for detections within 25km and ±24 hours of the event.
 *
 * @param {number} lat - Event latitude
 * @param {number} lon - Event longitude
 * @param {string} dateStr - Event date (YYYY-MM-DD)
 * @returns {{ corroborated: boolean, detections: number, maxFRP: number, nearestKm: number } | null}
 */
export async function corroborateEvent(lat, lon, dateStr) {
  const data = await fetchFirmsData();
  if (!data || data.length === 0) return null;

  lat = parseFloat(lat);
  lon = parseFloat(lon);
  if (isNaN(lat) || isNaN(lon) || !dateStr) return null;

  const eventTime = new Date(dateStr + 'T12:00:00Z').getTime();
  const windowMs = 24 * 60 * 60 * 1000;

  let detections = 0;
  let maxFRP = 0;
  let nearestKm = Infinity;

  for (const d of data) {
    // Quick bounding-box pre-filter (~0.25 degrees ≈ 25km at equator)
    if (Math.abs(d.latitude - lat) > 0.25 || Math.abs(d.longitude - lon) > 0.25) continue;

    const dist = haversineKm(lat, lon, d.latitude, d.longitude);
    if (dist > 25) continue;

    // Time check: ±24h from event date noon
    const acqTime = new Date(d.acq_date + 'T' + (d.acq_time || '0000').padStart(4, '0').slice(0, 2) + ':' + (d.acq_time || '0000').padStart(4, '0').slice(2) + ':00Z').getTime();
    if (isNaN(acqTime) || Math.abs(acqTime - eventTime) > windowMs) continue;

    detections++;
    if (d.frp > maxFRP) maxFRP = d.frp;
    if (dist < nearestKm) nearestKm = dist;
  }

  if (detections === 0) return { corroborated: false, detections: 0, maxFRP: 0, nearestKm: 0 };

  return {
    corroborated: true,
    detections,
    maxFRP: Math.round(maxFRP * 10) / 10,
    nearestKm: Math.round(nearestKm * 10) / 10,
  };
}

/**
 * Batch corroboration — check multiple events at once.
 * Accepts array of { lat, lon, date, id } objects.
 * Returns object keyed by id with corroboration results.
 */
export async function corroborateBatch(events) {
  const data = await fetchFirmsData();
  if (!data || data.length === 0) return {};

  const results = {};

  for (const evt of events) {
    const lat = parseFloat(evt.lat);
    const lon = parseFloat(evt.lon);
    if (isNaN(lat) || isNaN(lon) || !evt.date) {
      results[evt.id] = null;
      continue;
    }

    const eventTime = new Date(evt.date + 'T12:00:00Z').getTime();
    const windowMs = 24 * 60 * 60 * 1000;

    let detections = 0;
    let maxFRP = 0;
    let nearestKm = Infinity;

    for (const d of data) {
      if (Math.abs(d.latitude - lat) > 0.25 || Math.abs(d.longitude - lon) > 0.25) continue;

      const dist = haversineKm(lat, lon, d.latitude, d.longitude);
      if (dist > 25) continue;

      const acqTime = new Date(d.acq_date + 'T' + (d.acq_time || '0000').padStart(4, '0').slice(0, 2) + ':' + (d.acq_time || '0000').padStart(4, '0').slice(2) + ':00Z').getTime();
      if (isNaN(acqTime) || Math.abs(acqTime - eventTime) > windowMs) continue;

      detections++;
      if (d.frp > maxFRP) maxFRP = d.frp;
      if (dist < nearestKm) nearestKm = dist;
    }

    results[evt.id] = detections === 0
      ? { corroborated: false, detections: 0, maxFRP: 0, nearestKm: 0 }
      : { corroborated: true, detections, maxFRP: Math.round(maxFRP * 10) / 10, nearestKm: Math.round(nearestKm * 10) / 10 };
  }

  return results;
}
