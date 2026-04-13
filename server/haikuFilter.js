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
 * Solution: Route events through Haiku for structured multi-dimensional scoring.
 * Returns JSON with five analyst dimensions (credibility, severity, specificity,
 * novelty, conflict_relevance), a 0–12 total score, tags, confidence, and a
 * one-line reasoning note. Stored as `ai_classification` on passing events.
 *
 * Auto-pass criteria (Haiku skipped — no API call needed):
 *   - Actor types include military/rebel/armed group (MIL, REB, SPY, UAF, etc.)
 *   - AND Goldstein ≤ -4 (extreme conflict scale)
 *   - AND num_sources ≥ 3 (corroborated across multiple outlets)
 *   These are virtually certain to be real combat/atrocity events.
 *
 * Everything else → Haiku structured classification.
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
// Returns a structured JSON assessment across five analyst dimensions:
//   CREDIBILITY      (0-2): Source quality and corroboration
//   SEVERITY         (0-3): Real-world physical impact
//   SPECIFICITY      (0-2): Concreteness of who/what/where/when
//   NOVELTY          (0-2): New signal vs. known/redundant
//   CONFLICT_RELEVANCE (0-3): Directness of kinetic/strategic relevance
//
// Decision rule: include = true IFF score ≥ 7 AND credibility ≥ 1 AND
//                conflict_relevance ≥ 2.
//
// Design principles:
//  1. Article content (fetched) takes priority over GDELT's sparse actor fields
//  2. Structured output surfaces analyst reasoning, not just a pass/fail gate
//  3. Tags enable downstream UI filtering and pattern analysis
//  4. Auto-reject patterns listed explicitly to minimize false positives
//  5. Edge-case escalation signals (troop movements, first violence reports)
//     are called out for inclusion even at low severity scores
// ---------------------------------------------------------------------------
const PROMPT_TEMPLATE = `You are a fusion analyst at a military intelligence organization classifying news events for an operational conflict dashboard.

Score this event across five dimensions. Return ONLY valid JSON — no markdown, no explanation outside the JSON.

DIMENSIONS:
1. credibility (0-2): 0=noise/rumor/single-outlet  1=plausible but weak  2=multiple outlets or concrete sourcing
2. severity (0-3): 0=no material impact  1=localized/low-intensity  2=significant violence or infrastructure damage  3=major escalation, mass casualties, or strategic shift
3. specificity (0-2): 0=vague ("tensions rise", "clashes reported")  1=some detail but ambiguous  2=concrete actors + location + action reported
4. novelty (0-2): 0=redundant/retrospective/analysis  1=incremental update to ongoing situation  2=new specific incident being reported
5. conflict_relevance (0-3): 0=unrelated  1=indirect (diplomacy, sanctions, rhetoric)  2=logistics/support/intelligence activity  3=direct kinetic violence or civilian harm

INCLUDE = true ONLY IF: (sum ≥ 7) AND (credibility ≥ 1) AND (conflict_relevance ≥ 2)

AUTO-REJECT (conflict_relevance = 0, include = false):
- Domestic crime with no armed-group context
- Pure political rhetoric, elections, sanctions, diplomacy
- Protests without violence or escalation
- Opinion pieces, editorials, retrospectives, analysis
- Entertainment, sports, celebrity, immigration enforcement
- Threats or posturing with no confirmed kinetic action
- Legal proceedings, court rulings, arrests

ALWAYS INCLUDE even if small (these are escalation precursors):
- First confirmed violence in a previously quiet area
- Troop movements or verified force deployments
- Weapons transfers or military logistics
- Airspace violations or border incursions
- Cross-border attacks of any scale

GDELT data (secondary — may misclassify via NLP; treat as weak signal):
  Actor 1: {actor1} (type: {actor1_type})
  Actor 2: {actor2} (type: {actor2_type})
  Event: {event_type} / {sub_event_type}
  Location: {location}
  Source: {source_url}

Article content (primary — determine what actually happened from this):
{article_context}

Tags (choose all that apply): battle, explosion, airstrike, civilian_harm, troop_movement, weapons_transfer, border_incident, siege, assassination, hostage, riot, blockade, cross_border_attack, naval_incident, mass_casualty

Return ONLY this JSON structure:
{"include":BOOL,"score":INT,"breakdown":{"credibility":INT,"severity":INT,"specificity":INT,"novelty":INT,"conflict_relevance":INT},"reasoning":"ONE factual sentence from the article — specific actors, action, location, casualty count if known","tags":["tag1"],"confidence":"low"|"medium"|"high"}`;

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
// Parse a structured JSON classification response from Haiku.
//
// The model is instructed to return raw JSON only. In practice it occasionally
// wraps in markdown fences — we strip those first. If parsing fails entirely,
// we fall back to checking for a legacy YES/NO prefix so existing cached
// responses degrade gracefully.
// ---------------------------------------------------------------------------
function parseClassification(raw) {
  if (!raw) return null;

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const obj = JSON.parse(cleaned);
    // Validate required fields
    if (typeof obj.include !== 'boolean') return null;
    if (typeof obj.score   !== 'number')  return null;
    return {
      include:    obj.include,
      score:      Math.max(0, Math.min(12, Math.round(obj.score))),
      breakdown:  obj.breakdown  || null,
      reasoning:  obj.reasoning  || null,
      tags:       Array.isArray(obj.tags) ? obj.tags : [],
      confidence: ['low', 'medium', 'high'].includes(obj.confidence) ? obj.confidence : 'medium',
    };
  } catch {
    // Legacy fallback: binary YES/NO format
    const upper = cleaned.toUpperCase();
    if (upper.startsWith('YES')) {
      const colonIdx = cleaned.indexOf(':');
      const reasoning = colonIdx !== -1 ? cleaned.slice(colonIdx + 1).trim() : null;
      return { include: true, score: null, breakdown: null, reasoning, tags: [], confidence: 'medium' };
    }
    if (upper.startsWith('NO')) {
      return { include: false, score: null, breakdown: null, reasoning: null, tags: [], confidence: 'medium' };
    }
    return null; // unparseable
  }
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
        max_tokens: 300,   // structured JSON needs more room than a YES/NO + line
        messages:   [{ role: 'user', content: prompt }],
      });
      const raw    = message.content[0]?.text?.trim() || '';
      const result = parseClassification(raw);

      if (!result) {
        console.warn(`[haiku] Unparseable response for ${event.event_id_cnty}: ${raw.slice(0, 80)}`);
        return { pass: false, classification: null };
      }

      if (result.include) {
        return { pass: true, classification: result };
      }
      return { pass: false, classification: result };

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
        return { pass: true, classification: null };
      }
      console.warn(`[haiku] Classification failed for ${event.event_id_cnty}: ${err.message?.slice(0, 80)}`);
      return { pass: false, classification: null }; // Fail closed — reject ambiguous events
    }
  }
  return { pass: false, classification: null };
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
      const { pass, classification } = results[j];
      const ev = batch[j];

      if (pass) {
        // Attach structured AI classification to the event.
        // `notes` is kept for backward compatibility with the UI's NOTES section;
        // `ai_classification` carries the full structured assessment.
        const aiNote = classification?.reasoning || ev.notes;
        passed.push({
          ...ev,
          notes:             aiNote,
          ai_classification: classification || null,
        });
      } else {
        filtered++;
        console.log(
          `[haiku] ✗ [${ev.event_type}/${ev.sub_event_type}]` +
          ` actors: ${ev.actor1}(${ev.actor1_type}) vs ${ev.actor2}(${ev.actor2_type})` +
          ` score=${classification?.score ?? '?'} — ${(classification?.reasoning || ev.notes)?.slice(0, 80)}`
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
