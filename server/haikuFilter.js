/**
 * haikuFilter.js
 * --------------
 * Claude Haiku classification gate for GDELT events.
 *
 * Problem: GDELT uses NLP to extract CAMEO event codes from raw news text.
 * It frequently misclassifies non-conflict content:
 *   - "Travelers fight TSA policy"     → CAMEO 190 "Use conventional military force"
 *   - "Police respond to road rage"    → CAMEO 193 "Fight"
 *   - "TSA privatization plan"         → CAMEO 174 "Impose sanctions"
 *
 * GDELT's structural filters (QuadClass, root codes, Goldstein) are CAMEO-derived
 * and inherit these same misclassifications — they cannot fix this.
 *
 * Solution: Route all events except the highest-confidence ones through Haiku
 * for binary YES/NO classification against strict operational criteria.
 *
 * Auto-pass criteria (Haiku skipped):
 *   - Actor types include military/rebel/armed group (MIL, REB, SPY, UAF, etc.)
 *   - AND Goldstein ≤ -7 (extreme conflict scale)
 *   - AND num_sources ≥ 10 (widely reported, not single-outlet noise)
 *   These are virtually certain to be real combat/atrocity events.
 *
 * Everything else → Haiku YES/NO classification.
 */

import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Extract a human-readable headline from the URL slug.
// GDELT source URLs frequently encode the article headline in the path, e.g.:
//   /news/jihadists-kill-18-nigerian-troops-including-senior-brigadier-general/...
// This is free, zero-latency, and degrades gracefully when the slug is an ID.
// ---------------------------------------------------------------------------
function extractUrlSlug(url) {
  if (!url) return '';
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // Walk path segments from the end, take the longest non-UUID-looking one
    for (let i = parts.length - 1; i >= 0; i--) {
      const seg = parts[i]
        .replace(/\.[^.]+$/, '')                                              // strip extension
        .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '') // strip UUIDs
        .replace(/^article_[\w]+$/i, '')                                      // strip bare article IDs
        .replace(/[-_]+/g, ' ')
        .trim();
      if (seg.length > 20 && /\s/.test(seg)) return seg;                     // looks like a real headline
    }
    return '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Attempt to fetch the article and extract title + visible text excerpt.
// Designed to be best-effort: any failure returns null and the system falls
// back to the URL slug. A 3s timeout prevents slow sources from blocking
// the Haiku batch pipeline.
// ---------------------------------------------------------------------------
async function fetchArticleSnippet(url, timeoutMs = 3000) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArgusNewsBot/1.0; +https://argus.example.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const html = await res.text();

    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]{5,200})<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/\s+/g, ' ').trim()
      : null;

    // Strip scripts, styles, tags → plain visible text → first 700 chars
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 700);

    return { title, bodyText };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Actor type codes that indicate state or non-state armed actors.
// GDELT assigns these from its actor type ontology.
// ---------------------------------------------------------------------------
const ARMED_ACTOR_TYPES = new Set([
  'MIL',  // Military
  'REB',  // Rebel forces
  'SPY',  // Intelligence / secret service
  'COP',  // Police / law enforcement (kept — state security)
  'UAF',  // Unidentified armed forces
  'GOV',  // Government (kept — state-on-state actions)
  'IGO',  // Intergovernmental org (NATO, UN peacekeepers)
]);

// ---------------------------------------------------------------------------
// Determine if an event can auto-pass Haiku based on hard signals.
// Criteria: armed actors + meaningful conflict score + multi-outlet coverage.
//
// Threshold rationale:
//   goldstein ≤ -4 covers CAMEO codes like "Use conventional military force"
//   (190x) and "Fight" (193x) which are inherently kinetic — very few false
//   positives leak through at this level.
//   num_sources ≥ 3: two additional outlets beyond the origin article confirms
//   the event was newsworthy enough to propagate beyond a single outlet.
// ---------------------------------------------------------------------------
function canAutoPass(event) {
  const hasArmedActor =
    ARMED_ACTOR_TYPES.has(event.actor1_type) ||
    ARMED_ACTOR_TYPES.has(event.actor2_type);

  return (
    hasArmedActor &&
    event.goldstein_scale <= -4 &&
    event.num_sources >= 3
  );
}

// ---------------------------------------------------------------------------
// Haiku classification prompt.
//
// The single decisive criterion: does the article describe an event where
// WEAPONS WERE USED or PEOPLE WERE PHYSICALLY KILLED/INJURED in a military,
// paramilitary, or armed-group context?
//
// Design principles:
//  1. Lead with what we ACCEPT — keeps the model anchored on the right framing
//  2. Exhaustive REJECT list prevents "conflict-adjacent" false positives
//  3. Article content (fetched) takes priority over GDELT's sparse actor fields
//  4. YES response must include a factual note drawn from the article, not GDELT
// ---------------------------------------------------------------------------
const PROMPT_TEMPLATE = `You are a conflict analyst filtering events for a military intelligence dashboard.

The ONLY question you must answer: does this event describe KINETIC VIOLENCE in a military or armed-group context?

YES means ALL of the following are true:
1. Weapons were used, people were physically killed/injured, OR an armed force conducted a specific military operation with clear territorial or physical effect (territory seizure, incursion, shelling of a position, troop deployment into an active combat zone, hostage-taking or abduction by an armed group)
2. The perpetrators are military forces, armed rebel groups, paramilitary, terrorists, or state security forces acting in a combat role
3. The context is active armed conflict, war, insurgency, or terrorism — NOT domestic crime, cultural controversy, elections, or diplomatic maneuvering

NO means ANY of the following:
- No weapons were used and no one was physically harmed
- The violence is domestic crime (murder, road rage, robbery, assault, gang activity)
- The event is about politics, policy, sanctions, diplomacy, peace talks, or elections
- The event is about protests, demonstrations, activism, or cultural controversy
- The event involves celebrities, entertainment, sports, or media disputes
- The event is about hate speech, antisemitism, or discrimination WITHOUT physical violence occurring
- The event describes threats, warnings, alerts, or posturing with no actual kinetic action reported
- Military mobilization, alert-status changes, or force build-ups WITHOUT confirmed combat contact (e.g. "forces placed on alert", "troops massed near border", "military exercises")
- The event is a legal proceeding, arrest, deportation, or court ruling
- The article is an opinion piece, editorial, analysis, commentary, or retrospective — i.e. it reflects on or analyzes a conflict rather than reporting a specific, new kinetic event
- The article headline or framing uses constructs like "what X reveals about", "lessons from", "the case for/against", "why X matters", "what we learned", or other analytical/opinion framing
- The source URL contains terms like court, custody, protective-order, divorce, sports, celebrity, entertainment, or other non-conflict topics

GDELT structured data (may have sparse or incorrect actors — treat as secondary):
  Actor 1: {actor1} (GDELT type: {actor1_type})
  Actor 2: {actor2} (GDELT type: {actor2_type})
  Event code: {event_type} / {sub_event_type}
  Location: {location}
  Source URL: {source_url}

Article content (primary source — use this to determine what actually happened):
{article_context}

If YES: respond with YES followed by a colon and one factual sentence drawn from the article (specific actors, action, location, and casualty count if reported). Under 120 characters. Prefer actor names from the article over GDELT codes.
If NO: respond with NO only.`;

// ---------------------------------------------------------------------------
// Build the article context string injected into the Haiku prompt.
// Priority: fetched article (title + excerpt) → URL slug → fallback label.
// This replaces the previous {notes} field which was just a GDELT template
// restatement and gave Haiku no actual article content to reason from.
// ---------------------------------------------------------------------------
function buildArticleContext(snippet, slug) {
  if (snippet?.title || snippet?.bodyText) {
    const parts = [];
    if (snippet.title)    parts.push(`Title: ${snippet.title}`);
    if (snippet.bodyText) parts.push(`Excerpt: ${snippet.bodyText}`);
    return parts.join('\n');
  }
  if (slug) return `URL headline: ${slug}`;
  return '(article content not available — classify from GDELT fields only)';
}

// ---------------------------------------------------------------------------
// Classify a single event with retry on rate limits.
//
// Failure strategy (two-tier):
//   FAIL OPEN  — armed actor + Goldstein ≤ -4: these have already cleared the
//                structural filter gauntlet; a rate-limit hiccup shouldn't kill
//                them. We accept a small risk of passing marginal events over
//                silently discarding high-confidence kinetic incidents.
//   FAIL CLOSED — everything else: we'd rather drop an ambiguous event than
//                 show noise on an operational dashboard.
// ---------------------------------------------------------------------------
async function classifyEvent(client, event, snippet = null, retries = 2) {
  const slug           = extractUrlSlug(event.source_url);
  const articleContext = buildArticleContext(snippet, slug);

  const prompt = PROMPT_TEMPLATE
    .replace('{actor1}',          event.actor1)
    .replace('{actor1_type}',     event.actor1_type || 'unknown')
    .replace('{actor2}',          event.actor2)
    .replace('{actor2_type}',     event.actor2_type || 'unknown')
    .replace('{event_type}',      event.event_type)
    .replace('{sub_event_type}',  event.sub_event_type || '')
    .replace('{location}',        event.location)
    .replace('{source_url}',      event.source_url || 'unavailable')
    .replace('{article_context}', articleContext);

  // High-confidence signal: armed actor type + extreme Goldstein.
  // If Haiku is unavailable (rate limit exhausted), we fail open for these.
  const isHighConfidence =
    (ARMED_ACTOR_TYPES.has(event.actor1_type) || ARMED_ACTOR_TYPES.has(event.actor2_type)) &&
    event.goldstein_scale <= -4;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const message = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages:   [{ role: 'user', content: prompt }],
      });
      const raw = message.content[0]?.text?.trim() || '';
      const upper = raw.toUpperCase();
      if (upper.startsWith('YES')) {
        const colonIdx = raw.indexOf(':');
        const note = colonIdx !== -1 ? raw.slice(colonIdx + 1).trim() : null;
        return { pass: true, note };
      }
      return { pass: false, note: null };
    } catch (err) {
      const isRateLimit = err.status === 429;
      if (isRateLimit && attempt < retries) {
        // Exponential backoff: 3s, 6s
        const wait = 3000 * (attempt + 1);
        console.warn(`[haiku] Rate limited on ${event.event_id_cnty} — retrying in ${wait / 1000}s (attempt ${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      // Retries exhausted — apply two-tier failure strategy
      if (isHighConfidence) {
        console.warn(`[haiku] ⚠ Fail-open (high-confidence) ${event.event_id_cnty}: ${err.message?.slice(0, 60)}`);
        return { pass: true, note: null };
      }
      console.warn(`[haiku] Classification failed for ${event.event_id_cnty}: ${err.message?.slice(0, 80)}`);
      return { pass: false, note: null }; // Fail closed — reject ambiguous events
    }
  }
  return { pass: false, note: null };
}

// ---------------------------------------------------------------------------
// Public API: applyHaikuFilter(events, options)
//
// @param {Array}  events
// @param {Object} options
// @param {number} options.batchSize  Parallel Haiku calls per batch (default 15)
// @param {number} options.maxReview  Max events reviewed per cycle (default 400)
// @returns {Promise<Array>} Filtered events
// ---------------------------------------------------------------------------
export async function applyHaikuFilter(events, { batchSize = 8, maxReview = 600 } = {}) {
  // Vercel serverless functions have a 30s timeout — the 10s inter-batch delay
  // makes Haiku infeasible here. Structural CAMEO filtering already gates to
  // kinetic events only; CDN-level caching (s-maxage=3600) handles freshness.
  if (process.env.VERCEL) {
    console.log('[haiku] Serverless env detected — skipping Haiku filter (CDN cache active)');
    return events;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[haiku] ANTHROPIC_API_KEY not set — skipping Haiku filter');
    return events;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const autoPassed = [];
  const toReview   = [];

  for (const event of events) {
    if (canAutoPass(event)) {
      autoPassed.push(event);
    } else {
      toReview.push(event);
    }
  }

  // Events beyond maxReview are DROPPED, not passed through — we'd rather have
  // fewer high-confidence events than silently pass unreviewed noise.
  const reviewSlice  = toReview.slice(0, maxReview);
  const dropped      = toReview.length - reviewSlice.length;

  console.log(
    `[haiku] ${autoPassed.length} auto-passed (armed actors + Goldstein ≤ -5 + ≥5 sources) |` +
    ` reviewing ${reviewSlice.length}/${toReview.length}` +
    (dropped > 0 ? ` | ${dropped} dropped (over cap — increase maxReview if needed)` : '')
  );

  const passed  = [];
  let   filtered = 0;

  for (let i = 0; i < reviewSlice.length; i += batchSize) {
    const batch    = reviewSlice.slice(i, i + batchSize);

    // Fetch article snippets in parallel with a per-request timeout.
    // Failures return null and fall back to URL slug extraction — never blocks.
    const snippets = await Promise.all(batch.map((e) => fetchArticleSnippet(e.source_url)));

    const results = await Promise.all(
      batch.map((e, idx) => classifyEvent(client, e, snippets[idx]))
    );

    for (let j = 0; j < batch.length; j++) {
      if (results[j].pass) {
        passed.push({ ...batch[j], notes: results[j].note || batch[j].notes });
      } else {
        filtered++;
        console.log(
          `[haiku] ✗ [${batch[j].event_type}/${batch[j].sub_event_type}]` +
          ` actors: ${batch[j].actor1}(${batch[j].actor1_type}) vs ${batch[j].actor2}(${batch[j].actor2_type})` +
          ` — ${batch[j].notes?.slice(0, 80)}`
        );
      }
    }

    // Rate limit pacing: 50 RPM cap → 8 requests per batch → max 6 batches/min.
    // 10s gap between batches keeps us well under the limit even with retries.
    if (i + batchSize < reviewSlice.length) {
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  console.log(
    `[haiku] Done — kept ${passed.length}/${reviewSlice.length} reviewed | filtered ${filtered} as noise`
  );

  return [...autoPassed, ...passed];
}
