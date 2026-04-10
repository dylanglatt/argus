/**
 * api/events/[id]/confirm.js
 * --------------------------
 * POST /api/events/:id/confirm
 *
 * Marks an event as analyst-confirmed valid signal.
 * Loads current feedback state from Vercel Blob on each invocation
 * (serverless functions are stateless — in-memory sets reset per cold start),
 * then persists the updated state back to Blob.
 */

import { initFeedbackStore, confirmEvent, getConfirmedIds } from '../../../server/feedbackStore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { id } = req.query;
  if (!id) {
    res.status(400).json({ error: 'Missing event id' });
    return;
  }

  // Load current state from Blob before modifying — prevents overwrites
  // when multiple events are confirmed in sequence across separate invocations.
  await initFeedbackStore();
  await confirmEvent(id);

  res.status(200).json({ ok: true, id, totalConfirmed: getConfirmedIds().length });
}
