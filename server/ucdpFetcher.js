/**
 * ucdpFetcher.js
 * --------------
 * Fetches and normalizes UCDP GED (Georeferenced Event Dataset) events
 * into the Argus event schema.
 *
 * UCDP GED is the gold standard for validated armed conflict data.
 * Each event has been manually coded by conflict researchers at Uppsala
 * University. Unlike GDELT (NLP-extracted news signals), UCDP events are
 * authoritative: real fatality estimates, named actors, precise coordinates.
 *
 * API docs: https://ucdp.uu.se/apidocs/
 * Auth:     x-ucdp-access-token header, 5,000 req/day
 * Version:  25.1 (2025 release, covers through ~mid-2024)
 *
 * UCDP type_of_violence:
 *   1 = State-based conflict  → "Battles"
 *   2 = Non-state conflict    → "Battles"
 *   3 = One-sided violence    → "Violence against civilians"
 *
 * Argus event schema additions (UCDP only):
 *   source          - 'ucdp'
 *   fatalities_best - integer, best estimate of deaths
 *   fatalities_low  - integer, lower bound
 *   fatalities_high - integer, upper bound
 *   ucdp_conflict   - string, human-readable conflict name
 *   ucdp_violence_type - 1|2|3
 */

const UCDP_BASE    = 'https://ucdpapi.pcr.uu.se/api';
const UCDP_VERSION = '25.1';
const PAGE_SIZE    = 1000; // Max allowed by UCDP API

// ---------------------------------------------------------------------------
// Map UCDP type_of_violence → Argus event_type
// ---------------------------------------------------------------------------
function mapViolenceType(type) {
  switch (parseInt(type, 10)) {
    case 1: return 'Battles';                   // State-based
    case 2: return 'Battles';                   // Non-state
    case 3: return 'Violence against civilians'; // One-sided
    default: return 'Battles';
  }
}

// ---------------------------------------------------------------------------
// Map UCDP type_of_violence → human-readable sub-event label
// ---------------------------------------------------------------------------
function mapViolenceSubType(type) {
  switch (parseInt(type, 10)) {
    case 1: return 'State-based armed conflict';
    case 2: return 'Non-state armed conflict';
    case 3: return 'One-sided violence against civilians';
    default: return 'Armed conflict';
  }
}

// ---------------------------------------------------------------------------
// Normalize an actor name: remove trailing qualifiers UCDP appends,
// e.g. "Government of Sudan - SAF" → "Government of Sudan"
// but keep "Sudan Liberation Movement/Army" intact.
// ---------------------------------------------------------------------------
function cleanActor(name) {
  if (!name) return 'Unknown';
  // Trim trailing " - ABBREVIATION" only when the part after the dash is
  // an all-caps abbreviation (≤8 chars), not a meaningful qualifier.
  const trimmed = name.replace(/\s+-\s+[A-Z\/]{2,8}$/, '').trim();
  return trimmed.slice(0, 80) || 'Unknown';
}

// ---------------------------------------------------------------------------
// Derive an impact_score (0–10) from UCDP fatality estimate.
// Mirrors the Goldstein-derived scale so downstream UI code is consistent.
// Scale: 0 = 0 deaths, 10 = 1000+ deaths.
// ---------------------------------------------------------------------------
function fatalityToImpactScore(best) {
  const n = parseInt(best, 10) || 0;
  if (n === 0)    return 1;
  if (n < 5)      return 2;
  if (n < 15)     return 3;
  if (n < 30)     return 4;
  if (n < 60)     return 5;
  if (n < 120)    return 6;
  if (n < 250)    return 7;
  if (n < 500)    return 8;
  if (n < 1000)   return 9;
  return 10;
}

// ---------------------------------------------------------------------------
// Normalize a raw UCDP GED row into the Argus event schema
// ---------------------------------------------------------------------------
function normalizeEvent(row) {
  const lat = parseFloat(row.latitude);
  const lon = parseFloat(row.longitude);

  // Skip events without coordinates (rare — UCDP is thorough)
  if (!lat || !lon || isNaN(lat) || isNaN(lon)) return null;

  const best  = parseInt(row.best,  10) || 0;
  const low   = parseInt(row.low,   10) || 0;
  const high  = parseInt(row.high,  10) || 0;
  const actor1 = cleanActor(row.side_a);
  const actor2 = cleanActor(row.side_b);

  // Use date_start as the event date (ISO: YYYY-MM-DD)
  const eventDate = (row.date_start || '').slice(0, 10);
  if (!eventDate) return null;

  const eventType = mapViolenceType(row.type_of_violence);
  const subType   = mapViolenceSubType(row.type_of_violence);

  // Build a concise note from UCDP fields
  const actorStr = actor2 && actor2 !== 'Unknown' && actor2 !== actor1
    ? `${actor1} vs. ${actor2}`
    : actor1;
  const fatalStr = best > 0
    ? `${best} killed (est. ${low}–${high})`
    : 'Casualties unconfirmed';
  const notes = `${subType} — ${actorStr} in ${row.country || row.where_description || 'unknown location'}. ${fatalStr}. Conflict: ${row.conflict_name || 'unnamed'}.`;

  // Use UCDP's source headline if available, else the conflict name
  const sourceUrl = row.source_article || null;

  // hour_bucket for TimeChart compatibility (UCDP has no hour — default 0)
  const hour_bucket = 0;

  return {
    // Core identity
    event_id_cnty:    `ucdp-${row.id}`,
    event_date:       eventDate,
    hour_bucket,

    // Classification
    event_type:       eventType,
    sub_event_type:   subType,
    source:           'ucdp',

    // Actors
    actor1,
    actor2,
    actor1_type:      'MIL',  // UCDP always involves armed actors
    actor2_type:      row.type_of_violence === 3 ? 'CVL' : 'MIL',

    // Geography
    country:          row.country || '',
    admin1:           row.adm_1 || '',
    location:         row.where_description || row.country || '',
    latitude:         lat,
    longitude:        lon,

    // Fatalities (UCDP gold standard)
    fatalities_best:  best,
    fatalities_low:   low,
    fatalities_high:  high,

    // Impact — derived from fatalities, not Goldstein
    impact_score:     fatalityToImpactScore(best),
    goldstein_scale:  -(fatalityToImpactScore(best)),  // Synthetic: negative = conflict

    // Media signal fields (N/A for UCDP — use neutral defaults)
    num_mentions:  best > 0 ? Math.min(Math.ceil(best / 10) + 5, 200) : 10,
    num_sources:   1,
    num_articles:  1,
    avg_tone:      -5,  // Negative — all UCDP events are inherently conflict

    // Narrative
    notes,
    source_url: sourceUrl,

    // UCDP-specific metadata (kept for CountryBrief + filtering)
    ucdp_conflict:      row.conflict_name || '',
    ucdp_violence_type: parseInt(row.type_of_violence, 10) || 1,
  };
}

// ---------------------------------------------------------------------------
// Fetch one page of UCDP GED events
// ---------------------------------------------------------------------------
async function fetchPage(token, page, year, extraParams = '') {
  const url = `${UCDP_BASE}/gedevents/${UCDP_VERSION}?pagesize=${PAGE_SIZE}&page=${page}&year=${year}${extraParams}`;
  const res  = await fetch(url, {
    headers: { 'x-ucdp-access-token': token },
  });
  if (!res.ok) {
    throw new Error(`UCDP API error ${res.status} for year=${year} page=${page}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Public API: fetchUCDPEvents({ token, years, maxEvents })
//
// Fetches UCDP GED events across the specified years.
// Returns an array of normalized Argus-schema events.
//
// @param {string} token      - UCDP API access token
// @param {number[]} years    - Array of years to fetch (e.g. [2023, 2024])
// @param {number} maxEvents  - Max total events to return (default 2000)
// ---------------------------------------------------------------------------
export async function fetchUCDPEvents({ token, years = [2024], maxEvents = 2000 } = {}) {
  if (!token) {
    console.warn('[ucdp] No API token — skipping UCDP fetch');
    return [];
  }

  const allEvents = [];
  let totalFetched = 0;

  for (const year of years) {
    if (totalFetched >= maxEvents) break;

    console.log(`[ucdp] Fetching year=${year}...`);
    let page    = 1;
    let hasMore = true;

    while (hasMore && totalFetched < maxEvents) {
      try {
        const data = await fetchPage(token, page, year);
        const rows = data.Result || data.result || [];

        if (rows.length === 0) {
          hasMore = false;
          break;
        }

        for (const row of rows) {
          if (totalFetched >= maxEvents) break;
          const evt = normalizeEvent(row);
          if (evt) {
            allEvents.push(evt);
            totalFetched++;
          }
        }

        // UCDP paginates — check if there's a next page
        const nextPage = data.NextPageUrl || data.nextPageUrl || null;
        hasMore = Boolean(nextPage) && rows.length === PAGE_SIZE;
        page++;

        // Rate limit pacing: 5,000 req/day = ~3.5/min budget is generous,
        // but add a small delay between pages to be a good API citizen.
        if (hasMore) {
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch (err) {
        console.error(`[ucdp] Error fetching year=${year} page=${page}:`, err.message);
        hasMore = false;
      }
    }

    console.log(`[ucdp] Year ${year}: ${allEvents.length} total events so far`);
  }

  console.log(`[ucdp] Done — ${allEvents.length} events normalized`);
  return allEvents;
}
