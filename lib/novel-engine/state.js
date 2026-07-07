// lib/novel-engine/state.js
// Simplified version that doesn't rely on missing db exports

import { consolidateMemory, shouldConsolidate } from './memory.js';

export async function updateWorldState(snapshot, directorOutput, newSceneText) {
  const { storyState } = snapshot;

  let updatedStoryState = { ...storyState };

  // Update basic story state
  updatedStoryState.last_scene_summary = newSceneText.substring(0, 800) + (newSceneText.length > 800 ? '...' : '');
  if (!updatedStoryState.last_chapter_text) {
    updatedStoryState.last_chapter_text = newSceneText;
  }

  // TODO: Add full DB save logic later if needed
  // For now, just return the updated snapshot so the app doesn't crash

  return {
    ...snapshot,
    storyState: updatedStoryState
  };
}
