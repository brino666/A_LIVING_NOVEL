// lib/novel-engine/passiveTick.js
// The "world continues without you" mechanic. When a reader returns after a
// real-world gap, silently run the Director (never the Writer) through that
// gap before they read anything -- characters, events, and plot state move
// on off-screen, exactly like the rest of the world does while you're on
// vacation. The chapter text itself doesn't change until the reader's next
// real turn, but a short return-recap passage (recap.js) is generated once
// and shown above it in the meantime.

import {
  getWorldSnapshot, advanceWorldTime, touchLastVisited, updateCharacter, saveReturnRecap,
} from './db.js';
import { runStoryDirector } from './director.js';
import { applyDirectorUpdates } from './directorApply.js';
import { shouldConsolidate, consolidateMemory } from './memory.js';
import { generateReturnRecap } from './recap.js';

const GAP_THRESHOLD_MS = 6 * 60 * 60 * 1000; // don't bother for casual same-day reloads
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MAX_PASSIVE_TICKS = 3; // bounds Director-call cost, not the fictional time jump itself

export async function maybeRunPassiveTicks(worldId) {
  let snapshot = await getWorldSnapshot(worldId);
  if (!snapshot) return snapshot;

  const lastVisited = new Date(snapshot.world.last_visited_at).getTime();
  const now = Date.now();
  const realMsAway = now - lastVisited;
  if (realMsAway < GAP_THRESHOLD_MS) return snapshot;

  // The story's clock reflects real time actually passing -- roughly 1 real
  // hour away is 1 in-story hour -- not a jump gated by how many chapters
  // happened to be left in the reader's window when they dropped off.
  const totalHoursToAdvance = Math.max(1, Math.round(realMsAway / MS_PER_HOUR));
  const daysAway = Math.ceil(realMsAway / MS_PER_DAY);
  const tickCount = Math.min(Math.max(daysAway, 1), MAX_PASSIVE_TICKS);
  const baseHoursPerTick = Math.floor(totalHoursToAdvance / tickCount);

  for (let i = 0; i < tickCount; i++) {
    const isLastTick = i === tickCount - 1;
    // The last tick soaks up the remainder so the total matches real
    // elapsed time exactly, regardless of how evenly tickCount divides it.
    const hoursThisTick = isLastTick
      ? totalHoursToAdvance - baseHoursPerTick * (tickCount - 1)
      : baseHoursPerTick;
    const newTime = snapshot.world.world_hours + hoursThisTick;

    const directorOutput = await runStoryDirector({ snapshot, userAction: null, hoursAdvanced: hoursThisTick });

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

  // One recap for the whole gap, not one per tick -- shown once, above the
  // (otherwise unchanged) last chapter, until the reader's next real turn.
  const recapText = await generateReturnRecap(snapshot, daysAway);
  if (recapText && snapshot.storyState) {
    await saveReturnRecap(worldId, recapText);
    snapshot.storyState.return_recap_text = recapText;
  }

  await touchLastVisited(worldId);
  return snapshot;
}
