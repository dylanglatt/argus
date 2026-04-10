import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fetchConflictEvents, getCacheFetchedAt } from './gdeltFetcher.js';
import { mockEvents } from './mockData.js';
import { dismissEvent, undismissEvent, getDismissedIds, filterDismissed } from './feedbackStore.js';

dotenv.config({ override: true });

const app  = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// ---------------------------------------------------------------------------
// Kick off a background GDELT prefetch on server startup so the first
// client request hits a warm cache rather than waiting for downloads.
// ---------------------------------------------------------------------------
let warmupDone = false;
async function warmCache() {
  try {
    console.log('[startup] Pre-fetching GDELT conflict events...');
    await fetchConflictEvents({ days: 7, stepHours: 6, limit: 1000 });
    warmupDone = true;
    console.log('[startup] GDELT cache warm.');
  } catch (err) {
    console.error('[startup] GDELT warmup failed:', err.message);
  }
}
warmCache();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    status:     'ok',
    timestamp:  new Date().toISOString(),
    dataSource: 'GDELT 2.0 Event Database',
    cacheWarm:  warmupDone,
  });
});

/**
 * GET /api/events
 *
 * Returns normalized conflict events from the GDELT 2.0 Event Database.
 * Falls back to mock data if GDELT is unreachable.
 *
 * Query params:
 *   limit        (default 1000)
 *   event_type   filter by Sentinel event type
 *   country      filter by country name
 */
app.get('/api/events', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 1000;

  let events;
  let source;

  try {
    events = await fetchConflictEvents({ days: 7, stepHours: 6, limit: Math.min(limit, 2000) });
    source = 'gdelt';
  } catch (err) {
    console.error('[events] GDELT fetch failed, falling back to mock data:', err.message);
    events = [...mockEvents];
    source = 'mock';
  }

  // If GDELT returned nothing (e.g. all downloads failed), use mock
  if (!events || events.length === 0) {
    console.log('[events] No GDELT events — serving mock data');
    events = [...mockEvents];
    source = 'mock';
  }

  // Server-side filter by event_type
  if (req.query.event_type) {
    const types = Array.isArray(req.query.event_type)
      ? req.query.event_type
      : [req.query.event_type];
    events = events.filter((e) => types.includes(e.event_type));
  }

  // Server-side filter by country
  if (req.query.country) {
    const countries = Array.isArray(req.query.country)
      ? req.query.country
      : [req.query.country];
    events = events.filter((e) => countries.includes(e.country));
  }

  // Remove analyst-dismissed events before serving
  events = filterDismissed(events);

  events.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

  console.log(`[events] Returning ${Math.min(events.length, limit)} events (source: ${source})`);
  res.json({
    data:         events.slice(0, limit),
    count:        events.length,
    source,
    fetchedAt:    getCacheFetchedAt(),
    dismissedIds: getDismissedIds(), // Let frontend sync dismissed state on load
  });
});

// ---------------------------------------------------------------------------
// Feedback loop — analyst dismiss / restore
// ---------------------------------------------------------------------------

/**
 * POST /api/events/:id/dismiss
 * Mark an event as analyst-identified noise. Persists across restarts.
 */
app.post('/api/events/:id/dismiss', (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing event id' });
  dismissEvent(id);
  res.json({ ok: true, dismissed: id });
});

/**
 * DELETE /api/events/:id/dismiss
 * Undo a dismissal — restore a previously marked event.
 */
app.delete('/api/events/:id/dismiss', (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing event id' });
  undismissEvent(id);
  res.json({ ok: true, restored: id });
});

/**
 * GET /api/feedback/dismissed
 * Returns all dismissed event IDs (for debugging / analyst review).
 */
app.get('/api/feedback/dismissed', (_req, res) => {
  res.json({ dismissed: getDismissedIds(), count: getDismissedIds().length });
});

app.listen(PORT, () => {
  console.log(`\nArgus server running on http://localhost:${PORT}`);
  console.log(`Data source: GDELT 2.0 Event Database (no credentials required)\n`);
});
