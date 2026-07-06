// Minimal service worker -- satisfies browser installability criteria for
// the PWA manifest (desktop Chrome/Edge require a registered worker with a
// fetch handler before showing an install affordance), and handles Web Push
// display. No offline caching: a living novel needs a live connection anyway.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let data = { title: 'A Living Novel', body: '' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (err) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
