// lib/novel-engine/flash.js
// Short "flash" content -- a text from a friend, a news clipping, a
// character asking for help -- sent as a push notification between full
// chapters.

import client from './llm.js';

const SLOT_INSTRUCTIONS = {
  morning: 'Write a short morning news clipping or headline relevant to this world -- the kind of thing the reader would glance at over coffee. A local paper, not a global one.',
  lunch: 'Write a short midday text message from one of the existing characters to the reader -- casual, in-character, like an actual text someone sends on a break.',
  evening: 'Write a short evening beat -- a text, a voicemail transcript, or a small overheard news item -- that hints at something building in the world.',
};

const FLASH_TOOL = {
  type: "function",
  function: {
    name: 'record_flash_content',
    description: 'Record a short push-notification-style beat for this world.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title -- a character\'s name for a text, or a source like "Daily Herald" for a news clipping. Short.' },
        body: { type: 'string', description: 'The notification body -- 1-3 sentences. Second person ("you") if addressed to the reader.' },
      },
      required: ['title', 'body'],
    }
  }
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
  const response = await client.chat.completions.create({
    model: "grok-4.3",
    max_tokens: 300,
    messages: [
      { 
        role: "system", 
        content: 'You write extremely short "push notification" content for a living novel app. Never explain the mechanics, never say "chapter" or "notification" -- just the text/clipping/voicemail itself. Do not mention ids or JSON.' 
      },
      { role: "user", content: buildFlashContext(snapshot, slot) }
    ],
    tools: [FLASH_TOOL],
    tool_choice: { type: 'function', function: { name: 'record_flash_content' } },
    temperature: 0.8,
  });

  const toolCall = response.choices[0].message.tool_calls?.[0];
  if (!toolCall) return null;

  const args = JSON.parse(toolCall.function.arguments);
  return {
    title: args.title || 'A Living Novel',
    body: args.body,
  };
}
