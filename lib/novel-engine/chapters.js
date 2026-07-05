// lib/novel-engine/chapters.js
// Daily chapter cap: a rolling 24h window per world, not a calendar-day
// cutoff, so it doesn't need timezone bookkeeping. This is the mechanic that
// keeps the "living world" pitch honest -- a reader can't outrun the story's
// clock just by spending real money or reading fast.

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function evaluateChapterCap(world, now = Date.now()) {
  const windowStart = new Date(world.chapter_window_start).getTime();
  const windowExpired = now - windowStart >= WINDOW_MS;
  const currentCount = windowExpired ? 0 : world.chapters_in_window;
  const allowed = currentCount < world.chapter_cap;
  const effectiveWindowStart = windowExpired ? now : windowStart;

  return {
    allowed,
    newWindowStart: effectiveWindowStart,
    newCount: allowed ? currentCount + 1 : currentCount,
    chaptersUsed: currentCount,
    chapterCap: world.chapter_cap,
    resetsAt: effectiveWindowStart + WINDOW_MS,
  };
}
