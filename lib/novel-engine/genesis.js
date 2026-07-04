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
      opening_scene_seed: { type: 'string', description: 'One sentence describing where/how the reader\'s character begins.' },
    },
    required: ['locations', 'characters', 'main_plot_threads', 'active_hooks', 'opening_scene_seed'],
  },
};

export async function generateGenesis({ title, genre, toneSettings, userCharacter }) {
  const context = JSON.stringify({ title, genre, tone_settings: toneSettings, user_character: userCharacter }, null, 2);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
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
