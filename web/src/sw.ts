/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Web Share Target: store the shared file, then open the Add screen to pick it up.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || !url.pathname.endsWith('/share')) return;
  e.respondWith((async () => {
    const file = (await e.request.formData()).get('file');
    if (file instanceof File) {
      const cache = await caches.open('shared');
      await cache.put('shared-file', new Response(file, { headers: { 'content-type': file.type } }));
    }
    return Response.redirect(new URL('./#/add?kind=ticket&shared=1', self.registration.scope).href, 303);
  })());
});

// Cache-first for things fetched from third parties that never change for a given URL, so they
// keep working offline once seen: store logos, and the versioned OCR engine / barcode fallback on jsDelivr.
const RUNTIME = ['https://www.google.com/s2/favicons', 'https://cdn.jsdelivr.net/npm/'];
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !RUNTIME.some((p) => e.request.url.startsWith(p))) return;
  e.respondWith((async () => {
    const cache = await caches.open('runtime');
    const hit = await cache.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok || res.type === 'opaque') await cache.put(e.request, res.clone());
    return res;
  })());
});

precacheAndRoute(self.__WB_MANIFEST);
