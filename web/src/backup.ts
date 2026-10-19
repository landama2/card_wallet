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
  insertMany(mode === 'merge' ? dedupe(listItems(), items) : items, mode === 'replace');
}
