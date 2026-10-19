/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };
const sw = self;

// Web Share Target: store the shared file, then open the Add screen to pick it up.
sw.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || !url.pathname.endsWith('/share')) return;
  e.respondWith((async () => {
    const file = (await e.request.formData()).get('file');
    if (file instanceof File) {
      const cache = await caches.open('shared');
      await cache.put('shared-file', new Response(file, { headers: { 'content-type': file.type } }));
    }
    return Response.redirect(new URL('./#/add?kind=ticket&shared=1', sw.registration.scope).href, 303);
  })());
});

precacheAndRoute(self.__WB_MANIFEST);
