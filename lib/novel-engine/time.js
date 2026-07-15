// lib/novel-engine/time.js
// Governs how the in-story clock moves for a reader's own real-time turns.
// Passive absence (returning after a real-world gap) is handled separately
// in passiveTick.js, tied to actual elapsed real time, not chapter count.

// A reader's daily chapter allotment should also be a full in-story day --
// by the last chapter of their rolling window, the story's clock should
// cross into the next day, not just advance a few scattered hours.
export function advanceTime(currentTimeHours, chapterCap, isFinalChapterOfWindow) {
  const perChapterHours = Math.max(1, Math.round(24 / chapterCap));

  let hoursAdvanced;
  if (isFinalChapterOfWindow) {
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
