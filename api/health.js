/**
 * api/health.js
 * -------------
 * Vercel serverless function — GET /api/health
 */

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status:     'ok',
    timestamp:  new Date().toISOString(),
    dataSource: 'GDELT 2.0 Event Database',
  });
}
