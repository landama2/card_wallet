import { insertMany, listItems } from './db';
import { type NewItem, dedupe, serialize } from './logic';

export function exportBackup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([serialize(listItems())], { type: 'application/json' }));
  a.download = `wallet-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function applyImport(items: NewItem[], mode: 'merge' | 'replace') {
  const added = mode === 'merge' ? dedupe(listItems(), items) : items;
  insertMany(added, mode === 'replace');
  return { added: added.length, skipped: items.length - added.length };
}
