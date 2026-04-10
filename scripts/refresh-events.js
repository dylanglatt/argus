#!/usr/bin/env node
/**
 * scripts/refresh-events.js
 * -------------------------
 * Standalone ESM script that fetches GDELT events, filters them through
 * Claude Haiku for quality, and writes the cleaned set to Vercel Blob.
 *
 * Designed to run in GitHub Actions on a 30-minute schedule.
 * Can also be run locally: node scripts/refresh-events.js
 *
 * Requires env vars:
 *   BLOB_READ_WRITE_TOKEN  — Vercel Blob token
 *   ANTHROPIC_API_KEY      — for Haiku classification
 */

import 'dotenv/config';
import { fetchConflictEvents } from '../server/gdeltFetcher.js';
import { applyHaikuFilter } from '../server/haikuFilter.js';
import { setEventsInBlob, isBlobConfigured } from '../server/blobCache.js';

async function main() {
  // Guard: Blob must be configured
  if (!isBlobConfigured()) {
    console.error('[refresh] BLOB_READ_WRITE_TOKEN is not set — cannot write to Blob. Aborting.');
    process.exit(1);
  }

  console.log('[refresh] Starting GDELT fetch (7 days, 6h steps, limit 2000)...');
  const events = await fetchConflictEvents({ days: 7, stepHours: 6, limit: 2000 });
  console.log(`[refresh] GDELT returned ${events.length} events`);

  console.log(`[refresh] Sending ${events.length} events to Haiku filter...`);
  const filtered = await applyHaikuFilter(events);
  console.log(`[refresh] Haiku filter: ${filtered.length} passed / ${events.length - filtered.length} rejected`);

  // Sort by event_date descending and take top 500
  filtered.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
  const final = filtered.slice(0, 500);

  const fetchedAt = Date.now();
  await setEventsInBlob(final, fetchedAt);

  console.log(`[refresh] Blob updated — ${final.length} events written, fetchedAt: ${new Date(fetchedAt).toISOString()}`);
}

main().catch((err) => {
  console.error('[refresh] Fatal error:', err);
  process.exit(1);
});
