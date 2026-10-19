# Card Wallet PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable PWA that stores loyalty cards and expiring tickets as barcodes/QR codes and shows them full screen at a checkout.

**Architecture:** Vite + React static site in `web/`. Pure logic (`src/logic.ts`, copied unchanged from the React Native app plus a detector format map) is tested with plain Node. Storage is one JSON array in `localStorage`. A service worker (vite-plugin-pwa, injectManifest) precaches the build for offline use and receives shared files (Web Share Target). Hash routing, no router library.

**Tech Stack:** Vite, React, TypeScript, vite-plugin-pwa + workbox-precaching, bwip-js (browser build), barcode-detector (polyfill), tsx (`node:test` runner).

## Global Constraints

From `docs/superpowers/specs/2026-10-19-card-wallet-pwa-design.md` (plus the original spec where unchanged):

- Static site in `web/`; Vite `base: './'` so it works from any HTTPS host and sub-path.
- No reminders/notifications, no lead-time setting, no brightness control.
- Storage: `localStorage` key `wallet.items` holding a JSON array of `Item`. Call `navigator.storage.persist()` once at startup.
- `Item` shape unchanged from the RN app (incl. `notify_id`, always `null`) so backups stay compatible.
- Archived is **derived** (`kind = 'ticket' AND expires_at < now`); no stored flag.
- Supported formats: `qr, ean13, ean8, upc_a, code128, code39, pdf417, aztec, datamatrix`.
- Validate code against format before saving (EAN-13 / EAN-8 / UPC-A check digit). Ticket requires an expiry; expired expiry warns but allows saving.
- Camera denied/unavailable or no code found: alert, fall back to manual entry. Shared PDFs: alert "cannot be decoded", manual entry.
- Malformed backup: alert "Import failed", nothing changes. Import offers Merge / Replace all / Cancel.
- Hash routes: `#/cards`, `#/tickets`, `#/add?kind=card|ticket[&shared=1]`, `#/item/<id>`, `#/settings`.
- Testing: one pure-logic test file, `node:test` via `tsx`. No UI test framework.
- Don't touch the React Native app in `app/`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

All paths relative to `web/`.

| File | Responsibility |
|---|---|
| `vite.config.ts` | Vite + React + PWA plugin, manifest incl. share_target |
| `index.html` | Page shell |
| `public/icon-192.png`, `public/icon-512.png` | Install icons |
| `src/sw.ts` | Service worker: share-target POST handler + precache |
| `src/main.tsx` | Entry: register SW, request persistent storage, render |
| `src/logic.ts` / `src/logic.test.ts` | Pure logic (copied) + detector format map |
| `src/db.ts` | localStorage CRUD |
| `src/backup.ts` | Export download, apply import |
| `src/route.ts` | Hash routing hook + `go()` |
| `src/detect.ts` | BarcodeDetector wrapper |
| `src/Scanner.tsx` | Camera scanning view |
| `src/CodeView.tsx` | SVG barcode render |
| `src/screens/Lists.tsx` | Cards / Tickets tabs |
| `src/screens/Detail.tsx` | Full-screen code + wake lock + delete |
| `src/screens/Settings.tsx` | Export / import |
| `src/screens/Add.tsx` | Add form, scan, image import, share pickup |
| `src/App.tsx` | Route → screen |
| `src/style.css` | Mobile styles |

---

### Task 1: Scaffold the PWA shell

**Files:**
- Create: `web/` (Vite react-ts template), `web/vite.config.ts`, `web/src/sw.ts`, `web/src/main.tsx`, `web/src/App.tsx`, `web/public/icon-192.png`, `web/public/icon-512.png`
- Modify: `web/index.html`, `web/tsconfig.app.json`, `web/package.json`
- Delete: template boilerplate (`src/App.css`, `src/index.css`, `src/assets/`, `public/vite.svg`)

**Interfaces:**
- Produces: `npm run build` producing `dist/` with `manifest.webmanifest` (incl. `share_target`) and `sw.js`; `npm test` script; share POST to `./share` redirects to `#/add?kind=ticket&shared=1` with the file stored in Cache Storage cache `shared` under key `shared-file`.

- [ ] **Step 1: Create the project**

```bash
cd C:/Users/landa/personal/claude_stuff/card_wallet_app
npm create vite@latest web -- --template react-ts
cd web
npm install
npm install bwip-js barcode-detector
npm install -D vite-plugin-pwa workbox-precaching tsx
rm -rf src/App.css src/index.css src/assets public/vite.svg
```
If `web/.git` was created, delete it. Add `"test": "tsx --test src/logic.test.ts"` to `scripts` in `web/package.json`.

- [ ] **Step 2: Generate icons from the existing app icon (PowerShell, from `web/`)**

```powershell
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile("$PWD\..\app\assets\icon.png")
foreach ($s in 192, 512) {
  $b = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($src, 0, 0, $s, $s)
  $b.Save("$PWD\public\icon-$s.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $b.Dispose()
}
$src.Dispose()
```

- [ ] **Step 3: Write `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { globPatterns: ['**/*.{js,css,html,png}'] },
      manifest: {
        name: 'Card Wallet',
        short_name: 'Wallet',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
        share_target: {
          action: './share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'file', accept: ['image/*', 'application/pdf'] }] },
        },
      },
    }),
  ],
});
```
(If the installed `@vitejs/plugin-react` package name differs in the template, e.g. `@vitejs/plugin-react-swc`, keep the template's.)

- [ ] **Step 4: Write `web/src/sw.ts`**

```ts
/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

const sw = self as unknown as ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

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

precacheAndRoute(sw.__WB_MANIFEST);
```

- [ ] **Step 5: Exclude SW and test from the app typecheck**

In `web/tsconfig.app.json` add `"exclude": ["src/sw.ts", "src/**/*.test.ts"]` and add `"vite-plugin-pwa/client"` to `compilerOptions.types` (create the array if missing, keep existing entries such as `"vite/client"`). The SW is still bundled by Vite; it just isn't typechecked with the DOM lib.

- [ ] **Step 6: Placeholder entry**

`web/src/App.tsx`:

```tsx
export default function App() {
  return <p>Card Wallet</p>;
}
```
`web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';

registerSW({ immediate: true });
navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```
In `web/index.html` set `<title>Card Wallet</title>`, add `<meta name="theme-color" content="#ffffff" />`, and remove any `vite.svg` favicon link.

- [ ] **Step 7: Build and verify**

Run (from `web/`): `npm run build`
Expected: succeeds; `dist/sw.js` exists; `dist/manifest.webmanifest` contains `"share_target"` and both icons; `dist/index.html` links the manifest.

- [ ] **Step 8: Commit** (do not commit `dist/` or `node_modules/`; the template `.gitignore` covers them)

```bash
cd ..
git add web
git commit -m "chore: scaffold PWA shell with share target service worker"
```

---

### Task 2: Port pure logic and add detector format mapping (TDD)

**Files:**
- Create: `web/src/logic.ts` (copy of `app/src/logic.ts` + additions), `web/src/logic.test.ts` (copy + new test)

**Interfaces:**
- Produces everything `app/src/logic.ts` exports (`FORMATS`, `Format`, `BCID`, `Item`, `NewItem`, `isArchived`, `validateCode`, `reminderTime`, `serialize`, `parseImport`, `dedupe`), plus:
  - `DETECTOR_FORMAT: Record<Format, string>`
  - `fromDetector(f: string): Format | null`

- [ ] **Step 1: Copy existing logic and tests**

```bash
cp app/src/logic.ts app/src/logic.test.ts web/src/
```

- [ ] **Step 2: Add the failing test** — append to `web/src/logic.test.ts` and add `fromDetector` to its import line from `./logic`:

```ts
test('detector format names map to ours', () => {
  assert.equal(fromDetector('ean_13'), 'ean13');
  assert.equal(fromDetector('qr_code'), 'qr');
  assert.equal(fromDetector('data_matrix'), 'datamatrix');
  assert.equal(fromDetector('itf'), null);
});
```

- [ ] **Step 3: Run to see it fail**

Run (from `web/`): `npm test`
Expected: FAIL (`fromDetector` is not exported / not a function).

- [ ] **Step 4: Implement** — append to `web/src/logic.ts`:

```ts
// BarcodeDetector API format names.
export const DETECTOR_FORMAT: Record<Format, string> = {
  qr: 'qr_code', ean13: 'ean_13', ean8: 'ean_8', upc_a: 'upc_a', code128: 'code_128',
  code39: 'code_39', pdf417: 'pdf417', aztec: 'aztec', datamatrix: 'data_matrix',
};

export const fromDetector = (f: string): Format | null =>
  FORMATS.find((k) => DETECTOR_FORMAT[k] === f) ?? null;
```

- [ ] **Step 5: Run to see it pass**

Run (from `web/`): `npm test`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/logic.ts web/src/logic.test.ts
git commit -m "feat(web): port pure logic, add detector format mapping"
```

---

### Task 3: Storage, backup, routing

**Files:**
- Create: `web/src/db.ts`, `web/src/backup.ts`, `web/src/route.ts`

**Interfaces:**
- Consumes: `Item`, `NewItem`, `serialize`, `dedupe` from `./logic`.
- Produces:
  - `db.ts`: `listItems(): Item[]` (newest first), `getItem(id: number): Item | null`, `insertItem(n: NewItem): number`, `deleteItem(id: number): void`, `deleteAll(): void`
  - `backup.ts`: `exportBackup(): void`, `applyImport(items: NewItem[], mode: 'merge' | 'replace'): void`
  - `route.ts`: `useRoute(): { path: string; params: URLSearchParams }` (path defaults to `/cards`), `go(to: string): void`

- [ ] **Step 1: `web/src/db.ts`**

```ts
import type { Item, NewItem } from './logic';

// ponytail: whole list rewritten on every change; fine for a personal wallet (hundreds of items).
const KEY = 'wallet.items';

export const listItems = (): Item[] => JSON.parse(localStorage.getItem(KEY) ?? '[]');
const save = (items: Item[]) => localStorage.setItem(KEY, JSON.stringify(items));

export const getItem = (id: number) => listItems().find((i) => i.id === id) ?? null;

export function insertItem(n: NewItem): number {
  const items = listItems();
  const id = Math.max(0, ...items.map((i) => i.id)) + 1;
  save([{ ...n, id }, ...items]);
  return id;
}

export const deleteItem = (id: number) => save(listItems().filter((i) => i.id !== id));
export const deleteAll = () => save([]);
```

- [ ] **Step 2: `web/src/backup.ts`**

```ts
import { deleteAll, insertItem, listItems } from './db';
import { NewItem, dedupe, serialize } from './logic';

export function exportBackup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([serialize(listItems())], { type: 'application/json' }));
  a.download = `wallet-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function applyImport(items: NewItem[], mode: 'merge' | 'replace') {
  if (mode === 'replace') deleteAll();
  const toAdd = mode === 'merge' ? dedupe(listItems(), items) : items;
  toAdd.forEach(insertItem);
}
```

- [ ] **Step 3: `web/src/route.ts`**

```ts
import { useEffect, useState } from 'react';

export function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  return { path: path || '/cards', params: new URLSearchParams(query) };
}

export const go = (to: string) => { location.hash = to; };
```

- [ ] **Step 4: Verify**

Run (from `web/`): `npx tsc -b && npm test`
Expected: no type errors, 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): localStorage storage, backup export/import, hash routing"
```

---

### Task 4: Detection, scanner, code view

**Files:**
- Create: `web/src/detect.ts`, `web/src/Scanner.tsx`, `web/src/CodeView.tsx`

**Interfaces:**
- Consumes: `FORMATS`, `Format`, `BCID`, `DETECTOR_FORMAT`, `fromDetector` from `./logic`.
- Produces:
  - `detect(source: ImageBitmapSource | HTMLVideoElement): Promise<{ code: string; format: Format } | null>`
  - `detectBlob(blob: Blob): Promise<{ code: string; format: Format } | null>`
  - `Scanner` default export, props `{ onResult: (r: { code: string; format: Format }) => void; onCancel: () => void }`
  - `CodeView` default export, props `{ code: string; format: Format }`

- [ ] **Step 1: Check the polyfill API**

Read `web/node_modules/barcode-detector/README.md`. Confirm that importing `barcode-detector/polyfill` installs `globalThis.BarcodeDetector` only when the browser lacks it (so Android Chrome uses the native one), and how its global types are declared. If the entry name or behavior differs, adapt Step 2 minimally and note it in the report.

- [ ] **Step 2: `web/src/detect.ts`**

```ts
import 'barcode-detector/polyfill';
import { DETECTOR_FORMAT, FORMATS, Format, fromDetector } from './logic';

type Result = { code: string; format: Format };

let detector: Promise<BarcodeDetector> | undefined;
// Ask only for formats this browser supports; unsupported ones make the constructor throw.
const getDetector = () =>
  (detector ??= BarcodeDetector.getSupportedFormats().then((supported) =>
    new BarcodeDetector({ formats: FORMATS.map((f) => DETECTOR_FORMAT[f]).filter((f) => supported.includes(f as any)) as any }),
  ));

export async function detect(source: ImageBitmapSource | HTMLVideoElement): Promise<Result | null> {
  for (const r of await (await getDetector()).detect(source as any)) {
    const format = fromDetector(r.format);
    if (format) return { code: r.rawValue, format };
  }
  return null;
}

export const detectBlob = async (blob: Blob) => detect(await createImageBitmap(blob));
```

- [ ] **Step 3: `web/src/Scanner.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { detect } from './detect';
import type { Format } from './logic';

type Props = { onResult: (r: { code: string; format: Format }) => void; onCancel: () => void };

export default function Scanner({ onResult, onCancel }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let done = false;
    const tick = async () => {
      if (done) return;
      const r = await detect(video.current!).catch(() => null);
      if (r && !done) { done = true; onResult(r); } else timer = window.setTimeout(tick, 250);
    };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s;
        if (done) { s.getTracks().forEach((t) => t.stop()); return; }
        video.current!.srcObject = s;
        await video.current!.play();
        tick();
      })
      .catch(() => { if (!done) { alert('Camera unavailable. Enter the code manually.'); onCancel(); } });
    return () => { done = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="scanner">
      <video ref={video} playsInline muted />
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}
```

- [ ] **Step 4: `web/src/CodeView.tsx`**

```tsx
import bwipjs from 'bwip-js/browser';
import { BCID, Format } from './logic';

export default function CodeView({ code, format }: { code: string; format: Format }) {
  let svg: string;
  try {
    svg = bwipjs.toSVG({ bcid: BCID[format], text: code, scale: 4, paddingwidth: 10, paddingheight: 10, backgroundcolor: 'FFFFFF' });
  } catch (e) {
    return <p>Cannot render this code: {String(e)}</p>;
  }
  // bwip-js output contains only drawing paths (no human-readable text), so injecting it is safe.
  return <div className="code" dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

- [ ] **Step 5: Verify**

Run (from `web/`): `npx tsc -b && npm run build`
Expected: no type errors, build succeeds. (If `bwip-js/browser` has no types or `toSVG`, check `node_modules/bwip-js/package.json` exports and adapt the import; note it in the report.)

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): barcode detection, camera scanner, SVG code view"
```

---

### Task 5: Lists, detail, settings screens and app shell

**Files:**
- Create: `web/src/screens/Lists.tsx`, `web/src/screens/Detail.tsx`, `web/src/screens/Settings.tsx`, `web/src/style.css`
- Modify: `web/src/App.tsx`, `web/src/main.tsx` (import `./style.css`)

**Interfaces:**
- Consumes: `listItems`, `getItem`, `deleteItem` (db); `exportBackup`, `applyImport` (backup); `useRoute`, `go` (route); `CodeView`; `isArchived`, `parseImport`, `Item`, `NewItem` (logic).
- Produces: `App` routing `/cards`, `/tickets`, `/item/<id>`, `/settings`, and `/add` (Add screen comes in Task 6; until then `/add` renders a "Coming soon" placeholder inside `App.tsx`).

- [ ] **Step 1: `web/src/screens/Lists.tsx`**

```tsx
import { useState } from 'react';
import { listItems } from '../db';
import { Item, isArchived } from '../logic';
import { go } from '../route';

function Row({ item, dim }: { item: Item; dim?: boolean }) {
  return (
    <button className={'row' + (dim ? ' dim' : '')} onClick={() => go(`/item/${item.id}`)}>
      <span className="name">{item.name}</span>
      {item.expires_at != null && <span className="sub">{new Date(item.expires_at).toLocaleString()}</span>}
    </button>
  );
}

export default function Lists({ tab }: { tab: 'cards' | 'tickets' }) {
  const [q, setQ] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const items = listItems();
  const now = Date.now();
  const cards = items.filter((i) => i.kind === 'card' && i.name.toLowerCase().includes(q.toLowerCase()));
  const tickets = items.filter((i) => i.kind === 'ticket');
  const active = tickets.filter((i) => !isArchived(i, now)).sort((a, b) => (a.expires_at ?? Infinity) - (b.expires_at ?? Infinity));
  const archive = tickets.filter((i) => isArchived(i, now)).sort((a, b) => (b.expires_at ?? 0) - (a.expires_at ?? 0));
  const kind = tab === 'cards' ? 'card' : 'ticket';
  return (
    <>
      <header className="tabs">
        <button className={tab === 'cards' ? 'on' : ''} onClick={() => go('/cards')}>Cards</button>
        <button className={tab === 'tickets' ? 'on' : ''} onClick={() => go('/tickets')}>Tickets</button>
        <button onClick={() => go('/settings')} aria-label="Settings">⚙</button>
      </header>
      <main>
        {tab === 'cards' ? (
          <>
            <input type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            {cards.map((i) => <Row key={i.id} item={i} />)}
          </>
        ) : (
          <>
            {active.map((i) => <Row key={i.id} item={i} />)}
            <button className="link" onClick={() => setShowArchive(!showArchive)}>
              {showArchive ? 'Hide' : 'Show'} archive ({archive.length})
            </button>
            {showArchive && archive.map((i) => <Row key={i.id} item={i} dim />)}
          </>
        )}
      </main>
      <button className="fab" onClick={() => go(`/add?kind=${kind}`)}>+ Add {kind}</button>
    </>
  );
}
```

- [ ] **Step 2: `web/src/screens/Detail.tsx`**

```tsx
import { useEffect } from 'react';
import CodeView from '../CodeView';
import { deleteItem, getItem } from '../db';
import { isArchived } from '../logic';
import { go } from '../route';

export default function Detail({ id }: { id: number }) {
  const item = getItem(id);
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let gone = false;
    navigator.wakeLock?.request('screen').then((l) => { if (gone) l.release(); else lock = l; }).catch(() => {});
    return () => { gone = true; lock?.release(); };
  }, []);
  if (!item) return <main><p>Not found</p><button onClick={() => go('/cards')}>Back</button></main>;
  const back = () => go(item.kind === 'card' ? '/cards' : '/tickets');
  const remove = () => { if (confirm(`Delete ${item.name}?`)) { deleteItem(item.id); back(); } };
  return (
    <div className="detail">
      <header><button onClick={back}>‹ Back</button><h1>{item.name}</h1></header>
      {isArchived(item) && <p className="expired">Expired</p>}
      <CodeView code={item.code} format={item.format} />
      <p className="codetext">{item.code}</p>
      <button className="danger" onClick={remove}>Delete</button>
    </div>
  );
}
```

- [ ] **Step 3: `web/src/screens/Settings.tsx`**

```tsx
import { useState } from 'react';
import { applyImport, exportBackup } from '../backup';
import { NewItem, parseImport } from '../logic';
import { go } from '../route';

export default function Settings() {
  const [pending, setPending] = useState<NewItem[] | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try { setPending(parseImport(await file.text())); }
    catch (e) { alert(`Import failed: ${String(e)}`); }
  };
  const run = (mode: 'merge' | 'replace') => { applyImport(pending!, mode); setPending(null); alert('Import complete'); };
  return (
    <div>
      <header><button onClick={() => go('/cards')}>‹ Back</button><h1>Settings</h1></header>
      <main className="form">
        <button onClick={exportBackup}>Export backup</button>
        {/* No accept filter: Android often reports .json files with a generic MIME type. */}
        <label className="button">
          Import backup
          <input type="file" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {pending && (
          <div className="confirm">
            <p>{pending.length} items found.</p>
            <button onClick={() => run('merge')}>Merge</button>
            <button className="danger" onClick={() => run('replace')}>Replace all</button>
            <button onClick={() => setPending(null)}>Cancel</button>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: `web/src/App.tsx`**

```tsx
import Detail from './screens/Detail';
import Lists from './screens/Lists';
import Settings from './screens/Settings';
import { useRoute } from './route';

export default function App() {
  const { path } = useRoute();
  const id = path.match(/^\/item\/(\d+)$/)?.[1];
  if (id) return <Detail id={Number(id)} />;
  if (path === '/add') return <main><p>Coming soon</p></main>;
  if (path === '/settings') return <Settings />;
  return <Lists tab={path === '/tickets' ? 'tickets' : 'cards'} />;
}
```
In `web/src/main.tsx` add `import './style.css';` after the `App` import.

- [ ] **Step 5: `web/src/style.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.4 system-ui, sans-serif; background: #fff; color: #111; }
button, .button { font: inherit; padding: 12px; border: 1px solid #ccc; border-radius: 8px; background: #f4f4f4; color: inherit; cursor: pointer; text-align: center; }
input { font: inherit; padding: 12px; border: 1px solid #ccc; border-radius: 8px; width: 100%; }
header { display: flex; gap: 8px; align-items: center; padding: 8px; border-bottom: 1px solid #ddd; }
header h1 { font-size: 20px; margin: 0; }
main { padding: 8px 8px 80px; display: flex; flex-direction: column; gap: 8px; }
.form { gap: 12px; }
.tabs button { flex: 1; }
.tabs button:last-child { flex: 0; }
.tabs .on, .chips .on { background: #cde4ff; border-color: #69f; }
.row { display: flex; flex-direction: column; align-items: flex-start; text-align: left; width: 100%; }
.row .sub { font-size: 13px; color: #555; }
.dim { opacity: 0.4; }
.link { background: none; border: none; color: #36c; }
.fab { position: fixed; bottom: 16px; left: 16px; right: 16px; background: #36c; color: #fff; border: none; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips button { padding: 6px 10px; }
.primary { background: #36c; color: #fff; border: none; }
.danger { background: #fff; color: #c00; border-color: #c00; }
.detail { min-height: 100vh; display: flex; flex-direction: column; }
.code { padding: 16px; }
.code svg { width: 100%; height: auto; max-height: 60vh; display: block; }
.codetext { text-align: center; font-family: monospace; word-break: break-all; }
.expired { color: #c00; text-align: center; margin: 0; }
.confirm { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
.scanner { position: fixed; inset: 0; background: #000; display: flex; flex-direction: column; }
.scanner video { flex: 1; width: 100%; object-fit: cover; }
```

- [ ] **Step 6: Verify**

Run (from `web/`): `npx tsc -b && npm run build && npm test`
Expected: no type errors, build succeeds, 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat(web): cards/tickets lists, detail with wake lock, settings backup"
```

---

### Task 6: Add screen and share-target pickup

**Files:**
- Create: `web/src/screens/Add.tsx`
- Modify: `web/src/App.tsx` (replace the `/add` placeholder)

**Interfaces:**
- Consumes: `Scanner`, `detectBlob`, `insertItem`, `FORMATS`, `Format`, `validateCode`, `go`; Cache Storage cache `shared` key `shared-file` written by `src/sw.ts` (Task 1).
- Produces: `Add` default export, props `{ kind: 'card' | 'ticket'; shared: boolean }`.

- [ ] **Step 1: `web/src/screens/Add.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import Scanner from '../Scanner';
import { detectBlob } from '../detect';
import { insertItem } from '../db';
import { FORMATS, Format, validateCode } from '../logic';
import { go } from '../route';

export default function Add({ kind, shared }: { kind: 'card' | 'ticket'; shared: boolean }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [format, setFormat] = useState<Format>('qr');
  const [expires, setExpires] = useState(''); // datetime-local value, local time
  const [scanning, setScanning] = useState(false);
  const saving = useRef(false);
  const back = () => go(kind === 'card' ? '/cards' : '/tickets');

  const fill = (r: { code: string; format: Format } | null) => {
    if (!r) return alert('No code found. Enter the code manually.');
    setCode(r.code);
    setFormat(r.format);
  };
  const importBlob = async (blob: Blob) => fill(await detectBlob(blob).catch(() => null));

  useEffect(() => {
    if (!shared) return;
    (async () => {
      const cache = await caches.open('shared');
      const res = await cache.match('shared-file');
      if (!res) return;
      await cache.delete('shared-file');
      const blob = await res.blob();
      if (blob.type.startsWith('image/')) await importBlob(blob);
      else alert('PDF codes cannot be decoded. Enter the code manually.');
    })();
  }, [shared]);

  const save = () => {
    if (saving.current) return;
    if (!name.trim()) return alert('Name is required');
    const err = validateCode(format, code.trim());
    if (err) return alert(`Invalid code: ${err}`);
    if (kind === 'ticket' && !expires) return alert('Pick an expiry date');
    const expiresAt = kind === 'ticket' ? new Date(expires).getTime() : null;
    if (expiresAt != null && expiresAt < Date.now() && !confirm('Already expired. Save anyway?')) return;
    saving.current = true;
    insertItem({
      kind, name: name.trim(), code: code.trim(), format, color: null, note: null,
      expires_at: expiresAt, notify_id: null, created_at: Date.now(),
    });
    back();
  };

  if (scanning) {
    return <Scanner onResult={(r) => { fill(r); setScanning(false); }} onCancel={() => setScanning(false)} />;
  }

  return (
    <div>
      <header><button onClick={back}>‹ Back</button><h1>Add {kind}</h1></header>
      <main className="form">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Code / number" value={code} onChange={(e) => setCode(e.target.value)} />
        <div className="chips">
          {FORMATS.map((f) => (
            <button key={f} className={f === format ? 'on' : ''} onClick={() => setFormat(f)}>{f}</button>
          ))}
        </div>
        {kind === 'ticket' && (
          <label>Expires <input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
        )}
        <button onClick={() => setScanning(true)}>Scan with camera</button>
        <label className="button">
          Import from image
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importBlob(f); e.target.value = ''; }} />
        </label>
        <button className="primary" onClick={save}>Save</button>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route in `web/src/App.tsx`**

Add `import Add from './screens/Add';`, read `params` from `useRoute()`, and replace the `/add` placeholder line with:

```tsx
if (path === '/add') return <Add kind={params.get('kind') === 'ticket' ? 'ticket' : 'card'} shared={params.get('shared') === '1'} />;
```

- [ ] **Step 3: Verify**

Run (from `web/`): `npx tsc -b && npm run build && npm test`
Expected: no type errors, build succeeds, 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add web/src
git commit -m "feat(web): add screen with scan, image import, manual entry, share pickup"
```

---

### Task 7: Browser verification (controller)

Run `npm run build && npx vite preview` (from `web/`) and check in a desktop browser at the preview URL:
1. Add a card manually with `ean13` `4006381333931`: appears in Cards, detail shows a barcode.
2. `ean13` `4006381333932` is rejected ("Check digit is wrong").
3. Import an image containing a QR code: code + format filled in (desktop uses the polyfill).
4. Add a ticket with a past expiry: warning, then it appears greyed out in the archive.
5. Export backup, delete an item, import with Replace: items return; importing a non-JSON file shows "Import failed".
6. Manifest and service worker are registered (DevTools Application panel, or `navigator.serviceWorker.controller` after reload).

---

## Self-Review

- **Spec coverage:** stack/base path (T1); share target + offline SW (T1, T6); logic + format map + tests (T2); localStorage + persist (T1, T3); export/import merge/replace (T3, T5); routing (T3, T5); scan/decode with polyfill (T4); SVG render (T4); lists/search/archive (T5); wake lock detail + delete (T5); add flows, validation, expired warning, ticket expiry required, PDF message, camera fallback (T4, T6); browser check (T7). Reminders and brightness intentionally absent.
- **Placeholders:** the `/add` "Coming soon" line in T5 is a deliberate intermediate state replaced in T6. API-risk notes (polyfill entry, bwip-js/browser import, plugin-react package name) have stated fallbacks.
- **Type consistency:** `detect`/`detectBlob` result `{ code, format }`, `insertItem(NewItem)`, `go(path)`, `useRoute().params`, `Add` props `{ kind, shared }` match across tasks.
