// Minimal service worker -- exists only to satisfy browser installability
// criteria for the PWA manifest (desktop Chrome/Edge require a registered
// worker with a fetch handler before showing an install affordance). No
// offline caching: a living novel needs a live connection anyway.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
