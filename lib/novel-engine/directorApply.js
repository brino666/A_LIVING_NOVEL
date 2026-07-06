// lib/novel-engine/directorApply.js
// Applies a Director's structured decision to the database. Shared between
// the real turn loop (api/turn.js) and passive ticks (passiveTick.js), so
// off-screen simulation and on-screen chapters mutate the world identically.

import {
  updateCharacter, updateLocation, insertCharacter, insertEvent, resolveEvents, updateStoryState,
} from './db.js';

const PRIORITY_PRESSURE = { high: 0.85, medium: 0.5, low: 0.2 };

// The Director's tool schema declares world_updates[].changes as a freeform
// object (there's no strict tool-use schema enforcement on the Anthropic
// side), so the model is free to invent plausible-sounding field names --
// e.g. "emotional_state" -- that don't exist as real columns on these
// tables. Whitelist to what's actually in the schema so a hallucinated
// field drops silently instead of taking down the whole chapter with a
// Supabase 400.
const CHARACTER_UPDATABLE_FIELDS = new Set([
  'role', 'personality', 'goals', 'relationships', 'location_id', 'alive', 'memory_summary', 'last_seen_time',
]);
const LOCATION_UPDATABLE_FIELDS = new Set(['name', 'description', 'type', 'status']);

function pickAllowed(changes, allowedFields) {
  const picked = {};
  for (const key of Object.keys(changes || {})) {
    if (allowedFields.has(key)) picked[key] = changes[key];
  }
  return picked;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

export async function applyDirectorUpdates(worldId, snapshot, directorOutput, newTime) {
  const characterById = new Map(snapshot.characters.map((c) => [c.id, c]));

  for (const update of directorOutput.world_updates || []) {
    if (update.target === 'character' && characterById.has(update.id)) {
      const changes = pickAllowed(update.changes, CHARACTER_UPDATABLE_FIELDS);
      if (Object.keys(changes).length) await updateCharacter(update.id, changes);
    } else if (update.target === 'location') {
      const changes = pickAllowed(update.changes, LOCATION_UPDATABLE_FIELDS);
      if (Object.keys(changes).length) await updateLocation(update.id, changes);
    }
  }

  for (const action of directorOutput.npc_actions || []) {
    if (action.new_character && action.new_character.name) {
      await insertCharacter(worldId, {
        name: action.new_character.name,
        role: action.new_character.role || 'neutral',
        personality: action.new_character.personality || {},
        goals: action.new_character.goals || [],
        relationships: {},
        location_id: action.new_character.location_id || null,
        last_seen_time: newTime,
      });
      continue;
    }
    if (!action.character_id || !characterById.has(action.character_id)) continue;

    const changes = { last_seen_time: newTime };
    if (action.new_location_id) changes.location_id = action.new_location_id;
    if (action.memory_note) {
      const existing = characterById.get(action.character_id).memory_summary || '';
      changes.memory_summary = (existing ? existing + ' ' : '') + action.memory_note;
    }
    await updateCharacter(action.character_id, changes);
  }

  for (const event of directorOutput.new_events || []) {
    await insertEvent(worldId, {
      type: event.type,
      description: event.description,
      participants: event.participant_ids || [],
      created_time: newTime,
    });
  }

  await resolveEvents(directorOutput.resolved_event_ids || []);

  const storyStateChanges = {};
  if (directorOutput.story_thread_updates) {
    if (directorOutput.story_thread_updates.main_plot_threads) {
      storyStateChanges.main_plot_threads = directorOutput.story_thread_updates.main_plot_threads;
    }
    if (directorOutput.story_thread_updates.active_hooks) {
      storyStateChanges.active_hooks = directorOutput.story_thread_updates.active_hooks;
    }
  }
  const oldPressure = snapshot.storyState ? snapshot.storyState.narrative_pressure : 0.2;
  const priorityValue = PRIORITY_PRESSURE[directorOutput.narrative_priority] ?? 0.5;
  storyStateChanges.narrative_pressure = clamp01(oldPressure * 0.6 + priorityValue * 0.4);

  await updateStoryState(worldId, storyStateChanges);
}
