// api/agreement.js
// Tracks whether a reader has agreed to the current version of the 18+/
// Terms of Service checkbox in onboarding -- recorded server-side against
// their account, not just a browser localStorage flag, so it persists
// across devices and actually re-triggers everyone when the terms change
// (see lib/novel-engine/terms.js).

import { sbFetch } from '../lib/novel-engine/db.js';
import { requireMatchingUser } from '../lib/novel-engine/auth.js';
import { CURRENT_TERMS_VERSION } from '../lib/novel-engine/terms.js';

async function handleGet(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!(await requireMatchingUser(req, res, userId))) return;

  const rows = await sbFetch('/user_agreements?user_id=eq.' + userId + '&limit=1');
  const agreed = rows.length > 0 && rows[0].terms_version >= CURRENT_TERMS_VERSION;
  return res.status(200).json({ agreed, current_version: CURRENT_TERMS_VERSION });
}

async function handlePost(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body || {};
  const { userId } = body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!(await requireMatchingUser(req, res, userId))) return;

  await sbFetch('/user_agreements', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      terms_version: CURRENT_TERMS_VERSION,
      agreed_at: new Date().toISOString(),
    }),
  });
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[novel-engine/agreement error]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
