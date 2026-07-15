// lib/novel-engine/worldSeed.js
// Turns generateGenesis() output into actual rows -- shared between fresh
// world creation (api/world.js) and restarting an existing subscribed
// world into a brand-new story (api/restart-world.js).

import { sbFetch, insertCharacter } from './db.js';

export async function seedWorldContent(worldId, genesis, userCharacter) {
  const locationRows = await sbFetch('/locations', {
    method: 'POST',
    body: JSON.stringify(genesis.locations.map((l) => ({
      world_id: worldId, name: l.name, description: l.description, type: l.type,
    }))),
  });
  const locationByName = new Map(locationRows.map((l) => [l.name, l.id]));

  for (const c of genesis.characters) {
    await insertCharacter(worldId, {
      name: c.name,
      role: c.role,
      personality: c.personality || {},
      goals: c.goals || [],
      relationships: {},
      location_id: locationByName.get(c.starting_location_name) || null,
      last_seen_time: 0,
    });
  }

  const startingLocationId = locationRows[0] ? locationRows[0].id : null;

  await sbFetch('/story_state', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      world_id: worldId,
      main_plot_threads: genesis.main_plot_threads,
      user_relationship_map: {},
      active_hooks: genesis.active_hooks,
      narrative_pressure: 0.2,
      last_scene_summary: genesis.opening_scene_seed,
      last_chapter_text: genesis.opening_scene_seed,
    }),
  });

  await sbFetch('/user_character', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      world_id: worldId,
      name: userCharacter.name,
      traits: userCharacter.traits || {},
      inventory: [],
      current_location: startingLocationId,
      emotional_state: {},
      memory: '',
    }),
  });
}
