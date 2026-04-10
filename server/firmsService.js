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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Conflict zone index — built from POLECAT historical data by
// python/build_conflict_index.py. Filters FIRMS detections so only thermal
// anomalies that fall in historically documented conflict areas count as
// corroboration. Suppresses agricultural burns, gas flares, and industrial
// fires in conflict-adjacent regions.
//
// Index schema: { grid_size_deg, min_events, cell_count, cells: {"lat,lon": N} }
// If the file doesn't exist (index not yet built), FIRMS falls back to the
// original unfiltered behavior so the feature degrades gracefully.
// ---------------------------------------------------------------------------
let conflictZoneIndex = null;

function loadConflictZoneIndex() {
  const indexPath = path.join(__dirname, '../data/processed/conflict_zone_index.json');
  try {
    if (!fs.existsSync(indexPath)) {
      console.warn('[firms] No conflict zone index found — run python3 python/build_conflict_index.py to enable historical filtering');
      return;
    }
    const raw  = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    conflictZoneIndex = raw;
    console.log(`[firms] Conflict zone index loaded — ${raw.cell_count.toLocaleString()} cells, ${raw.grid_size_deg}° grid`);
  } catch (err) {
    console.warn('[firms] Failed to load conflict zone index:', err.message);
  }
}

// Load once at module initialisation (synchronous, file is small — < 500 KB)
loadConflictZoneIndex();

/**
 * Returns true if the given lat/lon falls within a historically documented
 * conflict zone cell. If no index is loaded, always returns true (no filter).
 */
function isConflictZone(lat, lon) {
  if (!conflictZoneIndex) return true;   // Graceful degradation
  const g = conflictZoneIndex.grid_size_deg;
  const snappedLat = Math.floor(lat / g) * g;
  const snappedLon = Math.floor(lon / g) * g;
  // Round to 4 decimal places to match Python key format
  const key = `${Math.round(snappedLat * 10000) / 10000},${Math.round(snappedLon * 10000) / 10000}`;
  return key in conflictZoneIndex.cells;
}

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

// Minimum Fire Radiative Power (MW) for the map display layer.
// Agricultural burns: 5–20 MW. Industrial/structural fires: 30–100+ MW.
// Weapons-related fires: 50–500+ MW. A floor of 30 removes ~80% of
// seasonal agricultural burn noise while retaining genuine conflict fires.
const MIN_DISPLAY_FRP = 30;

/**
 * Returns all cached FIRMS thermal anomalies (confidence > 60).
 * Used by corroboration checks — intentionally unfiltered so low-FRP
 * detections can still contribute to the corroboration count.
 */
export async function getFirmsData() {
  return fetchFirmsData();
}

/**
 * Returns FIRMS detections filtered for the map display layer:
 *   1. FRP ≥ MIN_DISPLAY_FRP — removes agricultural burns and low-energy fires
 *   2. Conflict zone check   — removes detections outside historically active
 *                              conflict cells (uses the POLECAT-derived index)
 *
 * Separate from getFirmsData() so corroboration logic retains full sensitivity
 * while the visual layer stays clean and legible.
 */
export async function getFilteredFirmsData() {
  const data = await fetchFirmsData();
  if (!data || data.length === 0) return [];
  return data.filter((d) => d.frp >= MIN_DISPLAY_FRP && isConflictZone(d.latitude, d.longitude));
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

    // Conflict zone check — skip detections in historically quiet areas
    // (agricultural burns, gas flares, industrial fires near frontlines)
    if (!isConflictZone(d.latitude, d.longitude)) continue;

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

      // Conflict zone check — skip detections in historically quiet areas
      if (!isConflictZone(d.latitude, d.longitude)) continue;

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
