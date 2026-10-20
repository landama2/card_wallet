import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory localStorage; modules are imported after it exists.
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() };
const { applyImport, isZip, restoreBeforeReplace, savedBeforeReplace, unzipBackup, zipBackup } = await import('./backup');
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

test('savedBeforeReplace is null when the stored copy is corrupt', () => {
  localStorage.clear();
  localStorage.setItem('wallet.beforeReplace', '{bad');
  assert.equal(savedBeforeReplace(), null);
});

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

test('a photo path naming an inherited key like "constructor" is treated as missing', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  const json = JSON.stringify({ version: 1, items: [{ ...n('x'), photo: 'constructor' }] });
  const r = unzipBackup(zipSync({ 'wallet.json': strToU8(json) }));
  assert.equal(r.photos[0], null);
  assert.equal(r.missing, 1);
});
