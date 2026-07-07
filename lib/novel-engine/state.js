// lib/novel-engine/state.js
import { consolidateMemory, shouldConsolidate } from './memory.js';
import { dbUpdateStoryState, dbSaveChapter } from './db.js';

export async function updateWorldState(snapshot, directorOutput, newSceneText) {
  const { storyState, characters } = snapshot;

  let updatedStoryState = { ...storyState };

  // Basic updates
  updatedStoryState.last_scene_summary = newSceneText.substring(0, 800) + (newSceneText.length > 800 ? '...' : '');
  updatedStoryState.last_chapter_text = newSceneText; // for the column you added

  // Apply director changes (simple version)
  if (directorOutput.world_updates) {
    // You can expand this later
  }

  // Memory consolidation
  if (shouldConsolidate(snapshot.interactionCount || 0)) {
    const memoryUpdate = await consolidateMemory({
      snapshot,
      recentSceneText: newSceneText
    });
    if (memoryUpdate) {
      // Apply memory updates here if needed
    }
  }

  // Save to DB
  await dbSaveChapter(snapshot.world.id, newSceneText);
  await dbUpdateStoryState(snapshot.world.id, updatedStoryState);

  return {
    ...snapshot,
    storyState: updatedStoryState
  };
}