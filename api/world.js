// api/world.js
// Create or fetch a reader's world. Each world is its own subscription --
// there's no per-account world limit tied to a plan (no billing exists yet
// to enforce that), only a flat abuse-guard cap. See api/worlds.js for the
// library listing endpoint.

import {
  sbFetch, getWorldSnapshot, getWorldById, getWorldForUser, getWorldsForUser, deleteWorld,
  updateToneSettings,
} from '../lib/novel-engine/db.js';
import { generateGenesis } from '../lib/novel-engine/genesis.js';
import { seedWorldContent } from '../lib/novel-engine/worldSeed.js';
import { requireMatchingUser } from '../lib/novel-engine/auth.js';
import { maybeRunPassiveTicks } from '../lib/novel-engine/passiveTick.js';
import { hasActiveAccess } from '../lib/novel-engine/access.js';

// World creation runs a genesis LLM call plus several sequential inserts;
// a GET can now also run up to a few passive-tick Director calls. Both can
// run past Vercel's default 10s function timeout.
export const config = { maxDuration: 120 };

// Pure abuse guard, not a monetization control -- there's no billing system
// yet to actually enforce "pay per world," so this just stops runaway
// creation (each one runs a real genesis LLM call) until that exists.
const MAX_WORLDS_PER_USER = 10;

async function handleGet(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const userId = req.query.userId;
  const worldId = req.query.worldId;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!(await requireMatchingUser(req, res, userId))) return;

  let world;
  if (worldId) {
    world = await getWorldById(worldId);
    if (!world || world.user_id !== userId) return res.status(404).json({ error: 'World not found' });
  } else {
    world = await getWorldForUser(userId); // convenience default: most recently created
  }
  if (!world) return res.status(200).json({ world: null });

  // Don't spend a real Director call catching up a world nobody's paying
  // to keep running -- just return it as-is; api/turn.js is what actually
  // blocks continuing.
  if (!hasActiveAccess(world)) {
    const snapshot = await getWorldSnapshot(world.id);
    return res.status(200).json({ world: snapshot });
  }

  // Catches the world up through any real-world gap since the reader's
  // last visit -- silently, before they see anything. See passiveTick.js.
  const snapshot = await maybeRunPassiveTicks(world.id);
  return res.status(200).json({ world: snapshot });
}

async function handlePost(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body || {};
  const { userId, title, genre, toneSettings, userCharacter } = body;

  if (!userId || !title || !userCharacter || !userCharacter.name) {
    return res.status(400).json({ error: 'userId, title, and userCharacter.name are required' });
  }
  if (!(await requireMatchingUser(req, res, userId))) return;

  const existingWorlds = await getWorldsForUser(userId);
  if (existingWorlds.length >= MAX_WORLDS_PER_USER) {
    return res.status(429).json({ error: 'You have reached the maximum number of worlds for now.' });
  }

  const [world] = await sbFetch('/worlds', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      title,
      genre: genre || 'general',
      tone_settings: toneSettings || {},
    }),
  });

  // Everything past this point can fail mid-way (a bad LLM response, a
  // transient Supabase error). If it does, delete the world row we just
  // created rather than leaving an incomplete world behind -- an orphan
  // with no story_state would both trip the "already has a world" check
  // above on retry AND break the frontend, which assumes storyState exists.
  try {
    const genesis = await generateGenesis({ title, genre, toneSettings, userCharacter });
    await seedWorldContent(world.id, genesis, userCharacter);
  } catch (err) {
    await deleteWorld(world.id).catch(() => {}); // best-effort cleanup; surface the original error either way
    throw err;
  }

  const snapshot = await getWorldSnapshot(world.id);
  return res.status(201).json({ world: snapshot });
}

// Clamp is generous headroom, not a meaningful "level cap" -- the actual
// effect plateaus well before this once it's pushing against content Claude
// itself won't write. It just stops the stored number from growing unbounded.
const INTENSITY_OFFSET_LIMIT = 10;

async function handlePatch(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body || {};
  const { userId, worldId, intensityOffset } = body;
  if (!userId || !worldId || typeof intensityOffset !== 'number' || !Number.isFinite(intensityOffset)) {
    return res.status(400).json({ error: 'userId, worldId, and a numeric intensityOffset are required' });
  }
  if (!(await requireMatchingUser(req, res, userId))) return;

  const world = await getWorldById(worldId);
  if (!world || world.user_id !== userId) return res.status(404).json({ error: 'World not found' });

  const clamped = Math.max(-INTENSITY_OFFSET_LIMIT, Math.min(INTENSITY_OFFSET_LIMIT, Math.trunc(intensityOffset)));
  const toneSettings = Object.assign({}, world.tone_settings, { intensity_offset: clamped });
  await updateToneSettings(worldId, toneSettings);
  return res.status(200).json({ toneSettings });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[novel-engine/world error]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
