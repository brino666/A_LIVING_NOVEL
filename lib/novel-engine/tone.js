// lib/novel-engine/tone.js
// Translates the reader's +/- intensity offset (relative to the tone set at
// world creation) into a natural-language steering note for the Director and
// Writer. There's no fixed number of "levels" -- it's a signed integer with
// no ceiling on the dial itself; the actual effect plateaus once it's pushing
// against content Claude won't write regardless of how the instruction reads.

export function intensityInstruction(offset) {
  const n = Math.trunc(Number(offset) || 0);
  if (n === 0) return '';

  const direction = n > 0 ? 'more intense' : 'gentler';
  const magnitude = Math.abs(n);
  const strength = magnitude >= 5 ? 'significantly' : magnitude >= 3 ? 'noticeably' : 'slightly';

  const guidance = n > 0
    ? 'Lean into higher stakes, sharper danger, and heavier emotional weight where the story allows.'
    : 'Ease off danger and darkness, favor lower stakes, and let scenes breathe more gently.';

  return `The reader has dialed this world ${strength} ${direction} than its baseline `
    + `tone (offset ${n > 0 ? '+' : ''}${n}). ${guidance} Do not change genre or any `
    + 'existing content boundaries to do this -- only the intensity within them.';
}
