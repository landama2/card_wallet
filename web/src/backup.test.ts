import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory localStorage; modules are imported after it exists.
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() };
const { applyImport, restoreBeforeReplace, savedBeforeReplace } = await import('./backup');
const { insertItem, listItems, restoreItem } = await import('./db');

const n = (name: string) => ({ kind: 'card' as const, name, code: name, format: 'qr' as const, color: null, note: null, expires_at: null, valid_from: null, domain: null, notify_id: null, created_at: 1 });

test('replace saves the old wallet; restore brings it back and clears the copy', () => {
  localStorage.clear();
  insertItem(n('old'));
  applyImport([n('new')], 'replace');
  assert.equal(savedBeforeReplace()?.length, 1);
  assert.equal(restoreBeforeReplace(), 1);
  assert.deepEqual(listItems().map((i) => i.name), ['old']);
  assert.equal(savedBeforeReplace(), null);
});

test('replace into an empty wallet clears an older restore copy', () => {
  localStorage.clear();
  insertItem(n('old'));
  applyImport([n('a')], 'replace');
  localStorage.removeItem('wallet.items');
  applyImport([n('b')], 'replace');
  assert.equal(savedBeforeReplace(), null);
});

test('restoreItem keeps a free id and picks a new one when taken', () => {
  localStorage.clear();
  const id = insertItem(n('x'));
  const item = listItems()[0];
  localStorage.removeItem('wallet.items');
  assert.equal(restoreItem(item), id);
  localStorage.removeItem('wallet.items');
  insertItem(n('y')); // takes the same id
  const newId = restoreItem(item);
  assert.notEqual(newId, id);
  assert.equal(new Set(listItems().map((i) => i.id)).size, 2);
});
