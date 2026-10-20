import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { insertMany, listItems } from './db';
import { type Item, type NewItem, NOT_A_BACKUP, dedupe, parseImport, serialize } from './logic';
import { getPhoto, listPhotoIds } from './photos';

const LAST = 'wallet.lastExport';
const SNOOZE = 'wallet.backupSnooze';
export const lastExport = (): number | null => Number(localStorage.getItem(LAST)) || null;
export const snoozedUntil = () => Number(localStorage.getItem(SNOOZE)) || 0;
export const snoozeBackup = () => localStorage.setItem(SNOOZE, String(Date.now() + 7 * 86_400_000));

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
    file = new File([zipBackup(items, photos) as Uint8Array<ArrayBuffer>], `${name}.zip`, { type: 'application/zip' });
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
  const photos = paths.map((p) => (typeof p === 'string' && Object.hasOwn(files, p) && files[p].length ? files[p] : null));
  return { items, photos, missing: paths.filter((p, i) => typeof p === 'string' && !photos[i]).length };
}

// The wallet from before the last Replace, until it's restored or replaced again.
const BEFORE = 'wallet.beforeReplace';
export const savedBeforeReplace = (): NewItem[] | null => {
  try { return JSON.parse(localStorage.getItem(BEFORE) ?? 'null'); } catch { return null; } // corrupt copy: treat as none
};
export function restoreBeforeReplace() {
  const items = savedBeforeReplace() ?? [];
  insertMany(items, true);
  localStorage.removeItem(BEFORE);
  return items.length;
}

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
