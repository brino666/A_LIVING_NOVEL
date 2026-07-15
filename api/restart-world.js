// api/restart-world.js
// Lets a subscribed (or grandfathered) world start over as a brand-new
// story -- new title, genre, character -- without touching its Stripe
// subscription at all. Rate limited to once per rolling 30 days so a
// single subscription can't substitute for running several worlds at once.

import { getWorldById, getWorldSnapshot, deleteWorldContent, updateWorldFields } from '../lib/novel-engine/db.js';
import { generateGenesis } from '../lib/novel-engine/genesis.js';
import { seedWorldContent } from '../lib/novel-engine/worldSeed.js';
import { requireMatchingUser } from '../lib/novel-engine/auth.js';
import { hasActiveAccess } from '../lib/novel-engine/access.js';

// Genesis runs again here, same as world creation -- can run past Vercel's
// default 10s function timeout.
export const config = { maxDuration: 120 };

const RESTART_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { userId, worldId, title, genre, toneSettings, userCharacter } = body;
  if (!userId || !worldId || !title || !userCharacter || !userCharacter.name) {
    return res.status(400).json({ error: 'userId, worldId, title, and userCharacter.name are required' });
  }

  try {
    if (!(await requireMatchingUser(req, res, userId))) return;

    const world = await getWorldById(worldId);
    if (!world || world.user_id !== userId) return res.status(404).json({ error: 'World not found' });

    if (!hasActiveAccess(world)) {
      return res.status(403).json({ error: 'Restarting is available to subscribed worlds -- subscribe first.' });
    }

    if (world.last_restart_at) {
      const nextEligible = new Date(world.last_restart_at).getTime() + RESTART_COOLDOWN_MS;
      if (Date.now() < nextEligible) {
        return res.status(429).json({
          error: 'This world can only be restarted once per billing period. Try again after '
            + new Date(nextEligible).toLocaleDateString() + '.',
          next_eligible_at: new Date(nextEligible).toISOString(),
        });
      }
    }

    // Generate the new story before deleting anything -- if this fails,
    // the reader's current story is completely untouched and they can just
    // try again.
    const genesis = await generateGenesis({ title, genre, toneSettings, userCharacter });

    await deleteWorldContent(worldId);
    await seedWorldContent(worldId, genesis, userCharacter);

    const now = new Date().toISOString();
    await updateWorldFields(worldId, {
      title,
      genre: genre || 'general',
      tone_settings: toneSettings || {},
      world_hours: 0,
      interaction_count: 0,
      chapters_in_window: 0,
      chapter_window_start: now,
      last_restart_at: now,
      last_visited_at: now,
    });

    const snapshot = await getWorldSnapshot(worldId);
    return res.status(200).json({ world: snapshot });
  } catch (err) {
    console.error('[novel-engine/restart-world error]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
