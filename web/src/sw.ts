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

// Cache-first for files that never change for a given URL, so they keep working offline once seen.
// Not precached: they are big (OCR) or per-user (logos), so they are only downloaded when used.
const RUNTIME: { prefix: string; cache: string; keep: (res: Response) => boolean }[] = [
  // Store logos: <img> requests are no-cors, so the response is opaque and its status unknown.
  { prefix: 'https://www.google.com/s2/favicons', cache: 'logos', keep: (res) => res.ok || res.type === 'opaque' },
  // Self-hosted OCR engine and language data (see vite.config.ts).
  { prefix: new URL('ocr/', self.registration.scope).href, cache: 'ocr', keep: (res) => res.ok },
  // Barcode fallback (zxing-wasm via barcode-detector), versioned URLs on jsDelivr.
  { prefix: 'https://fastly.jsdelivr.net/npm/', cache: 'runtime', keep: (res) => res.ok },
];
self.addEventListener('fetch', (e) => {
  const rule = e.request.method === 'GET' && RUNTIME.find((r) => e.request.url.startsWith(r.prefix));
  if (!rule) return;
  e.respondWith((async () => {
    const cache = await caches.open(rule.cache);
    const hit = await cache.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (rule.keep(res)) await cache.put(e.request, res.clone());
    return res;
  })());
});

precacheAndRoute(self.__WB_MANIFEST);
