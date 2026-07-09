// lib/novel-engine/director.js
// The Story Director: a simulation step function, not a chat responder.

import client from './llm.js';
import { formatWorldTime } from './time.js';
import { intensityInstruction } from './tone.js';

const DIRECTOR_SYSTEM_PROMPT = `You are a narrative simulation engine.

You simulate a living world that continues whether or not the user interacts.
Characters have independent goals. Events may occur without user involvement.
Maintain continuity and consequence. Do not center everything on the user
unless directly relevant.

The Director decides what happens. A separate Writer will turn your decision
into prose -- you never write narrative text yourself, only structured facts.

Rules:
- Advance at least one character's goal or at least one plot thread this turn,
  even if the user's action seems small.
- Characters not present with the user may still act off-screen; reflect that
  in npc_actions and new_events.
- Do not resolve every open thread at once. Prefer slow-burn consequence.
- Keep narrative_priority "high" only for a genuine turning point.
- Only reference existing characters/locations by id. To introduce someone
  new, set new_character on that npc_action instead of character_id.`;

function buildWorldContext(snapshot, hoursAdvanced, userAction) {
  const { world, storyState, userCharacter, characters, locations, events } = snapshot;
  return JSON.stringify({
    world_time: formatWorldTime(world.world_hours),
    hours_since_last_turn: hoursAdvanced,
    genre: world.genre,
    tone_settings: world.tone_settings,
    intensity_guidance: intensityInstruction(world.tone_settings && world.tone_settings.intensity_offset),
    user_action: userAction || '(no action -- passive tick)',
    user_character: userCharacter,
    characters: characters.map((c) => ({
      id: c.id, name: c.name, role: c.role, personality: c.personality,
      goals: c.goals, relationships: c.relationships, location_id: c.location_id,
      alive: c.alive, memory_summary: c.memory_summary,
    })),
    locations: locations.map((l) => ({ id: l.id, name: l.name, type: l.type, status: l.status, description: l.description })),
    open_events: events.map((e) => ({ id: e.id, type: e.type, description: e.description, participants: e.participants })),
    story_state: storyState ? {
      main_plot_threads: storyState.main_plot_threads,
      active_hooks: storyState.active_hooks,
      narrative_pressure: storyState.narrative_pressure,
    } : null,
    last_scene: storyState ? storyState.last_scene_summary : '',
  }, null, 2);
}

const DIRECTOR_TOOL = {
  type: "function",
  function: {
    name: 'record_story_update',
    description: 'Record the Director\'s simulation update for this turn.',
    parameters: {
      type: 'object',
      properties: {
        world_updates: { type: 'array', items: { type: 'object' } },
        npc_actions: { type: 'array', items: { type: 'object' } },
        new_events: { type: 'array', items: { type: 'object' } },
        scene_focus: { type: 'string' },
        tone_shift: { type: 'string' },
        narrative_priority: { type: 'string', enum: ['low', 'medium', 'high'] }
      },
      required: ['world_updates', 'npc_actions', 'new_events', 'scene_focus', 'narrative_priority']
    }
  }
};
function isWellFormedDirectorOutput(output) {
  return output
    && Array.isArray(output.world_updates)
    && Array.isArray(output.npc_actions)
    && Array.isArray(output.new_events)
    && typeof output.scene_focus === 'string';
}

export async function runStoryDirector({ snapshot, userAction, hoursAdvanced }) {
  const context = buildWorldContext(snapshot, hoursAdvanced, userAction);

  async function callDirector() {
    const response = await client.chat.completions.create({
      model: "grok-4.3",
      max_tokens: 2000,
      messages: [
        { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
        { role: "user", content: 'Current world state:\n' + context }
      ],
      tools: [DIRECTOR_TOOL],
      tool_choice: { type: 'function', function: { name: 'record_story_update' } },
      temperature: 0.7,
    });

    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (!toolCall) throw new Error('Director did not return a structured update.');
    return JSON.parse(toolCall.function.arguments);
  }

  let directorOutput = await callDirector();
  if (!isWellFormedDirectorOutput(directorOutput)) directorOutput = await callDirector();
  if (!isWellFormedDirectorOutput(directorOutput)) {
    throw new Error('Director returned malformed structured output even after retry.');
  }
  return directorOutput;
}
