// lib/novel-engine/db.js
// Thin REST wrapper around Supabase (service-role key, server-side only)
// plus the World State load/save helpers the core loop needs.

// Normalized to a bare origin (no trailing slash, no /rest/v1 suffix) so a
// pasted-in trailing slash or an accidentally-full REST URL in the env var
// can't double up into /rest/v1/rest/v1/... and 404 with PGRST125.
const SUPABASE_URL = (process.env.supabase_url || process.env.SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '');
const SUPABASE_SERVICE_KEY = process.env.supabase_ret_key || process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function sbFetch(path, options) {
  options = options || {};
  const headers = Object.assign({
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }, options.headers || {});

  const res = await fetch(SUPABASE_URL + '/rest/v1' + path, Object.assign({}, options, { headers }));

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Supabase error (' + res.status + '): ' + err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ── World snapshot ───────────────────────────────────────────────────

export async function getWorldSnapshot(worldId) {
  const [worlds, storyStates, userCharacters, characters, locations, events] = await Promise.all([
    sbFetch('/worlds?id=eq.' + worldId + '&limit=1'),
    sbFetch('/story_state?world_id=eq.' + worldId + '&limit=1'),
    sbFetch('/user_character?world_id=eq.' + worldId + '&limit=1'),
    sbFetch('/characters?world_id=eq.' + worldId + '&alive=eq.true&order=last_seen_time.desc&limit=50'),
    sbFetch('/locations?world_id=eq.' + worldId),
    sbFetch('/events?world_id=eq.' + worldId + '&resolved=eq.false&order=created_time.desc&limit=20'),
  ]);

  if (!worlds.length) return null;

  return {
    world: worlds[0],
    storyState: storyStates[0] || null,
    userCharacter: userCharacters[0] || null,
    characters,
    locations,
    events,
  };
}

export async function getWorldForUser(userId) {
  const worlds = await sbFetch('/worlds?user_id=eq.' + userId + '&order=created_at.desc&limit=1');
  return worlds[0] || null;
}

// ── Mutations ────────────────────────────────────────────────────────

export async function advanceWorldTime(worldId, newTime, interactionCount) {
  await sbFetch('/worlds?id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ world_hours: newTime, interaction_count: interactionCount }),
  });
}

export async function consumeChapterSlot(worldId, capCheck) {
  await sbFetch('/worlds?id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      chapters_in_window: capCheck.newCount,
      chapter_window_start: new Date(capCheck.newWindowStart).toISOString(),
    }),
  });
}

export async function saveSceneSummary(worldId, sceneText) {
  await sbFetch('/story_state?world_id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ last_scene_summary: sceneText }),
  });
}

export async function updateStoryState(worldId, changes) {
  await sbFetch('/story_state?world_id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(changes),
  });
}

export async function updateCharacter(characterId, changes) {
  await sbFetch('/characters?id=eq.' + characterId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(changes),
  });
}

export async function updateLocation(locationId, changes) {
  await sbFetch('/locations?id=eq.' + locationId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(changes),
  });
}

export async function deleteWorld(worldId) {
  await sbFetch('/worlds?id=eq.' + worldId, {
    method: 'DELETE',
    headers: { 'Prefer': 'return=minimal' },
  });
}

export async function insertCharacter(worldId, character) {
  const rows = await sbFetch('/characters', {
    method: 'POST',
    body: JSON.stringify(Object.assign({ world_id: worldId }, character)),
  });
  return rows[0];
}

export async function insertEvent(worldId, event) {
  await sbFetch('/events', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(Object.assign({ world_id: worldId }, event)),
  });
}

export async function resolveEvents(eventIds) {
  if (!eventIds || !eventIds.length) return;
  await sbFetch('/events?id=in.(' + eventIds.join(',') + ')', {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ resolved: true }),
  });
}
