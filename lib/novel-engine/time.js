// lib/novel-engine/time.js
// The critical differentiator: every interaction advances world time,
// whether or not the user's action would "naturally" take that long.

// A reader's daily chapter allotment should also be a full in-story day --
// by the last chapter of their rolling window, the story's clock should
// cross into the next day, not just advance a few scattered hours.
export function advanceTime(currentTimeHours, userActed, options = {}) {
  if (!userActed) {
    // Passive tick: simulates an arbitrary real-world absence, unrelated to
    // the reader's own chapter cadence.
    const hoursAdvanced = 1 + Math.floor(Math.random() * 23);
    return { newTime: currentTimeHours + hoursAdvanced, hoursAdvanced };
  }

  const chapterCap = options.chapterCap || 4;
  const perChapterHours = Math.max(1, Math.round(24 / chapterCap));

  let hoursAdvanced;
  if (options.isFinalChapterOfWindow) {
    // The day's chapter allotment is spent -- the in-story day should be
    // over too, not left to chance. Push straight to the next day boundary.
    const hoursIntoDay = currentTimeHours % 24;
    const hoursToNextDay = 24 - hoursIntoDay;
    hoursAdvanced = Math.max(perChapterHours, hoursToNextDay);
  } else {
    const jitter = Math.round(Math.random() * 2) - 1; // -1, 0, or +1
    hoursAdvanced = Math.max(1, perChapterHours + jitter);
  }

  return { newTime: currentTimeHours + hoursAdvanced, hoursAdvanced };
}

export function formatWorldTime(totalHours) {
  const day = Math.floor(totalHours / 24) + 1;
  const hour = totalHours % 24;
  return 'Day ' + day + ', ' + String(hour).padStart(2, '0') + ':00';
}
