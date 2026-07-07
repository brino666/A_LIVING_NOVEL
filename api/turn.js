import { runStoryDirector } from '../lib/novel-engine/director.js';
import { writeScene } from '../lib/novel-engine/writer.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { snapshot, userAction } = req.body || {};

  if (!snapshot) {
    return res.status(400).json({ error: "Missing snapshot" });
  }

  try {
    const directorOutput = await runStoryDirector({ snapshot, userAction, hoursAdvanced: 8 });
    const newScene = await writeScene({ snapshot, directorOutput, userAction });

    return res.status(200).json({
      success: true,
      scene: newScene,
      snapshot // for now, don't update state fully
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
