// lib/novel-engine/memory.js
// V1 memory: no vector DB, just memory_summary text fields that get
// re-compressed every few interactions so they stay short and current.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CONSOLIDATE_EVERY = 4;

const MEMORY_TOOL = {
  name: 'record_memory_summaries',
  description: 'Record compressed memory summaries.',
  input_schema: {
    type: 'object',
    properties: {
      world_memory_summary: { type: 'string', description: '2-4 sentence summary of where the overarching story stands.' },
      character_memory_updates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            character_id: { type: 'string' },
            memory_summary: { type: 'string', description: '1-3 sentence compressed memory for this character, replacing their old one.' },
          },
          required: ['character_id', 'memory_summary'],
        },
      },
    },
    required: ['world_memory_summary', 'character_memory_updates'],
  },
};

export function shouldConsolidate(interactionCount) {
  return interactionCount > 0 && interactionCount % CONSOLIDATE_EVERY === 0;
}

export async function consolidateMemory({ snapshot, recentSceneText }) {
  const { characters, storyState } = snapshot;

  const context = JSON.stringify({
    previous_world_summary: storyState ? storyState.last_scene_summary : '',
    most_recent_scene: recentSceneText,
    characters: characters.map((c) => ({ id: c.id, name: c.name, existing_memory: c.memory_summary })),
  }, null, 2);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    system: 'You compress a running story into short, durable memory notes. Be concrete: names, decisions, unresolved tension. Drop scene-level detail that no longer matters.',
    tools: [MEMORY_TOOL],
    tool_choice: { type: 'tool', name: 'record_memory_summaries' },
    messages: [{ role: 'user', content: 'Compress memory from this context:\n' + context }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) return null;
  return toolUse.input;
}
