/**
 * gdeltFetcher.js
 * ---------------
 * Downloads, parses, and normalizes GDELT 2.0 Event Database files into
 * Sentinel's internal event schema.
 *
 * GDELT publishes a new export file every 15 minutes at:
 *   http://data.gdeltproject.org/gdeltv2/YYYYMMDDHHMMSS.export.CSV.zip
 *
 * Each file is a tab-delimited CSV with 61 columns (no header row).
 * We filter for conflict events (QuadClass 3 = Verbal Conflict,
 * 4 = Material Conflict) and normalize CAMEO codes to Sentinel event types.
 *
 * Sentinel event schema (output):
 *   event_id_cnty  - GDELT GLOBALEVENTID
 *   event_date     - ISO date (YYYY-MM-DD)
 *   event_type     - Sentinel classification (Battles, Protests, etc.)
 *   sub_event_type - Human-readable CAMEO description
 *   actor1, actor2 - Actor names
 *   country        - Full country name (mapped from FIPS code)
 *   admin1         - Region/state code
 *   location       - Full location name
 *   latitude, longitude
 *   impact_score   - 0–10 derived from inverted Goldstein Scale
 *   goldstein_scale - Raw Goldstein value (-10 to +10)
 *   num_mentions   - # of article mentions (used for map marker sizing)
 *   num_sources    - # of unique source outlets
 *   num_articles   - # of articles
 *   avg_tone       - Average media tone (-100 to +100)
 *   source_url     - Primary source article URL
 *   notes          - Auto-generated event summary
 */

import http from 'http';
import https from 'https';
import zlib from 'zlib';
import { applyHaikuFilter } from './haikuFilter.js';

// ---------------------------------------------------------------------------
// GDELT column indices (0-indexed, GDELT 2.0 export format)
// ---------------------------------------------------------------------------
const C = {
  GLOBALEVENTID:       0,
  SQLDATE:             1,
  Actor1Name:          6,
  Actor1Type1Code:     12,  // e.g. MIL, GOV, REB, CVL, BUS, COP — primary actor type
  Actor2Name:          16,
  Actor2Type1Code:     22,  // same type codes for actor 2
  EventCode:           26,
  EventBaseCode:       27,
  EventRootCode:       28,
  QuadClass:           29,
  GoldsteinScale:      30,
  NumMentions:         31,
  NumSources:          32,
  NumArticles:         33,
  AvgTone:             34,
  ActionGeo_FullName:  52,
  ActionGeo_Country:   53,
  ActionGeo_ADM1:      54,
  ActionGeo_Lat:       56,
  ActionGeo_Long:      57,
  SOURCEURL:           60,
};

// ---------------------------------------------------------------------------
// CAMEO EventRootCode → Sentinel event_type
// ---------------------------------------------------------------------------
function mapEventType(eventRootCode, eventCode) {
  const root = parseInt(eventRootCode, 10);
  const code = String(eventCode || '');

  // -------------------------------------------------------------------
  // KINETIC EVENTS ONLY — if nobody is being shot, bombed, or attacked,
  // it doesn't belong in a conflict tracker.
  //
  // EXCLUDED root codes (non-kinetic, generate enormous noise):
  //   13 THREATEN         → verbal threats, diplomatic warnings
  //   14 PROTEST          → rallies, demonstrations, flotillas
  //   16 REDUCE RELATIONS → diplomatic reductions, severed ties
  //   17 COERCE           → sanctions, privatization, legal action
  //
  // Exception: CAMEO 145 (violent riot) is kinetic and kept.
  // -------------------------------------------------------------------

  // Riots (violent protest — subset of root 14, the ONLY 14x code we keep)
  if (code === '145') return 'Riots';

  // Root 14 (all non-violent protests) — excluded
  if (root === 14) return null;

  // Roots 13, 16, 17 — excluded (verbal threats, diplomatic, sanctions)
  if (root === 13 || root === 16 || root === 17) return null;

  // Explosions / Remote violence — bombings, airstrikes, artillery
  if (
    code.startsWith('183') || // Bombing subtypes
    code.startsWith('195') || // Air/naval/artillery force
    code === '1951' ||
    code === '1952' ||
    code === '1953'
  ) {
    return 'Explosions/Remote violence';
  }

  // Violence against civilians — assault, hostage-taking, mass violence
  if (root === 18 || root === 20) return 'Violence against civilians';

  // Battles — fighting, military engagement
  if (root === 19) return 'Battles';

  // Military posture — mobilization, force display (root 15)
  // Only MILITARY codes: 152 (military alert), 154 (armed forces), 155 (clandestine).
  // Exclude 150 (generic), 151 (police alert), 153 (police power) — domestic policing.
  if (code === '152' || code === '154' || code === '155') return 'Strategic developments';
  if (root === 15) return null;

  return null; // Not a conflict event we track
}

// ---------------------------------------------------------------------------
// CAMEO code → human-readable description
// ---------------------------------------------------------------------------
const CAMEO_DESC = {
  '130': 'Threaten',
  '131': 'Threaten, NOS',
  '132': 'Threaten with administrative sanctions',
  '133': 'Threaten with political dissent',
  '134': 'Threaten with boycott or embargo',
  '135': 'Threaten to halt negotiations',
  '136': 'Threaten to reduce or break relations',
  '137': 'Threaten with military force',
  '138': 'Threaten with military action',
  '139': 'Threaten unconventional violence',
  '140': 'Protest, NOS',
  '141': 'Demonstrate or rally',
  '142': 'Conduct hunger strike',
  '143': 'Conduct strike or boycott',
  '144': 'Obstruct passage, blockade',
  '145': 'Protest violently, riot',
  '150': 'Display military posture',
  '151': 'Increase police alert status',
  '152': 'Increase military alert status',
  '153': 'Mobilize or increase police power',
  '154': 'Mobilize or increase armed forces',
  '155': 'Increase clandestine activities',
  '160': 'Reduce relations',
  '161': 'Reduce or break diplomatic relations',
  '162': 'Reduce or stop aid',
  '163': 'Reduce or stop economic cooperation',
  '164': 'Reduce or stop military cooperation',
  '165': 'Halt negotiations',
  '170': 'Coerce',
  '171': 'Seize or damage property',
  '172': 'Arrest or detain with legal action',
  '173': 'Expel or deport individuals',
  '174': 'Impose embargo, boycott, or sanctions',
  '180': 'Use unconventional force',
  '181': 'Abduct, hijack, or take hostage',
  '182': 'Physically assault',
  '183': 'Conduct bombing',
  '1831': 'Conduct suicide bombing',
  '1832': 'Conduct car bombing',
  '1833': 'Conduct IED / roadside bombing',
  '184': 'Use as human shield',
  '185': 'Attempt assassination',
  '186': 'Assassinate',
  '190': 'Use conventional military force',
  '191': 'Impose blockade, restrict movement',
  '192': 'Occupy territory',
  '193': 'Fight',
  '194': 'Fight with small arms',
  '195': 'Employ air, naval, or artillery force',
  '1951': 'Conduct airstrike',
  '1952': 'Conduct naval strike',
  '1953': 'Conduct artillery / rocket strike',
  '196': 'Violate ceasefire',
  '200': 'Engage in mass violence',
  '201': 'Engage in mass expulsion',
  '202': 'Engage in mass killings',
  '203': 'Engage in ethnic cleansing',
  '204': 'Engage in genocide',
};

// ---------------------------------------------------------------------------
// FIPS 2-letter country code → full country name
// ---------------------------------------------------------------------------
const FIPS_TO_COUNTRY = {
  AC: 'Antigua and Barbuda', AF: 'Afghanistan', AG: 'Algeria', AJ: 'Azerbaijan',
  AL: 'Albania', AM: 'Armenia', AO: 'Angola', AR: 'Argentina', AS: 'Australia',
  AU: 'Austria', AV: 'Anguilla', BA: 'Bahrain', BB: 'Barbados', BC: 'Botswana',
  BE: 'Belgium', BG: 'Bangladesh', BH: 'Belize', BK: 'Bosnia and Herzegovina',
  BL: 'Bolivia', BM: 'Myanmar', BN: 'Benin', BO: 'Belarus', BR: 'Brazil',
  BT: 'Bhutan', BU: 'Bulgaria', BX: 'Brunei', BY: 'Burundi', CA: 'Canada',
  CB: 'Cambodia', CD: 'Chad', CE: 'Sri Lanka', CF: 'DR Congo',
  CG: 'Republic of Congo', CH: 'China', CI: 'Chile', CM: 'Cameroon',
  CO: 'Colombia', CS: 'Costa Rica', CT: 'Central African Republic', CU: 'Cuba',
  CV: 'Cape Verde', CY: 'Cyprus', DA: 'Denmark', DJ: 'Djibouti',
  DO: 'Dominica', DR: 'Dominican Republic', EC: 'Ecuador', EG: 'Egypt',
  EI: 'Ireland', EK: 'Equatorial Guinea', EN: 'Estonia', ER: 'Eritrea',
  ES: 'El Salvador', ET: 'Ethiopia', EZ: 'Czech Republic', FI: 'Finland',
  FJ: 'Fiji', FM: 'Micronesia', FR: 'France', GA: 'Gambia', GB: 'Gabon',
  GG: 'Georgia', GH: 'Ghana', GI: 'Gibraltar', GL: 'Greenland', GM: 'Germany',
  GR: 'Greece', GT: 'Guatemala', GV: 'Guinea', GY: 'Guyana', GZ: 'Gaza Strip',
  HA: 'Haiti', HK: 'Hong Kong', HO: 'Honduras', HR: 'Croatia', HU: 'Hungary',
  IC: 'Iceland', ID: 'Indonesia', IN: 'India', IR: 'Iran', IS: 'Israel',
  IT: 'Italy', IV: "Cote d'Ivoire", IZ: 'Iraq', JA: 'Japan', JM: 'Jamaica',
  JO: 'Jordan', KE: 'Kenya', KG: 'Kyrgyzstan', KN: 'North Korea',
  KS: 'South Korea', KU: 'Kuwait', KV: 'Kosovo', KZ: 'Kazakhstan',
  LA: 'Laos', LE: 'Lebanon', LG: 'Latvia', LH: 'Lithuania', LI: 'Liberia',
  LO: 'Slovakia', LS: 'Liechtenstein', LT: 'Lesotho', LU: 'Luxembourg',
  LY: 'Libya', MA: 'Madagascar', MC: 'Macau', MD: 'Moldova', MG: 'Mongolia',
  MI: 'Malawi', MJ: 'Montenegro', MK: 'North Macedonia', ML: 'Mali',
  MN: 'Monaco', MO: 'Morocco', MP: 'Mauritius', MR: 'Mauritania', MT: 'Malta',
  MU: 'Oman', MV: 'Maldives', MX: 'Mexico', MY: 'Malaysia', MZ: 'Mozambique',
  NG: 'Niger', NI: 'Nigeria', NL: 'Netherlands', NO: 'Norway', NP: 'Nepal',
  NU: 'Nicaragua', NZ: 'New Zealand', PA: 'Paraguay', PE: 'Peru',
  PK: 'Pakistan', PL: 'Poland', PM: 'Panama', PO: 'Portugal',
  PP: 'Papua New Guinea', PU: 'Guinea-Bissau', QA: 'Qatar', RI: 'Serbia',
  RO: 'Romania', RP: 'Philippines', RS: 'Russia', RW: 'Rwanda',
  SA: 'Saudi Arabia', SE: 'Seychelles', SF: 'South Africa', SG: 'Senegal',
  SI: 'Slovenia', SL: 'Sierra Leone', SM: 'San Marino', SN: 'Singapore',
  SO: 'Somalia', SP: 'Spain', SS: 'South Sudan', SU: 'Sudan', SW: 'Sweden',
  SY: 'Syria', SZ: 'Switzerland', TD: 'Trinidad and Tobago', TH: 'Thailand',
  TI: 'Tajikistan', TK: 'Turkmenistan', TO: 'Togo', TP: 'Timor-Leste',
  TS: 'Tunisia', TU: 'Turkey', TZ: 'Tanzania', UA: 'United Arab Emirates',
  UG: 'Uganda', UK: 'United Kingdom', UP: 'Ukraine', US: 'United States',
  UV: 'Burkina Faso', UY: 'Uruguay', UZ: 'Uzbekistan', VE: 'Venezuela',
  VM: 'Vietnam', WE: 'West Bank', WI: 'Western Sahara', YM: 'Yemen',
  YI: 'Yemen', ZA: 'Zambia', ZI: 'Zimbabwe',
};

// ---------------------------------------------------------------------------
// GDELT actor name expansion — common abbreviations and type codes
// ---------------------------------------------------------------------------
const ACTOR_EXPANSIONS = {
  'GOV':      'Government',
  'MIL':      'Military',
  'POLICE':   'Police',
  'REBEL':    'Rebel Forces',
  'PROTEST':  'Protesters',
  'CVL':      'Civilians',
  'MINIST':   'Minister',
  'PRES':     'President',
  'PM':       'Prime Minister',
  'JOUR':     'Press / Media',
  'JOURNALIST': 'Press / Media',
  'BUSINESS': 'Business',
  'LABOR':    'Labor Group',
  'OPP':      'Opposition',
  'LEG':      'Legislature',
};

// Parse actor name: GDELT concatenates type codes — produce a readable label.
function cleanActorName(raw) {
  if (!raw || raw.trim() === '') return 'Unknown';
  const s = raw.trim();

  // If an expansion exists for the full string, use it
  if (ACTOR_EXPANSIONS[s]) return ACTOR_EXPANSIONS[s];

  // Title-case all-caps strings (e.g. "ENERGY MINIST" → "Energy Minister")
  if (s === s.toUpperCase() && /^[A-Z\s\/]+$/.test(s)) {
    return s
      .split(/\s+/)
      .map((w) => ACTOR_EXPANSIONS[w] || (w.charAt(0) + w.slice(1).toLowerCase()))
      .join(' ')
      .trim();
  }

  return s.slice(0, 60);
}

// ---------------------------------------------------------------------------
// Generate narrative notes from available GDELT fields
// ---------------------------------------------------------------------------
function buildNotes(eventType, subType, actor1, actor2, location, numMentions, numSources, goldstein) {
  const actors =
    actor1 !== 'Unknown' && actor2 !== 'Unknown' && actor2 !== actor1
      ? `${actor1} vs. ${actor2}`
      : actor1 !== 'Unknown'
      ? actor1
      : 'Unknown actors';

  const goldSign = goldstein > 0 ? '+' : '';
  const coverage =
    numSources === 1
      ? `${numSources} outlet`
      : `${numSources} outlets`;

  return `${subType || eventType} — ${actors} in ${location}. Reported across ${numMentions} mention(s) from ${coverage}. Goldstein: ${goldSign}${goldstein.toFixed(1)}.`;
}

// ---------------------------------------------------------------------------
// URL slug hard-filter: patterns that are 100% incompatible with armed conflict.
// These are checked against the lowercase source URL before any other logic.
// Using this as a pre-Haiku gate is cheaper and more reliable than asking an
// LLM to re-discover that "protective-order-ruling" is not a war event.
// ---------------------------------------------------------------------------
const REJECT_URL_SLUGS = [
  // Family / domestic law — never kinetic conflict
  'protective-order', 'restraining-order', 'child-custody', 'custody-battle',
  'no-contact-order', 'divorce-settlement', 'custody-hearing', 'parental-rights',
  'visitation-rights', 'unsupervised-visit', 'alimony', 'child-support',
  // Court outcomes that are structurally non-conflict
  'court-ruling', 'court-order', 'court-decision', 'verdict-reached',
  'pleads-guilty', 'plea-deal', 'sentenced-to', 'acquitted',
  // Celebrity / entertainment — high GDELT false-positive surface area
  '-wedding-', '-engagement-', '-honeymoon-', '-baby-shower-', '-pregnancy-',
  '-maternity-', '-breakup-', '-divorce-',
  // Sports — GDELT frequently misreads competitive language as conflict
  'super-bowl', 'world-cup', 'march-madness', 'nfl-', 'nba-', 'mlb-', 'nhl-', '-mls-',
  // Entertainment awards
  'grammy', 'oscar-', '-emmy-', 'golden-globe', 'box-office',
  // Domestic accidents / weather — not conflict
  'car-accident', 'car-crash', 'traffic-accident', 'plane-crash',
  'hurricane-', 'tornado-', 'wildfire-', 'earthquake-',
];

function rejectByUrl(sourceUrl) {
  if (!sourceUrl) return false;
  const slug = sourceUrl.toLowerCase();
  return REJECT_URL_SLUGS.some((pattern) => slug.includes(pattern));
}

// ---------------------------------------------------------------------------
// Stable-country civilian filter.
//
// In low-conflict, high-rule-of-law countries (US, UK, EU core, etc.) GDELT
// overwhelmingly misclassifies domestic crime, sports disputes, and social
// media arguments as kinetic conflict events. Real armed-conflict events in
// these countries (e.g. a terrorist attack) WILL have armed actor type codes
// (MIL, COP, REB, GOV, SPY) or very negative Goldstein (≤ -5). If neither
// condition holds, the event is almost certainly noise.
// ---------------------------------------------------------------------------
const STABLE_COUNTRY_CODES = new Set([
  'US', 'CA', 'UK', 'GM', 'FR', 'IT', 'SP', 'NL', 'BE', 'AU', 'NZ',
  'JA', 'SW', 'NO', 'DA', 'FI', 'EI', 'PO', 'EZ', 'PL', 'HU',
  'SZ', 'AU', 'AS',   // Austria/Australia both map to AS/AU — covered
]);

const ARMED_TYPES_FOR_STABLE = new Set(['MIL', 'REB', 'SPY', 'UAF', 'COP', 'GOV', 'IGO']);

function rejectStableCountryNoise(countryCode, actor1_type, actor2_type, goldstein) {
  if (!STABLE_COUNTRY_CODES.has(countryCode)) return false; // Not a stable country — keep
  const hasArmedActor =
    ARMED_TYPES_FOR_STABLE.has(actor1_type) ||
    ARMED_TYPES_FOR_STABLE.has(actor2_type);
  if (hasArmedActor) return false;         // Armed actors present — keep
  if (goldstein <= -5) return false;       // Extreme conflict score — keep
  return true;                             // Civilian actors + mild Goldstein in stable country → reject
}

// ---------------------------------------------------------------------------
// Normalize a single parsed row into Sentinel schema
// Returns null if the event should be filtered out
// hourBucket: the UTC hour of the GDELT file (0, 6, 12, or 18), used to
// bucket events into 6-hour windows for the TimeChart.
// ---------------------------------------------------------------------------
function normalizeRow(cols, hourBucket = 0) {
  if (cols.length < 61) return null;

  const quadClass = parseInt(cols[C.QuadClass], 10);
  const rootCode  = parseInt(cols[C.EventRootCode], 10);

  // Keep only Material Conflict (QuadClass 4) with kinetic root codes.
  // QuadClass 3 (Verbal Conflict) is excluded — verbal threats are not kinetic.
  // Kinetic roots: 15 (force posture), 18 (assault), 19 (fight), 20 (mass violence).
  // Root 14 is only kept for code 145 (violent riot); all others are non-kinetic.
  // Roots 13, 16, 17 are fully excluded by mapEventType → null.
  const isConflict = quadClass >= 3 && rootCode >= 14 && rootCode <= 20;
  if (!isConflict) return null;

  const eventCode = String(cols[C.EventCode] || '').trim();
  const eventType = mapEventType(cols[C.EventRootCode], eventCode);
  if (!eventType) return null;

  // Require at least 3 distinct source outlets.
  // 1–2 source events are overwhelmingly domestic noise that GDELT has
  // misclassified — real geopolitical conflict gets picked up by 3+ outlets.
  const numSources  = parseInt(cols[C.NumSources], 10) || 0;
  if (numSources < 3) return null;

  const numMentions = parseInt(cols[C.NumMentions], 10) || 0;

  // Require valid geographic coordinates
  const lat = parseFloat(cols[C.ActionGeo_Lat]);
  const lng = parseFloat(cols[C.ActionGeo_Long]);
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;

  // Parse date: YYYYMMDD → YYYY-MM-DD
  const sqlDate  = String(cols[C.SQLDATE] || '');
  if (sqlDate.length !== 8) return null;
  const eventDate = `${sqlDate.slice(0, 4)}-${sqlDate.slice(4, 6)}-${sqlDate.slice(6, 8)}`;

  const goldstein   = parseFloat(cols[C.GoldsteinScale]) || 0;
  // numSources and numMentions already declared above for the gate checks; reuse them
  const numArticles = parseInt(cols[C.NumArticles], 10) || 1;
  const avgTone     = parseFloat(cols[C.AvgTone]) || 0;

  const countryCode = String(cols[C.ActionGeo_Country] || '').trim();
  const country     = FIPS_TO_COUNTRY[countryCode] || (countryCode || 'Unknown');
  const location    = String(cols[C.ActionGeo_FullName] || '').trim() || country;
  const admin1      = String(cols[C.ActionGeo_ADM1] || '').trim();

  const sourceUrl = String(cols[C.SOURCEURL] || '').trim();

  // URL slug hard-filter: reject unambiguously non-conflict content before
  // doing any further work. Patterns like "protective-order-ruling" or
  // "child-custody" cannot appear in a legitimate armed-conflict article.
  if (rejectByUrl(sourceUrl)) return null;

  const actor1 = cleanActorName(cols[C.Actor1Name]);
  const actor2 = cleanActorName(cols[C.Actor2Name]);
  const actor1_type = String(cols[C.Actor1Type1Code] || '').trim().toUpperCase();
  const actor2_type = String(cols[C.Actor2Type1Code] || '').trim().toUpperCase();

  // Stable-country civilian filter: US/UK/EU etc. with no armed actor types
  // and a Goldstein score above -5 are almost always domestic noise.
  if (rejectStableCountryNoise(countryCode, actor1_type, actor2_type, goldstein)) return null;

  // Exclude events where actors are clearly non-conflict entities.
  // GDELT extracts these from everyday news about civilians, consumers, etc.
  // and misclassifies them as conflict actors.
  const NOISE_ACTORS = new Set([
    // Civilian roles — never armed-conflict actors
    'Traveler', 'Tourist', 'Resident', 'Consumer', 'Student', 'Patient',
    'Voter', 'Taxpayer', 'Employee', 'Worker', 'Driver', 'Farmer',
    'Immigrant', 'Refugee', 'Visitor', 'Homeowner', 'Tenant', 'Donor',
  ]);
  // Legal/judicial actors — court proceedings are NEVER kinetic conflict.
  // Any event with a legal actor on either side is a misclassification.
  const LEGAL_ACTORS = new Set([
    'Attorney', 'Lawyer', 'Prosecutor', 'Judge', 'Magistrate',
    'Defendant', 'Plaintiff', 'Solicitor', 'Barrister', 'Counsel',
  ]);
  if (LEGAL_ACTORS.has(actor1) || LEGAL_ACTORS.has(actor2)) return null;

  if (NOISE_ACTORS.has(actor1) && NOISE_ACTORS.has(actor2)) return null;
  if (NOISE_ACTORS.has(actor1) && actor2 === 'Unknown') return null;
  if (NOISE_ACTORS.has(actor2) && actor1 === 'Unknown') return null;

  const subType = CAMEO_DESC[eventCode] || CAMEO_DESC[String(eventCode).slice(0, 3)] || eventType;

  // impact_score: invert Goldstein so more-negative = higher score (0–10)
  const impact_score = Math.max(0, Math.min(10, Math.round(-goldstein)));

  return {
    event_id_cnty:   String(cols[C.GLOBALEVENTID]),
    event_date:      eventDate,
    hour_bucket:     hourBucket,    // 0, 6, 12, or 18 UTC — used for 6h TimeChart windows
    event_type:      eventType,
    sub_event_type:  subType,
    actor1,
    actor2,
    actor1_type,     // GDELT type code: MIL, GOV, REB, CVL, BUS, COP, etc.
    actor2_type,
    country,
    admin1,
    location,
    latitude:        lat,
    longitude:       lng,
    impact_score,                   // 0–10 conflict severity proxy
    goldstein_scale: goldstein,
    num_mentions:    numMentions,
    num_sources:     numSources,
    num_articles:    numArticles,
    avg_tone:        Math.round(avgTone * 10) / 10,
    source_url:      String(cols[C.SOURCEURL] || '').trim(),
    notes:           buildNotes(eventType, subType, actor1, actor2, location, numMentions, numSources, goldstein),
  };
}

// ---------------------------------------------------------------------------
// Parse a GDELT tab-delimited CSV text into normalized events
// hourBucket is passed through to normalizeRow for 6-hour window attribution.
// ---------------------------------------------------------------------------
function parseGDELTCsv(text, hourBucket = 0) {
  const events = [];
  const lines  = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const event = normalizeRow(cols, hourBucket);
    if (event) events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Unzip a ZIP buffer without external dependencies.
// GDELT uses ZIP (not gzip). We parse the local file header (PK\x03\x04)
// and inflate the DEFLATE-compressed payload via Node's built-in zlib.
// ---------------------------------------------------------------------------
function unzipBuffer(buf) {
  // Local file header signature: 50 4B 03 04
  const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const offset = buf.indexOf(sig);
  if (offset === -1) throw new Error('ZIP local file header not found');

  const comprMethod    = buf.readUInt16LE(offset + 8);  // 0=stored, 8=deflate
  const compressedSize = buf.readUInt32LE(offset + 18);
  const fnLen          = buf.readUInt16LE(offset + 26);
  const extraLen       = buf.readUInt16LE(offset + 28);
  const dataStart      = offset + 30 + fnLen + extraLen;
  const payload        = buf.slice(dataStart, compressedSize > 0 ? dataStart + compressedSize : undefined);

  return new Promise((resolve, reject) => {
    if (comprMethod === 0) {
      resolve(payload); // Stored (no compression)
    } else {
      zlib.inflateRaw(payload, (err, result) => {
        if (err) reject(err); else resolve(result);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Download a single GDELT export zip and return parsed events
// Resolves to [] on 404 (file not yet published) or timeout
// GDELT data files are served over plain HTTP; the http:// URL avoids the
// GCS TLS certificate mismatch that occurs via data.gdeltproject.org/HTTPS.
// ---------------------------------------------------------------------------
function downloadAndParse(url) {
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve) => {
    const req = client.get(url, { timeout: 12000 }, (res) => {
      if (res.statusCode === 404 || res.statusCode === 403) {
        res.resume();
        resolve([]);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        console.warn(`[gdelt] HTTP ${res.statusCode} for ${url}`);
        resolve([]);
        return;
      }

      // Collect full body as buffer, then unzip
      const chunks = [];
      res.on('data',  (chunk) => chunks.push(chunk));
      res.on('end',   async () => {
        try {
          const raw    = Buffer.concat(chunks);
          const decompressed = await unzipBuffer(raw);
          const text   = decompressed.toString('utf8');
          // Extract UTC hour from URL filename (YYYYMMDDHHMMSS) → snap to 6h bucket
          const hourMatch = url.match(/(\d{8})(\d{2})\d{4}\.export/);
          const fileHour  = hourMatch ? parseInt(hourMatch[2], 10) : 0;
          const hourBucket = Math.floor(fileHour / 6) * 6; // 0, 6, 12, or 18
          const events = parseGDELTCsv(text, hourBucket);
          resolve(events);
        } catch (err) {
          console.warn(`[gdelt] Parse/decompress error for ${url}:`, err.message);
          resolve([]);
        }
      });
      res.on('error', (err) => {
        console.warn(`[gdelt] Stream error for ${url}:`, err.message);
        resolve([]);
      });
    });

    req.on('error',   (err) => { console.warn(`[gdelt] Fetch error: ${err.message}`); resolve([]); });
    req.on('timeout', ()    => { req.destroy(); console.warn(`[gdelt] Timeout: ${url}`); resolve([]); });
  });
}

// ---------------------------------------------------------------------------
// Build GDELT export file URLs for the past N days, sampling every `stepHours`
// GDELT files snap to 15-minute boundaries; we align to the nearest :00
// ---------------------------------------------------------------------------
function buildFileUrls(days = 7, stepHours = 6) {
  const base = 'http://data.gdeltproject.org/gdeltv2';
  const urls = [];
  const now  = new Date();

  // Align to last full hour boundary
  now.setMinutes(0, 0, 0);

  for (let hoursBack = stepHours; hoursBack <= days * 24; hoursBack += stepHours) {
    const ts = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
    const y  = ts.getUTCFullYear();
    const mo = String(ts.getUTCMonth() + 1).padStart(2, '0');
    const d  = String(ts.getUTCDate()).padStart(2, '0');
    const h  = String(ts.getUTCHours()).padStart(2, '0');
    urls.push(`${base}/${y}${mo}${d}${h}0000.export.CSV.zip`);
  }

  return urls;
}

// ---------------------------------------------------------------------------
// In-memory cache + in-flight guard
// ---------------------------------------------------------------------------
let cache = {
  events:    null,
  fetchedAt: null,
  ttlMs:     15 * 60 * 1000, // 15 minutes — matches GDELT publish cadence
};

// Single in-flight promise: if a fetch is already running, concurrent callers
// wait for it rather than launching duplicate GDELT downloads + Haiku passes.
let fetchInFlight = null;

// ---------------------------------------------------------------------------
// Public API: fetchConflictEvents()
// Returns normalized conflict events, cached for 15 minutes.
// ---------------------------------------------------------------------------
/**
 * Returns the Unix timestamp (ms) of the last successful GDELT cache fill,
 * or null if the cache has never been populated.
 */
export function getCacheFetchedAt() {
  return cache.fetchedAt;
}

export async function fetchConflictEvents({ days = 7, stepHours = 6, limit = 1000 } = {}) {
  const now = Date.now();

  if (cache.events && cache.fetchedAt && now - cache.fetchedAt < cache.ttlMs) {
    console.log(`[gdelt] Cache hit — ${cache.events.length} events`);
    return cache.events.slice(0, limit);
  }

  // If a fetch is already in progress, wait for it instead of launching another
  if (fetchInFlight) {
    console.log('[gdelt] Fetch already in progress — waiting for result...');
    await fetchInFlight;
    return (cache.events || []).slice(0, limit);
  }

  console.log(`[gdelt] Cache miss — fetching GDELT files (last ${days} days @ ${stepHours}h intervals)`);

  // Set the in-flight guard — cleared in finally block regardless of outcome
  let resolveFlight;
  fetchInFlight = new Promise((r) => { resolveFlight = r; });

  try {
    const urls = buildFileUrls(days, stepHours);
    console.log(`[gdelt] Downloading ${urls.length} files in parallel...`);

    // Download in batches of 8 to avoid hammering GDELT servers
    const BATCH = 8;
    const allEvents = [];
    for (let i = 0; i < urls.length; i += BATCH) {
      const batch   = urls.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(downloadAndParse));
      results.forEach((evts) => allEvents.push(...evts));
      console.log(`[gdelt] Batch ${Math.ceil(i / BATCH) + 1}/${Math.ceil(urls.length / BATCH)} done — running total: ${allEvents.length}`);
    }

    // Deduplicate by event ID
    const seen = new Set();
    const deduped = allEvents.filter((e) => {
      if (seen.has(e.event_id_cnty)) return false;
      seen.add(e.event_id_cnty);
      return true;
    });

    // Sort by date descending, then by num_mentions descending
    deduped.sort((a, b) => {
      const dateDiff = new Date(b.event_date) - new Date(a.event_date);
      if (dateDiff !== 0) return dateDiff;
      return b.num_mentions - a.num_mentions;
    });

    console.log(`[gdelt] Loaded ${deduped.length} unique conflict events — running Haiku filter...`);

    // Haiku classification pass: filters ambiguous events (Protests, low-signal
    // Strategic developments) before they enter the cache.
    const filtered = await applyHaikuFilter(deduped);

    console.log(`[gdelt] ${filtered.length} events after Haiku filter (removed ${deduped.length - filtered.length})`);

    cache.events    = filtered;
    cache.fetchedAt = now;

    return filtered.slice(0, limit);
  } finally {
    // Release the in-flight guard so future callers can trigger a new fetch
    fetchInFlight = null;
    resolveFlight?.();
  }
}

// ---------------------------------------------------------------------------
// Export FIPS lookup for use elsewhere (e.g., building country filter lists)
// ---------------------------------------------------------------------------
export { FIPS_TO_COUNTRY };
