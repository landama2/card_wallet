# Design Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the top 10 items from `docs/design-review.md` so the wallet shows codes the till can read, gets the right card up fast, keeps your data safe, and doesn't throw away typed input on Back.

**Architecture:** Small, independent changes to the existing Vite + React PWA in `web/`. Pure logic goes in `web/src/logic.ts` with `node:test` tests in `web/src/logic.test.ts`. Overlays (scanner, till mode) become `?flag=1` hash parameters so the phone's Back button closes them. Dialogs get their own history entry for the same reason.

**Tech Stack:** React 19, TypeScript, Vite 8, vite-plugin-pwa, bwip-js, `tsx --test` for unit tests, localStorage for data.

## Global Constraints

- Single user on their own phone. No onboarding, multi-user or growth features.
- No new dependencies.
- Run all commands from `web/`: `npm test` (unit), `npm run build` (type check + build), `npm run lint`.
- In-browser checks use the preview server `web-dev` from `.claude/launch.json` (port 5173) and the built-in browser tools at 375×812 (`resize_window` preset `mobile`). Reset to `desktop` afterwards.
- The barcode card (`.code-card`) and till overlay stay pure white with black bars in every theme.
- Keep old data and old backups working: new `Item` fields are optional, and `parseImport` defaults them.
- Match the surrounding code style: terse, a short comment where it explains intent, `ponytail:` comments for deliberate shortcuts.
- One commit per task. End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Seed data for browser checks** (run with `javascript_tool` on the preview tab):

```js
localStorage.setItem('wallet.items', JSON.stringify([
  { id: 1, kind: 'card', name: 'Albert', code: '4006381333931', format: 'ean13', color: null, note: null, expires_at: null, valid_from: null, domain: null, notify_id: null, created_at: 1 },
  { id: 2, kind: 'card', name: 'Broken', code: '2900000000017', format: 'ean13', color: null, note: null, expires_at: null, valid_from: null, domain: null, notify_id: null, created_at: 1 },
  { id: 3, kind: 'ticket', name: 'Prague Metro 24h', code: 'T-123', format: 'qr', color: null, note: 'Zones P, 0, B', expires_at: Date.now() + 3 * 3600e3, valid_from: null, domain: null, notify_id: null, created_at: 1 },
]));
location.reload();
```

Clear it with `localStorage.clear(); location.reload();` when the task is done.

---

### Task 1: Guess the barcode format from a typed code

**Files:**
- Modify: `web/src/logic.ts` (add `guessFormat` after `validateCode`)
- Modify: `web/src/screens/Add.tsx`
- Test: `web/src/logic.test.ts`

**Interfaces:**
- Produces: `guessFormat(code: string): Format` in `logic.ts`.

- [ ] **Step 1: Write the failing test**

Add `guessFormat` to the import list at the top of `web/src/logic.test.ts`, then append:

```ts
test('guessFormat picks a barcode type from a typed code', () => {
  assert.equal(guessFormat('4006381333931'), 'ean13');
  assert.equal(guessFormat('036000291452'), 'upc_a');
  assert.equal(guessFormat('96385074'), 'ean8');
  assert.equal(guessFormat('4006381333932'), 'code128'); // bad check digit: still a 1D code, not QR
  assert.equal(guessFormat('ABC-123'), 'code128');
  assert.equal(guessFormat('Žabka 1'), 'qr'); // Code 128 can't hold non-ASCII
  assert.equal(guessFormat(''), 'qr');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, with `guessFormat` not exported (SyntaxError or `guessFormat is not a function`).

- [ ] **Step 3: Implement `guessFormat`**

In `web/src/logic.ts`, directly after `validateCode`:

```ts
// Best guess for a hand-typed code: retail barcodes by digit count and check digit, other text as Code 128.
// Many till scanners read 1D codes only, so QR is the last resort.
export function guessFormat(code: string): Format {
  const c = code.trim();
  if (/^\d+$/.test(c) && checkDigitOk(c)) {
    if (c.length === 13) return 'ean13';
    if (c.length === 12) return 'upc_a';
    if (c.length === 8) return 'ean8';
  }
  return /^[\x20-\x7e]+$/.test(c) ? 'code128' : 'qr';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Use it in the Add form**

In `web/src/screens/Add.tsx`:

1. Add `guessFormat` to the `../logic` import.
2. Under `const saving = useRef(false);` add:

```ts
  const formatTouched = useRef(editing != null); // once the user picks a type (or a scan sets one), stop guessing
```

3. In `fill`, after `setFormat(r.format);` add `formatTouched.current = true;`.
4. Replace the Code `<input>` `onChange`:

```tsx
onChange={(e) => { typed('code', setCode)(e.target.value); if (!formatTouched.current) setFormat(guessFormat(e.target.value)); }}
```

5. Replace the pill button `onClick`:

```tsx
onClick={() => { formatTouched.current = true; setFormat(f); }}
```

- [ ] **Step 6: Verify in the browser**

Start preview `web-dev`, go to `#/add`, type `4006381333931` in Code. Expected: the `EAN-13` pill has `aria-pressed="true"`. Enter name `Test` and save, then open the card. Expected: a 1D barcode (wide bars), not a QR square. Then go to `#/add`, tap `QR`, type `4006381333931`. Expected: QR stays selected.

- [ ] **Step 7: Commit**

```bash
git add src/logic.ts src/logic.test.ts src/screens/Add.tsx
git commit -m "fix(web): guess the barcode type from a typed code instead of defaulting to QR"
```

---

### Task 2: Check imported codes and show a friendly error when a code can't be drawn

**Files:**
- Modify: `web/src/logic.ts` (`parseImport`)
- Modify: `web/src/CodeView.tsx`
- Modify: `web/src/screens/Detail.tsx` (pass `editHref`)
- Modify: `web/src/style.css`
- Test: `web/src/logic.test.ts`

**Interfaces:**
- Produces: `CodeView` props become `{ code: string; format: Format; editHref?: string }`.

- [ ] **Step 1: Write the failing test**

Append to `web/src/logic.test.ts`:

```ts
test('import keeps an item whose code does not fit its format, as Code 128', () => {
  const [bad] = parseImport('{"version":1,"items":[{"kind":"card","name":"A","code":"2900000000017","format":"ean13"}]}');
  assert.equal(bad.format, 'code128');
  const [good] = parseImport('{"version":1,"items":[{"kind":"card","name":"A","code":"4006381333931","format":"ean13"}]}');
  assert.equal(good.format, 'ean13');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, `'ean13' !== 'code128'`.

- [ ] **Step 3: Implement the check in `parseImport`**

In `web/src/logic.ts` `parseImport`, change the returned object's first line from

```ts
      kind: x.kind, name: x.name, code: x.code, format: x.format,
```

to

```ts
      // A code that breaks its format's rules (e.g. a bad EAN check digit) can't be drawn; Code 128 can draw any of them.
      kind: x.kind, name: x.name, code: x.code, format: validateCode(x.format, x.code) ? 'code128' : x.format,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Replace the raw error in CodeView**

Replace `web/src/CodeView.tsx` with:

```tsx
import bwipjs from 'bwip-js/browser';
import { FORMAT_LABEL, renderOptions, type Format } from './logic';

// `editHref`: where to fix the code type when it can't be drawn (the number itself is shown by the caller).
export default function CodeView({ code, format, editHref }: { code: string; format: Format; editHref?: string }) {
  let svg: string;
  try {
    svg = bwipjs.toSVG(renderOptions(code, format));
  } catch {
    return (
      <p className="code-error">
        {/* stopPropagation: the code card around this opens till mode on click (Task 3). */}
        This code can't be drawn as {FORMAT_LABEL[format]}.{editHref && <> <a href={editHref} onClick={(e) => e.stopPropagation()}>Change the code type</a></>}
      </p>
    );
  }
  // bwip-js output contains only drawing paths (no human-readable text), so injecting it is safe.
  return <div className="code" dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

In `web/src/screens/Detail.tsx`, change `<CodeView code={item.code} format={item.format} />` to:

```tsx
<CodeView code={item.code} format={item.format} editHref={`#/edit/${item.id}`} />
```

Append to `web/src/style.css` after the `.format-label` rule:

```css
.code-error { margin: 0; text-align: center; color: #5b616e; font-size: 14px; }
.code-error a { color: #1f4fd1; font-weight: 600; }
```

(Literal colours on purpose: the code card is white in every theme.)

- [ ] **Step 6: Verify in the browser**

Load the seed data, open `#/item/2` (Broken, bad EAN check digit stored directly). Expected: "This code can't be drawn as EAN-13. Change the code type", the number `2900000000017` below it, and no text containing `bwipp`. Tap the link. Expected: the Edit screen opens. Then in Settings, import a file containing `{"version":1,"items":[{"kind":"card","name":"Imp","code":"2900000000017","format":"ean13"}]}` and open it. Expected: bars and the label "Code 128".

- [ ] **Step 7: Commit**

```bash
git add src/logic.ts src/logic.test.ts src/CodeView.tsx src/screens/Detail.tsx src/style.css
git commit -m "fix(web): import codes that break their format as Code 128; friendly message when a code can't be drawn"
```

---

### Task 3: Till mode (fullscreen code) and a brightness tip that only shows 3 times

**Files:**
- Modify: `web/src/route.ts` (add `openOverlay`, `closeOverlay`)
- Modify: `web/src/main.tsx` (strip leftover overlay flags on load)
- Modify: `web/src/App.tsx` (pass `till`)
- Modify: `web/src/logic.ts` (add `LINEAR`)
- Modify: `web/src/screens/Detail.tsx`
- Modify: `web/src/style.css`

**Interfaces:**
- Produces: `openOverlay(flag: string): void` and `closeOverlay(): void` in `route.ts`. Task 7 uses them for `scan`.
- Produces: `LINEAR: Set<Format>` in `logic.ts`.
- Produces: `Detail` props `{ id: number; till: boolean }`.

- [ ] **Step 1: Add the overlay helpers to `route.ts`**

Append to `web/src/route.ts`:

```ts
// Overlays (scanner, till mode) are `?flag=1` on the current hash, so the phone's Back button closes them.
export const openOverlay = (flag: string) => {
  const h = location.hash.slice(1) || '/cards';
  go(`${h}${h.includes('?') ? '&' : '?'}${flag}=1`);
};
export const closeOverlay = () => history.back();
```

- [ ] **Step 2: Strip overlay flags left over after a reload**

In `web/src/main.tsx`, after `navigator.storage?.persist?.();` add:

```ts
// After a reload an overlay flag has no history entry under it, so closeOverlay()'s Back would leave the app.
const stripped = location.hash.replace(/[?&](scan|till)=1/g, '');
if (stripped !== location.hash) history.replaceState(null, '', stripped || '#/cards');
```

- [ ] **Step 3: Pass the flag to Detail**

In `web/src/App.tsx`, change `if (id) return <Detail id={Number(id)} />;` to:

```tsx
  if (id) return <Detail id={Number(id)} till={params.get('till') === '1'} />;
```

- [ ] **Step 4: Add `LINEAR`**

In `web/src/logic.ts`, after `FORMAT_LABEL`:

```ts
// 1D barcodes: in till mode they turn sideways so the bars use the long side of the screen.
export const LINEAR = new Set<Format>(['ean13', 'ean8', 'upc_a', 'code128', 'code39']);
```

- [ ] **Step 5: Build till mode in Detail**

In `web/src/screens/Detail.tsx`:

1. Change the signature to `export default function Detail({ id, till }: { id: number; till: boolean }) {`.
2. Add `LINEAR` to the `../logic` import, and `closeOverlay, openOverlay` to the `../route` import.
3. After the theme-colour `useEffect`, add:

```ts
  // Esc closes till mode on desktop; on the phone it's Back or a tap.
  useEffect(() => {
    if (!till) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlay(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [till]);

  // ponytail: StrictMode runs this initializer twice in dev, so the tip disappears after 2 dev views; fine in prod.
  const [showTip] = useState(() => {
    const n = Number(localStorage.getItem('wallet.tipViews') ?? 0) + 1;
    localStorage.setItem('wallet.tipViews', String(n));
    return n <= 3;
  });
```

These hooks must sit above the `if (!item) return …` early return.

4. Replace the `.code-card` block and the tip with:

```tsx
        <div className="code-card" role="button" tabIndex={0} aria-label="Show code full screen"
          onClick={() => openOverlay('till')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openOverlay('till'); }}>
          <CodeView code={item.code} format={item.format} editHref={`#/edit/${item.id}`} />
          <p className="codetext">{item.code}</p>
          <span className="format-label">{FORMAT_LABEL[item.format]} · tap for full screen</span>
        </div>
        {showTip && <p className="tip"><Icon name="sun" /> Turn the screen brightness up if the till can't read it. The screen stays on while this is open.</p>}
```

5. Just before the closing `</div>` of `.detail`, add the overlay:

```tsx
      {till && (
        <div className={'till' + (LINEAR.has(item.format) ? ' linear' : '')} role="dialog" aria-modal="true" aria-label={`${item.name} code`} onClick={closeOverlay}>
          <div className="till-code">
            <CodeView code={item.code} format={item.format} />
            <p className="codetext">{item.code}</p>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Style it**

In `web/src/style.css`, change the `.tip` rule's start to `.tip { display: flex; ...` (unchanged) and add `.tip svg { flex: none; }` after it. Then append after the `.action.danger` rule:

```css
.code-card { cursor: pointer; color: #14161a; }
.code-card .format-label { color: #5b616e; }

/* Till mode: the code alone, as large as the screen allows; white in every theme. */
.till { position: fixed; inset: 0; z-index: 50; background: #fff; color: #14161a; display: flex; align-items: center; justify-content: center; padding: 24px; }
.till-code { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.till .code svg { width: 100%; height: auto; max-height: 70dvh; display: block; }
.till .codetext { font-size: 24px; }
/* 1D codes turn sideways: laid out as wide as the screen is tall, then rotated. */
.till.linear .till-code { width: 88dvh; flex: none; transform: rotate(90deg); }
.till.linear .code svg { max-height: calc(100vw - 110px); }
```

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 8: Verify in the browser**

At 375×812 with the seed data, open `#/item/1` and click the code card. Expected: URL ends `?till=1` and a white overlay shows. Run `document.querySelector('.till svg').getBoundingClientRect().height / innerHeight`. Expected: ≥ 0.8 (the rotated bars span the height). Then `navigate` back. Expected: overlay gone, still on `#/item/1`. Open it again and click the overlay. Expected: closes. Reload `#/item/1?till=1`. Expected: the URL becomes `#/item/1` with no overlay. Open `#/item/1` 3 more times. Expected: the brightness tip is gone on the 4th view (3rd in dev, see the ponytail comment).

- [ ] **Step 9: Commit**

```bash
git add src/route.ts src/main.tsx src/App.tsx src/logic.ts src/screens/Detail.tsx src/style.css
git commit -m "feat(web): till mode shows the code full screen, 1D codes sideways; brightness tip shows only the first 3 times"
```

---

### Task 4: Order cards by last use

**Files:**
- Modify: `web/src/logic.ts` (`Item`, `parseImport`, add `byRecent`)
- Modify: `web/src/screens/Detail.tsx` (record use)
- Modify: `web/src/screens/Lists.tsx` (sort)
- Test: `web/src/logic.test.ts`

**Interfaces:**
- Produces: `Item.last_used_at?: number | null` and `byRecent(a: Item, b: Item): number` in `logic.ts`. Task 10 sorts search results with `byRecent`.

- [ ] **Step 1: Write the failing test**

Add `byRecent` to the import list in `web/src/logic.test.ts` and append:

```ts
test('cards sort by last use, then A–Z; last use survives a backup', () => {
  const c = (name: string, last_used_at?: number): Item => ({ ...base, kind: 'card', name, last_used_at });
  assert.deepEqual([c('B'), c('A'), c('Old', 5), c('New', 9)].sort(byRecent).map((i) => i.name), ['New', 'Old', 'A', 'B']);
  assert.equal(parseImport(serialize([{ ...base, last_used_at: 7 }]))[0].last_used_at, 7);
  assert.equal(parseImport('{"version":1,"items":[{"kind":"card","name":"A","code":"1","format":"qr"}]}')[0].last_used_at, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (`byRecent` is not exported, and TypeScript complains about `last_used_at` if type-checked).

- [ ] **Step 3: Implement**

In `web/src/logic.ts`:

1. In `Item`, after the `domain` line, add:

```ts
  last_used_at?: number | null; // when its detail screen was last opened; missing in items saved before this
```

2. In `parseImport`'s returned object, after the `domain:` line add:

```ts
      last_used_at: typeof x.last_used_at === 'number' ? x.last_used_at : null,
```

3. After `isUpcoming`, add:

```ts
// Cards: most recently opened first; never-opened cards after them, A–Z.
export const byRecent = (a: Item, b: Item) =>
  (b.last_used_at ?? 0) - (a.last_used_at ?? 0) || a.name.localeCompare(b.name);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Record use and sort**

In `web/src/screens/Detail.tsx`, after the wake-lock `useEffect`, add:

```ts
  useEffect(() => { updateItem(id, { last_used_at: Date.now() }); }, [id]); // puts this card first on the list
```

In `web/src/screens/Lists.tsx`, add `byRecent` to the `../logic` import and change the `cards` line to:

```ts
  const cards = items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())).sort(byRecent);
```

- [ ] **Step 6: Verify in the browser**

Seed data, open `#/cards`: tiles read Albert, Broken (A–Z). Open `#/item/2`, then go back to `#/cards`. Expected: Broken is first.

- [ ] **Step 7: Commit**

```bash
git add src/logic.ts src/logic.test.ts src/screens/Detail.tsx src/screens/Lists.tsx
git commit -m "feat(web): cards list puts the most recently opened card first"
```

---

### Task 5: Backup reminder, last-backup status, export through the share sheet

**Files:**
- Modify: `web/src/logic.ts` (add `backupDue`, `daysAgo`)
- Modify: `web/src/backup.ts`
- Modify: `web/src/screens/Settings.tsx`
- Modify: `web/src/screens/Lists.tsx`
- Modify: `web/src/style.css`
- Test: `web/src/logic.test.ts`

**Interfaces:**
- Produces in `logic.ts`: `backupDue(itemCount: number, lastExport: number | null, snoozedUntil: number, now?: number): boolean`, `daysAgo(t: number, now?: number, locale?: string): string`.
- Produces in `backup.ts`: `exportBackup(): Promise<boolean>` (true once handed over), `lastExport(): number | null`, `snoozedUntil(): number`, `snoozeBackup(): void`.

- [ ] **Step 1: Write the failing test**

Add `backupDue, daysAgo` to the import list in `web/src/logic.test.ts` and append:

```ts
test('backup reminder: due with items and no export in 30 days, unless snoozed', () => {
  const D = 86_400_000, now = 100 * D;
  assert.equal(backupDue(0, null, 0, now), false);
  assert.equal(backupDue(3, null, 0, now), true);
  assert.equal(backupDue(3, now - 10 * D, 0, now), false);
  assert.equal(backupDue(3, now - 31 * D, 0, now), true);
  assert.equal(backupDue(3, null, now + D, now), false);
  assert.equal(daysAgo(now, now, 'en'), 'today');
  assert.equal(daysAgo(now - 3 * D, now, 'en'), '3 days ago');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, `backupDue` not exported.

- [ ] **Step 3: Implement the logic**

Append to `web/src/logic.ts`:

```ts
const DAY = 86_400_000;
// The list asks for a backup when there's something to lose and the last export is over 30 days old (or never).
export const backupDue = (itemCount: number, lastExport: number | null, snoozedUntil: number, now = Date.now()) =>
  itemCount > 0 && now >= snoozedUntil && (lastExport == null || now - lastExport > 30 * DAY);

// 'today', 'yesterday', '3 days ago'.
export const daysAgo = (t: number, now = Date.now(), locale?: string) =>
  new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-Math.floor((now - t) / DAY), 'day');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Export through the share sheet and remember when**

Replace `exportBackup` in `web/src/backup.ts` with:

```ts
const LAST = 'wallet.lastExport';
const SNOOZE = 'wallet.backupSnooze';
export const lastExport = (): number | null => Number(localStorage.getItem(LAST)) || null;
export const snoozedUntil = () => Number(localStorage.getItem(SNOOZE)) || 0;
export const snoozeBackup = () => localStorage.setItem(SNOOZE, String(Date.now() + 7 * 86_400_000));

// The share sheet where the phone offers one for this file (save to Drive/Files/mail), else a plain download.
// Resolves to false when the user closes the share sheet without picking anything.
export async function exportBackup(): Promise<boolean> {
  const file = new File([serialize(listItems())], `wallet-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
  const saved = () => { localStorage.setItem(LAST, String(Date.now())); return true; };
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return saved(); }
    catch (e) { if ((e as Error).name === 'AbortError') return false; } // other errors: fall back to a download
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return saved();
}
```

Note: Chrome on Android may refuse to share `.json` files (`canShare` returns false). The download fallback then runs, which still counts as a backup.

- [ ] **Step 6: Show the status in Settings**

In `web/src/screens/Settings.tsx`:

1. Change imports: `import { useEffect, useRef, useState } from 'react';`, `import { applyImport, exportBackup, lastExport } from '../backup';`, and add `daysAgo` to the `../logic` import.
2. At the top of the component add:

```ts
  const [last, setLast] = useState(lastExport);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted); }, []);
  const doExport = async () => { if (await exportBackup()) setLast(lastExport()); };
```

3. Change the Export button's `onClick={exportBackup}` to `onClick={doExport}`.
4. Directly under the intro `<p>` in the Backup panel add:

```tsx
          <p className="backup-status">
            {last ? `Last backup: ${daysAgo(last)}` : 'No backup yet'}
            {persisted === false && ' · This browser may clear your data when the phone runs low on space'}
          </p>
```

- [ ] **Step 7: Remind on the list**

In `web/src/screens/Lists.tsx`:

1. Add imports: `import { lastExport, snoozeBackup, snoozedUntil } from '../backup';` and `backupDue, daysAgo` to the `../logic` import.
2. After `const [showArchive, ...]` add:

```ts
  const [nag, setNag] = useState(() => backupDue(listItems().length, lastExport(), snoozedUntil()));
  const last = lastExport();
```

3. As the first child of `<main className="content">` add:

```tsx
        {nag && (
          <div className="banner nag" role="status">
            <span>{last ? `Last backup ${daysAgo(last)}.` : 'No backup yet.'} Your cards are stored only on this phone.</span>
            <div className="nag-actions">
              <button className="secondary" onClick={() => go('/settings')}>Back up now</button>
              <button className="link-btn" onClick={() => { snoozeBackup(); setNag(false); }}>Later</button>
            </div>
          </div>
        )}
```

4. Append to `web/src/style.css` (Settings section):

```css
.panel .backup-status { color: var(--soft-ink); font-weight: 600; }
.nag { display: flex; flex-direction: column; gap: 8px; }
.nag-actions { display: flex; gap: 8px; align-items: center; }
.nag .secondary { padding: 0 16px; }
```

- [ ] **Step 8: Verify in the browser**

Seed data and reload `#/cards`. Expected: banner "No backup yet. …". Tap "Later". Expected: banner gone, and still gone after reload. Run `localStorage.removeItem('wallet.backupSnooze')`, go to `#/settings`. Expected: "No backup yet". Tap Export. Expected: the line becomes "Last backup: today", and on `#/cards` the banner is gone.

- [ ] **Step 9: Commit**

```bash
git add src/logic.ts src/logic.test.ts src/backup.ts src/screens/Settings.tsx src/screens/Lists.tsx src/style.css
git commit -m "feat(web): show the last backup date, remind after 30 days, export through the share sheet"
```

---

### Task 6: Undo that lasts: Replace survives leaving Settings, Delete gets Undo

**Files:**
- Modify: `web/src/db.ts` (add `restoreItem`)
- Modify: `web/src/backup.ts` (keep the wallet from before a replace)
- Modify: `web/src/Dialog.tsx` (add `toast`, safe autofocus)
- Modify: `web/src/screens/Settings.tsx`
- Modify: `web/src/screens/Detail.tsx`
- Modify: `web/src/style.css`

**Interfaces:**
- Produces: `restoreItem(item: Item): void` in `db.ts`.
- Produces: `savedBeforeReplace(): NewItem[] | null` and `restoreBeforeReplace(): number` in `backup.ts`.
- Produces: `toast(message: string, action: string, run: () => void): void` in `Dialog.tsx`. Task 7 rewrites `Dialog.tsx` and must keep it.

- [ ] **Step 1: `restoreItem` in `db.ts`**

Append to `web/src/db.ts`:

```ts
// Put a deleted item back with its old id (Undo after Delete).
export const restoreItem = (item: Item) => save([item, ...listItems()]);
```

- [ ] **Step 2: Keep the previous wallet on Replace**

In `web/src/backup.ts`, replace `applyImport` with:

```ts
// The wallet from before the last Replace, until it's restored or replaced again.
const BEFORE = 'wallet.beforeReplace';
export const savedBeforeReplace = (): NewItem[] | null => JSON.parse(localStorage.getItem(BEFORE) ?? 'null');
export function restoreBeforeReplace() {
  const items = savedBeforeReplace() ?? [];
  insertMany(items, true);
  localStorage.removeItem(BEFORE);
  return items.length;
}

export function applyImport(items: NewItem[], mode: 'merge' | 'replace') {
  if (mode === 'replace') {
    const before = listItems().map(({ id, ...rest }) => rest);
    if (before.length) localStorage.setItem(BEFORE, JSON.stringify(before));
  }
  const added = mode === 'merge' ? dedupe(listItems(), items) : items;
  insertMany(added, mode === 'replace');
  return { added: added.length, skipped: items.length - added.length };
}
```

- [ ] **Step 3: Settings uses it, and counts say "items"**

In `web/src/screens/Settings.tsx`:

1. Imports: `import { ask } from '../Dialog';`, `import { applyImport, exportBackup, lastExport, restoreBeforeReplace, savedBeforeReplace } from '../backup';`, `import { listItems } from '../db';` (drop `insertMany`).
2. Change the `result` state type's `undo?: NewItem[]` to `undo?: boolean`.
3. Replace `const cards = (n: number) => …` with:

```ts
  // Counts cover cards, tickets and coupons together.
  const count = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
  const [before, setBefore] = useState(savedBeforeReplace);
```

and rename every `cards(` call in the file to `count(`. Also change `'This backup has no cards.'` to `'This backup is empty.'` and the "Add new cards" button to "Add new items".
4. Replace `run` and `undo` with:

```ts
  const run = (mode: 'merge' | 'replace') => {
    const { added, skipped } = applyImport(pending!.items, mode);
    setPending(null); setConfirmReplace(false);
    setBefore(savedBeforeReplace());
    show(mode === 'replace'
      ? { ok: true, title: `Replaced your wallet with ${count(added)}.`, undo: savedBeforeReplace() != null }
      : added
        ? { ok: true, title: `Added ${count(added)}.`, detail: skipped ? `${skipped} already in your wallet, skipped.` : undefined }
        : { ok: true, title: 'Nothing new.', detail: `All ${skipped} are already in your wallet.` });
  };
  const restore = () => {
    const n = restoreBeforeReplace();
    setBefore(null);
    show({ ok: true, title: `Restored your ${count(n)}.` });
  };
  const restoreLater = async () => {
    if (await ask(`Replace your ${count(listItems().length)} with the ${count(before!.length)} you had before the last replace?`, 'Restore', true)) restore();
  };
```

5. Change the Undo button to `{result.undo && <button className="secondary" onClick={restore}>Undo</button>}`.
6. Under the Export/Import `.two` div add:

```tsx
          {before && !result?.undo && <button className="secondary" onClick={restoreLater}>Restore the wallet from before the last replace</button>}
```

7. Change the replace confirm text to: `This deletes your {count(listItems().length)} and loads {count(pending.items.length)} from the backup. You can restore them afterwards in Settings.`

- [ ] **Step 4: Toast and safe autofocus in `Dialog.tsx`**

In `web/src/Dialog.tsx`:

1. After the `show` declaration add:

```ts
type Toast = { message: string; action: string; run: () => void };
let showToast: ((t: Toast | null) => void) | null = null;
/** A short message with one action (e.g. Undo) above the tab bar; goes away after 6 s. */
export const toast = (message: string, action: string, run: () => void) => showToast?.({ message, action, run });
```

2. In `DialogHost`, after the `text`/`field` lines add:

```ts
  const [t, setT] = useState<Toast | null>(null);
  useEffect(() => { showToast = setT; return () => { showToast = null; }; }, []);
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), 6000); return () => clearTimeout(h); }, [t]);
```

3. Replace `if (!req) return null;` and the returned JSX with:

```tsx
  const toastEl = t && (
    <div className="toast" role="status">
      <span>{t.message}</span>
      <button onClick={() => { setT(null); t.run(); }}>{t.action}</button>
    </div>
  );
  if (!req) return toastEl;
  const close = (v: string | boolean | null) => { req.done(v); setQueue((q) => q.slice(1)); };
  const cancel = () => close(req.input != null ? null : false);
  const ok = () => close(req.input != null ? text : true);
  return (
    <>
      {toastEl}
      <div className="dialog-backdrop" onClick={req.cancel ? cancel : undefined}>
        <form
          className="dialog" role="alertdialog" aria-modal="true" aria-label={req.message}
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => { e.preventDefault(); ok(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
        >
          <p>{req.message}</p>
          {req.input != null && <input ref={field} value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="none" autoCorrect="off" />}
          <div className="actions">
            {/* A destructive dialog focuses Cancel, so Enter can't confirm it by accident. */}
            {req.cancel && <button type="button" className="secondary" autoFocus={req.danger} onClick={cancel}>Cancel</button>}
            <button type="submit" autoFocus={req.input == null && !req.danger} className={`secondary strong${req.danger ? ' danger-text' : ''}`}>{req.ok}</button>
          </div>
        </form>
      </div>
    </>
  );
```

(The old `close`/`cancel`/`ok` lines above the old JSX are replaced by these.)

- [ ] **Step 5: Delete with Undo in Detail**

In `web/src/screens/Detail.tsx`:

1. Change the Dialog import to `import { askText, notify, toast } from '../Dialog';` and the db import to `import { deleteItem, getItem, restoreItem, updateItem } from '../db';`.
2. Replace `remove` with:

```ts
  const remove = () => {
    deleteItem(item.id);
    back();
    toast(`Deleted ${item.name}`, 'Undo', () => { restoreItem(item); go(`/item/${item.id}`); });
  };
```

3. Append to `web/src/style.css`:

```css
.toast { position: fixed; left: 16px; right: 16px; bottom: calc(var(--tabbar) + 16px); z-index: 90; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 6px 6px 16px; border-radius: 14px; background: #14161a; color: #fff; font-size: 14px; box-shadow: 0 8px 24px rgba(20, 22, 26, 0.3); }
.toast button { height: 44px; padding: 0 14px; border: none; border-radius: 10px; background: transparent; color: #9fb6ff; font-weight: 700; }
```

- [ ] **Step 6: Build and test**

Run: `npm run build && npm test`
Expected: no type errors, all tests PASS.

- [ ] **Step 7: Verify in the browser**

Seed data. Open `#/item/1`, tap Delete. Expected: back on `#/cards` without Albert, toast "Deleted Albert · Undo". Tap Undo. Expected: Albert's detail opens with id 1. In Settings, import a backup file and choose Replace everything → Yes, replace. Leave to `#/cards`, come back to `#/settings`. Expected: "Restore the wallet from before the last replace" button. Tap it, confirm. Expected: "Restored your 3 items." and the seed items are back.

- [ ] **Step 8: Commit**

```bash
git add src/db.ts src/backup.ts src/Dialog.tsx src/screens/Settings.tsx src/screens/Detail.tsx src/style.css
git commit -m "feat(web): Undo after Delete; the wallet from before a Replace can be restored later"
```

---

### Task 7: Back closes the scanner and dialogs; torch and "Type the code" in the scanner

**Files:**
- Modify: `web/src/App.tsx` (pass `scanning`)
- Modify: `web/src/screens/Add.tsx`
- Modify: `web/src/Scanner.tsx`
- Modify: `web/src/Dialog.tsx`
- Modify: `web/src/style.css`

**Interfaces:**
- Consumes: `openOverlay`, `closeOverlay` from `route.ts` (Task 3); `toast` in `Dialog.tsx` (Task 6, keep it).
- Produces: `Add` props `{ kind: Kind; shared: boolean; editId?: number; scanning: boolean }`. Task 10 adds `initialName`.
- Produces: `Scanner` props `{ onResult; onCancel: () => void; onManual: () => void }`.

- [ ] **Step 1: Scanner is a URL flag**

In `web/src/App.tsx`, add `scanning={params.get('scan') === '1'}` to both `<Add …>` elements.

In `web/src/screens/Add.tsx`:

1. Signature: `export default function Add({ kind: initialKind, shared, editId, scanning }: { kind: Kind; shared: boolean; editId?: number; scanning: boolean }) {`
2. Delete `const [scanning, setScanning] = useState(false);`.
3. Import `closeOverlay, go, openOverlay` from `../route`.
4. After `const saving = useRef(false);` add:

```ts
  const codeInput = useRef<HTMLInputElement>(null);
  const typeCode = useRef(false); // "Type the code" in the scanner: focus the Code field once the form is back
  useEffect(() => {
    if (!scanning && typeCode.current) { typeCode.current = false; codeInput.current?.focus(); }
  }, [scanning]);
```

5. Replace the `if (scanning) { … }` block with:

```tsx
  if (scanning) {
    return (
      <Scanner
        onResult={(r) => { fill(r, 'scanned'); closeOverlay(); }}
        onCancel={closeOverlay}
        onManual={() => { typeCode.current = true; closeOverlay(); }}
      />
    );
  }
```

6. Scan button: `onClick={() => openOverlay('scan')}`.
7. Code input: add `ref={codeInput}`.

- [ ] **Step 2: Scanner with torch, manual entry and an inline camera error**

Replace `web/src/Scanner.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { detect } from './detect';
import type { Format } from './logic';

type Props = { onResult: (r: { code: string; format: Format }) => void; onCancel: () => void; onManual: () => void };

export default function Scanner({ onResult, onCancel, onManual }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [torch, setTorch] = useState(false);
  const [failed, setFailed] = useState(false);
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
        setTrack(s.getVideoTracks()[0]);
        tick();
      })
      .catch(() => { if (!done) setFailed(true); });
    return () => { done = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  // Torch: Chrome on Android only; the button appears only where the camera reports one.
  const hasTorch = !!(track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch;
  const toggleTorch = () =>
    track!.applyConstraints({ advanced: [{ torch: !torch } as unknown as MediaTrackConstraintSet] }).then(() => setTorch(!torch)).catch(() => {});
  return (
    <div className="scanner">
      <video ref={video} playsInline muted />
      {failed
        ? <p className="hint-text">Camera unavailable. Type the code instead.</p>
        : <><div className="frame" aria-hidden="true" /><p className="hint-text">Point the camera at the barcode or QR code</p></>}
      <div className="scanner-actions">
        {hasTorch && (
          <button className="glass" aria-label="Light" aria-pressed={torch} onClick={toggleTorch}><Icon name="sun" /></button>
        )}
        <button onClick={onManual}>Type the code</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
```

In `web/src/style.css`, replace the `.scanner .cancel` rule with:

```css
.scanner-actions { position: absolute; left: 20px; right: 20px; bottom: calc(28px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 10px; }
.scanner-actions button:not(.glass) { flex: 1; height: 56px; border: none; border-radius: 16px; background: rgba(255, 255, 255, 0.92); color: #14161a; font-size: 16px; font-weight: 600; }
.scanner-actions .glass { width: 56px; height: 56px; border-radius: 16px; flex: none; }
.scanner-actions .glass[aria-pressed='true'] { background: #fff; color: #14161a; }
```

- [ ] **Step 3: Dialogs get a history entry; Back cancels them**

In `web/src/Dialog.tsx`:

1. Replace the top comment and `open` with:

```ts
// In-app replacement for alert/confirm/prompt: call notify/ask/askText from anywhere, mount <DialogHost /> once.
// Each dialog pushes a history entry, so the phone's Back button cancels it instead of leaving the screen.
```

```ts
const open = (r: Omit<Req, 'done'>) => new Promise<string | boolean | null>((done) => {
  history.pushState({ dialog: true }, '');
  show!({ ...r, done });
});
```

2. In `DialogHost`, after the `field` ref add:

```ts
  const top = useRef<Req | undefined>(undefined);
  const answer = useRef<string | boolean | null | undefined>(undefined); // set by a button; undefined = Back was pressed
```

3. After `const req = queue[0];` add `top.current = req;` and this effect (keep it above the early return):

```ts
  // Every close goes through history.back(); the dialog resolves once its entry is gone, so the caller's
  // next navigation (go(...)) can't race with that Back.
  useEffect(() => {
    const onPop = () => {
      const r = top.current;
      if (!r) return;
      const v = answer.current !== undefined ? answer.current : r.input != null ? null : false;
      answer.current = undefined;
      setQueue((q) => q.slice(1));
      r.done(v);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
```

4. Replace the `close` line with:

```ts
  const close = (v: string | boolean | null) => {
    if (answer.current !== undefined) return; // a double tap must not go Back twice
    answer.current = v;
    history.back();
  };
```

Keep `toast`, `showToast` and the toast JSX from Task 6.

- [ ] **Step 4: Build and test**

Run: `npm run build && npm test`
Expected: no type errors, all tests PASS.

- [ ] **Step 5: Verify in the browser**

At `#/add`, type name `Keep me`, tap Scan code. Expected: URL ends `?scan=1`. The camera fails in the browser pane, so the scanner shows "Camera unavailable. Type the code instead." `navigate` back. Expected: on `#/add` with "Keep me" still in the name. Tap Scan code → "Type the code". Expected: form back, Code field focused (`document.activeElement === document.querySelector('input[placeholder^="Scan"]')`). Choose Ticket, set Expires to yesterday, tap Save → dialog "Already expired. Save anyway?". `navigate` back. Expected: dialog gone, still on `#/add`. Save again, tap "Save anyway". Expected: lands on `#/tickets` with the new ticket, and one `navigate` back goes to `#/add`, not to a blank dialog state.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/screens/Add.tsx src/Scanner.tsx src/Dialog.tsx src/style.css
git commit -m "fix(web): Back closes the scanner and dialogs instead of leaving the screen; torch and type-the-code in the scanner"
```

---

### Task 8: Ticket and coupon rows: full names, no seconds, readable expired rows

**Files:**
- Modify: `web/src/logic.ts` (`statusChip`, `validityLabel`)
- Modify: `web/src/screens/Lists.tsx` (`Row`)
- Modify: `web/src/style.css`
- Test: `web/src/logic.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `validityLabel` to the import list in `web/src/logic.test.ts` and append:

```ts
test('ticket chip shows only the time when it ends today; labels have no seconds', () => {
  const at = (y: number, m: number, d: number, h = 12, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();
  const fmt = (t: number) => toDateInput(t);
  const now = at(2026, 10, 19, 10);
  assert.deepEqual(statusChip({ ...base, expires_at: at(2026, 10, 19, 20) }, now, fmt, fmt, () => '20:00'), { text: 'Ends today, 20:00', tone: 'soon' });
  assert.doesNotMatch(validityLabel({ ...base, expires_at: at(2026, 10, 20, 15, 40, 54) })!, /54/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (the chip reads `Ends today, 2026-10-19` and the label contains `54`).

- [ ] **Step 3: Implement**

In `web/src/logic.ts`:

1. After `shortDateTime` add:

```ts
const shortTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
```

2. Change the `statusChip` signature to add `time = shortTime` after `dateTime = shortDateTime`, and the `suffix` line to:

```ts
  const suffix = i.kind !== 'ticket' ? '' : `, ${days === 0 ? time(i.expires_at) : when(i.expires_at)}`;
```

3. Replace `validityLabel` with:

```ts
// Row/detail subtitle: ticket = date + time, coupon = date range (time of day is irrelevant).
export function validityLabel(i: Item): string | null {
  if (i.expires_at == null) return null;
  if (i.kind !== 'coupon') return new Date(i.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' });
  return i.valid_from == null ? `Valid until ${day(i.expires_at)}` : `Valid ${day(i.valid_from)} – ${day(i.expires_at)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all tests PASS (the existing "Ends tomorrow, 2026-10-20 20:00" case is unchanged).

- [ ] **Step 5: Stack the chip under the name**

In `web/src/screens/Lists.tsx` `Row`, replace the `.text` span and the chip after it with:

```tsx
      <span className="text">
        <span className="name">{item.name}</span>
        {chip && <span className={`chip ${chip.tone}`}>{chip.text}</span>}
        {item.note && <span className="sub">{item.note}</span>}
      </span>
```

In `web/src/style.css`, replace `.row-card.dim { opacity: 0.6; }` with:

```css
/* Expired: quieter card and a grey logo, but text keeps full contrast. */
.row-card.dim { background: transparent; box-shadow: none; }
.row-card.dim .logo { filter: grayscale(1); opacity: 0.6; }
```

and add after the `.row-card .sub` rule:

```css
.row-card .chip { align-self: flex-start; }
```

- [ ] **Step 6: Verify in the browser**

Seed data at 375×812, open `#/tickets`. Expected: "Prague Metro 24h" in full, chip "Ends today, HH:MM" under it, note below. Open it. Expected: the subtitle time has no seconds.

- [ ] **Step 7: Commit**

```bash
git add src/logic.ts src/logic.test.ts src/screens/Lists.tsx src/style.css
git commit -m "fix(web): ticket rows show the full name, times without seconds, readable expired rows"
```

---

### Task 9: Dark mode for everything except the barcode

**Files:**
- Modify: `web/src/style.css`
- Modify: `web/index.html`
- Modify: `web/vite.config.ts`
- Modify: `web/src/screens/Detail.tsx` (theme-color for both metas)

- [ ] **Step 1: Tokens for every literal colour**

In `web/src/style.css`, add these to the existing `:root` block:

```css
  color-scheme: light dark;
  --field-bg: #ffffff;
  --seg-bg: #e6e8ee;
  --seg-on: #ffffff;
  --dashed: #c9cdd6;
  --filled-line: #9fb6ee;
  --on-accent: #ffffff;
  --ok-bg: #e7f5ee; --ok-ink: #1e5e40;
  --soon-bg: #fff1e0; --soon-ink: #8a3c00;
  --neutral-bg: #eceef2;
  --err-bg: #fdecea;
  --tip-bg: #fff7e6; --tip-ink: #6b4300;
  --toast-bg: #14161a;
```

Directly after the `:root` block add:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115; --surface: #1a1d23; --field-bg: #22262e; --seg-bg: #22262e; --seg-on: #3a404b;
    --ink: #eceef2; --muted: #a3a9b6; --soft-ink: #c9cdd6;
    --line: #2c313a; --field-line: #3a404b; --dashed: #4a505c; --filled-line: #4f6fc4;
    --accent: #8fb0ff; --on-accent: #0b1020; --accent-soft: #1f2a44; --accent-soft-ink: #c7d6ff;
    --danger: #ff8a80;
    --ok-bg: #16301f; --ok-ink: #9ee2b8; --soon-bg: #3a2810; --soon-ink: #ffc98a; --neutral-bg: #2a2f38;
    --err-bg: #3a1a18; --tip-bg: #33280f; --tip-ink: #ffd88a; --toast-bg: #2f3540;
    --shadow: none;
  }
}
```

- [ ] **Step 2: Replace the literals**

In `web/src/style.css`, make these exact replacements:

| Rule | Old | New |
|---|---|---|
| `.row-card.upcoming` | `#c9cdd6` | `var(--dashed)` |
| `.chip.soon` | `background: #fff1e0; color: #8a3c00;` | `background: var(--soon-bg); color: var(--soon-ink);` |
| `.chip.ok` | `background: #e7f5ee; color: #1e5e40;` | `background: var(--ok-bg); color: var(--ok-ink);` |
| `.chip.expired` | `background: #eceef2;` | `background: var(--neutral-bg);` |
| `.fab` | `color: #fff;` | `color: var(--on-accent);` |
| `.tip` | `background: #fff7e6; color: #6b4300;` | `background: var(--tip-bg); color: var(--tip-ink);` |
| `.segmented` | `background: #e6e8ee;` | `background: var(--seg-bg);` |
| `.segmented button[aria-pressed='true']` | `background: #fff;` | `background: var(--seg-on);` |
| `.banner` | `color: #1a2f66;` | `color: var(--accent-soft-ink);` |
| `.input` | `background: #fff;` | `background: var(--field-bg);` |
| `.input.waiting` | both `#fff` | `var(--field-bg)` |
| `.input.filled` | `#9fb6ee` | `var(--filled-line)` |
| `.pills button` | `background: #fff;` | `background: var(--field-bg);` |
| `.secondary` | `background: #fff;` | `background: var(--field-bg);` |
| `.primary` | `color: #fff;` | `color: var(--on-accent);` |
| `.result.ok` | `background: #e7f5ee; color: #1e5e40;` | `background: var(--ok-bg); color: var(--ok-ink);` |
| `.result.err` | `background: #fdecea;` | `background: var(--err-bg);` |
| `.dialog input` | (no background) | add `background: var(--field-bg);` |
| `.toast` | `background: #14161a;` | `background: var(--toast-bg);` |

Leave alone: `.tile`, `.mark`, `.logo` (white logo plate and white text on store colours), `.detail`/`.glass` (white on store colour), `.code-card`, `.code-error`, `.till`, `.scanner*`.

- [ ] **Step 3: Status bar colours**

In `web/index.html`, replace the `theme-color` meta with:

```html
    <meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)" />
```

In `web/vite.config.ts`, set `background_color: '#f4f5f7'` and `theme_color: '#f4f5f7'`.

In `web/src/screens/Detail.tsx`, replace the theme-colour effect with:

```ts
  // The phone's status bar takes the store colour too, while this screen is open (both light and dark metas).
  useEffect(() => {
    if (!color) return;
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const before = metas.map((m) => m.content);
    metas.forEach((m) => { m.content = color; });
    return () => metas.forEach((m, i) => { m.content = before[i]; });
  }, [color]);
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Verify in the browser**

`resize_window` with `colorScheme: 'dark'`, seed data. Check `#/cards`, `#/tickets`, `#/add`, `#/settings`, `#/item/1`, and a dialog. Run `getComputedStyle(document.body).backgroundColor` → `rgb(15, 17, 21)`; on `#/item/1`, `getComputedStyle(document.querySelector('.code-card')).backgroundColor` → `rgb(255, 255, 255)`. Take a screenshot of each screen and check text is readable. Set `colorScheme: 'light'` again and confirm nothing changed from before.

- [ ] **Step 6: Commit**

```bash
git add src/style.css index.html vite.config.ts src/screens/Detail.tsx
git commit -m "feat(web): dark mode; the barcode card stays white"
```

---

### Task 10: Inline form errors, search that finds more, focus ring, 44px targets, safe areas

**Files:**
- Modify: `web/src/logic.ts` (`validateCode` message)
- Modify: `web/src/screens/Add.tsx`
- Modify: `web/src/App.tsx` (pass `initialName`)
- Modify: `web/src/screens/Lists.tsx`
- Modify: `web/src/style.css`
- Modify: `web/index.html`
- Test: `web/src/logic.test.ts`

**Interfaces:**
- Consumes: `byRecent` (Task 4).
- Produces: `Add` prop `initialName: string`.

- [ ] **Step 1: Write the failing test**

In `web/src/logic.test.ts`, inside `validateCode checks digits and check digit`, add:

```ts
  assert.match(validateCode('ean13', '123')!, /^EAN-13 needs/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, the message starts with `ean13 needs`.

- [ ] **Step 3: Use the label**

In `web/src/logic.ts` `validateCode`, change `` `${format} needs exactly ${n} digits` `` to `` `${FORMAT_LABEL[format]} needs exactly ${n} digits` ``.

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Inline errors in Add**

In `web/src/screens/Add.tsx`:

1. Signature: add `initialName = ''` → `({ kind: initialKind, shared, editId, scanning, initialName = '' }: { kind: Kind; shared: boolean; editId?: number; scanning: boolean; initialName?: string })`, and `useState(editing?.name ?? initialName)` for `name`.
2. After the `filled` state add:

```ts
  const [errors, setErrors] = useState<Record<string, string>>({}); // field -> message, shown under the field
```

3. In `typed`, after `setFilled(...)` add `setErrors(({ [field]: _gone, ...rest }) => rest);`.
4. Replace the validation lines at the top of `save` (from `if (!name.trim())` through the `from > until` line) with:

```ts
    // Collected in form order, shown under each field; focus goes to the first one.
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Enter the store name';
    const domain = toDomain(website);
    if (website.trim() && !domain) e.website = 'Should look like tesco.cz';
    const codeErr = validateCode(format, code.trim());
    if (codeErr) e.code = codeErr;
    if (kind === 'ticket' && !expires) e.expires = 'Pick when it expires';
    if (kind === 'coupon' && !until) e.until = 'Pick the last valid day';
    else if (kind === 'coupon' && from && from > until) e.until = 'Must not be before "Valid from"';
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) { document.getElementById(`f-${first}`)?.focus(); return; }
```

(`domain` is now declared here; delete the later `const domain = toDomain(website);` line.)
5. Before `return (` add:

```tsx
  const errProps = (f: string) => ({ id: `f-${f}`, ...(errors[f] ? { 'aria-invalid': true, 'aria-describedby': `e-${f}` } : {}) });
  const errText = (f: string) => errors[f] && <span id={`e-${f}`} className="field-error">{errors[f]}</span>;
```

6. Spread `{...errProps('name')}` on the name input, `{...errProps('website')}` on website, `{...errProps('code')}` on code, `{...errProps('expires')}` on the ticket Expires input, `{...errProps('until')}` on Valid until. Put `{errText('name')}` after the closing `</span>` of `.with-logo`, and `{errText('website')}`, `{errText('code')}`, `{errText('expires')}`, `{errText('until')}` right after their inputs, inside the same `<label>`.
7. The ticket Expires `onChange` becomes `onChange={(e) => { setExpires(e.target.value); setErrors(({ expires: _gone, ...rest }) => rest); }}`.

In `web/src/App.tsx`, add `initialName={params.get('name') ?? ''}` to the `/add` `<Add …>`.

- [ ] **Step 5: Search finds notes and codes; no-results state**

In `web/src/screens/Lists.tsx`:

1. Replace the `cards` line with:

```ts
  const needle = q.trim().toLowerCase();
  const cards = items.filter((i) => [i.name, i.note ?? '', i.code].some((s) => s.toLowerCase().includes(needle))).sort(byRecent);
```

2. After the `.tiles` div add:

```tsx
            {cards.length === 0 && needle && (
              <div className="empty">
                <p>No card matches “{q.trim()}”.</p>
                <button className="secondary" onClick={() => go(`/add?kind=card&name=${encodeURIComponent(q.trim())}`)}>Add “{q.trim()}”</button>
              </div>
            )}
```

3. Change `EMPTY.card` to `'No cards yet. Tap + to scan a card or add it from a photo.'`.

- [ ] **Step 6: Focus, targets, safe areas**

In `web/src/style.css`:

```css
.search:focus-within { outline: 3px solid var(--accent); outline-offset: 2px; }
.field-error { font-size: 13px; color: var(--danger); }
.input[aria-invalid='true'] { border-color: var(--danger); }
.empty p { margin: 0 0 12px; }
.empty .secondary { display: inline-flex; padding: 0 20px; }
```

Change `.segmented button` and `.pills button` `height` to `44px`. Change `.topbar` padding to `calc(20px + env(safe-area-inset-top, 0px)) 20px 8px` and `.subbar` padding to `calc(16px + env(safe-area-inset-top, 0px)) 12px 8px`.

In `web/index.html`, change the viewport meta to:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 7: Build, lint, test**

Run: `npm run build && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 8: Verify in the browser**

`#/add`, tap Save with everything empty. Expected: no dialog; "Enter the store name" under Name and "Code is empty" under Code, Name focused. Type a name. Expected: its error disappears. Type `123` with EAN-13 picked and save. Expected: "EAN-13 needs exactly 13 digits". Seed data, `#/cards`, search `zzz`. Expected: "No card matches “zzz”." plus "Add “zzz”", which opens Add with Name `zzz`. Search `4006`. Expected: Albert (matched by code). Tab into search. Expected: blue ring. `getComputedStyle(document.querySelector('.pills button')).height` → `44px`.

- [ ] **Step 9: Commit**

```bash
git add src/logic.ts src/logic.test.ts src/screens/Add.tsx src/App.tsx src/screens/Lists.tsx src/style.css index.html
git commit -m "fix(web): inline form errors, search by note and code with a no-results state, focus ring, 44px targets, safe areas"
```

---

## Final check

- [ ] Run `npm run build && npm run lint && npm test` in `web/`. Expected: all pass.
- [ ] At 375×812, light then dark: add a card by typing an EAN, open it, open till mode, Back, delete and Undo, export, import with Replace and restore. Clear the test data afterwards.
- [ ] Reset the viewport to `desktop`.
- [ ] On the phone (only the user can do this): show a card in till mode at a real till.

## Deliberately left out (from the review)

Pinned cards, coupon cross-link on the card screen, brand colour picker, a "discard changes?" guard, native `<dialog>`, desktop max-width, removing the Logo action, an app shortcut to the last card, self-hosted fonts, and the Google favicon privacy note. Add any of them later as their own small task.
