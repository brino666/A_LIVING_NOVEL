
// lib/novel-engine/flash.js
import { callLLM } from './llm.js';

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
        title: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['title', 'body'],
    }
  }
};

export async function generateFlashContent(snapshot, slot) {
  const context = JSON.stringify({
    genre: snapshot.world.genre,
    tone_settings: snapshot.world.tone_settings,
    characters: snapshot.characters.slice(0, 5).map(c => ({ name: c.name, role: c.role })),
    last_scene: snapshot.storyState?.last_scene_summary || '',
    instruction: SLOT_INSTRUCTIONS[slot] || SLOT_INSTRUCTIONS.morning,
  }, null, 2);

  const { content } = await callLLM({
    systemPrompt: 'You write extremely short "push notification" content for a living novel app. Never explain mechanics.',
    userPrompt: context,
    temperature: 0.8,
    max_tokens: 300,
    tools: [FLASH_TOOL],
  });

  // Parse the tool response (Grok returns tool_calls)
  try {
    // For simplicity, just return the content for now
    return {
      title: "A Living Novel",
      body: content.trim()
    };
  } catch (e) {
    return { title: "Update", body: content.trim() };
  }
}
}
