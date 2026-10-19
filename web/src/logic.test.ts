import test from 'node:test';
import assert from 'node:assert/strict';
import { type Item, isArchived, isUpcoming, dayStart, dayEnd, toDateInput, validateCode, reminderTime, serialize, parseImport, dedupe, fromDetector } from './logic';

const base: Item = { id: 1, kind: 'ticket', name: 'Concert', code: 'ABC', format: 'qr', color: null, note: null, expires_at: 1000, valid_from: null, notify_id: 'n1', created_at: 1 };

test('coupon dates cover whole local days', () => {
  assert.equal(dayStart('2026-10-20'), new Date(2026, 9, 20).getTime());
  assert.equal(dayEnd('2026-10-31'), new Date(2026, 10, 1).getTime() - 1);
  assert.equal(toDateInput(dayStart('2026-01-05')), '2026-01-05');
  assert.equal(toDateInput(dayEnd('2026-12-31')), '2026-12-31');
});

test('coupon is upcoming before valid_from, valid through the last day, then archived', () => {
  const c: Item = { ...base, kind: 'coupon', valid_from: dayStart('2026-10-20'), expires_at: dayEnd('2026-10-31') };
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
  assert.equal(isUpcoming(c, at(2026, 10, 19, 23)), true);
  assert.equal(isUpcoming(c, at(2026, 10, 20, 0)), false);
  assert.equal(isArchived(c, at(2026, 10, 31, 23)), false);
  assert.equal(isArchived(c, at(2026, 11, 1, 0)), true);
  assert.equal(isUpcoming({ ...c, valid_from: null }, at(2026, 1, 1)), false);
});

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

test('coupons survive a backup round trip; old backups without valid_from still import', () => {
  const [c] = parseImport(serialize([{ ...base, kind: 'coupon', valid_from: 5, expires_at: 9 }]));
  assert.equal(c.kind, 'coupon');
  assert.equal(c.valid_from, 5);
  const [old] = parseImport('{"version":1,"items":[{"kind":"card","name":"A","code":"1","format":"qr"}]}');
  assert.equal(old.valid_from, null);
});

test('detector format names map to ours', () => {
  assert.equal(fromDetector('ean_13'), 'ean13');
  assert.equal(fromDetector('qr_code'), 'qr');
  assert.equal(fromDetector('data_matrix'), 'datamatrix');
  assert.equal(fromDetector('itf'), null);
});
