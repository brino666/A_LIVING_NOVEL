// lib/novel-engine/flash.js
import { callLLM } from './llm.js';

const SLOT_INSTRUCTIONS = {
  morning: 'Write a short morning news clipping or headline relevant to this world -- the kind of thing the reader would glance at over coffee.',
  lunch: 'Write a short midday text message from one of the existing characters to the reader.',
  evening: 'Write a short evening beat -- a text or small news item.',
};

export async function generateFlashContent(snapshot, slot) {
  const context = JSON.stringify({
    genre: snapshot.world?.genre,
    tone_settings: snapshot.world?.tone_settings,
    last_scene: snapshot.storyState?.last_scene_summary || '',
    instruction: SLOT_INSTRUCTIONS[slot] || SLOT_INSTRUCTIONS.morning,
  }, null, 2);

  const { content } = await callLLM({
    systemPrompt: 'You write extremely short push-notification style content. Keep it 1-3 sentences.',
    userPrompt: context,
    temperature: 0.8,
    max_tokens: 300,
  });

  return {
    title: "A Living Novel",
    body: content.trim()
  };
}
