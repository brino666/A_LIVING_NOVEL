// lib/novel-engine/genesis.js
// Runs once, when a world is created: seeds enough living world to make the
// first scene feel inhabited (a couple of characters with real goals, a
// location or two, and 1-2 opening plot threads) instead of an empty room.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GENESIS_TOOL = {
  name: 'record_genesis',
  description: 'Record the seed content for a brand-new living world.',
  input_schema: {
    type: 'object',
    properties: {
      locations: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string' },
          },
          required: ['name', 'description', 'type'],
        },
      },
      characters: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string', enum: ['ally', 'antagonist', 'neutral', 'unknown'] },
            personality: { type: 'object' },
            goals: { type: 'array', items: { type: 'string' } },
            starting_location_name: { type: 'string', description: 'Must match one of the locations above.' },
          },
          required: ['name', 'role', 'goals', 'starting_location_name'],
        },
      },
      main_plot_threads: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 },
      active_hooks: { type: 'array', items: { type: 'string' } },
      opening_scene_seed: {
        type: 'string',
        description: 'One sentence describing where/how the reader\'s character begins. Written in second-person '
          + 'present tense, addressing the reader as "you" -- never by their own character name -- since this is '
          + 'the first line the reader sees and must match the voice of every chapter after it.',
      },
    },
    required: ['locations', 'characters', 'main_plot_threads', 'active_hooks', 'opening_scene_seed'],
  },
};

function isWellFormedGenesis(genesis) {
  return genesis
    && Array.isArray(genesis.locations)
    && Array.isArray(genesis.characters)
    && Array.isArray(genesis.main_plot_threads)
    && Array.isArray(genesis.active_hooks);
}

export async function generateGenesis({ title, genre, toneSettings, userCharacter }) {
  const context = JSON.stringify({ title, genre, tone_settings: toneSettings, user_character: userCharacter }, null, 2);

  async function callGenesis() {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      system: `You design the seed state for a living novel world. Create characters with
independent goals that do not depend on the reader ever showing up. Create at
least one plot thread that is already in motion before the reader arrives.
Keep it grounded in the given genre and tone.`,
      tools: [GENESIS_TOOL],
      tool_choice: { type: 'tool', name: 'record_genesis' },
      messages: [{ role: 'user', content: 'Seed a new world from this brief:\n' + context }],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse) throw new Error('Genesis did not return structured seed content.');
    return toolUse.input;
  }

  // Without strict schema validation, the model's structured output can
  // occasionally come back malformed (wrong field types). Retry once before
  // giving up -- this is usually a one-off, not a repeating failure.
  let genesis = await callGenesis();
  if (!isWellFormedGenesis(genesis)) genesis = await callGenesis();
  if (!isWellFormedGenesis(genesis)) {
    throw new Error('Genesis returned malformed seed content (locations/characters/threads were not arrays) even after a retry.');
  }
  return genesis;
}
