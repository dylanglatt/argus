/**
 * api/brief/[country].js
 * ----------------------
 * GET /api/brief/:country
 *
 * Returns an AI-generated theater situation report for the given country.
 * Uses Claude Haiku to synthesize a 3-paragraph sitrep from:
 *   - Recent GDELT events (from current Blob cache) for that country
 *   - UCDP events for that country (from current Blob cache)
 *
 * Response:
 *   { sitrep: string, gdelt_events: number, ucdp_events: number, generated_at: number }
 *
 * Cached at the CDN level for 30 minutes — expensive to generate but
 * the situation doesn't change minute-to-minute.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getEventsFromBlob } from '../../server/blobCache.js';

const SITREP_PROMPT = `You are a senior conflict analyst writing a theater situation report for a classified intelligence briefing.

Country: {country}

Recent GDELT news signals ({gdelt_count} events, last 7 days):
{gdelt_summary}

UCDP validated conflict data ({ucdp_count} events):
{ucdp_summary}

Write a concise 3-paragraph situation report (SITREP) covering:
1. CURRENT SITUATION: Who is fighting whom, where, and what type of violence (state-based conflict, insurgency, civilian targeting, etc.)
2. RECENT TRAJECTORY: Is violence escalating, de-escalating, or stable? What is driving the trend?
3. KEY ACTORS & ASSESSMENT: Name the primary armed actors and give a brief analytic assessment of the most significant threat or development.

Rules:
- Write in third person, present tense, past tense for specific events
- Be specific: use actor names, location names, and fatality numbers where available
- No hedging language like "it appears" or "may be" — write with analytic confidence
- Do not use bullet points or headers — write flowing prose only
- Maximum 200 words total
- If data is sparse, say so briefly and note what is known`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }

  const country = req.query.country;
  if (!country || country.length > 100) {
    res.status(400).json({ error: 'Invalid country parameter' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI brief unavailable — ANTHROPIC_API_KEY not configured' });
    return;
  }

  try {
    // Pull events from Blob cache (same source as the main event feed)
    const blobResult = await getEventsFromBlob();
    const allEvents  = blobResult?.events || [];

    // Filter to the requested country
    const countryEvents = allEvents.filter(
      (e) => (e.country || '').toLowerCase() === country.toLowerCase()
    );

    const gdeltEvents = countryEvents.filter((e) => e.source !== 'ucdp');
    const ucdpEvents  = countryEvents.filter((e) => e.source === 'ucdp');

    // Build compact event summaries for the prompt
    const gdeltSummary = gdeltEvents.length === 0
      ? 'No recent GDELT signals for this country.'
      : gdeltEvents
          .sort((a, b) => new Date(b.event_date) - new Date(a.event_date))
          .slice(0, 15)
          .map((e) => {
            const actors = [e.actor1, e.actor2].filter((a) => a && a !== 'Unknown').join(' vs. ') || 'Unknown actors';
            return `[${e.event_date}] ${e.sub_event_type || e.event_type} — ${actors} in ${e.location}. ${e.notes || ''}`.slice(0, 200);
          })
          .join('\n');

    const ucdpSummary = ucdpEvents.length === 0
      ? 'No UCDP validated data available for this country.'
      : ucdpEvents
          .sort((a, b) => new Date(b.event_date) - new Date(a.event_date))
          .slice(0, 10)
          .map((e) => {
            const kia = e.fatalities_best > 0 ? ` (${e.fatalities_best} killed)` : '';
            return `[${e.event_date}] ${e.ucdp_conflict || e.sub_event_type} — ${e.actor1} vs. ${e.actor2}${kia}. ${e.location}.`;
          })
          .join('\n');

    const prompt = SITREP_PROMPT
      .replace('{country}',      country)
      .replace('{gdelt_count}',  String(gdeltEvents.length))
      .replace('{gdelt_summary}', gdeltSummary)
      .replace('{ucdp_count}',   String(ucdpEvents.length))
      .replace('{ucdp_summary}', ucdpSummary);

    const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message  = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages:   [{ role: 'user', content: prompt }],
    });

    const sitrep = message.content[0]?.text?.trim() || 'Situation report unavailable.';

    res.status(200).json({
      sitrep,
      gdelt_events:  gdeltEvents.length,
      ucdp_events:   ucdpEvents.length,
      generated_at:  Date.now(),
    });
  } catch (err) {
    console.error('[brief] Error generating sitrep:', err.message);
    res.status(500).json({ error: 'Failed to generate situation report', detail: err.message });
  }
}
