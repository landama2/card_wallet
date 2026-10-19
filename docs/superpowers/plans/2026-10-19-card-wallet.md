# Card Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A personal Android app (Expo) that stores loyalty cards and expiring tickets as barcodes/QR codes and shows them full screen at a checkout.

**Architecture:** expo-router app with two tabs (Cards, Tickets). All pure logic (validation, archive derivation, reminder time, backup parsing) lives in `src/logic.ts` with no React Native imports so it is testable with plain Node. Everything else is thin glue over Expo modules: one SQLite table, local notifications, SVG barcodes via `bwip-js`.

**Tech Stack:** Expo (React Native, TypeScript), expo-router, expo-sqlite, expo-camera, expo-image-picker, expo-notifications, expo-brightness, expo-keep-awake, expo-file-system, expo-sharing, expo-document-picker, expo-share-intent, bwip-js, react-native-svg, `tsx` (test runner via `node:test`).

## Global Constraints

Copied from `docs/superpowers/specs/2026-10-19-card-wallet-design.md`:

- Android only, single user, sideloaded dev build. No accounts, no cloud, no server.
- Storage: expo-sqlite, one table `items`, no ORM.
- Archived is **derived** (`kind = 'ticket' AND expires_at < now`); no stored status flag, no background job.
- Supported formats: `qr, ean13, ean8, upc_a, code128, code39, pdf417, aztec, datamatrix`.
- Reminder: local notification at `expires_at - lead time`; lead time is global, default 1 day.
- Validate code against format before saving (EAN-13 / EAN-8 / UPC-A check digit).
- Expired date on a ticket: warn, but allow saving.
- Camera permission denied: fall back to manual entry.
- Malformed import JSON: reject with a message, change nothing.
- Testing: one small test file for pure logic only. No UI test framework.
- Out of scope: widget, app lock, cloud sync, per-ticket reminder time, auto-purge of archive.

## Deviations from spec (decided while planning, flag to user)

- **Shared PDFs are not decoded.** Expo has no PDF-to-image API; a shared PDF opens the Add screen with a message and manual entry. Shared images are decoded.
- **No edit screen in v1.** Items can be added and deleted. (Spec's "on edit" reminder cancel only applies to delete.)
- **`color` and `note` columns exist but have no UI** in v1.

## File Structure

All paths relative to `card_wallet_app/app/` (the Expo project; the repo root holds `docs/`).

| File | Responsibility |
|---|---|
| `src/logic.ts` | Types, format list, `isArchived`, `validateCode`, `reminderTime`, `serialize`, `parseImport`, `dedupe` |
| `src/logic.test.ts` | The one test file for the above |
| `src/db.ts` | SQLite open + CRUD |
| `src/reminders.ts` | Notification schedule/cancel, lead-time setting |
| `src/decode.ts` | Decode a code from an image file |
| `src/backup.ts` | Export/import JSON file |
| `src/CodeView.tsx` | Render a code as SVG |
| `src/Row.tsx` | List row |
| `app/_layout.tsx` | Root stack + share-intent handling |
| `app/(tabs)/_layout.tsx` | Tabs |
| `app/(tabs)/index.tsx` | Cards tab |
| `app/(tabs)/tickets.tsx` | Tickets tab |
| `app/add.tsx` | Add screen |
| `app/item/[id].tsx` | Full-screen detail |
| `app/settings.tsx` | Export / import / lead time |

---

### Task 1: Scaffold project and commit the spec

**Files:**
- Create: `app/` (Expo project), `app/app.json` (edited)
- Delete: `app/App.tsx`, `app/index.ts`

**Interfaces:**
- Produces: a runnable Expo TypeScript project in `app/` with all dependencies installed and `npm test` script.

- [ ] **Step 1: Commit the existing docs**

```bash
cd C:/Users/landa/personal/claude_stuff/card_wallet_app
git add docs
git commit -m "docs: add card wallet design spec and plan"
```

- [ ] **Step 2: Create the Expo project**

```bash
npx create-expo-app@latest app --template blank-typescript
ls -a app
```
Expected: project created. If `app/.git` exists, delete it (`rm -rf app/.git`); the repo root is the only git repo.

- [ ] **Step 3: Install dependencies**

```bash
cd app
npx expo install expo-router react-native-screens react-native-safe-area-context expo-linking expo-constants expo-status-bar expo-sqlite expo-camera expo-image-picker expo-notifications expo-brightness expo-keep-awake expo-file-system expo-sharing expo-document-picker react-native-svg @react-native-community/datetimepicker
npm install bwip-js expo-share-intent
npm install -D tsx
```

- [ ] **Step 4: Switch to expo-router entry**

```bash
rm App.tsx index.ts
```
In `app/package.json` set `"main": "expo-router/entry"` and add to `"scripts"`: `"test": "tsx --test src/logic.test.ts"`.

- [ ] **Step 5: Replace `app/app.json`**

```json
{
  "expo": {
    "name": "Card Wallet",
    "slug": "card-wallet",
    "version": "1.0.0",
    "scheme": "cardwallet",
    "orientation": "portrait",
    "android": { "package": "com.landa.cardwallet" },
    "plugins": [
      "expo-router",
      ["expo-camera", { "cameraPermission": "Scan loyalty card and ticket codes." }],
      "expo-notifications",
      ["expo-share-intent", { "androidIntentFilters": ["image/*", "application/pdf"] }]
    ]
  }
}
```
(Keep any extra keys the template generated that don't conflict, e.g. `icon`.)

- [ ] **Step 6: Create a minimal root layout so the project is valid**

Create `app/app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function Root() {
  return <Stack />;
}
```
Create `app/app/index.tsx`:

```tsx
import { Text } from 'react-native';

export default function Home() {
  return <Text>Card Wallet</Text>;
}
```
(`index.tsx` is deleted in Task 5 when the tabs group takes over.)

- [ ] **Step 7: Verify the TypeScript compiles**

Run (from `app/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd ..
git add app
git commit -m "chore: scaffold Expo project with dependencies"
```

---

### Task 2: Pure logic (TDD)

**Files:**
- Create: `app/src/logic.ts`
- Test: `app/src/logic.test.ts`

**Interfaces:**
- Produces (all exported from `src/logic.ts`):
  - `FORMATS: readonly Format[]`, `type Format = 'qr'|'ean13'|'ean8'|'upc_a'|'code128'|'code39'|'pdf417'|'aztec'|'datamatrix'`
  - `BCID: Record<Format, string>` (bwip-js symbology names)
  - `type Item = { id: number; kind: 'card'|'ticket'; name: string; code: string; format: Format; color: string|null; note: string|null; expires_at: number|null; notify_id: string|null; created_at: number }`
  - `type NewItem = Omit<Item, 'id'>`
  - `isArchived(item: Item, now?: number): boolean`
  - `validateCode(format: Format, code: string): string | null` (error message or null)
  - `reminderTime(expiresAt: number, leadMs: number, now: number): number | null`
  - `serialize(items: Item[]): string`
  - `parseImport(json: string): NewItem[]` (throws on bad input)
  - `dedupe(existing: Item[], incoming: NewItem[]): NewItem[]`

- [ ] **Step 1: Write the failing test**

Create `app/src/logic.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { Item, isArchived, validateCode, reminderTime, serialize, parseImport, dedupe } from './logic';

const base: Item = { id: 1, kind: 'ticket', name: 'Concert', code: 'ABC', format: 'qr', color: null, note: null, expires_at: 1000, notify_id: 'n1', created_at: 1 };

test('archive is derived from expiry; cards never archive', () => {
  assert.equal(isArchived(base, 2000), true);
  assert.equal(isArchived(base, 500), false);
  assert.equal(isArchived({ ...base, kind: 'card', expires_at: null }, 2000), false);
});

test('validateCode checks digits and check digit', () => {
  assert.equal(validateCode('ean13', '4006381333931'), null);
  assert.match(validateCode('ean13', '4006381333932')!, /Check digit/);
  assert.match(validateCode('ean13', '123')!, /13 digits/);
  assert.equal(validateCode('ean8', '96385074'), null);
  assert.equal(validateCode('upc_a', '036000291452'), null);
  assert.equal(validateCode('qr', 'anything'), null);
  assert.match(validateCode('qr', '')!, /empty/);
});

test('reminderTime is lead before expiry, or null if already past', () => {
  assert.equal(reminderTime(10_000, 1000, 5000), 9000);
  assert.equal(reminderTime(10_000, 1000, 9500), null);
});

test('export/import round trip, rejects garbage, dedupes', () => {
  const out = parseImport(serialize([base]));
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Concert');
  assert.equal(out[0].notify_id, null);
  assert.throws(() => parseImport('{not json'));
  assert.throws(() => parseImport('{"version":1,"items":[{"kind":"x"}]}'));
  assert.equal(dedupe([base], out).length, 0);
  assert.equal(dedupe([], out).length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `npm test`
Expected: FAIL, cannot find module `./logic`.

- [ ] **Step 3: Write the implementation**

Create `app/src/logic.ts`:

```ts
export const FORMATS = ['qr', 'ean13', 'ean8', 'upc_a', 'code128', 'code39', 'pdf417', 'aztec', 'datamatrix'] as const;
export type Format = (typeof FORMATS)[number];

export const BCID: Record<Format, string> = {
  qr: 'qrcode', ean13: 'ean13', ean8: 'ean8', upc_a: 'upca', code128: 'code128',
  code39: 'code39', pdf417: 'pdf417', aztec: 'azteccode', datamatrix: 'datamatrix',
};

export type Item = {
  id: number; kind: 'card' | 'ticket'; name: string; code: string; format: Format;
  color: string | null; note: string | null; expires_at: number | null;
  notify_id: string | null; created_at: number;
};
export type NewItem = Omit<Item, 'id'>;

export const isArchived = (i: Item, now = Date.now()) =>
  i.kind === 'ticket' && i.expires_at != null && i.expires_at < now;

function checkDigitOk(code: string) {
  const d = code.split('').map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const DIGITS: Partial<Record<Format, number>> = { ean13: 13, ean8: 8, upc_a: 12 };

export function validateCode(format: Format, code: string): string | null {
  if (!code) return 'Code is empty';
  const n = DIGITS[format];
  if (n) {
    if (!new RegExp(`^\\d{${n}}$`).test(code)) return `${format} needs exactly ${n} digits`;
    if (!checkDigitOk(code)) return 'Check digit is wrong';
  }
  return null;
}

export const reminderTime = (expiresAt: number, leadMs: number, now: number) => {
  const t = expiresAt - leadMs;
  return t > now ? t : null;
};

export const serialize = (items: Item[]) =>
  JSON.stringify({ version: 1, items: items.map(({ id, notify_id, ...rest }) => rest) }, null, 2);

export function parseImport(json: string): NewItem[] {
  const data = JSON.parse(json);
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error('Not a wallet backup');
  return data.items.map((x: any) => {
    const ok = (x.kind === 'card' || x.kind === 'ticket') && typeof x.name === 'string'
      && typeof x.code === 'string' && (FORMATS as readonly string[]).includes(x.format);
    if (!ok) throw new Error('Bad item in backup');
    return {
      kind: x.kind, name: x.name, code: x.code, format: x.format,
      color: x.color ?? null, note: x.note ?? null, expires_at: x.expires_at ?? null,
      notify_id: null, created_at: x.created_at ?? Date.now(),
    };
  });
}

export const dedupe = (existing: Item[], incoming: NewItem[]) =>
  incoming.filter((n) => !existing.some((e) => e.kind === n.kind && e.code === n.code && e.name === n.name));
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `npm test`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src
git commit -m "feat: pure logic for validation, archive, reminders, backup"
```

---

### Task 3: Database and reminders

**Files:**
- Create: `app/src/db.ts`, `app/src/reminders.ts`

**Interfaces:**
- Consumes: `Item`, `NewItem`, `reminderTime` from `./logic`.
- Produces:
  - `db.ts`: `listItems(): Item[]`, `getItem(id: number): Item | null`, `insertItem(i: NewItem): number` (new id), `setNotifyId(id: number, nid: string | null): void`, `deleteItem(id: number): void`, `deleteAll(): void`
  - `reminders.ts`: `DAY: number`, `getLead(): number`, `setLead(ms: number): void` (also reschedules all), `schedule(item: Item): Promise<void>`, `cancel(item: Item): Promise<void>`

- [ ] **Step 1: Create `app/src/db.ts`**

```ts
import * as SQLite from 'expo-sqlite';
import type { Item, NewItem } from './logic';

const db = SQLite.openDatabaseSync('wallet.db');
db.execSync(`CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT NOT NULL,
  code TEXT NOT NULL, format TEXT NOT NULL, color TEXT, note TEXT,
  expires_at INTEGER, notify_id TEXT, created_at INTEGER NOT NULL)`);

export const listItems = () => db.getAllSync<Item>('SELECT * FROM items ORDER BY created_at DESC');
export const getItem = (id: number) => db.getFirstSync<Item>('SELECT * FROM items WHERE id = ?', id);
export const insertItem = (i: NewItem) =>
  db.runSync(
    'INSERT INTO items (kind,name,code,format,color,note,expires_at,notify_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    i.kind, i.name, i.code, i.format, i.color, i.note, i.expires_at, i.notify_id, i.created_at,
  ).lastInsertRowId;
export const setNotifyId = (id: number, nid: string | null) =>
  db.runSync('UPDATE items SET notify_id = ? WHERE id = ?', nid, id);
export const deleteItem = (id: number) => db.runSync('DELETE FROM items WHERE id = ?', id);
export const deleteAll = () => db.runSync('DELETE FROM items');
```

- [ ] **Step 2: Create `app/src/reminders.ts`**

```ts
import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import { Item, reminderTime } from './logic';
import { listItems, setNotifyId } from './db';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
  }),
});

export const DAY = 86_400_000;
export const getLead = () => Number(Storage.getItemSync('lead_ms') ?? DAY);
export const setLead = (ms: number) => {
  Storage.setItemSync('lead_ms', String(ms));
  void rescheduleAll();
};

export async function schedule(item: Item) {
  if (item.kind !== 'ticket' || item.expires_at == null) return;
  const t = reminderTime(item.expires_at, getLead(), Date.now());
  if (t == null) return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT,
  });
  if (!(await Notifications.requestPermissionsAsync()).granted) return;
  const nid = await Notifications.scheduleNotificationAsync({
    content: { title: 'Ticket expiring soon', body: item.name },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(t), channelId: 'default' },
  });
  setNotifyId(item.id, nid);
}

export async function cancel(item: Item) {
  if (item.notify_id) await Notifications.cancelScheduledNotificationAsync(item.notify_id);
}

async function rescheduleAll() {
  for (const i of listItems()) {
    await cancel(i);
    setNotifyId(i.id, null);
    await schedule({ ...i, notify_id: null });
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run (from `app/`): `npx tsc --noEmit`
Expected: no errors. (If an Expo API signature differs in the installed SDK, adjust to the installed types; keep behavior identical.)

- [ ] **Step 4: Commit**

```bash
git add app/src
git commit -m "feat: sqlite storage and local reminders"
```

---

### Task 4: Code rendering and detail screen

**Files:**
- Create: `app/src/CodeView.tsx`, `app/app/item/[id].tsx`

**Interfaces:**
- Consumes: `BCID`, `Format`, `isArchived` from `./logic`; `getItem`, `deleteItem` from `./db`; `cancel` from `./reminders`.
- Produces: `CodeView` default export with props `{ code: string; format: Format }`; route `/item/<id>`.

- [ ] **Step 1: Create `app/src/CodeView.tsx`**

```tsx
import { Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import bwipjs from 'bwip-js';
import { BCID, Format } from './logic';

export default function CodeView({ code, format }: { code: string; format: Format }) {
  let xml: string;
  try {
    xml = bwipjs.toSVG({
      bcid: BCID[format], text: code, scale: 4, backgroundcolor: 'FFFFFF',
      paddingwidth: 10, paddingheight: 10,
    });
  } catch (e) {
    return <Text>Cannot render this code: {String(e)}</Text>;
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center' }}>
      <SvgXml xml={xml} width="100%" height="100%" />
    </View>
  );
}
```

- [ ] **Step 2: Check `bwip-js` resolves under Metro**

Run (from `app/`): `npx expo export --platform android 2>&1 | tail -20`
Expected: bundling succeeds. If it fails on Node modules (`zlib`, `fs`), change the import to the browser build: `import bwipjs from 'bwip-js/dist/bwip-js.mjs';` (add a `declare module 'bwip-js/dist/bwip-js.mjs';` line to a `app/src/types.d.ts`), then re-run. Delete the generated `app/dist/` afterwards.

- [ ] **Step 3: Create `app/app/item/[id].tsx`**

```tsx
import { useEffect } from 'react';
import { Alert, Button, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import CodeView from '../../src/CodeView';
import { getItem, deleteItem } from '../../src/db';
import { cancel } from '../../src/reminders';
import { isArchived } from '../../src/logic';

export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const item = getItem(Number(id));
  useKeepAwake();
  useEffect(() => {
    Brightness.setBrightnessAsync(1).catch(() => {});
    return () => { Brightness.restoreSystemBrightnessAsync().catch(() => {}); };
  }, []);

  if (!item) return <Text>Not found</Text>;

  const remove = () =>
    Alert.alert('Delete?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await cancel(item); deleteItem(item.id); router.back(); } },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 22, padding: 16 }}>{item.name}</Text>
      {isArchived(item) && <Text style={{ color: 'red', paddingHorizontal: 16 }}>Expired</Text>}
      <CodeView code={item.code} format={item.format} />
      <Text selectable style={{ textAlign: 'center', padding: 8 }}>{item.code}</Text>
      <Button title="Delete" color="red" onPress={remove} />
    </View>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run (from `app/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "feat: SVG code rendering and full-screen detail screen"
```

---

### Task 5: Tabs and lists

**Files:**
- Create: `app/src/Row.tsx`, `app/app/(tabs)/_layout.tsx`, `app/app/(tabs)/index.tsx`, `app/app/(tabs)/tickets.tsx`
- Modify: `app/app/_layout.tsx`
- Delete: `app/app/index.tsx`

**Interfaces:**
- Consumes: `listItems` from `../../src/db`; `Item`, `isArchived` from `../../src/logic`.
- Produces: `Row` default export with props `{ item: Item; dim?: boolean }`; links to `/add?kind=card|ticket` and `/settings` (built in Tasks 6 and 7).

- [ ] **Step 1: Create `app/src/Row.tsx`**

```tsx
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import type { Item } from './logic';

export default function Row({ item, dim }: { item: Item; dim?: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/item/${item.id}`)}
      style={{ padding: 16, borderBottomWidth: 1, borderColor: '#ddd', opacity: dim ? 0.4 : 1 }}
    >
      <Text style={{ fontSize: 18 }}>{item.name}</Text>
      {item.expires_at != null && <Text>{new Date(item.expires_at).toLocaleString()}</Text>}
    </Pressable>
  );
}
```

- [ ] **Step 2: Remove the placeholder home and create the tabs layout**

```bash
rm app/app/index.tsx
```
Create `app/app/(tabs)/_layout.tsx`:

```tsx
import { Link, Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerRight: () => <Link href="/settings" style={{ marginRight: 16 }}>Settings</Link> }}>
      <Tabs.Screen name="index" options={{ title: 'Cards' }} />
      <Tabs.Screen name="tickets" options={{ title: 'Tickets' }} />
    </Tabs>
  );
}
```

- [ ] **Step 3: Create the Cards tab, `app/app/(tabs)/index.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import Row from '../../src/Row';
import { listItems } from '../../src/db';
import type { Item } from '../../src/logic';

export default function Cards() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  useFocusEffect(useCallback(() => { setItems(listItems().filter((i) => i.kind === 'card')); }, []));
  const shown = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={{ flex: 1 }}>
      <TextInput placeholder="Search" value={q} onChangeText={setQ} style={{ padding: 12, borderBottomWidth: 1 }} />
      <FlatList data={shown} keyExtractor={(i) => String(i.id)} renderItem={({ item }) => <Row item={item} />} />
      <Link href={{ pathname: '/add', params: { kind: 'card' } }} style={{ padding: 16, textAlign: 'center' }}>+ Add card</Link>
    </View>
  );
}
```

- [ ] **Step 4: Create the Tickets tab, `app/app/(tabs)/tickets.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import Row from '../../src/Row';
import { listItems } from '../../src/db';
import { Item, isArchived } from '../../src/logic';

export default function Tickets() {
  const [items, setItems] = useState<Item[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  useFocusEffect(useCallback(() => { setItems(listItems().filter((i) => i.kind === 'ticket')); }, []));
  const now = Date.now();
  const active = items.filter((i) => !isArchived(i, now)).sort((a, b) => a.expires_at! - b.expires_at!);
  const archive = items.filter((i) => isArchived(i, now)).sort((a, b) => b.expires_at! - a.expires_at!);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView>
        {active.map((i) => <Row key={i.id} item={i} />)}
        <Button title={`${showArchive ? 'Hide' : 'Show'} archive (${archive.length})`} onPress={() => setShowArchive(!showArchive)} />
        {showArchive && archive.map((i) => <Row key={i.id} item={i} dim />)}
        {showArchive && archive.length === 0 && <Text style={{ padding: 16 }}>Archive is empty</Text>}
      </ScrollView>
      <Link href={{ pathname: '/add', params: { kind: 'ticket' } }} style={{ padding: 16, textAlign: 'center' }}>+ Add ticket</Link>
    </View>
  );
}
```

- [ ] **Step 5: Update the root layout, `app/app/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';

export default function Root() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add" options={{ title: 'Add' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="item/[id]" options={{ title: '' }} />
    </Stack>
  );
}
```

Note: the tabs header (with Settings link) is shown by the Tabs navigator itself, so the stack hides its own header for `(tabs)`.

- [ ] **Step 6: Verify it compiles**

Run (from `app/`): `npx tsc --noEmit`
Expected: no errors (the `/add` and `/settings` hrefs are untyped strings, so they compile before those screens exist).

- [ ] **Step 7: Commit**

```bash
git add app
git commit -m "feat: Cards and Tickets tabs with search and archive section"
```

---

### Task 6: Add screen (manual, scan, image import, expiry)

**Files:**
- Create: `app/src/decode.ts`, `app/app/add.tsx`

**Interfaces:**
- Consumes: `FORMATS`, `Format`, `validateCode`, `NewItem` from `../src/logic`; `insertItem`, `getItem` from `../src/db`; `schedule` from `../src/reminders`.
- Produces: `decodeImage(uri: string): Promise<{ code: string; format: Format } | null>`; route `/add` with params `kind` (`card`|`ticket`), `sharedPath?` (file path), `sharedMime?` (MIME type).

- [ ] **Step 1: Create `app/src/decode.ts`**

```ts
import { CameraView } from 'expo-camera';
import { FORMATS, Format } from './logic';

export async function decodeImage(uri: string): Promise<{ code: string; format: Format } | null> {
  const results = await CameraView.scanFromURLAsync(uri, [...FORMATS]);
  const r = results.find((x) => (FORMATS as readonly string[]).includes(x.type));
  return r ? { code: r.data, format: r.type as Format } : null;
}
```
If `scanFromURLAsync` is not on `CameraView` in the installed expo-camera, it is on `Camera` (`import { Camera } from 'expo-camera'`); check `node_modules/expo-camera/build/*.d.ts` and use whichever exists.

- [ ] **Step 2: Create `app/app/add.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Alert, Button, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { FORMATS, Format, validateCode } from '../src/logic';
import { getItem, insertItem } from '../src/db';
import { schedule } from '../src/reminders';
import { decodeImage } from '../src/decode';

export default function Add() {
  const { kind = 'card', sharedPath, sharedMime } =
    useLocalSearchParams<{ kind?: 'card' | 'ticket'; sharedPath?: string; sharedMime?: string }>();
  const router = useRouter();
  const [perm, requestPerm] = useCameraPermissions();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [format, setFormat] = useState<Format>('qr');
  const [expires, setExpires] = useState<Date | null>(null);
  const [scanning, setScanning] = useState(false);

  const importImage = async (uri: string) => {
    const r = await decodeImage(uri).catch(() => null);
    if (!r) return Alert.alert('No code found', 'Enter the code manually.');
    setCode(r.code);
    setFormat(r.format);
  };

  useEffect(() => {
    if (!sharedPath) return;
    if (sharedMime?.startsWith('image/')) void importImage(sharedPath);
    else Alert.alert('Cannot read this file', 'PDF codes cannot be decoded. Enter the code manually.');
  }, [sharedPath]);

  const startScan = async () => {
    if (!perm?.granted && !(await requestPerm()).granted) {
      return Alert.alert('Camera denied', 'Enter the code manually.');
    }
    setScanning(true);
  };

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (!r.canceled) await importImage(r.assets[0].uri);
  };

  const pickExpiry = () =>
    DateTimePickerAndroid.open({
      value: expires ?? new Date(), mode: 'date',
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        DateTimePickerAndroid.open({
          value: d, mode: 'time', is24Hour: true,
          onChange: (e2, t) => { if (e2.type === 'set' && t) setExpires(t); },
        });
      },
    });

  const doSave = async () => {
    const id = insertItem({
      kind, name: name.trim(), code: code.trim(), format, color: null, note: null,
      expires_at: kind === 'ticket' ? expires!.getTime() : null, notify_id: null, created_at: Date.now(),
    });
    await schedule(getItem(id)!);
    router.back();
  };

  const save = () => {
    if (!name.trim()) return Alert.alert('Name is required');
    const err = validateCode(format, code.trim());
    if (err) return Alert.alert('Invalid code', err);
    if (kind === 'ticket' && !expires) return Alert.alert('Pick an expiry date');
    if (kind === 'ticket' && expires!.getTime() < Date.now()) {
      return Alert.alert('Already expired', 'Save anyway?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: doSave },
      ]);
    }
    void doSave();
  };

  if (scanning) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: [...FORMATS] }}
          onBarcodeScanned={({ type, data }) => {
            if ((FORMATS as readonly string[]).includes(type)) {
              setCode(data); setFormat(type as Format); setScanning(false);
            }
          }}
        />
        <Button title="Cancel" onPress={() => setScanning(false)} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <TextInput placeholder="Name" value={name} onChangeText={setName} style={{ borderBottomWidth: 1 }} />
      <TextInput placeholder="Code / number" value={code} onChangeText={setCode} style={{ borderBottomWidth: 1 }} />
      <ScrollView horizontal>
        {FORMATS.map((f) => (
          <Pressable key={f} onPress={() => setFormat(f)} style={{ padding: 8, margin: 2, backgroundColor: f === format ? '#9cf' : '#eee' }}>
            <Text>{f}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {kind === 'ticket' && <Button title={expires ? expires.toLocaleString() : 'Pick expiry'} onPress={pickExpiry} />}
      <Button title="Scan with camera" onPress={startScan} />
      <Button title="Import from image" onPress={pickImage} />
      <Button title="Save" onPress={save} />
    </ScrollView>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run (from `app/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app
git commit -m "feat: add screen with scan, image import, manual entry, expiry"
```

---

### Task 7: Settings, backup and lead time

**Files:**
- Create: `app/src/backup.ts`, `app/app/settings.tsx`

**Interfaces:**
- Consumes: `listItems`, `insertItem`, `getItem`, `deleteAll` from `./db`; `serialize`, `parseImport`, `dedupe`, `NewItem` from `./logic`; `cancel`, `schedule`, `DAY`, `getLead`, `setLead` from `./reminders`.
- Produces: `exportBackup(): Promise<void>`, `pickBackup(): Promise<NewItem[] | null>` (null if user cancelled; throws on malformed file), `applyImport(items: NewItem[], mode: 'merge' | 'replace'): Promise<void>`; route `/settings`.

- [ ] **Step 1: Create `app/src/backup.ts`**

```ts
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { listItems, insertItem, getItem, deleteAll } from './db';
import { NewItem, serialize, parseImport, dedupe } from './logic';
import { cancel, schedule } from './reminders';

export async function exportBackup() {
  const f = new File(Paths.cache, 'wallet-backup.json');
  f.create({ overwrite: true });
  f.write(serialize(listItems()));
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json' });
}

export async function pickBackup(): Promise<NewItem[] | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (r.canceled) return null;
  return parseImport(await new File(r.assets[0].uri).text());
}

export async function applyImport(items: NewItem[], mode: 'merge' | 'replace') {
  if (mode === 'replace') {
    for (const i of listItems()) await cancel(i);
    deleteAll();
  }
  const toAdd = mode === 'merge' ? dedupe(listItems(), items) : items;
  for (const n of toAdd) await schedule(getItem(insertItem(n))!);
}
```
If the installed expo-file-system's `File` API differs (e.g. `text()` sync vs async, `create` options), adapt to the installed types; behavior stays the same.

- [ ] **Step 2: Create `app/app/settings.tsx`**

```tsx
import { useState } from 'react';
import { Alert, Button, Text, View } from 'react-native';
import { exportBackup, pickBackup, applyImport } from '../src/backup';
import { DAY, getLead, setLead } from '../src/reminders';

const LEADS = [['1 hour', DAY / 24], ['1 day', DAY], ['3 days', 3 * DAY]] as const;

export default function Settings() {
  const [lead, setLeadState] = useState(getLead());

  const doImport = async () => {
    try {
      const items = await pickBackup();
      if (!items) return;
      Alert.alert('Import', `${items.length} items found.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge', onPress: () => applyImport(items, 'merge') },
        { text: 'Replace all', style: 'destructive', onPress: () => applyImport(items, 'replace') },
      ]);
    } catch (e) {
      Alert.alert('Import failed', String(e));
    }
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Button title="Export backup" onPress={exportBackup} />
      <Button title="Import backup" onPress={doImport} />
      <Text style={{ marginTop: 16 }}>Remind me before a ticket expires:</Text>
      {LEADS.map(([label, ms]) => (
        <Button key={label} title={(lead === ms ? '● ' : '○ ') + label} onPress={() => { setLead(ms); setLeadState(ms); }} />
      ))}
    </View>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run (from `app/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app
git commit -m "feat: settings screen with backup export/import and reminder lead time"
```

---

### Task 8: Share intent and on-device verification

**Files:**
- Modify: `app/app/_layout.tsx`

**Interfaces:**
- Consumes: route `/add` params `kind`, `sharedPath`, `sharedMime` (Task 6).

- [ ] **Step 1: Handle incoming shares in `app/app/_layout.tsx`**

```tsx
import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { ShareIntentProvider, useShareIntent } from 'expo-share-intent';

function Routes() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (!hasShareIntent) return;
    const f = shareIntent.files?.[0];
    if (f) router.push({ pathname: '/add', params: { kind: 'ticket', sharedPath: f.path, sharedMime: f.mimeType } });
    resetShareIntent();
  }, [hasShareIntent]);
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add" options={{ title: 'Add' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="item/[id]" options={{ title: '' }} />
    </Stack>
  );
}

export default function Root() {
  return (
    <ShareIntentProvider>
      <Routes />
    </ShareIntentProvider>
  );
}
```
Shared files default to opening Add as a `ticket` (a share is most often a ticket); the Add screen has no kind switcher in v1. If the installed `expo-share-intent` exposes a different shape than `shareIntent.files[].path/mimeType`, follow its README.

- [ ] **Step 2: Verify it compiles and tests pass**

Run (from `app/`): `npx tsc --noEmit && npm test`
Expected: no TS errors, 4 tests pass.

- [ ] **Step 3: Build and install the dev build on the phone**

Prerequisite: Android Studio / Android SDK installed, phone connected with USB debugging on.

```bash
cd app
npx expo run:android
```
Expected: app builds, installs, launches showing Cards and Tickets tabs.

- [ ] **Step 4: Manual verification checklist (on device)**

Check each, fix anything that fails:
1. Add a card manually with `ean13` `4006381333931`: appears in Cards, tap shows a scannable barcode at full brightness; leaving the screen restores brightness.
2. Add card with `ean13` `4006381333932`: rejected with "Check digit is wrong".
3. Scan a real barcode with the camera: code and format filled in.
4. Import a screenshot containing a QR code from the gallery: code and format filled in.
5. Add a ticket expiring in ~2 minutes with lead set to 1 hour: no reminder scheduled (past); add one expiring in 2 days with lead 1 day: notification arrives ~1 day before (to test quickly, temporarily set a 1-hour lead and expiry in 61 minutes).
6. A ticket whose expiry has passed shows in the Archive section, greyed out, still opens.
7. Export backup, delete all, import with Replace: items return; malformed file shows "Import failed" and changes nothing.
8. Share an image with a code from the gallery to Card Wallet: Add screen opens with the code decoded. Share a PDF: message shown, manual entry.
9. Deny camera permission: Alert says to enter manually; app does not crash.

- [ ] **Step 5: Commit any fixes**

```bash
git add app
git commit -m "feat: handle shared images/PDFs; verified on device"
```

---

## Self-Review

- **Spec coverage:** stack/modules (Tasks 1, 3, 4, 6, 7, 8); data model and derived archive (2, 3, 5); Cards/Tickets tabs, Active/Archive (5); Add flows scan/manual/image/shared (6, 8); detail screen with brightness + keep-awake (4); reminders with global lead, default 1 day (3, 7); export/import merge/replace with rescheduling (7); validation, expired warning, camera denied, malformed import (2, 6, 7); one logic test file (2). Gaps by design are listed under "Deviations from spec".
- **Placeholders:** none; every code step has full code. The three "adapt if installed API differs" notes (expo-camera `scanFromURLAsync`, expo-file-system `File`, expo-share-intent shape, bwip-js import path) are version risks with a stated fallback, not missing content.
- **Type consistency:** `Item`/`NewItem` fields and function names (`insertItem`, `getItem`, `schedule`, `cancel`, `setLead`, `getLead`, `decodeImage`, `exportBackup`, `pickBackup`, `applyImport`) match across tasks.
