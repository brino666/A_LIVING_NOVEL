// lib/novel-engine/time.js
// The critical differentiator: every interaction advances world time,
// whether or not the user's action would "naturally" take that long.

export function advanceTime(currentTimeHours, userActed) {
  const hoursAdvanced = userActed
    ? 1 + Math.floor(Math.random() * 3) // user action: +1-3 hours
    : 1 + Math.floor(Math.random() * 23); // passive tick: +1-24 hours
  return {
    newTime: currentTimeHours + hoursAdvanced,
    hoursAdvanced,
  };
}

export function formatWorldTime(totalHours) {
  const day = Math.floor(totalHours / 24) + 1;
  const hour = totalHours % 24;
  return 'Day ' + day + ', ' + String(hour).padStart(2, '0') + ':00';
}
