// api/push-cron.js
// Fired periodically by Vercel Cron (see vercel.json). For every reader who
// has enabled notifications, checks whether it's currently their local
// morning/lunch/evening window and they haven't already gotten that slot's
// notification today -- if so, generates a short flash beat (Haiku, cheap)
// from whichever world they were most recently in and pushes it.

import webpush from 'web-push';
import {
  getAllPushSubscriptions, getMostRecentlyVisitedWorld, getWorldSnapshot, markFlashSlotSent, deletePushSubscription,
} from '../lib/novel-engine/db.js';
import { generateFlashContent } from '../lib/novel-engine/flash.js';

export const config = { maxDuration: 60 };

const SLOTS = [
  { name: 'morning', startHour: 7, endHour: 9 },
  { name: 'lunch', startHour: 12, endHour: 14 },
  { name: 'evening', startHour: 18, endHour: 20 },
];

function localHourAndDate(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  }).formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? 0 : parseInt(map.hour, 10);
  return { hour, dateStr: map.year + '-' + map.month + '-' + map.day };
}

function dueSlot(sub) {
  let timezone = sub.timezone || 'UTC';
  let hour; let dateStr;
  try {
    ({ hour, dateStr } = localHourAndDate(timezone));
  } catch (err) {
    ({ hour, dateStr } = localHourAndDate('UTC')); // invalid/unknown timezone string -- fall back rather than skip the reader entirely
  }
  const slot = SLOTS.find((s) => hour >= s.startHour && hour < s.endHour);
  if (!slot) return null;
  if (sub['last_' + slot.name + '_sent_date'] === dateStr) return null; // already sent today
  return { slot: slot.name, dateStr };
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  webpush.setVapidDetails(
    'mailto:' + (process.env.VAPID_CONTACT_EMAIL || 'admin@example.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const subscriptions = await getAllPushSubscriptions();
  let sent = 0;

  for (const sub of subscriptions) {
    const due = dueSlot(sub);
    if (!due) continue;

    try {
      const world = await getMostRecentlyVisitedWorld(sub.user_id);
      if (!world) continue;
      const snapshot = await getWorldSnapshot(world.id);
      if (!snapshot) continue;

      const flash = await generateFlashContent(snapshot, due.slot);
      if (!flash) continue;

      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify(flash),
      );
      await markFlashSlotSent(sub.id, due.slot, due.dateStr);
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await deletePushSubscription(sub.id).catch(() => {}); // subscription expired/revoked on the browser side
      } else {
        console.error('[novel-engine/push-cron error]', err);
      }
    }
  }

  return res.status(200).json({ checked: subscriptions.length, sent });
}
