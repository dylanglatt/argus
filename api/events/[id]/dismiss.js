/**
 * api/events/[id]/dismiss.js
 * --------------------------
 * POST /api/events/:id/dismiss
 *
 * Marks an event as analyst-dismissed noise.
 * Loads current feedback state from Vercel Blob on each invocation
 * (serverless functions are stateless — in-memory sets reset per cold start),
 * then persists the updated state back to Blob.
 */

import { initFeedbackStore, dismissEvent, getDismissedIds } from '../../../server/feedbackStore.js';

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
  // when multiple events are dismissed in sequence across separate invocations.
  await initFeedbackStore();
  await dismissEvent(id);

  res.status(200).json({ ok: true, id, totalDismissed: getDismissedIds().length });
}
