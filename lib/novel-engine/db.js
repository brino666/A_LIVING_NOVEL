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

export async function getWorldById(worldId) {
  const worlds = await sbFetch('/worlds?id=eq.' + worldId + '&limit=1');
  return worlds[0] || null;
}

// Lightweight rows for the library picker -- not a full snapshot per world.
export async function getWorldsForUser(userId) {
  return sbFetch(
    '/worlds?user_id=eq.' + userId
    + '&order=last_visited_at.desc'
    + '&select=id,title,genre,chapter_cap,world_hours,last_visited_at,created_at'
  );
}

// The world a push notification should draw content from -- whichever one
// the reader was actually in most recently, not just the oldest/newest.
export async function getMostRecentlyVisitedWorld(userId) {
  const worlds = await sbFetch('/worlds?user_id=eq.' + userId + '&order=last_visited_at.desc&limit=1');
  return worlds[0] || null;
}

// ── Push notifications ──────────────────────────────────────────────

export async function upsertPushSubscription(userId, subscription, timezone) {
  await sbFetch('/push_subscriptions', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth_key: subscription.keys.auth,
      timezone: timezone || 'UTC',
    }),
  });
}

export async function getAllPushSubscriptions() {
  return sbFetch('/push_subscriptions?select=*');
}

export async function markFlashSlotSent(subscriptionId, slot, dateStr) {
  const column = 'last_' + slot + '_sent_date';
  await sbFetch('/push_subscriptions?id=eq.' + subscriptionId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ [column]: dateStr }),
  });
}

export async function deletePushSubscription(id) {
  await sbFetch('/push_subscriptions?id=eq.' + id, {
    method: 'DELETE',
    headers: { 'Prefer': 'return=minimal' },
  });
}

// ── Mutations ────────────────────────────────────────────────────────

export async function advanceWorldTime(worldId, newTime, interactionCount) {
  await sbFetch('/worlds?id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ world_hours: newTime, interaction_count: interactionCount }),
  });
}

export async function touchLastVisited(worldId) {
  await sbFetch('/worlds?id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ last_visited_at: new Date().toISOString() }),
  });
}

export async function updateToneSettings(worldId, toneSettings) {
  await sbFetch('/worlds?id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ tone_settings: toneSettings }),
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

// The slot is consumed before the Director/Writer chain runs (so two rapid
// clicks can't both slip through mid-generation) -- if generation then
// fails for any reason, give the slot back rather than charging the reader
// a chapter for a story they never got. Only touches the count, not the
// window start, so it doesn't re-anchor the rolling 24h window.
export async function refundChapterSlot(worldId, capCheck) {
  await sbFetch('/worlds?id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ chapters_in_window: Math.max(0, capCheck.newCount - 1) }),
  });
}

export async function saveSceneSummary(worldId, sceneText) {
  await sbFetch('/story_state?world_id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ last_scene_summary: sceneText }),
  });
}

// Separate from saveSceneSummary above: this pair of columns is always the
// real rendered chapter text, for display -- never overwritten with a
// compressed memory summary the way last_scene_summary periodically is.
// Keeps exactly one chapter of look-back available after a page refresh.
export async function saveChapterDisplayText(worldId, previousText, currentText) {
  await sbFetch('/story_state?world_id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ previous_chapter_text: previousText || null, last_chapter_text: currentText }),
  });
}

// The recap shown once on return after a passive-tick gap (see recap.js) --
// cleared the next time the reader takes a real turn, since the upcoming
// chapter takes over telling them what's changed.
export async function saveReturnRecap(worldId, recapText) {
  await sbFetch('/story_state?world_id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ return_recap_text: recapText }),
  });
}

export async function clearReturnRecap(worldId) {
  await sbFetch('/story_state?world_id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ return_recap_text: null }),
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

// Only writes the fields actually provided -- undefined values are
// dropped, not sent as null, so callers can pass a partial patch (e.g. the
// webhook only knows the new price/status, not the customer id, on most
// event types).
function stripUndefined(fields) {
  const body = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) body[key] = value;
  }
  return body;
}

export async function updateWorldBilling(worldId, fields) {
  await sbFetch('/worlds?id=eq.' + worldId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(stripUndefined(fields)),
  });
}

// Fallback for webhook events where the subscription's own metadata.worldId
// wasn't set for some reason -- looked up by the subscription id we stored
// on checkout.session.completed instead.
export async function updateWorldBillingBySubscriptionId(subscriptionId, fields) {
  await sbFetch('/worlds?stripe_subscription_id=eq.' + subscriptionId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(stripUndefined(fields)),
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
