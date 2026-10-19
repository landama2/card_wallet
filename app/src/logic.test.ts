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
