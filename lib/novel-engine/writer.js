// lib/novel-engine/writer.js
// The Scene Writer: turns the Director's structured decision into prose.
// It never decides plot -- it only describes what already happened.

import Anthropic from '@anthropic-ai/sdk';
import { formatWorldTime } from './time.js';
import { intensityInstruction } from './tone.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildWriterSystemPrompt(genre, toneSettings, userCharacterName) {
  return `Write in second-person present tense. The reader's character
(${userCharacterName}) is "you" -- this is happening to the reader right now,
not a story being told about someone else afterward. Never refer to the
reader's own character by name or in third person in the narration itself.

Correct voice: "The whiskey in front of you has gone warm, and still you
haven't touched it. You keep your hands wrapped around the glass instead,
feeling the condensation slick against your palms."
Wrong voice (do not do this): "The whiskey in front of ${userCharacterName}
had gone warm an hour ago, and still she hadn't touched it."

Every other character keeps their own name and is written in ordinary third
person -- only the reader's own character becomes "you." Other characters
may address the reader by name in dialogue ("${userCharacterName}, you're
late") -- that's fine, it's speech, not narration.

Do not mention system mechanics, ids, or JSON -- the reader must never see the
simulation underneath.
The world is continuous and independent of the reader; other characters act
on their own goals even when off-screen.
The reader is a participant, not the center of the world, unless the scene
focus says otherwise.
Maintain tone: genre="${genre}", settings=${JSON.stringify(toneSettings || {})}.
${intensityInstruction(toneSettings && toneSettings.intensity_offset)}

Every sentence should move the plot, reveal character, or land one concrete
sensory detail -- cut anything that doesn't. Do not re-describe a feeling,
a room, or an action once it's already been established; do not pad a beat
with a second or third variation of the same image. Prefer one sharp,
specific detail over a list of atmospheric ones. If a line could be deleted
without losing anything the reader needs, delete it. Tight and fast beats
long and atmospheric.

Output a single chapter of roughly 1500-1800 words -- this is a daily
release, not a quick scene, so give it real structure: a beginning, a turn,
and a landing point, not just incident. End with either a natural
continuation moment or a soft decision point, written as prose -- never a
hard stop, never a literal game-style prompt like "What do you do?".`;
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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    // Sonnet 5's tokenizer runs ~30% denser than older Claude models, so 1500-1800
    // words of prose can run close to 3200 tokens on its own -- this leaves real
    // headroom instead of risking a chapter truncating mid-sentence.
    max_tokens: 4000,
    system: buildWriterSystemPrompt(world.genre, world.tone_settings, userCharacter.name),
    messages: [{ role: 'user', content: 'Write this scene from the following director briefing:\n' + briefing }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : '';
}
