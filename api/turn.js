// api/turn.js
// The core loop:
//   load world -> advance time -> run Director -> apply world changes ->
//   run Scene Writer -> save state -> return the scene.

import {
  getWorldSnapshot, advanceWorldTime, saveSceneSummary, saveChapterDisplayText, updateCharacter, consumeChapterSlot, refundChapterSlot, touchLastVisited, clearReturnRecap, setFreePreviewTurnsUsed,
} from '../lib/novel-engine/db.js';
import { advanceTime, formatWorldTime } from '../lib/novel-engine/time.js';
import { runStoryDirector } from '../lib/novel-engine/director.js';
import { writeScene } from '../lib/novel-engine/writer.js';
import { shouldConsolidate, consolidateMemory } from '../lib/novel-engine/memory.js';
import { evaluateChapterCap } from '../lib/novel-engine/chapters.js';
import { applyDirectorUpdates } from '../lib/novel-engine/directorApply.js';
import { requireMatchingUser } from '../lib/novel-engine/auth.js';
import { hasActiveAccess, hasFreePreviewRemaining, FREE_PREVIEW_CHAPTERS } from '../lib/novel-engine/access.js';

// The Director + Writer chain can still run past a minute even at the
// shorter 1500-1800 word target -- Vercel's Hobby plan hard-caps functions
// at 60s regardless of this setting, so a paid plan is the safe assumption.
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { userId, worldId, userAction } = body;
  if (!userId || !worldId) return res.status(400).json({ error: 'userId and worldId are required' });

  try {
    if (!(await requireMatchingUser(req, res, userId))) return;

    const snapshot = await getWorldSnapshot(worldId);
    if (!snapshot) return res.status(404).json({ error: 'World not found' });
    if (snapshot.world.user_id !== userId) return res.status(403).json({ error: 'Not your world' });

    const isSubscribed = hasActiveAccess(snapshot.world);
    if (!isSubscribed && !hasFreePreviewRemaining(snapshot.world)) {
      return res.status(402).json({
        error: "You've used your free preview chapters. Subscribe to keep reading.",
        requiresSubscription: true,
      });
    }

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

    try {
      const isLastChapterOfDay = capCheck.newCount === capCheck.chapterCap;
      const { newTime, hoursAdvanced } = advanceTime(snapshot.world.world_hours, capCheck.chapterCap, isLastChapterOfDay);

      const directorOutput = await runStoryDirector({ snapshot, userAction, hoursAdvanced, isLastChapterOfDay });

      await applyDirectorUpdates(worldId, snapshot, directorOutput, newTime);

      snapshot.world.world_hours = newTime; // so the Writer sees the advanced clock
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
      const previousChapterText = snapshot.storyState ? snapshot.storyState.last_chapter_text : '';
      await saveChapterDisplayText(worldId, previousChapterText, sceneText);
      await clearReturnRecap(worldId);
      await touchLastVisited(worldId);

      let previewUsed = null;
      if (!isSubscribed) {
        previewUsed = (snapshot.world.free_preview_turns_used || 0) + 1;
        await setFreePreviewTurnsUsed(worldId, previewUsed);
      }

      return res.status(200).json({
        scene: sceneText,
        world_time: formatWorldTime(newTime),
        hours_advanced: hoursAdvanced,
        narrative_priority: directorOutput.narrative_priority,
        scene_focus: directorOutput.scene_focus,
        pacing: ['slow', 'moderate', 'fast'].includes(directorOutput.pacing) ? directorOutput.pacing : 'moderate',
        chapters_used: capCheck.newCount,
        chapter_cap: capCheck.chapterCap,
        resets_at: new Date(capCheck.resetsAt).toISOString(),
        is_free_preview: !isSubscribed,
        free_preview_used: previewUsed,
        free_preview_limit: FREE_PREVIEW_CHAPTERS,
      });
    } catch (genErr) {
      // The slot was already spent above -- if anything past that point
      // fails, give it back rather than charging a chapter for a story
      // the reader never got.
      await refundChapterSlot(worldId, capCheck).catch(() => {});
      throw genErr;
    }
  } catch (err) {
    console.error('[novel-engine/turn error]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
