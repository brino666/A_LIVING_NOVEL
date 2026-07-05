// lib/novel-engine/writer.js
// The Scene Writer: turns the Director's structured decision into prose.
// It never decides plot -- it only describes what already happened.

import Anthropic from '@anthropic-ai/sdk';
import { formatWorldTime } from './time.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildWriterSystemPrompt(genre, toneSettings) {
  return `Write in third-person immersive fiction.
Do not mention system mechanics, ids, or JSON -- the reader must never see the
simulation underneath.
The world is continuous and independent of the reader; characters act on
their own goals even when off-screen.
The reader's character is a participant, not the center of the world, unless
the scene focus says otherwise.
Maintain tone: genre="${genre}", settings=${JSON.stringify(toneSettings || {})}.

Output a single full chapter of roughly 2200-2500 words -- this is a daily
chapter release, not a quick scene, so give it real chapter structure: room
to breathe, more than one beat, a sense of arc within the chapter. End with
either a natural continuation moment or a soft decision point -- never a hard
stop, never a literal question like "What do you do?".`;
}

export async function writeScene({ snapshot, directorOutput, userAction }) {
  const { world, userCharacter } = snapshot;

  const briefing = JSON.stringify({
    world_time: formatWorldTime(world.current_time),
    user_action: userAction || '(the reader takes no direct action this scene -- the world moves on its own)',
    user_character: userCharacter,
    scene_focus: directorOutput.scene_focus,
    tone_shift: directorOutput.tone_shift || null,
    npc_actions: directorOutput.npc_actions,
    new_events: directorOutput.new_events,
    last_scene: snapshot.storyState ? snapshot.storyState.last_scene_summary : '',
  }, null, 2);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096, // ~2500 words + headroom for descriptive prose token density
    system: buildWriterSystemPrompt(world.genre, world.tone_settings),
    messages: [{ role: 'user', content: 'Write this scene from the following director briefing:\n' + briefing }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : '';
}
