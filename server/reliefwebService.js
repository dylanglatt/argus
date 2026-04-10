/**
 * reliefwebService.js
 * -------------------
 * Proxies ReliefWeb (UN OCHA) humanitarian report queries.
 * Caches per-country results for 1 hour to stay well under
 * the 1,000 calls/day rate limit.
 *
 * Exports:
 *   getReportsForCountry(countryName) — returns latest 5 reports
 */

import https from 'https';

// ---------------------------------------------------------------------------
// Per-country cache — { [country]: { data, fetchedAt } }
// ---------------------------------------------------------------------------
const countryCache = {};
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// HTTPS POST helper (built-in module, same pattern as gdeltFetcher)
// ---------------------------------------------------------------------------
function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const postData = JSON.stringify(body);

    const opts = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      timeout:  15000,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length':  Buffer.byteLength(postData),
      },
    };

    const req = https.request(opts, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`ReliefWeb HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('ReliefWeb JSON parse error')); }
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ReliefWeb request timeout')); });
    req.write(postData);
    req.end();
  });
}

/**
 * Fetch the 5 most recent humanitarian reports for a given country.
 * Returns array of { id, title, date, source, url }.
 */
export async function getReportsForCountry(countryName) {
  if (!countryName) return [];

  const key = countryName.toLowerCase();

  // Check cache
  const cached = countryCache[key];
  if (cached && (Date.now() - cached.fetchedAt < CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const result = await httpsPost(
      'https://api.reliefweb.int/v2/reports?appname=argus',
      {
        filter: { field: 'country.name', value: countryName },
        limit:  5,
        sort:   ['date.original:desc'],
        fields: {
          include: ['title', 'date', 'source', 'url'],
        },
      }
    );

    const reports = (result.data || []).map((item) => ({
      id:     item.id,
      title:  item.fields?.title || 'Untitled',
      date:   item.fields?.date?.original || null,
      source: item.fields?.source?.[0]?.name || 'Unknown',
      url:    item.fields?.url || null,
    }));

    countryCache[key] = { data: reports, fetchedAt: Date.now() };
    console.log(`[reliefweb] Cached ${reports.length} reports for ${countryName}`);
    return reports;
  } catch (err) {
    console.error(`[reliefweb] Fetch failed for ${countryName}:`, err.message);
    return cached?.data || [];
  }
}
