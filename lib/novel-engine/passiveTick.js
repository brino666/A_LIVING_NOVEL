// lib/novel-engine/passiveTick.js
// The "world continues without you" mechanic. When a reader returns after a
// real-world gap, silently run the Director (never the Writer) through that
// gap before they read anything -- characters, events, and plot state move
// on off-screen, exactly like the rest of the world does while you're on
// vacation. No recap screen: the next real chapter's Director already sees
// the updated characters/events/hooks and can surface what changed through
// the story itself (a mention in dialogue, a changed relationship) rather
// than a system-style summary dump.

import {
  getWorldSnapshot, advanceWorldTime, touchLastVisited, updateCharacter,
} from './db.js';
import { advanceTime } from './time.js';
import { runStoryDirector } from './director.js';
import { applyDirectorUpdates } from './directorApply.js';
import { shouldConsolidate, consolidateMemory } from './memory.js';

const GAP_THRESHOLD_MS = 6 * 60 * 60 * 1000; // don't bother for casual same-day reloads
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_PASSIVE_TICKS = 3; // bounds cost regardless of how long the reader was away

export async function maybeRunPassiveTicks(worldId) {
  let snapshot = await getWorldSnapshot(worldId);
  if (!snapshot) return snapshot;

  const lastVisited = new Date(snapshot.world.last_visited_at).getTime();
  const now = Date.now();
  if (now - lastVisited < GAP_THRESHOLD_MS) return snapshot;

  const daysAway = Math.ceil((now - lastVisited) / MS_PER_DAY);
  const tickCount = Math.min(Math.max(daysAway, 1), MAX_PASSIVE_TICKS);

  for (let i = 0; i < tickCount; i++) {
    const { newTime } = advanceTime(snapshot.world.world_hours, false);
    const directorOutput = await runStoryDirector({ snapshot, userAction: null, hoursAdvanced: newTime - snapshot.world.world_hours });

    await applyDirectorUpdates(worldId, snapshot, directorOutput, newTime);

    const interactionCount = (snapshot.world.interaction_count || 0) + 1;
    await advanceWorldTime(worldId, newTime, interactionCount);

    if (shouldConsolidate(interactionCount)) {
      const consolidation = await consolidateMemory({ snapshot, recentSceneText: snapshot.storyState ? snapshot.storyState.last_scene_summary : '' });
      if (consolidation) {
        for (const update of consolidation.character_memory_updates || []) {
          await updateCharacter(update.character_id, { memory_summary: update.memory_summary });
        }
      }
    }

    snapshot = await getWorldSnapshot(worldId);
  }

  await touchLastVisited(worldId);
  return snapshot;
}
