// lib/novel-engine/flash.js
// Short "flash" content -- a text from a friend, a news clipping, a
// character asking for help -- sent as a push notification between full
// chapters. Deliberately generated on Haiku, not Sonnet: this is two or
// three sentences, not chapter-quality prose, so it should cost a fraction
// of a cent, not a fraction of a dollar.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SLOT_INSTRUCTIONS = {
  morning: 'Write a short morning news clipping or headline relevant to this world -- the kind of thing the reader would glance at over coffee. A local paper, not a global one.',
  lunch: 'Write a short midday text message from one of the existing characters to the reader -- casual, in-character, like an actual text someone sends on a break.',
  evening: 'Write a short evening beat -- a text, a voicemail transcript, or a small overheard news item -- that hints at something building in the world.',
};

const FLASH_TOOL = {
  name: 'record_flash_content',
  description: 'Record a short push-notification-style beat for this world.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Notification title -- a character\'s name for a text, or a source like "Daily Herald" for a news clipping. Short.' },
      body: { type: 'string', description: 'The notification body -- 1-3 sentences. Second person ("you") if addressed to the reader.' },
    },
    required: ['title', 'body'],
  },
};

function buildFlashContext(snapshot, slot) {
  const { world, characters, storyState } = snapshot;
  return JSON.stringify({
    genre: world.genre,
    tone_settings: world.tone_settings,
    characters: characters.slice(0, 5).map((c) => ({ name: c.name, role: c.role, goals: c.goals })),
    last_scene: storyState ? storyState.last_scene_summary : '',
    instruction: SLOT_INSTRUCTIONS[slot] || SLOT_INSTRUCTIONS.morning,
  }, null, 2);
}

export async function generateFlashContent(snapshot, slot) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 150,
    system: 'You write extremely short "push notification" content for a living novel app. Never explain the mechanics, never say "chapter" or "notification" -- just the text/clipping/voicemail itself. Do not mention ids or JSON.',
    tools: [FLASH_TOOL],
    tool_choice: { type: 'tool', name: 'record_flash_content' },
    messages: [{ role: 'user', content: buildFlashContext(snapshot, slot) }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || !toolUse.input || !toolUse.input.body) return null;
  return {
    title: toolUse.input.title || 'A Living Novel',
    body: toolUse.input.body,
  };
}
