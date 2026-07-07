/// lib/novel-engine/writer.js
import { callLLM } from './llm.js';
import { formatWorldTime } from './time.js';
import { intensityInstruction } from './tone.js';

function buildWriterSystemPrompt(genre, toneSettings, userCharacterName) {
  return `Write in second-person present tense. The reader's character (${userCharacterName}) is "you"...`; 
  // (keep your full original prompt here - just copy from the old file)
}

export async function writeScene({ snapshot, directorOutput, userAction }) {
  const { world, userCharacter } = snapshot;

  const briefing = JSON.stringify({
    world_time: formatWorldTime(world.world_hours),
    user_action: userAction || '(the reader takes no direct action this scene -- the world moves on its own)',
    user_character: userCharacter,
    scene_focus: directorOutput.scene_focus,
    tone_shift: directorOutput.tone_shift || null,
    npc_actions: directorOutput.npc_actions,
    new_events: directorOutput.new_events,
    last_scene: snapshot.storyState ? snapshot.storyState.last_scene_summary : '',
  }, null, 2);

  const { content } = await callLLM({
    systemPrompt: buildWriterSystemPrompt(world.genre, world.tone_settings, userCharacter.name),
    userPrompt: 'Write this scene from the following director briefing:\n' + briefing,
    temperature: 0.85,
    max_tokens: 4000,
  });

  return content.trim();
}