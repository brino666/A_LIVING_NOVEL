// lib/novel-engine/recap.js
// A short "while you were away" bridge, shown once the first time a reader
// returns after a passive-tick gap. Passive ticks already move characters,
// events, and plot state forward silently -- but the chapter text itself
// intentionally doesn't change until the reader's next real turn, so a
// multi-day gap could otherwise look completely frozen. Generated on
// Haiku, not Sonnet: a few sentences, not chapter-quality prose.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RECAP_TOOL = {
  name: 'record_return_recap',
  description: 'Record a short bridge passage for a reader returning after time away.',
  input_schema: {
    type: 'object',
    properties: {
      recap_text: {
        type: 'string',
        description: 'A brief 2-4 sentence, second-person ("you") passage explaining what quietly '
          + 'carried your character through the time that passed -- recovering, traveling, tied up '
          + 'with something specific and mundane -- and gesturing at one concrete thing that changed '
          + 'in the world while they were gone. This is a bridge, not a chapter: do not resolve major '
          + 'plot threads or introduce a twist here. Never mention notifications, chapters, apps, or '
          + 'any other app mechanics.',
      },
    },
    required: ['recap_text'],
  },
};

function buildRecapContext(snapshot, daysAway) {
  const { world, characters, storyState, events } = snapshot;
  return JSON.stringify({
    genre: world.genre,
    tone_settings: world.tone_settings,
    days_away: daysAway,
    your_character: snapshot.userCharacter ? snapshot.userCharacter.name : 'you',
    last_scene_before_you_left: storyState ? storyState.last_chapter_text : '',
    what_moved_on_without_you: {
      main_plot_threads: storyState ? storyState.main_plot_threads : [],
      active_hooks: storyState ? storyState.active_hooks : [],
      characters: characters.slice(0, 5).map((c) => ({ name: c.name, role: c.role, goals: c.goals })),
      recent_events: events.slice(0, 5),
    },
  }, null, 2);
}

// Best-effort: a failed or slow recap should never block the reader from
// seeing their world load, so callers should treat a null return as "skip it."
export async function generateReturnRecap(snapshot, daysAway) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: 'You write a short bridge passage for a living novel app, shown once when a reader '
        + 'returns after being away. Ground it in the notes given rather than inventing a full new scene.',
      tools: [RECAP_TOOL],
      tool_choice: { type: 'tool', name: 'record_return_recap' },
      messages: [{ role: 'user', content: buildRecapContext(snapshot, daysAway) }],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || !toolUse.input || !toolUse.input.recap_text) return null;
    return toolUse.input.recap_text;
  } catch (err) {
    console.error('[novel-engine/recap error]', err);
    return null;
  }
}
