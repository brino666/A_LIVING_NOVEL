// api/turn.js
// The core loop:
//   load world -> advance time -> run Director -> apply world changes ->
//   run Scene Writer -> save state -> return the scene.

import {
  getWorldSnapshot, advanceWorldTime, saveSceneSummary, updateStoryState,
  updateCharacter, updateLocation, insertCharacter, insertEvent, resolveEvents,
  consumeChapterSlot,
} from '../lib/novel-engine/db.js';
import { advanceTime, formatWorldTime } from '../lib/novel-engine/time.js';
import { runStoryDirector } from '../lib/novel-engine/director.js';
import { writeScene } from '../lib/novel-engine/writer.js';
import { shouldConsolidate, consolidateMemory } from '../lib/novel-engine/memory.js';
import { evaluateChapterCap } from '../lib/novel-engine/chapters.js';

// Full-length chapters (~2500 words) push the Director + Writer chain well
// past a minute -- Vercel's Hobby plan hard-caps functions at 60s regardless
// of this setting; this app needs a paid plan once chapters are this long.
export const config = { maxDuration: 120 };

const PRIORITY_PRESSURE = { high: 0.85, medium: 0.5, low: 0.2 };

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

async function applyDirectorUpdates(worldId, snapshot, directorOutput, newTime) {
  const characterById = new Map(snapshot.characters.map((c) => [c.id, c]));

  for (const update of directorOutput.world_updates || []) {
    if (update.target === 'character' && characterById.has(update.id)) {
      await updateCharacter(update.id, update.changes);
    } else if (update.target === 'location') {
      await updateLocation(update.id, update.changes);
    }
  }

  for (const action of directorOutput.npc_actions || []) {
    if (action.new_character && action.new_character.name) {
      await insertCharacter(worldId, {
        name: action.new_character.name,
        role: action.new_character.role || 'neutral',
        personality: action.new_character.personality || {},
        goals: action.new_character.goals || [],
        relationships: {},
        location_id: action.new_character.location_id || null,
        last_seen_time: newTime,
      });
      continue;
    }
    if (!action.character_id || !characterById.has(action.character_id)) continue;

    const changes = { last_seen_time: newTime };
    if (action.new_location_id) changes.location_id = action.new_location_id;
    if (action.memory_note) {
      const existing = characterById.get(action.character_id).memory_summary || '';
      changes.memory_summary = (existing ? existing + ' ' : '') + action.memory_note;
    }
    await updateCharacter(action.character_id, changes);
  }

  for (const event of directorOutput.new_events || []) {
    await insertEvent(worldId, {
      type: event.type,
      description: event.description,
      participants: event.participant_ids || [],
      created_time: newTime,
    });
  }

  await resolveEvents(directorOutput.resolved_event_ids || []);

  const storyStateChanges = {};
  if (directorOutput.story_thread_updates) {
    if (directorOutput.story_thread_updates.main_plot_threads) {
      storyStateChanges.main_plot_threads = directorOutput.story_thread_updates.main_plot_threads;
    }
    if (directorOutput.story_thread_updates.active_hooks) {
      storyStateChanges.active_hooks = directorOutput.story_thread_updates.active_hooks;
    }
  }
  const oldPressure = snapshot.storyState ? snapshot.storyState.narrative_pressure : 0.2;
  const priorityValue = PRIORITY_PRESSURE[directorOutput.narrative_priority] ?? 0.5;
  storyStateChanges.narrative_pressure = clamp01(oldPressure * 0.6 + priorityValue * 0.4);

  await updateStoryState(worldId, storyStateChanges);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { userId, worldId, userAction } = body;
  if (!userId || !worldId) return res.status(400).json({ error: 'userId and worldId are required' });

  try {
    const snapshot = await getWorldSnapshot(worldId);
    if (!snapshot) return res.status(404).json({ error: 'World not found' });
    if (snapshot.world.user_id !== userId) return res.status(403).json({ error: 'Not your world' });

    const capCheck = evaluateChapterCap(snapshot.world);
    if (!capCheck.allowed) {
      return res.status(429).json({
        error: 'Daily chapter limit reached',
        chapters_used: capCheck.chaptersUsed,
        chapter_cap: capCheck.chapterCap,
        resets_at: new Date(capCheck.resetsAt).toISOString(),
      });
    }
    // Consume the slot before the expensive LLM chain, not after, so two
    // rapid clicks can't both slip through while the first is still running.
    await consumeChapterSlot(worldId, capCheck);

    const { newTime, hoursAdvanced } = advanceTime(snapshot.world.current_time, !!userAction);

    const directorOutput = await runStoryDirector({ snapshot, userAction, hoursAdvanced });

    await applyDirectorUpdates(worldId, snapshot, directorOutput, newTime);

    snapshot.world.current_time = newTime; // so the Writer sees the advanced clock
    const sceneText = await writeScene({ snapshot, directorOutput, userAction });

    const interactionCount = (snapshot.world.interaction_count || 0) + 1;
    await advanceWorldTime(worldId, newTime, interactionCount);

    let summaryToSave = sceneText;
    if (shouldConsolidate(interactionCount)) {
      const consolidation = await consolidateMemory({ snapshot, recentSceneText: sceneText });
      if (consolidation) {
        summaryToSave = consolidation.world_memory_summary;
        for (const update of consolidation.character_memory_updates || []) {
          await updateCharacter(update.character_id, { memory_summary: update.memory_summary });
        }
      }
    }
    await saveSceneSummary(worldId, summaryToSave);

    return res.status(200).json({
      scene: sceneText,
      world_time: formatWorldTime(newTime),
      hours_advanced: hoursAdvanced,
      narrative_priority: directorOutput.narrative_priority,
      scene_focus: directorOutput.scene_focus,
      chapters_used: capCheck.newCount,
      chapter_cap: capCheck.chapterCap,
      resets_at: new Date(capCheck.resetsAt).toISOString(),
    });
  } catch (err) {
    console.error('[novel-engine/turn error]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
