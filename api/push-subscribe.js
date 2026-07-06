// api/push-subscribe.js
// Stores a reader's Web Push subscription (one row per browser/device) plus
// the timezone it was captured in, so the flash-notification cron job can
// figure out "morning/lunch/evening" in the reader's own local time.

import { upsertPushSubscription } from '../lib/novel-engine/db.js';
import { requireMatchingUser } from '../lib/novel-engine/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { userId, subscription, timezone } = body;

  if (!userId || !subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'userId and a valid subscription are required' });
  }
  if (!(await requireMatchingUser(req, res, userId))) return;

  try {
    await upsertPushSubscription(userId, subscription, timezone);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[novel-engine/push-subscribe error]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
