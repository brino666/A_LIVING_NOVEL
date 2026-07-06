// lib/novel-engine/director.js
// The Story Director: a simulation step function, not a chat responder.
// It decides what happens in the world this turn. The Writer (writer.js)
// only describes what the Director decided.

import Anthropic from '@anthropic-ai/sdk';
import { formatWorldTime } from './time.js';
import { intensityInstruction } from './tone.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DIRECTOR_SYSTEM_PROMPT = `You are a narrative simulation engine.

You simulate a living world that continues whether or not the user interacts.
Characters have independent goals. Events may occur without user involvement.
Maintain continuity and consequence. Do not center everything on the user
unless directly relevant.

The Director decides what happens. A separate Writer will turn your decision
into prose -- you never write narrative text yourself, only structured facts.

Rules:
- If user_action reads as a note about the story itself rather than something
  the reader's character does or says (e.g. "this is getting too dark", "we've
  been stuck in this location too long", "I want more romance"), treat it as
  out-of-character guidance for pacing/tone/direction -- do not have the
  character say or do it in-world.
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
  name: 'record_story_update',
  description: 'Record this turn\'s simulation update for the living world.',
  input_schema: {
    type: 'object',
    properties: {
      world_updates: {
        type: 'array',
        description: 'Partial field changes to existing characters or locations.',
        items: {
          type: 'object',
          properties: {
            target: { type: 'string', enum: ['character', 'location'] },
            id: { type: 'string', description: 'Existing id being changed.' },
            changes: { type: 'object', description: 'Partial fields to merge, e.g. {"alive": false} or {"status": "closed"}.' },
          },
          required: ['target', 'id', 'changes'],
        },
      },
      npc_actions: {
        type: 'array',
        description: 'What characters do this turn, independent of the user.',
        items: {
          type: 'object',
          properties: {
            character_id: { type: 'string', description: 'Existing character id, omit if new_character is set.' },
            new_character: {
              type: 'object',
              description: 'Only set when this action introduces a brand-new character.',
              properties: {
                name: { type: 'string' },
                role: { type: 'string', enum: ['ally', 'antagonist', 'neutral', 'unknown'] },
                personality: { type: 'object' },
                goals: { type: 'array', items: { type: 'string' } },
                location_id: { type: 'string' },
              },
            },
            action: { type: 'string', description: 'Short description of what they do.' },
            new_location_id: { type: 'string', description: 'Set if this action moves the character.' },
            memory_note: { type: 'string', description: 'Short note to append to this character\'s memory_summary.' },
          },
          required: ['action'],
        },
      },
      new_events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['mystery', 'romance', 'conflict', 'discovery', 'random'] },
            description: { type: 'string' },
            participant_ids: { type: 'array', items: { type: 'string' } },
          },
          required: ['type', 'description'],
        },
      },
      resolved_event_ids: { type: 'array', items: { type: 'string' }, description: 'Open event ids that are now resolved.' },
      story_thread_updates: {
        type: 'object',
        description: 'Replacement values for story_state fields, only if they changed.',
        properties: {
          main_plot_threads: { type: 'array', items: { type: 'string' } },
          active_hooks: { type: 'array', items: { type: 'string' } },
        },
      },
      scene_focus: { type: 'string', description: 'What matters right now -- the Writer will center the scene on this.' },
      tone_shift: { type: 'string', description: 'A tonal note for the Writer, if the mood should shift this scene. Empty string if none.' },
      narrative_priority: { type: 'string', enum: ['high', 'medium', 'low'] },
      pacing: {
        type: 'string',
        enum: ['slow', 'moderate', 'fast'],
        description: 'The reading pace this chapter should feel like -- independent of narrative_priority. '
          + '"slow" for quiet, contemplative, dread-building, or atmosphere-heavy scenes; "fast" for physical '
          + 'action, chases, confrontation, or urgency; "moderate" otherwise. A high-priority scene can still '
          + 'be slow (a tense standoff) and a low-priority one can still be fast (a minor scuffle).',
      },
    },
    required: ['world_updates', 'npc_actions', 'new_events', 'scene_focus', 'narrative_priority', 'pacing'],
  },
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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system: DIRECTOR_SYSTEM_PROMPT,
      tools: [DIRECTOR_TOOL],
      tool_choice: { type: 'tool', name: 'record_story_update' },
      messages: [{ role: 'user', content: 'Current world state:\n' + context }],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse) throw new Error('Director did not return a structured update.');
    return toolUse.input;
  }

  // Same reasoning as genesis.js: without strict schema validation the
  // model's structured output can occasionally come back malformed. Retry
  // once before giving up.
  let directorOutput = await callDirector();
  if (!isWellFormedDirectorOutput(directorOutput)) directorOutput = await callDirector();
  if (!isWellFormedDirectorOutput(directorOutput)) {
    throw new Error('Director returned malformed structured output (world_updates/npc_actions/new_events were not arrays) even after a retry.');
  }
  return directorOutput;
}
