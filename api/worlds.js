// api/worlds.js
// Lists a user's worlds for the library picker -- lightweight rows, not
// full snapshots. See api/world.js for loading/creating a single world.

import { getWorldsForUser } from '../lib/novel-engine/db.js';
import { requireMatchingUser } from '../lib/novel-engine/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    if (!(await requireMatchingUser(req, res, userId))) return;
    const worlds = await getWorldsForUser(userId);
    return res.status(200).json({ worlds });
  } catch (err) {
    console.error('[novel-engine/worlds error]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
