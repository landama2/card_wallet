# Receipts and Saved Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Receipt" item kind (purchase date, amount, claim deadline, optional code), and keep one original photo per item, hidden behind an "Original photo" row. Photos are optionally included in a ZIP backup.

**Architecture:** Item data stays in `localStorage` (`db.ts`), extended with two optional fields. Photos live in a new IndexedDB store (`photos.ts`) keyed by item id. Pure logic goes in `logic.ts`, `receipt-parse.ts` and `backup.ts` and is unit-tested. Screens (`Add`, `Detail`, `Lists`, `Settings`) wire it up and are checked by hand in the browser preview.

**Tech Stack:** React 19 + TypeScript + Vite PWA, tests with `node:test` via `tsx --test`, plus the new dependency `fflate` for the ZIP format.

**Spec:** `docs/superpowers/specs/2026-10-20-receipts-and-photos-design.md`

## Global Constraints

- Work on branch `receipt-photos`. Never stage `.claude/` (it's gitignored local config).
- All commands run from `web/`. Tests: `npm test`. Types and build: `npm run build`. Lint: `npm run lint`.
- The only new runtime dependency is `fflate`. IndexedDB, canvas and file inputs use browser APIs directly, with no wrappers.
- One photo per item, stored as a JPEG `Blob` scaled to at most 1600 px on its longest side, quality 0.8.
- Amounts are CZK, stored as a number, shown as `1 250 Kč` (cs-CZ format). No currency field.
- For receipts, `expires_at` is the claim deadline (end of that day, optional). `purchased_at` is the start of the purchase day.
- The JSON backup stays `version: 1`. Old backups must keep importing.
- The UI copy follows the app's tone: short, plain English, sentence case.
- Match the surrounding code: terse, comments only for the non-obvious, `// ponytail:` for deliberate shortcuts.
- Commit messages: `feat(web): …` / `test(web): …`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Change |
|---|---|
| `web/src/logic.ts` | `receipt` kind, `purchased_at`/`amount`, `validateCode(…, kind)`, `parseAmount`, `formatAmount`, `receiptFacts`, receipt-aware `validityLabel`/`dedupe`/`serialize`/`parseImport`, `NOT_A_BACKUP` |
| `web/src/receipt-parse.ts` (new) | `guessReceipt(lines, now)` → amount + purchase date from OCR text |
| `web/src/photos.ts` (new) | IndexedDB photo store + `shrinkPhoto` |
| `web/src/db.ts` | `insertMany` returns the new ids |
| `web/src/backup.ts` | `applyImport` returns per-item ids; `zipBackup`/`unzipBackup`/`isZip`; `exportBackup(withPhotos)` |
| `web/src/Icon.tsx` | `receipt` icon |
| `web/src/screens/Add.tsx` | receipt fields, photo-first picker, "Keep photo" switch, receipt OCR fill |
| `web/src/screens/Detail.tsx` | "Original photo" row, photo viewer overlay, receipts without code, delete/undo keeps the photo |
| `web/src/App.tsx` | pass `photo` overlay flag to Detail |
| `web/src/screens/Lists.tsx` | Receipts tab, amount on rows |
| `web/src/screens/Settings.tsx` | two exports, ZIP import, photo usage line |
| `web/src/style.css` | 4-column tab bar, photo row/card/viewer, keep-photo switch, barcode `<details>` |

---

### Task 1: Receipt kind in the data model

**Files:**
- Modify: `web/src/logic.ts`
- Modify (to keep `tsc` green, as `Record<Kind, …>` maps gain a key): `web/src/screens/Add.tsx:14`, `web/src/screens/Detail.tsx:10`, `web/src/screens/Lists.tsx:9-17`, `web/src/Icon.tsx`, `web/src/style.css:108`
- Test: `web/src/logic.test.ts`

**Interfaces:**
- Produces:
  - `KINDS` includes `'receipt'`
  - `Item.purchased_at?: number | null` and `Item.amount?: number | null`
  - `validateCode(format: Format, code: string, kind?: Kind): string | null`
  - `parseAmount(s: string): number | null`
  - `formatAmount(n: number): string`
  - `receiptFacts(i: Item): string | null`
  - `NOT_A_BACKUP: string`
  - `serialize(items: Item[], photo?: (i: Item, n: number) => string | undefined): string`
  - `dedupe(existing: Item[], incoming: NewItem[])`, which now also compares `amount` and `purchased_at`
  - Icon name `'receipt'`

- [ ] **Step 1: Write the failing tests.** Append to `web/src/logic.test.ts`, and add `dedupe, formatAmount, parseAmount, receiptFacts, serialize, validateCode, validityLabel` to its existing import from `'./logic'` if they're not already imported:

```ts
test('receipts may have no code; other kinds may not', () => {
  assert.equal(validateCode('qr', '', 'receipt'), null);
  assert.equal(validateCode('qr', ''), 'Code is empty');
  assert.equal(validateCode('qr', '', 'card'), 'Code is empty');
});

test('parseImport accepts a receipt without a code and keeps amount and purchase date', () => {
  const json = JSON.stringify({ version: 1, items: [{ kind: 'receipt', name: 'Dr. Max', code: '', format: 'qr', amount: 389.5, purchased_at: 5, expires_at: 9 }] });
  const [r] = parseImport(json);
  assert.equal(r.kind, 'receipt');
  assert.equal(r.code, '');
  assert.equal(r.format, 'qr'); // not forced to code128
  assert.equal(r.amount, 389.5);
  assert.equal(r.purchased_at, 5);
  assert.equal(r.expires_at, 9);
});

test('a card without a code still imports as Code 128, as before receipts', () => {
  const json = JSON.stringify({ version: 1, items: [{ kind: 'card', name: 'X', code: '', format: 'qr' }] });
  assert.equal(parseImport(json)[0].format, 'code128'); // empty code breaks qr rules -> code128 fallback, as before
});

test('parseAmount reads Czech and English styles; rejects junk', () => {
  assert.equal(parseAmount('1 250,50'), 1250.5);
  assert.equal(parseAmount('1250.5 Kč'), 1250.5);
  assert.equal(parseAmount(' 389 '), 389);
  assert.equal(parseAmount('12,345'), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
});

test('formatAmount uses Czech grouping and Kč', () => {
  assert.equal(formatAmount(1250).replace(/\s/g, ' '), '1 250 Kč');
  assert.equal(formatAmount(389.5).replace(/\s/g, ' '), '389,50 Kč');
});

test('receipts: deadline label and facts line', () => {
  const r = { ...base, kind: 'receipt' as const, code: '', expires_at: new Date(2026, 11, 31, 23, 59).getTime(), amount: 1250, purchased_at: new Date(2026, 9, 3).getTime() };
  assert.match(validityLabel(r)!, /^Claim by /);
  assert.match(receiptFacts(r)!.replace(/\s/g, ' '), /^1 250 Kč · Bought /);
  assert.equal(receiptFacts({ ...base }), null);
});

test('dedupe tells apart receipts that differ only in amount or date', () => {
  const r = { ...base, kind: 'receipt' as const, code: '', name: 'Dr. Max', amount: 100, purchased_at: 1 };
  const { id: _id, ...n } = r;
  assert.equal(dedupe([r], [n]).length, 0);
  assert.equal(dedupe([r], [{ ...n, amount: 200 }]).length, 1);
  assert.equal(dedupe([r], [{ ...n, purchased_at: 2 }]).length, 1);
  assert.equal(dedupe([{ ...base }], [{ ...base, id: undefined } as any]).length, 0); // old items without the fields still dedupe
});

test('serialize adds a photo path only where given', () => {
  const out = JSON.parse(serialize([base, { ...base, id: 2 }], (i, n) => (i.id === 2 ? `photos/${n}.jpg` : undefined)));
  assert.equal(out.items[0].photo, undefined);
  assert.equal(out.items[1].photo, 'photos/1.jpg');
  assert.equal(JSON.parse(serialize([base])).items[0].photo, undefined);
});
```

- [ ] **Step 2: Run the tests and check they fail.**

Run: `npm test`
Expected: FAIL. The new imports don't exist (`parseAmount is not a function`, or a TS/ESM import error).

- [ ] **Step 3: Implement in `web/src/logic.ts`.**

Replace the `KINDS` line:

```ts
export const KINDS = ['card', 'ticket', 'coupon', 'receipt'] as const;
```

Replace the `Item` type and the comment above it:

```ts
// Coupons: valid_from = start of the first day, expires_at = end of the last day (local time).
// Receipts: expires_at = end of the claim deadline day (optional), purchased_at = start of the purchase day.
// valid_from is null for cards, tickets, receipts and coupons without a start date (and in items saved before coupons existed).
export type Item = {
  id: number; kind: Kind; name: string; code: string; format: Format;
  color: string | null; note: string | null; expires_at: number | null; valid_from: number | null;
  domain: string | null; // store website, e.g. 'tesco.cz'; drives the logo. Missing in items saved before logos.
  last_used_at?: number | null; // when its detail screen was last opened; missing in items saved before this
  purchased_at?: number | null; amount?: number | null; // receipts only (CZK); missing in items saved before receipts
  notify_id: string | null; created_at: number;
};
```

Replace `validityLabel`:

```ts
// Row/detail subtitle: ticket = date + time, coupon = date range, receipt = claim deadline (time of day is irrelevant).
export function validityLabel(i: Item): string | null {
  if (i.expires_at == null) return null;
  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' });
  if (i.kind === 'receipt') return `Claim by ${day(i.expires_at)}`;
  if (i.kind !== 'coupon') return new Date(i.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return i.valid_from == null ? `Valid until ${day(i.expires_at)}` : `Valid ${day(i.valid_from)} – ${day(i.expires_at)}`;
}

// 389.5 -> '389,50 Kč'; whole amounts without decimals: '1 250 Kč'.
export const formatAmount = (n: number) => {
  const digits = Number.isInteger(n) ? 0 : 2;
  return n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: digits, maximumFractionDigits: digits });
};

// '1 250,50', '1250.5 Kč' -> 1250.5; null when it isn't an amount (max 2 decimals).
export function parseAmount(s: string): number | null {
  const t = s.replace(/\s|Kč|CZK/gi, '').replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}

// Receipt subtitle: '1 250 Kč · Bought 3 Oct 2026'; null when neither is known.
export function receiptFacts(i: Item): string | null {
  const bought = i.purchased_at != null ? `Bought ${new Date(i.purchased_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : null;
  return [i.amount != null ? formatAmount(i.amount) : null, bought].filter(Boolean).join(' · ') || null;
}
```

Replace the first line of `validateCode` and its signature:

```ts
export function validateCode(format: Format, code: string, kind?: Kind): string | null {
  if (!code) return kind === 'receipt' ? null : 'Code is empty';
```

Replace `serialize`, `parseImport` and `dedupe`:

```ts
export const NOT_A_BACKUP = "That file isn't a wallet backup. Choose a file made with Export.";

// `photo` names the item's photo file inside a ZIP backup; plain JSON backups have none.
export const serialize = (items: Item[], photo: (i: Item, n: number) => string | undefined = () => undefined) =>
  JSON.stringify({ version: 1, items: items.map((i, n) => { const { id, notify_id, ...rest } = i; return { ...rest, photo: photo(i, n) }; }) }, null, 2);

export function parseImport(json: string): NewItem[] {
  let data: any;
  try { data = JSON.parse(json); } catch { /* reported below */ }
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error(NOT_A_BACKUP);
  return data.items.map((x: any, i: number) => {
    const ok = (KINDS as readonly string[]).includes(x?.kind) && typeof x.name === 'string'
      && typeof x.code === 'string' && (FORMATS as readonly string[]).includes(x.format);
    if (!ok) throw new Error(`Item ${i + 1} in the backup is incomplete, so nothing was imported.`);
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    return {
      // A code that breaks its format's rules (e.g. a bad EAN check digit) can't be drawn; Code 128 can draw any of them.
      kind: x.kind, name: x.name, code: x.code, format: validateCode(x.format, x.code, x.kind) ? 'code128' : x.format,
      color: x.color ?? null, note: x.note ?? null,
      expires_at: num(x.expires_at), valid_from: num(x.valid_from),
      domain: typeof x.domain === 'string' ? toDomain(x.domain) : null,
      last_used_at: num(x.last_used_at), purchased_at: num(x.purchased_at), amount: num(x.amount),
      notify_id: null, created_at: x.created_at ?? Date.now(),
    };
  });
}

// Receipts usually have no code, so amount and purchase date tell two receipts from the same shop apart.
export const dedupe = (existing: Item[], incoming: NewItem[]) =>
  incoming.filter((n) => !existing.some((e) => e.kind === n.kind && e.code === n.code && e.name === n.name
    && (e.amount ?? null) === (n.amount ?? null) && (e.purchased_at ?? null) === (n.purchased_at ?? null)));
```

Then keep `tsc` green by adding the `receipt` key everywhere a `Record<Kind, …>` exists:

`web/src/screens/Add.tsx:14`:
```ts
const KIND_LABEL: Record<Kind, string> = { card: 'Card', ticket: 'Ticket', coupon: 'Coupon', receipt: 'Receipt' };
```

`web/src/screens/Detail.tsx:10`:
```ts
const KIND_LABEL = { card: 'Loyalty card', ticket: 'Ticket', coupon: 'Coupon', receipt: 'Receipt' } as const;
```

`web/src/screens/Lists.tsx:9-17`, replacing `TITLE`, `TAB` and `EMPTY`:
```ts
const TITLE: Record<Kind, string> = { card: 'Wallet', ticket: 'Tickets', coupon: 'Coupons', receipt: 'Receipts' };
const TAB: Record<Kind, { label: string; icon: IconName }> = {
  card: { label: 'Cards', icon: 'card' }, ticket: { label: 'Tickets', icon: 'ticket' }, coupon: { label: 'Coupons', icon: 'coupon' },
  receipt: { label: 'Receipts', icon: 'receipt' },
};
const EMPTY: Record<Kind, string> = {
  card: 'No cards yet. Tap + to scan a card or add it from a photo.',
  ticket: 'No tickets. Tap + to add one; it moves to the archive when it expires.',
  coupon: 'No coupons. Tap + and import a screenshot: the store and dates are filled in for you.',
  receipt: 'No receipts. Tap + and take a photo: the date and amount are filled in for you.',
};
```

`web/src/Icon.tsx`, adding to `PATHS` after `coupon`:
```tsx
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
```

`web/src/style.css:108`: in `.tabbar`, change `grid-template-columns: repeat(3, minmax(0, 1fr));` to `repeat(4, minmax(0, 1fr))`.

- [ ] **Step 4: Run the tests and build, and check they pass.**

Run: `npm test && npm run build`
Expected: all tests PASS, and the build finishes without TS errors.

- [ ] **Step 5: Commit.**

```bash
git add web/src/logic.ts web/src/logic.test.ts web/src/screens/Add.tsx web/src/screens/Detail.tsx web/src/screens/Lists.tsx web/src/Icon.tsx web/src/style.css
git commit -m "feat(web): receipt kind with purchase date, amount and claim deadline in the data model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Read the amount and purchase date from receipt text

**Files:**
- Create: `web/src/receipt-parse.ts`
- Test: `web/src/receipt-parse.test.ts`

**Interfaces:**
- Consumes: `parseAmount(s: string): number | null` from Task 1.
- Produces: `guessReceipt(lines: string[], now?: number): { amount?: number; purchased?: string }`, where `purchased` is `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing test** in `web/src/receipt-parse.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { guessReceipt } from './receipt-parse';

const NOW = new Date(2026, 9, 20).getTime(); // 2026-10-20

test('Czech pharmacy receipt: "Celkem k úhradě" and a d.m.yyyy date', () => {
  const lines = ['Dr. Max Lékárna', 'IČ: 12345678', 'Ibalgin 400 1x 89,00', 'Celkem k úhradě 1 250,50 Kč', 'Datum: 3.10.2026 14:22'];
  assert.deepEqual(guessReceipt(lines, NOW), { amount: 1250.5, purchased: '2026-10-03' });
});

test('the last total line wins over a subtotal; spaced date with two-digit year', () => {
  const lines = ['Subtotal 300,00', 'TOTAL 389.00 CZK', 'Date 03. 10. 26'];
  assert.deepEqual(guessReceipt(lines, NOW), { amount: 389, purchased: '2026-10-03' });
});

test('future and impossible dates are skipped; no total means no amount', () => {
  assert.deepEqual(guessReceipt(['Platnost do 31.12.2026', '31.02.2026', 'Vystaveno 1.9.2026'], NOW), { purchased: '2026-09-01' });
  assert.deepEqual(guessReceipt(['Hello', 'Suma'], NOW), {});
});
```

- [ ] **Step 2: Run the test and check it fails.**

Run: `npm test`
Expected: FAIL with `Cannot find module './receipt-parse'`.

- [ ] **Step 3: Implement** `web/src/receipt-parse.ts`:

```ts
// The total and purchase date from OCR'd receipt lines. Pure, like ocr-parse.ts, so it's tested with plain text.
import { parseAmount } from './logic';

const TOTAL = /celkem|k úhradě|total|suma/i;
const NUMBER = /\d[\d  ]*(?:[.,]\d{1,2})?/g;
// "3.10.2026", "03. 10. 26"
const DATE = /(?<![\d.])(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/g;

export function guessReceipt(lines: string[], now = Date.now()): { amount?: number; purchased?: string } {
  const out: { amount?: number; purchased?: string } = {};
  for (const l of lines.filter((l) => TOTAL.test(l))) {
    const n = parseAmount(l.match(NUMBER)?.at(-1) ?? ''); // last number on the line: "Celkem 2 položky 389,00"
    if (n != null) out.amount = n; // the last total line wins (after any subtotal)
  }
  for (const m of lines.join('\n').matchAll(DATE)) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3]) + (m[3].length === 2 ? 2000 : 0)];
    const date = new Date(y, mo - 1, d);
    if (date.getMonth() !== mo - 1 || date.getDate() !== d || date.getTime() > now) continue;
    out.purchased = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    break;
  }
  return out;
}
```

- [ ] **Step 4: Run the test and check it passes.**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/receipt-parse.ts web/src/receipt-parse.test.ts
git commit -m "feat(web): read a receipt's total and purchase date from its text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Photo store and ZIP backup logic

**Files:**
- Create: `web/src/photos.ts`
- Modify: `web/src/db.ts` (`insertMany`), `web/src/backup.ts`
- Modify: `web/package.json`, `web/package-lock.json` (`npm install fflate`)
- Test: `web/src/backup.test.ts`

**Interfaces:**
- Consumes: `serialize(items, photo)`, `parseImport`, `NOT_A_BACKUP` and `dedupe` from Task 1.
- Produces:
  - `photos.ts`:
    - `getPhoto(id: number): Promise<Blob | undefined>`
    - `putPhoto(id: number, b: Blob): Promise<void>`
    - `deletePhoto(id: number): Promise<void>`
    - `clearPhotos(): Promise<void>`
    - `listPhotoIds(): Promise<number[]>`
    - `photoUsage(): Promise<{ count: number; bytes: number }>`
    - `shrinkPhoto(b: Blob): Promise<Blob>`
  - `db.ts`: `insertMany(ns: NewItem[], replace: boolean): number[]` (new ids, in input order).
  - `backup.ts`:
    - `applyImport(items, mode): { added: number; skipped: number; ids: (number | null)[] }`, where `ids[i]` is the new id of `items[i]`, or `null` if it was skipped as a duplicate
    - `isZip(b: Uint8Array): boolean`
    - `zipBackup(items: Item[], photos: Map<number, Uint8Array>): Uint8Array`
    - `unzipBackup(b: Uint8Array): { items: NewItem[]; photos: (Uint8Array | null)[]; missing: number }`
    - `exportBackup(withPhotos?: boolean): Promise<boolean>`

- [ ] **Step 1: Install fflate.**

Run: `npm install fflate`
Expected: `fflate` appears under `dependencies` in `web/package.json`.

- [ ] **Step 2: Write the failing tests.** Append to `web/src/backup.test.ts`, and change its backup import line to:

```ts
const { applyImport, isZip, restoreBeforeReplace, savedBeforeReplace, unzipBackup, zipBackup } = await import('./backup');
```

```ts
test('applyImport reports the new id of each added item and null for skipped ones', () => {
  localStorage.clear();
  insertItem(n('dup'));
  const r = applyImport([n('a'), n('dup'), n('b')], 'merge');
  assert.equal(r.added, 2);
  assert.equal(r.ids[1], null);
  const byId = new Map(listItems().map((i) => [i.id, i.name]));
  assert.equal(byId.get(r.ids[0]!), 'a');
  assert.equal(byId.get(r.ids[2]!), 'b');
});

test('zip backup round trip keeps items and pairs each photo with its item', () => {
  localStorage.clear();
  insertItem(n('no photo'));
  const withPhoto = insertItem(n('with photo'));
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3]);
  const zip = zipBackup(listItems(), new Map([[withPhoto, jpeg]]));
  assert.ok(isZip(zip));
  const { items, photos, missing } = unzipBackup(zip);
  assert.deepEqual(items.map((i) => i.name), listItems().map((i) => i.name));
  const k = items.findIndex((i) => i.name === 'with photo');
  assert.deepEqual(photos[k], jpeg);
  assert.equal(photos[1 - k], null);
  assert.equal(missing, 0);
});

test('a zip without wallet.json, or not a zip at all, is not a backup', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  assert.throws(() => unzipBackup(zipSync({ 'other.txt': strToU8('x') })), /isn't a wallet backup/);
  assert.throws(() => unzipBackup(new Uint8Array([0x50, 0x4b, 0, 0])), /isn't a wallet backup/);
  assert.equal(isZip(new TextEncoder().encode('{"version":1}')), false);
});

test('a photo named in wallet.json but absent from the zip is counted as missing', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  const json = JSON.stringify({ version: 1, items: [{ ...n('x'), photo: 'photos/0.jpg' }] });
  const r = unzipBackup(zipSync({ 'wallet.json': strToU8(json) }));
  assert.equal(r.items.length, 1);
  assert.equal(r.photos[0], null);
  assert.equal(r.missing, 1);
});
```

- [ ] **Step 3: Run the tests and check they fail.**

Run: `npm test`
Expected: FAIL, because `zipBackup`/`isZip`/`unzipBackup` are undefined and `r.ids` is undefined.

- [ ] **Step 4: Implement.**

`web/src/db.ts`, replacing `insertMany`:

```ts
// Returns the new ids, in the order of `ns`.
export function insertMany(ns: NewItem[], replace: boolean): number[] {
  const items = replace ? [] : listItems();
  let id = Math.max(0, ...items.map((i) => i.id));
  const added = ns.map((n) => ({ ...n, id: ++id }));
  save([...added, ...items]);
  return added.map((i) => i.id);
}
```

`web/src/backup.ts`. Change the imports at the top:

```ts
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { insertMany, listItems } from './db';
import { type Item, type NewItem, NOT_A_BACKUP, dedupe, parseImport, serialize } from './logic';
import { getPhoto, listPhotoIds } from './photos';
```

Replace `exportBackup` with:

```ts
// The share sheet where the phone offers one for this file (save to Drive/Files/mail), else a plain download.
// Resolves to false when the user closes the share sheet without picking anything.
// With photos: a .zip holding wallet.json and photos/<n>.jpg; without: the plain .json, as before photos existed.
export async function exportBackup(withPhotos = false): Promise<boolean> {
  const name = `wallet-backup-${new Date().toISOString().slice(0, 10)}`;
  const items = listItems();
  let file: File;
  if (withPhotos) {
    const photos = new Map<number, Uint8Array>();
    for (const id of await listPhotoIds()) {
      const b = await getPhoto(id);
      if (b) photos.set(id, new Uint8Array(await b.arrayBuffer()));
    }
    file = new File([zipBackup(items, photos)], `${name}.zip`, { type: 'application/zip' });
  } else {
    file = new File([serialize(items)], `${name}.json`, { type: 'application/json' });
  }
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

export const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b; // "PK"

// Photos are stored, not compressed: JPEG doesn't shrink further.
export function zipBackup(items: Item[], photos: Map<number, Uint8Array>): Uint8Array {
  const files: Zippable = {};
  const json = serialize(items, (i, n) => {
    const data = photos.get(i.id);
    if (!data) return undefined;
    files[`photos/${n}.jpg`] = [data, { level: 0 }];
    return `photos/${n}.jpg`;
  });
  files['wallet.json'] = strToU8(json);
  return zipSync(files);
}

// photos[i] belongs to items[i]; missing = photos named in wallet.json but absent from the zip.
export function unzipBackup(b: Uint8Array): { items: NewItem[]; photos: (Uint8Array | null)[]; missing: number } {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(b); } catch { throw new Error(NOT_A_BACKUP); }
  if (!files['wallet.json']) throw new Error(NOT_A_BACKUP);
  const text = strFromU8(files['wallet.json']);
  const items = parseImport(text);
  const paths: unknown[] = JSON.parse(text).items.map((x: any) => x?.photo);
  const photos = paths.map((p) => (typeof p === 'string' && files[p]?.length ? files[p] : null));
  return { items, photos, missing: paths.filter((p, i) => typeof p === 'string' && !photos[i]).length };
}
```

Replace `applyImport` with:

```ts
// ids[i] = the new id of items[i], or null when Merge skipped it as already in the wallet.
export function applyImport(items: NewItem[], mode: 'merge' | 'replace') {
  if (mode === 'replace') {
    const before = listItems().map(({ id, ...rest }) => rest);
    if (before.length) localStorage.setItem(BEFORE, JSON.stringify(before));
    else localStorage.removeItem(BEFORE); // an empty wallet has nothing to restore, and an older copy would be unrelated
  }
  const existing = listItems();
  const fresh = items.map((n) => mode === 'replace' || dedupe(existing, [n]).length > 0);
  const newIds = insertMany(items.filter((_, i) => fresh[i]), mode === 'replace');
  let k = 0;
  const ids = fresh.map((f) => (f ? newIds[k++] : null));
  return { added: newIds.length, skipped: items.length - newIds.length, ids };
}
```

Create `web/src/photos.ts`:

```ts
// One original photo per item (keyed by item id) in IndexedDB: localStorage only holds ~5 MB.
// The database opens on first use, so importing this module is safe where IndexedDB doesn't exist (tests).
let db: Promise<IDBDatabase> | undefined;
const open = () => new Promise<IDBDatabase>((ok, fail) => {
  const r = indexedDB.open('wallet-photos', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('photos');
  r.onsuccess = () => ok(r.result);
  r.onerror = () => fail(r.error);
});

function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return (db ??= open()).then((d) => new Promise<T>((ok, fail) => {
    const tx = d.transaction('photos', mode);
    const r = f(tx.objectStore('photos'));
    tx.oncomplete = () => ok(r.result);
    tx.onerror = tx.onabort = () => fail(tx.error);
  }));
}

export const getPhoto = (id: number) => run<Blob | undefined>('readonly', (s) => s.get(id));
export const listPhotoIds = () => run('readonly', (s) => s.getAllKeys()) as Promise<number[]>;
export const deletePhoto = (id: number) => run('readwrite', (s) => s.delete(id)).then(() => {});
export const clearPhotos = () => run('readwrite', (s) => s.clear()).then(() => {});

export function putPhoto(id: number, b: Blob) {
  // Without this, browsers may clear site data; iOS Safari does after 7 days unused unless the app is installed.
  navigator.storage?.persisted?.().then((p) => p || navigator.storage.persist()).catch(() => {});
  return run('readwrite', (s) => s.put(b, id)).then(() => {});
}

export async function photoUsage() {
  const all = await run<Blob[]>('readonly', (s) => s.getAll());
  return { count: all.length, bytes: all.reduce((n, b) => n + b.size, 0) };
}

const MAX_SIDE = 1600; // px; plenty to read a receipt, ~200-400 KB as JPEG
// Scaled down to MAX_SIDE and re-encoded as JPEG; the original where the browser can't.
export async function shrinkPhoto(image: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return image;
  const bmp = await createImageBitmap(image);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } finally {
    bmp.close();
  }
}
```

- [ ] **Step 5: Run the tests and build, and check they pass.**

Run: `npm test && npm run build`
Expected: all tests PASS (old backup tests included), and the build is clean. `Settings.tsx` still calls `exportBackup()` with no argument, which still works.

- [ ] **Step 6: Commit.**

```bash
git add web/package.json web/package-lock.json web/src/photos.ts web/src/db.ts web/src/backup.ts web/src/backup.test.ts
git commit -m "feat(web): photo store in IndexedDB; zip backups with photos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Add screen — receipt fields and Keep photo

**Files:**
- Modify: `web/src/screens/Add.tsx`
- Modify: `web/src/style.css`

**Interfaces:**
- Consumes:
  - `parseAmount`, `validateCode(format, code, kind)` and `dayStart`/`dayEnd`/`toDateInput` from `logic.ts`
  - `guessReceipt` from `receipt-parse.ts`
  - `putPhoto` and `shrinkPhoto` from `photos.ts`
  - `insertItem` (returns the id)

- [ ] **Step 1: Change the imports and the `Field` type** at the top of `web/src/screens/Add.tsx`:

```ts
import { FORMATS, FORMAT_LABEL, KINDS, type Format, type Kind, dayEnd, dayStart, guessFormat, parseAmount, toDateInput, toDomain, validateCode } from '../logic';
import { readLines } from '../ocr';
import { guessFromText } from '../ocr-parse';
import { putPhoto, shrinkPhoto } from '../photos';
import { guessReceipt } from '../receipt-parse';
```

```ts
type Field = 'name' | 'website' | 'code' | 'from' | 'until' | 'purchased' | 'amount';
```

- [ ] **Step 2: Add the state.** Put this after the `website` state line:

```ts
  const [purchased, setPurchased] = useState(editing?.purchased_at != null ? toDateInput(editing.purchased_at) : '');
  const [amount, setAmount] = useState(editing?.amount != null ? String(editing.amount).replace('.', ',') : '');
  const [deadline, setDeadline] = useState(editing?.kind === 'receipt' && editing.expires_at ? toDateInput(editing.expires_at) : '');
  const [photo, setPhoto] = useState<Blob | null>(null); // the last image picked; saved with the item when keepPhoto
  const [keepPhoto, setKeepPhoto] = useState(true);
```

Replace the two `current` lines:

```ts
  const current = useRef({ kind, name, website, from, until, scanning, code, purchased, amount }); // latest values, for the async OCR fill below
  current.current = { kind, name, website, from, until, scanning, code, purchased, amount };
```

- [ ] **Step 3: No "No code found" dialog for receipts.** In `fill`, change the `if (!r)` block:

```ts
    if (!r) {
      // Late OCR result: don't pop a dialog over the scanner, or after a code is already there. Receipts rarely have one.
      if (current.current.scanning || current.current.code || current.current.kind === 'receipt') return;
      notify('No code found. Enter the code manually.');
      return;
    }
```

- [ ] **Step 4: Fill in receipt fields from OCR.** In `readText`, replace `const g = guessFromText(await readLines(blob));` with:

```ts
      const lines = await readLines(blob);
      const g = guessFromText(lines);
```

After the `if (c.kind === 'coupon') { … }` block, add:

```ts
      if (c.kind === 'receipt') {
        const r = guessReceipt(lines.map((l) => l.text));
        if (r.purchased && !c.purchased) { setPurchased(r.purchased); got.push('purchased'); }
        if (r.amount != null && !c.amount) { setAmount(String(r.amount).replace('.', ',')); got.push('amount'); }
      }
```

Replace the `words` line:

```ts
      const words: Record<Field, string> = { name: 'name', website: 'website', code: 'code', from: 'valid from', until: 'valid until', purchased: 'purchase date', amount: 'amount' };
```

- [ ] **Step 5: Remember the picked image.** Replace `importBlob`:

```ts
  const importBlob = async (blob: Blob) => {
    setPhoto(blob);
    const ocr = readText(blob);
    const r = await detectBlob(blob).catch(() => null);
    if (!r) await ocr;
    fill(r, 'from image');
  };
```

- [ ] **Step 6: Save the receipt fields and the photo.** Replace the whole `save` function:

```ts
  const save = async () => {
    if (saving.current) return;
    const isReceipt = kind === 'receipt';
    // Collected in form order, shown under each field; focus goes to the first one.
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = isReceipt ? 'Enter the shop or provider' : 'Enter the store name';
    const domain = toDomain(website);
    if (website.trim() && !domain) e.website = 'Should look like tesco.cz';
    const amt = amount.trim() ? parseAmount(amount) : null;
    if (isReceipt && amount.trim() && amt == null) e.amount = 'Enter an amount like 1 250,50';
    const codeErr = validateCode(format, code.trim(), kind);
    if (codeErr) e.code = codeErr;
    if (kind === 'ticket' && !expires) e.expires = 'Pick when it expires';
    if (kind === 'coupon' && !until) e.until = 'Pick the last valid day';
    else if (kind === 'coupon' && from && from > until) e.until = 'Must not be before "Valid from"';
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) { document.getElementById(`f-${first}`)?.focus(); return; }
    const expiresAt = kind === 'ticket' ? new Date(expires).getTime()
      : kind === 'coupon' ? dayEnd(until)
      : isReceipt && deadline ? dayEnd(deadline) : null;
    const validFrom = kind === 'coupon' && from ? dayStart(from) : null;
    if (expiresAt != null && expiresAt < Date.now() && !(await ask(isReceipt ? 'The claim deadline has passed. Save anyway?' : 'Already expired. Save anyway?', 'Save anyway'))) return;
    if (saving.current) return;
    saving.current = true;
    const fields = {
      kind, name: name.trim(), note: note.trim() || null, code: code.trim(), format,
      expires_at: expiresAt, valid_from: validFrom, domain,
      purchased_at: isReceipt && purchased ? dayStart(purchased) : null, amount: isReceipt ? amt : null,
    };
    let id: number;
    try {
      if (editing) { updateItem(editing.id, fields); id = editing.id; }
      else id = insertItem({ ...fields, color: null, notify_id: null, created_at: Date.now() });
    } catch (e) {
      saving.current = false;
      return notify('Could not save: ' + String(e));
    }
    // A failed photo never loses the item: it's already saved.
    if (photo && keepPhoto) {
      try { await putPhoto(id, await shrinkPhoto(photo)); }
      catch (err) { console.error('photo save failed', err); await notify("Saved, but the photo couldn't be kept."); }
    }
    if (editing) go(`/item/${editing.id}`); else go(`/${kind}s`);
  };
```

- [ ] **Step 7: Render.** In the render section:

1. Replace the `vals` line:

```ts
  const vals: Record<Field, string> = { name, website, code, from, until, purchased, amount };
```

2. Above the `return (`, add these shared pieces:

```tsx
  const isReceipt = kind === 'receipt';
  const fromImage = (label: string) => (
    <label className="secondary">
      {reading ? <span className="spinner" aria-hidden /> : <Icon name="image" size={20} />}{label}
      <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) importBlob(f); e.target.value = ''; }} />
    </label>
  );
  const keepSwitch = photo && (
    <label className="check">
      <input type="checkbox" checked={keepPhoto} onChange={(e) => setKeepPhoto(e.target.checked)} />
      Keep the photo on this phone (under “Original photo”{editing ? ', replacing the old one' : ''})
    </label>
  );
  const codeFields = (
    <>
      <label className="field">
        <span className="field-label">Code {badge('code')}</span>
        <input ref={codeInput} {...errProps('code')} className={cls('code')} value={code} onChange={(e) => { typed('code', setCode)(e.target.value); if (!formatTouched.current) setFormat(guessFormat(e.target.value)); }} placeholder={isReceipt ? 'Optional' : 'Scan, import or type the number'} autoCapitalize="none" />
        {errText('code')}
      </label>
      <div className="pills" role="group" aria-label="Code type">
        {FORMATS.map((f) => (
          <button key={f} aria-pressed={f === format} onClick={() => { formatTouched.current = true; setFormat(f); setErrors(({ code: _gone, ...rest }) => rest); }}>{FORMAT_LABEL[f]}</button>
        ))}
      </div>
    </>
  );
```

3. In the JSX, right after the `{ocrNote && !reading && ocrDebugOn() && <OcrDebug />}` line, add the photo-first picker for receipts:

```tsx
        {isReceipt && <>{fromImage(photo ? 'Choose another photo' : 'Take or choose photo')}{keepSwitch}</>}
```

4. Change the store-name label text to `{isReceipt ? 'Shop or provider' : 'Store name'} {badge('name')}`.

5. Replace everything from `<div className="two">` (the Scan code / From image buttons) through the end of the `pills` div with:

```tsx
        {!isReceipt && (
          <>
            <div className="two">
              <button className="secondary" onClick={() => openOverlay('scan')}><Icon name="scan" size={20} />Scan code</button>
              {fromImage('From image')}
            </div>
            {keepSwitch}
            {codeFields}
          </>
        )}
```

6. After the `{kind === 'coupon' && (…)}` block, add:

```tsx
        {isReceipt && (
          <>
            <div className="two">
              <label className="field">
                <span className="field-label">Purchase date {badge('purchased')}</span>
                <input className={cls('purchased')} type="date" value={purchased} onChange={(e) => typed('purchased', setPurchased)(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Amount (Kč) {badge('amount')}</span>
                <input {...errProps('amount')} className={cls('amount')} inputMode="decimal" value={amount} onChange={(e) => typed('amount', setAmount)(e.target.value)} placeholder="e.g. 389,50" />
                {errText('amount')}
              </label>
            </div>
            <label className="field">
              <span className="field-label">Claim by (optional)</span>
              <input className="input" type="date" value={deadline} min={purchased || undefined} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <details className="more" open={!!code}>
              <summary>Barcode (optional)</summary>
              <button className="secondary" onClick={() => openOverlay('scan')}><Icon name="scan" size={20} />Scan code</button>
              {codeFields}
            </details>
          </>
        )}
```

7. In the note field's placeholder, use `kind === 'coupon' ? 'e.g. −20 % on fruit' : isReceipt ? 'e.g. For VZP, Dr. Novák' : 'e.g. Family card'`.

8. Append the CSS to `web/src/style.css`:

```css
.check { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; color: var(--soft-ink); }
.check input { width: 20px; height: 20px; accent-color: var(--accent); }
.more { display: flex; flex-direction: column; gap: 12px; }
.more summary { min-height: 44px; display: flex; align-items: center; font-size: 14px; font-weight: 600; color: var(--soft-ink); cursor: pointer; }
.more[open] > :not(summary) { margin-top: 12px; }
```

- [ ] **Step 8: Build and lint.**

Run: `npm run build && npm run lint && npm test`
Expected: clean, all tests pass.

- [ ] **Step 9: Check by hand in the browser preview.** Use `preview_start` with the `web` dev server from `.claude/launch.json`.
- Add → Receipt: the photo button is first, and the code sits in a collapsed "Barcode (optional)".
- Pick a receipt image: purchase date and amount fill in (with badges), and "Keep photo" is checked.
- Save with no code: it saves and returns to `/receipts`. In DevTools → Application → IndexedDB → `wallet-photos` → `photos`, a JPEG Blob is stored under the new id.
- An amount of `abc` shows "Enter an amount like 1 250,50" under the field.
- Add → Card → From image → save: the photo is stored. Unchecking "Keep photo" stores nothing.
- A card with an empty code still shows "Code is empty".

- [ ] **Step 10: Commit.**

```bash
git add web/src/screens/Add.tsx web/src/style.css
git commit -m "feat(web): add receipts with date, amount and claim deadline; keep the picked photo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Detail screen — Original photo row and viewer

**Files:**
- Modify: `web/src/screens/Detail.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/style.css`

**Interfaces:**
- Consumes:
  - `getPhoto`, `putPhoto`, `deletePhoto` and `shrinkPhoto` from `photos.ts`
  - `receiptFacts` from `logic.ts`
  - `ask` from `Dialog.tsx`
  - `openOverlay('photo')` / `closeOverlay` from `route.ts`
- Produces: `Detail` props `{ id: number; till: boolean; photoOpen: boolean }`

- [ ] **Step 1: Pass the overlay flag** in `web/src/App.tsx`:

```tsx
  if (id) return <Detail id={Number(id)} till={params.get('till') === '1'} photoOpen={params.get('photo') === '1'} />;
```

- [ ] **Step 2: Imports, props and photo state** in `web/src/screens/Detail.tsx`:

```ts
import { ask, askText, notify, toast } from '../Dialog';
import { FORMAT_LABEL, LINEAR, receiptFacts, statusChip, toDomain, validityLabel } from '../logic';
import { deletePhoto, getPhoto, putPhoto, shrinkPhoto } from '../photos';
```

```tsx
export default function Detail({ id, till, photoOpen }: { id: number; till: boolean; photoOpen: boolean }) {
```

After the `rev` state:

```tsx
  const [photo, setPhoto] = useState<string | null>(null); // object URL of the stored photo
  const [showPhoto, setShowPhoto] = useState(false); // the "Original photo" row is collapsed until tapped
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    let url: string | undefined;
    let gone = false;
    getPhoto(id).then((b) => { if (!gone && b) setPhoto(url = URL.createObjectURL(b)); else if (!gone) setPhoto(null); })
      .catch(() => { if (!gone) setPhoto(null); }); // unreadable = treated as none; "Add photo" replaces it
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [id, rev]);
```

Change the Esc effect so it also covers the photo viewer:

```tsx
  useEffect(() => {
    if (!till && !photoOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlay(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [till, photoOpen]);
  useEffect(() => { if (!photoOpen) setZoomed(false); }, [photoOpen]);
```

- [ ] **Step 3: Delete and Undo keep the photo; photo actions.** Replace `remove`, and add `pickPhoto` and `removePhoto`:

```tsx
  const remove = async () => {
    const blob = await getPhoto(item.id).catch(() => undefined); // held in memory for Undo
    deleteItem(item.id);
    deletePhoto(item.id).catch(() => {});
    back();
    toast(`Deleted ${item.name}`, 'Undo', () => {
      const newId = restoreItem(item);
      if (blob) putPhoto(newId, blob).catch(() => {});
      go(`/item/${newId}`);
    });
  };
  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    try { await putPhoto(item.id, await shrinkPhoto(f)); setShowPhoto(true); setRev((r) => r + 1); }
    catch { notify("The photo couldn't be saved."); }
  };
  const removePhoto = async () => {
    if (!(await ask('Remove the photo? The item stays.', 'Remove', true))) return;
    await deletePhoto(item.id).catch(() => {});
    setRev((r) => r + 1);
  };
  const photoInput = <input type="file" accept="image/*" className="sr-only" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />;
  const noCode = item.kind === 'receipt' && !item.code;
```

`setLogo` uses `setRev(rev + 1)`. Leave it as it is.

- [ ] **Step 4: Render.**

1. Replace the `.sub` line:

```tsx
          <div className="sub">{[item.note, receiptFacts(item), validityLabel(item)].filter(Boolean).join(' · ') || KIND_LABEL[item.kind]}</div>
```

2. Wrap the code card and the tip so a receipt without a code shows its photo instead:

```tsx
        {noCode ? (
          photo && (
            <button className="photo-card" aria-label="Show photo full screen" onClick={() => openOverlay('photo')}>
              <img src={photo} alt="" />
            </button>
          )
        ) : (
          <>
            <div className="code-card" role="button" tabIndex={0} aria-label="Show code full screen"
              onClick={() => openOverlay('till')} onKeyDown={(e) => { if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); openOverlay('till'); }}>
              <CodeView code={item.code} format={item.format} editHref={`#/edit/${item.id}`} />
              <p className="codetext">{item.code}</p>
              <span className="format-label">{FORMAT_LABEL[item.format]} · tap for full screen</span>
            </div>
            {showTip && <p className="tip"><Icon name="sun" /> Turn the screen brightness up if the till can't read it. The screen stays on while this is open.</p>}
          </>
        )}
```

3. Before `<div className="actions">`, add the photo row. It stays hidden until tapped. For a receipt without a code, the photo already shows above, so the row only has the actions:

```tsx
        {photo ? (
          <div className="photo-row">
            <button className="link-btn" aria-expanded={showPhoto || noCode} onClick={() => setShowPhoto(!showPhoto)}>
              Original photo <Icon name="chevron" size={18} />
            </button>
            {(showPhoto || noCode) && (
              <div className="photo-body">
                {!noCode && <button className="photo-thumb" aria-label="Show photo full screen" onClick={() => openOverlay('photo')}><img src={photo} alt="" /></button>}
                <div className="row">
                  <label className="secondary">Replace{photoInput}</label>
                  <button className="secondary danger-text" onClick={removePhoto}>Remove</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <label className="link-btn photo-add"><Icon name="image" size={18} />Add photo{photoInput}</label>
        )}
```

4. After the `{till && (…)}` block, add the viewer:

```tsx
      {photoOpen && photo && (
        <div className={'photo-view' + (zoomed ? ' zoomed' : '')} role="dialog" aria-modal="true" aria-label={`${item.name} photo`} onClick={closeOverlay}>
          <img src={photo} alt={`Photo of ${item.name}`} onClick={(e) => { e.stopPropagation(); setZoomed(!zoomed); }} />
        </div>
      )}
```

5. Append the CSS to `web/src/style.css`:

```css
.photo-row { display: flex; flex-direction: column; gap: 10px; }
.photo-row .link-btn, .photo-add { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; }
.photo-row .link-btn[aria-expanded="true"] svg { transform: rotate(180deg); }
.photo-body { display: flex; flex-direction: column; gap: 10px; }
.photo-body .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.photo-thumb, .photo-card { border: none; padding: 0; border-radius: 16px; overflow: hidden; background: var(--surface); box-shadow: var(--shadow); }
.photo-thumb img { display: block; width: 100%; max-height: 180px; object-fit: cover; }
.photo-card img { display: block; width: 100%; max-height: 50dvh; object-fit: contain; background: #fff; }
.photo-view { position: fixed; inset: 0; z-index: 50; background: #000; display: flex; align-items: center; justify-content: center; overflow: auto; }
.photo-view img { max-width: 100%; max-height: 100%; object-fit: contain; cursor: zoom-in; }
/* ponytail: tap toggles fit / full resolution with scrolling; real pinch-zoom only if this proves too clumsy */
.photo-view.zoomed { align-items: flex-start; justify-content: flex-start; }
.photo-view.zoomed img { max-width: none; max-height: none; cursor: zoom-out; }
```

- [ ] **Step 5: Build, lint and test.**

Run: `npm run build && npm run lint && npm test`
Expected: clean.

- [ ] **Step 6: Check by hand in the browser preview.**
- A card with a photo shows a collapsed "Original photo" row. Expand it to see a thumbnail; tapping it opens a black full-screen viewer. Tapping the image toggles the zoom, tapping the backdrop or pressing Back closes it, and Esc closes it on desktop.
- Replace swaps the photo. Remove asks first, then shows "Add photo".
- A receipt without a code shows its photo instead of the barcode card, plus the amount, purchase date and "Claim by …" under its name.
- Delete an item with a photo: its IndexedDB entry is gone. Undo restores the item with its photo.

- [ ] **Step 7: Commit.**

```bash
git add web/src/screens/Detail.tsx web/src/App.tsx web/src/style.css
git commit -m "feat(web): original photo on the detail screen, full-screen viewer, receipts without a code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Receipts list, backups with photos, photo usage

**Files:**
- Modify: `web/src/screens/Lists.tsx`
- Modify: `web/src/screens/Settings.tsx`

**Interfaces:**
- Consumes:
  - `formatAmount` from `logic.ts`
  - `exportBackup(withPhotos)`, `isZip`, `unzipBackup` and `applyImport(…).ids` from `backup.ts`
  - `clearPhotos`, `putPhoto` and `photoUsage` from `photos.ts`
  - `parseImport` from `logic.ts`

- [ ] **Step 1: Lists.** In `web/src/screens/Lists.tsx`:

1. Add `formatAmount` to the `../logic` import.
2. In `Row`, replace the note line:

```tsx
        {(item.amount != null || item.note) && <span className="sub">{[item.amount != null ? formatAmount(item.amount) : null, item.note].filter(Boolean).join(' · ')}</span>}
```

3. Replace `byExpiry`. Receipts without a deadline go after those with one, newest purchase first:

```ts
  const byExpiry = (a: Item, b: Item) =>
    (a.expires_at ?? Infinity) - (b.expires_at ?? Infinity) || (b.purchased_at ?? 0) - (a.purchased_at ?? 0);
```

(`Infinity - Infinity` is `NaN`, which is falsy, so `||` falls through to the purchase date.)

- [ ] **Step 2: Settings: imports and state.** In `web/src/screens/Settings.tsx`:

```ts
import { applyImport, exportBackup, isZip, lastExport, restoreBeforeReplace, savedBeforeReplace, unzipBackup } from '../backup';
import { clearPhotos, photoUsage, putPhoto } from '../photos';
```

Replace the `doExport` and `pending` lines:

```ts
  const doExport = async (withPhotos: boolean) => { if (await exportBackup(withPhotos)) setLast(lastExport()); };
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  useEffect(() => { photoUsage().then(setUsage).catch(() => {}); }, []);
  const [pending, setPending] = useState<{ items: NewItem[]; photos: (Uint8Array | null)[] | null; missing: number; fresh: number } | null>(null);
```

- [ ] **Step 3: Settings: reading a ZIP or JSON file.** Replace the body of `pick`'s `try` block:

```ts
      const bytes = new Uint8Array(await file.arrayBuffer());
      const zip = isZip(bytes) ? unzipBackup(bytes) : null;
      const items = zip ? zip.items : parseImport(new TextDecoder().decode(bytes));
      if (items.length) {
        setPending({ items, photos: zip?.photos ?? null, missing: zip?.missing ?? 0, fresh: dedupe(listItems(), items).length });
        setTimeout(() => panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      } else { setPending(null); show({ ok: false, title: 'This backup is empty.' }); }
```

- [ ] **Step 4: Settings: applying the photos.** Replace `run`:

```ts
  // Replace clears every stored photo (their items are gone); then each imported item gets its photo, if the zip had one.
  const run = async (mode: 'merge' | 'replace') => {
    const p = pending!;
    setPending(null); setConfirmReplace(false);
    const { added, skipped, ids } = applyImport(p.items, mode);
    let failed = p.missing;
    if (mode === 'replace') await clearPhotos().catch(() => {});
    for (const [i, data] of (p.photos ?? []).entries()) {
      if (!data || ids[i] == null) continue;
      await putPhoto(ids[i]!, new Blob([data], { type: 'image/jpeg' })).catch(() => { failed++; });
    }
    photoUsage().then(setUsage).catch(() => {});
    setBefore(savedBeforeReplace());
    const lost = failed ? `${failed} ${failed === 1 ? 'photo' : 'photos'} couldn't be restored.` : undefined;
    show(mode === 'replace'
      ? { ok: true, title: `Replaced your wallet with ${count(added)}.`, detail: lost, undo: savedBeforeReplace() != null }
      : added
        ? { ok: true, title: `Added ${count(added)}.`, detail: [skipped ? `${skipped} already in your wallet, skipped.` : '', lost ?? ''].filter(Boolean).join(' ') || undefined }
        : { ok: true, title: 'Nothing new.', detail: `All ${skipped} are already in your wallet.` });
  };
```

Update the replace confirmation text. Its `<p>` becomes:

```tsx
                <p>This deletes your {count(listItems().length)} and their photos, and loads {count(pending.items.length)} from the backup. You can restore the items (without photos) afterwards in Settings.</p>
```

- [ ] **Step 5: Settings: export buttons, accepting ZIPs, usage line.** In the Backup panel:

1. Replace the `.backup-status` paragraph:

```tsx
          <p className="backup-status">
            {last ? `Last backup: ${daysAgo(last)}` : 'No backup yet'}
            {usage && usage.count > 0 && ` · ${usage.count} ${usage.count === 1 ? 'photo' : 'photos'}, ${(usage.bytes / 1_048_576).toFixed(1)} MB`}
            {persisted === false && ' · This browser may clear your data when the phone runs low on space'}
          </p>
```

2. Replace the `<div className="two">` holding Export/Import with:

```tsx
          <div className="two">
            <button className="secondary" onClick={() => doExport(false)}><Icon name="download" size={20} />Export</button>
            {/* A filter is needed: without one Android offers photo/video capture and asks for camera and
                microphone. Generic types are included because Android often reports .json files as those. */}
            <label className="secondary">
              <Icon name="upload" size={20} />Import
              <input type="file" accept=".json,.zip,application/json,application/zip,text/plain,application/octet-stream" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          {usage && usage.count > 0 && (
            <button className="secondary" onClick={() => doExport(true)}><Icon name="download" size={20} />Export with photos (.zip)</button>
          )}
```

3. Change the panel's intro paragraph to: `Your cards, receipts and photos are stored only on this phone. Export a backup now and then, and keep it somewhere safe. Photos are only in the “with photos” backup, which contains your receipts in readable form.`

- [ ] **Step 6: Build, lint and test.**

Run: `npm run build && npm run lint && npm test`
Expected: clean.

- [ ] **Step 7: Check by hand in the browser preview.**
- There are 4 tabs, and Receipts lists rows with amount and deadline chip, soonest first. Receipts without a deadline come last, and receipts past their deadline sit under "Show expired".
- Settings shows "N photos, X MB". "Export with photos (.zip)" downloads a zip; opening it shows `wallet.json` and `photos/*.jpg`.
- Delete everything, import the zip, choose Replace: the items and photos come back. Merging the same zip again reports "Nothing new" and adds no photos.
- Import an old `.json` backup: it still works.

- [ ] **Step 8: Commit.**

```bash
git add web/src/screens/Lists.tsx web/src/screens/Settings.tsx
git commit -m "feat(web): receipts tab; export and import backups with photos; photo storage line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:**
  - Data model: Task 1. OCR: Task 2. Storage and persist: Task 3. Add: Task 4. Detail, viewer, delete/undo: Task 5. Lists, backups, usage: Tasks 3 and 6. Errors: Tasks 4, 5 and 6. Tests: Tasks 1–3.
- **Spec changes made while planning** (spec updated to match):
  - Receipt OCR parsing lives in `receipt-parse.ts` rather than `ocr-parse.ts`.
  - The viewer uses tap-to-zoom rather than pinch.
  - `dedupe` also compares amount and purchase date.
  - An unreadable photo is treated as missing ("Add photo").
  - Picking an image while editing replaces the stored photo.
  - The search-by-amount line is dropped (the receipts tab has no search).
