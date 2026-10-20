import { insertMany, listItems } from './db';
import { type NewItem, dedupe, serialize } from './logic';

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

export function applyImport(items: NewItem[], mode: 'merge' | 'replace') {
  if (mode === 'replace') {
    const before = listItems().map(({ id, ...rest }) => rest);
    if (before.length) localStorage.setItem(BEFORE, JSON.stringify(before));
    else localStorage.removeItem(BEFORE); // an empty wallet has nothing to restore, and an older copy would be unrelated
  }
  const added = mode === 'merge' ? dedupe(listItems(), items) : items;
  insertMany(added, mode === 'replace');
  return { added: added.length, skipped: items.length - added.length };
}
