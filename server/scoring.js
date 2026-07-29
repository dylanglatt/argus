/**
 * scoring.js, conflict severity model (server / pipeline)
 * ----------------------------------------------
 * NOTE: keep this file in sync with src/utils/scoring.js (identical logic). The
 * client copy is authoritative for what the user sees: severity is recomputed
 * on load so the score is transparent and consistent regardless of which data
 * path served the event (Blob, live GDELT, or mock).
 *
 * Why not just use Goldstein? GDELT's Goldstein value is a fixed lookup keyed
 * on the CAMEO code, so nearly every kinetic event lands at or near -10. Using
 * it as the dominant term made almost every event score 7-8. This model keeps
 * Goldstein as one input (the CAMEO baseline) but adds axes that actually vary
 * event to event, so the 0-10 score discriminates.
 *
 * severity (0-10) = weighted sum of five normalized components:
 *   intensity      0.40  CAMEO event-type / sub-event kinetic tier
 *   reach          0.20  log-scaled media mentions
 *   corroboration  0.15  log-scaled distinct source outlets
 *   goldstein      0.15  inverted Goldstein scale (the CAMEO baseline)
 *   tone           0.10  how hostile the coverage is (inverted avg tone)
 * plus a small boost for satellite (FIRMS) corroboration.
 */

const WEIGHTS = {
  intensity:     0.40,
  reach:         0.20,
  corroboration: 0.15,
  goldstein:     0.15,
  tone:          0.10,
};

// Base kinetic intensity by Argus event type (0-10).
const TYPE_BASE = {
  'Violence against civilians': 7.5,
  'Explosions/Remote violence': 7.5,
  'Battles':                    6.5,
  'Riots':                      4.5,
  'Strategic developments':     3.5,
};

// Sub-event keyword -> intensity floor. The most severe matching pattern wins.
const SUBEVENT_TIERS = [
  [/genocide|ethnic cleansing|mass killing|massacre/i, 10],
  [/suicide bomb/i,                                     9.5],
  [/car bomb|vehicle bomb/i,                            9],
  [/airstrike|air strike|artillery|rocket|naval strike|shelling/i, 9],
  [/bombing|\bied\b|roadside/i,                         8.5],
  [/assassinat/i,                                       8.5],
  [/mass violence|mass expulsion/i,                     8.5],
  [/hostage|abduct|kidnap|siege/i,                      8],
  [/small arms|armed clash|firefight|fight with/i,      7.5],
  [/assault|attack/i,                                   7],
  [/occupy|blockade|ceasefire violation/i,              6],
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function intensityComponent(event) {
  let v = TYPE_BASE[event.event_type] ?? 4;
  const sub = event.sub_event_type || '';
  for (const [re, floor] of SUBEVENT_TIERS) {
    if (re.test(sub) && floor > v) v = floor;
  }
  return clamp(v, 0, 10);
}

function reachComponent(event) {
  const m = event.num_mentions || 0;
  return clamp((Math.log2(m + 1) / Math.log2(500)) * 10, 0, 10);
}

function corroborationComponent(event) {
  const s = event.num_sources || 0;
  return clamp((Math.log2(s + 1) / Math.log2(50)) * 10, 0, 10);
}

function goldsteinComponent(event) {
  return clamp(-(event.goldstein_scale || 0), 0, 10);
}

function toneComponent(event) {
  // avg_tone is roughly -20..+20; more negative = more hostile = higher.
  return clamp((-(event.avg_tone || 0) / 12) * 10, 0, 10);
}

/**
 * Compute the 0-10 severity score and its component breakdown for an event.
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreEvent(event) {
  const c = {
    intensity:     intensityComponent(event),
    reach:         reachComponent(event),
    corroboration: corroborationComponent(event),
    goldstein:     goldsteinComponent(event),
    tone:          toneComponent(event),
  };

  let raw =
    c.intensity     * WEIGHTS.intensity +
    c.reach         * WEIGHTS.reach +
    c.corroboration * WEIGHTS.corroboration +
    c.goldstein     * WEIGHTS.goldstein +
    c.tone          * WEIGHTS.tone;

  const boost = event.satellite_corroborated ? 0.5 : 0;
  raw = clamp(raw + boost, 0, 10);

  return {
    score: Math.round(raw),
    breakdown: {
      intensity:     Math.round(c.intensity * 10) / 10,
      reach:         Math.round(c.reach * 10) / 10,
      corroboration: Math.round(c.corroboration * 10) / 10,
      goldstein:     Math.round(c.goldstein * 10) / 10,
      tone:          Math.round(c.tone * 10) / 10,
      satellite_boost: boost,
      raw:           Math.round(raw * 10) / 10,
      weights:       WEIGHTS,
    },
  };
}
