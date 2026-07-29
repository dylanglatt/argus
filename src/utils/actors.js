/**
 * actors.js, actor resolution and relevance gating (client side)
 * ----------------------------------------------------------------
 * GDELT's Actor1Name / Actor2Name fields are NLP-extracted from raw article
 * text. They are frequently NOT real actors: they are common nouns ("Gunman",
 * "Police"), civilian roles ("Worshipper"), facilities ("Military Base"),
 * demonym fragments ("Bahama"), or bare place names. Surfacing those as if they
 * were named belligerents is the single most visible source of noise in the UI.
 *
 * This module makes one honest decision: show an actor ONLY when we can
 * positively resolve it to (a) a state force, (b) a whitelisted named armed
 * group, or (c) an intergovernmental organization. Everything else resolves to
 * null, and the UI renders "Unattributed" rather than a misleading artifact.
 *
 * The GDELT actor TYPE code (MIL, GOV, REB, ...) is structured and reliable;
 * the NAME string is not. So type codes gate inclusion, but we still reject a
 * name that is a known generic noun even when a type code is present, because
 * GDELT routinely tags "Gunman" as UAF or "Military Base" as MIL.
 */

// Lowercased names that are never a real named actor, even with a type code.
// These are the common nouns, civilian roles, facilities, and fragments that
// GDELT extracts from article prose.
const GENERIC_ACTOR_NOUNS = new Set([
  // Combatant common nouns
  'gunman', 'gunmen', 'bandit', 'bandits', 'insurgent', 'insurgents',
  'insurgency', 'militant', 'militants', 'terrorist', 'terrorists',
  'terrorist group', 'fighter', 'fighters', 'attacker', 'attackers',
  'assailant', 'assailants', 'gang', 'gangs', 'gunfire', 'shooter', 'shooters',
  'soldier', 'soldiers', 'rebel', 'rebels', 'militia', 'militias', 'mob', 'mobs',
  'raider', 'raiders', 'kidnapper', 'kidnappers', 'perpetrator', 'perpetrators',
  'operative', 'operatives', 'combatant', 'combatants', 'jihadist', 'jihadists',
  'extremist', 'extremists', 'suspect', 'suspects', 'suicide bomber',
  // Bare institutional / force nouns (no nationality qualifier)
  'military', 'army', 'navy', 'air force', 'police', 'police officer',
  'police officers', 'security', 'security personnel', 'security forces',
  'security force', 'government troops', 'government forces', 'troops',
  'forces', 'armed forces', 'armed group', 'armed men', 'regime', 'junta',
  'authorities', 'intelligence', 'special forces', 'paramilitary',
  'opposition', 'opposition forces', 'government', 'state', 'coast guard',
  'national guard', 'border guard', 'guard', 'peacekeepers',
  // Facilities / places misread as actors
  'military base', 'base', 'prison', 'checkpoint', 'convoy', 'outpost',
  'barracks', 'compound', 'airport', 'airbase', 'embassy',
  // Civilian / community roles
  'civilian', 'civilians', 'resident', 'residents', 'villager', 'villagers',
  'worshipper', 'worshippers', 'worshiper', 'worshipers', 'student', 'students',
  'protester', 'protesters', 'demonstrator', 'demonstrators', 'refugee',
  'refugees', 'migrant', 'migrants', 'prisoner', 'prisoners', 'hostage',
  'hostages', 'victim', 'victims', 'passenger', 'passengers', 'driver',
  'commuter', 'commuters', 'pilgrim', 'pilgrims', 'farmer', 'farmers',
  'herder', 'herders', 'trader', 'traders', 'worker', 'workers',
  // Vague titles
  'commander', 'commanders', 'official', 'officials', 'leader', 'leaders',
  'spokesman', 'spokesperson', 'spokeswoman', 'president', 'minister',
  'lawmaker', 'lawmakers', 'ruler', 'people', 'group', 'unidentified',
  'unknown', 'others', 'member', 'members', 'suspected militants',
]);

// Nationality / national adjectives that, when followed by a force role, name a
// real state actor: "Israeli Military", "Nigerian Forces", "Ukrainian Government".
const NATIONAL_ADJECTIVES = new Set([
  'israeli', 'iranian', 'palestinian', 'ukrainian', 'russian', 'syrian',
  'iraqi', 'yemeni', 'somali', 'nigerian', 'nigerien', 'sudanese', 'libyan',
  'afghan', 'pakistani', 'turkish', 'ethiopian', 'malian', 'chinese', 'indian',
  'lebanese', 'saudi', 'egyptian', 'colombian', 'mexican', 'congolese',
  'philippine', 'filipino', 'burkinabe', 'kurdish', 'american', 'british',
  'french', 'german', 'azerbaijani', 'armenian', 'georgian', 'myanmar',
  'burmese', 'cameroonian', 'chadian', 'kenyan', 'ugandan', 'rwandan',
  'tanzanian', 'mozambican', 'venezuelan', 'haitian', 'algerian', 'moroccan',
  'tunisian', 'jordanian', 'qatari', 'emirati', 'kuwaiti', 'omani', 'bahraini',
  'south', 'central', 'north', 'korean', 'thai', 'burkinese', 'nigérien',
]);

// Force / institution role words that complete a national-actor label.
const ROLE_SUFFIXES = [
  'military', 'armed forces', 'forces', 'army', 'navy', 'air force',
  'government', 'police', 'defense forces', 'defence forces', 'national army',
  'national guard', 'gendarmerie', 'coast guard', 'security forces',
];

// Whitelisted named armed groups and intergovernmental organizations. Matched
// case-insensitively as a substring so "Boko Haram insurgents" still resolves.
const KNOWN_GROUPS = [
  'boko haram', 'iswap', 'iswa', 'islamic state', 'isis', 'isil', 'daesh',
  'al-shabaab', 'al shabaab', 'shabaab', 'al-qaeda', 'al qaeda', 'aqim', 'aqap',
  'hezbollah', 'hizbollah', 'hizbullah', 'hamas', 'houthi', 'houthis',
  'ansar allah', 'taliban', 'ttp', 'wagner', 'pkk', 'ypg', 'sdf', 'hts',
  'hayat tahrir', 'al-nusra', 'nusra', 'jnim', 'codeco', 'adf', 'm23', 'rsf',
  'rapid support forces', 'islamic jihad', 'kataib', "lord's resistance", 'lra',
  'tplf', 'eln', 'farc', 'cjng', 'sinaloa', 'ansaru', 'al-qassam', 'qassam',
  'fulani', 'janjaweed', 'seleka', 'anti-balaka', 'mnla', 'jamaat',
  'nato', 'united nations', 'unifil', 'european union', 'african union',
  'ecowas', 'peacekeeping force', 'idf', 'israel defense forces',
];

// Mangled forms GDELT / the fetcher's title-caser produce, normalized for display.
const DISPLAY_NORMALIZE = {
  'the un': 'United Nations',
  'un': 'United Nations',
  'nato': 'NATO',
  'idf': 'Israel Defense Forces',
  'rsf': 'Rapid Support Forces',
  'sdf': 'Syrian Democratic Forces',
  'pkk': 'PKK',
  'eu': 'European Union',
};

function endsWithRole(lower) {
  return ROLE_SUFFIXES.some((r) => lower === r || lower.endsWith(` ${r}`));
}

/**
 * Resolve a single (name, typeCode) pair to a display string, or null if it is
 * not a real, nameable actor.
 */
// GDELT actor type codes for entities that are never armed belligerents:
// civilians, media, education, business, NGOs, judicial, labor. A name carrying
// one of these is context extracted from the article, not a conflict actor.
const NON_ACTOR_TYPES = new Set(['CVL', 'MED', 'EDU', 'BUS', 'NGO', 'JUD', 'LAB']);

export function resolveActorName(rawName, typeCode) {
  if (!rawName) return null;
  const name = String(rawName).trim();
  if (!name || name.toLowerCase() === 'unknown') return null;

  const lower = name.toLowerCase();
  const type  = typeCode ? String(typeCode).trim().toUpperCase() : '';

  // Explicit generic noun, reject regardless of type code.
  if (GENERIC_ACTOR_NOUNS.has(lower)) return null;

  // Known group / IGO substring match, kept even if GDELT mis-typed it.
  if (KNOWN_GROUPS.some((g) => lower.includes(g))) {
    return DISPLAY_NORMALIZE[lower] || name;
  }

  // Non-armed entity type (civilian, media, education, business, NGO, court,
  // labor), not a belligerent, so do not surface it as one.
  if (NON_ACTOR_TYPES.has(type)) return null;

  // National force label: "<Adjective> <role>" (e.g. "Israeli Military").
  const tokens = lower.split(/\s+/);
  if (tokens.length >= 2 && NATIONAL_ADJECTIVES.has(tokens[0]) && endsWithRole(lower)) {
    return name;
  }
  // "United States Military" / "United Nations Forces" style.
  if ((lower.startsWith('united states') || lower.startsWith('united nations')) && endsWithRole(lower)) {
    return name;
  }

  // Normalizable mangled form (e.g. "The Un" -> "United Nations").
  if (DISPLAY_NORMALIZE[lower]) return DISPLAY_NORMALIZE[lower];

  // Anything else (bare country names, cities, unlisted nouns) is not a
  // positively resolved actor. Show "Unattributed" rather than guess.
  return null;
}

/**
 * Resolve the best displayable actor for an event: prefer actor1, then actor2.
 * Returns a clean string, or null when neither side names a real actor.
 */
export function resolveActor(event) {
  if (!event) return null;
  return (
    resolveActorName(event.actor1, event.actor1_type) ||
    resolveActorName(event.actor2, event.actor2_type) ||
    null
  );
}

/** Display label with the honest fallback used across the UI. */
export function resolveActorLabel(event) {
  return resolveActor(event) || 'Unattributed';
}

// ---------------------------------------------------------------------------
// Client-side relevance safety gate.
//
// The served feed is already structurally + Haiku filtered, but the live blob
// can still carry domestic false positives (e.g. "King County, Washington"
// scored as armed conflict). This gate is a narrow last line of defense: it
// drops events in high-rule-of-law countries that have no positively resolved
// actor, weak corroboration, no satellite confirmation, and no analyst
// confirmation. It deliberately does NOT touch events in active conflict
// zones, where generic-actor reports ("gunmen attacked a village") are real.
// ---------------------------------------------------------------------------
const STABLE_COUNTRIES = new Set([
  'United States', 'Canada', 'United Kingdom', 'Germany', 'France', 'Italy',
  'Spain', 'Netherlands', 'Belgium', 'Australia', 'New Zealand', 'Japan',
  'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Portugal', 'Austria',
  'Switzerland', 'Poland', 'Czech Republic', 'Hungary', 'South Korea',
  'Singapore', 'Luxembourg', 'Iceland',
]);

export function isPlausibleConflict(event, { confirmed = false } = {}) {
  if (!event) return false;
  if (confirmed) return true;                         // analyst-confirmed always kept
  if (!STABLE_COUNTRIES.has(event.country)) return true; // active/at-risk region, keep

  // In a stable country, require a positive signal to keep the event.
  if (resolveActor(event)) return true;               // names a real actor
  if ((event.num_sources || 0) >= 3) return true;     // broadly corroborated
  if (event.satellite_corroborated) return true;      // FIRMS thermal match
  return false;                                        // otherwise: domestic noise
}
