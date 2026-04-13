#!/usr/bin/env node
/**
 * scripts/refresh-events.js
 * -------------------------
 * Fetches conflict events from two sources, merges them, and writes
 * the cleaned set to Vercel Blob for serving by api/events.js.
 *
 * Sources:
 *   1. GDELT 2.0 — near real-time NLP-extracted news signals (last 7 days)
 *      Haiku-filtered for kinetic conflict only.
 *
 *   2. UCDP GED — validated conflict research data with fatality estimates.
 *      Expert-coded by Uppsala University researchers. No Haiku needed —
 *      UCDP data is already gold-standard quality.
 *
 * Merge strategy:
 *   - Both sources produce events in the same Argus schema.
 *   - UCDP events are tagged source='ucdp'; GDELT tagged source='gdelt'.
 *   - Deduplication: UCDP events with the same country + date that match
 *     a GDELT event are kept as-is (both sources, different confidence levels).
 *   - Final set sorted by date desc, capped at 800 events.
 *
 * Requires env vars:
 *   BLOB_READ_WRITE_TOKEN  — Vercel Blob token
 *   ANTHROPIC_API_KEY      — for Haiku classification of GDELT events
 *   UCDP_API_TOKEN         — UCDP API access token
 */

import 'dotenv/config';
import { fetchConflictEvents } from '../server/gdeltFetcher.js';
import { applyHaikuFilter }    from '../server/haikuFilter.js';
import { fetchUCDPEvents }     from '../server/ucdpFetcher.js';
import { setEventsInBlob, isBlobConfigured } from '../server/blobCache.js';

async function main() {
  if (!isBlobConfigured()) {
    console.error('[refresh] BLOB_READ_WRITE_TOKEN is not set — cannot write to Blob. Aborting.');
    process.exit(1);
  }

  // ── Step 1: GDELT ────────────────────────────────────────────────────────
  console.log('[refresh] === GDELT FETCH ===');
  console.log('[refresh] Fetching GDELT events (7 days, 6h steps, limit 2000)...');
  let gdeltEvents = [];
  try {
    gdeltEvents = await fetchConflictEvents({ days: 7, stepHours: 6, limit: 2000 });
    console.log(`[refresh] GDELT raw: ${gdeltEvents.length} events`);

    console.log(`[refresh] Running Haiku filter on ${gdeltEvents.length} events...`);
    gdeltEvents = await applyHaikuFilter(gdeltEvents);
    console.log(`[refresh] GDELT after Haiku: ${gdeltEvents.length} events`);
  } catch (err) {
    console.error('[refresh] GDELT fetch/filter failed:', err.message);
    gdeltEvents = [];
  }

  // Tag all GDELT events explicitly
  gdeltEvents = gdeltEvents.map((e) => ({ ...e, source: e.source || 'gdelt' }));

  // ── Step 2: UCDP ─────────────────────────────────────────────────────────
  console.log('[refresh] === UCDP FETCH ===');
  const ucdpToken = process.env.UCDP_API_TOKEN;
  let ucdpEvents  = [];

  if (!ucdpToken) {
    console.warn('[refresh] UCDP_API_TOKEN not set — skipping UCDP fetch');
  } else {
    try {
      // Fetch 2024 data (most complete recent year) + 2023 for historical depth.
      // 2025 data is partial/not yet released depending on UCDP update cycle.
      ucdpEvents = await fetchUCDPEvents({
        token:     ucdpToken,
        years:     [2024, 2023],
        maxEvents: 1500,
      });
      console.log(`[refresh] UCDP: ${ucdpEvents.length} validated events`);
    } catch (err) {
      console.error('[refresh] UCDP fetch failed:', err.message);
      ucdpEvents = [];
    }
  }

  // ── Step 3: Merge ─────────────────────────────────────────────────────────
  console.log('[refresh] === MERGE ===');
  const merged = [...gdeltEvents, ...ucdpEvents];
  console.log(`[refresh] Merged: ${gdeltEvents.length} GDELT + ${ucdpEvents.length} UCDP = ${merged.length} total`);

  // Sort by date descending, UCDP events with same date sort before GDELT
  // (UCDP is higher confidence so surfaces first at the same date)
  merged.sort((a, b) => {
    const dateDiff = new Date(b.event_date) - new Date(a.event_date);
    if (dateDiff !== 0) return dateDiff;
    // Same date: UCDP before GDELT
    if (a.source === 'ucdp' && b.source !== 'ucdp') return -1;
    if (b.source === 'ucdp' && a.source !== 'ucdp') return  1;
    return 0;
  });

  // Cap at 800 — keeps response payload manageable while showing dense coverage
  const final = merged.slice(0, 800);

  const gdeltCount = final.filter((e) => e.source !== 'ucdp').length;
  const ucdpCount  = final.filter((e) => e.source === 'ucdp').length;
  console.log(`[refresh] Final: ${final.length} events (${gdeltCount} GDELT, ${ucdpCount} UCDP)`);

  // ── Step 4: Write to Blob ─────────────────────────────────────────────────
  const fetchedAt = Date.now();
  await setEventsInBlob(final, fetchedAt);

  console.log(`[refresh] Blob updated — ${final.length} events written at ${new Date(fetchedAt).toISOString()}`);
}

main().catch((err) => {
  console.error('[refresh] Fatal error:', err);
  process.exit(1);
});
