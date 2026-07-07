import { runStoryDirector } from '../lib/novel-engine/director.js';
import { writeScene } from '../lib/novel-engine/writer.js';
import { updateWorldState } from '../lib/novel-engine/state.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { snapshot, userAction, hoursAdvanced } = req.body || {};

  if (!snapshot || !snapshot.world) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing snapshot or world data" 
    });
  }

  try {
    const directorOutput = await runStoryDirector({
      snapshot,
      userAction: userAction || '',
      hoursAdvanced: hoursAdvanced || 8
    });

    const newScene = await writeScene({
      snapshot,
      directorOutput,
      userAction
    });

    const updatedSnapshot = await updateWorldState(snapshot, directorOutput, newScene);

    return res.status(200).json({
      success: true,
      scene: newScene,
      snapshot: updatedSnapshot,
      directorOutput
    });

  } catch (error) {
    console.error("Turn error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
}
