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
// Design principles:
//  1. Lead with what we ACCEPT — keeps the model anchored on the right framing
//  2. Exhaustive REJECT list prevents "conflict-adjacent" false positives
//  3. Geographic context: US/EU/stable-country events need a higher bar
//  4. Include actor types so the model can assess whether actors are armed
//  5. Binary YES/NO only — max 5 tokens
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Haiku classification prompt.
//
// The single decisive criterion: does the article describe an event where
// WEAPONS WERE USED or PEOPLE WERE PHYSICALLY KILLED/INJURED in a military,
// paramilitary, or armed-group context?
//
// If nobody was shot, bombed, shelled, stabbed, or killed by an armed actor,
// the answer is NO — regardless of how conflict-adjacent the language sounds.
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

Actor 1: {actor1} (GDELT type: {actor1_type})
Actor 2: {actor2} (GDELT type: {actor2_type})
Event: {event_type} / {sub_event_type}
Location: {location}
Source URL: {source_url}
Summary: {notes}

Answer YES or NO only.`;

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
async function classifyEvent(client, event, retries = 2) {
  const prompt = PROMPT_TEMPLATE
    .replace('{actor1}',      event.actor1)
    .replace('{actor1_type}', event.actor1_type || 'unknown')
    .replace('{actor2}',      event.actor2)
    .replace('{actor2_type}', event.actor2_type || 'unknown')
    .replace('{event_type}',  event.event_type)
    .replace('{sub_event_type}', event.sub_event_type || '')
    .replace('{location}',    event.location)
    .replace('{source_url}',  event.source_url || 'unavailable')
    .replace('{notes}',       event.notes || '');

  // High-confidence signal: armed actor type + extreme Goldstein.
  // If Haiku is unavailable (rate limit exhausted), we fail open for these.
  const isHighConfidence =
    (ARMED_ACTOR_TYPES.has(event.actor1_type) || ARMED_ACTOR_TYPES.has(event.actor2_type)) &&
    event.goldstein_scale <= -4;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const message = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages:   [{ role: 'user', content: prompt }],
      });
      const answer = message.content[0]?.text?.trim().toUpperCase();
      return answer === 'YES';
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
        return true;
      }
      console.warn(`[haiku] Classification failed for ${event.event_id_cnty}: ${err.message?.slice(0, 80)}`);
      return false; // Fail closed — reject ambiguous events
    }
  }
  return false;
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
    const batch   = reviewSlice.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((e) => classifyEvent(client, e)));

    for (let j = 0; j < batch.length; j++) {
      if (results[j]) {
        passed.push(batch[j]);
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
