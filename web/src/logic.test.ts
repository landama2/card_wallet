import test from 'node:test';
import assert from 'node:assert/strict';
import { type Item, statusChip, storeHue, FORMAT_LABEL, FORMATS, toDomain, logoUrl, initialOf, isArchived, isUpcoming, dayStart, dayEnd, toDateInput, validateCode, reminderTime, serialize, parseImport, dedupe, fromDetector } from './logic';

const base: Item = { id: 1, kind: 'ticket', name: 'Concert', code: 'ABC', format: 'qr', color: null, note: null, expires_at: 1000, valid_from: null, domain: null, notify_id: 'n1', created_at: 1 };

test('store website input becomes a bare domain, or null if it is not one', () => {
  assert.equal(toDomain('tesco.cz'), 'tesco.cz');
  assert.equal(toDomain('  https://www.Tesco.cz/clubcard?x=1 '), 'tesco.cz');
  assert.equal(toDomain('http://shop.billa.cz:8080'), 'shop.billa.cz');
  assert.equal(toDomain('Tesco'), null);
  assert.equal(toDomain(''), null);
  assert.equal(toDomain('a b.cz'), null);
  assert.equal(logoUrl('tesco.cz'), 'https://www.google.com/s2/favicons?domain=tesco.cz&sz=128');
});

test('status chip: coupons by calendar day, tickets with time, cards none', () => {
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
  const fmt = (t: number) => toDateInput(t); // locale-free formatter for the test
  const now = at(2026, 10, 19, 10);
  const coupon = (from: string | null, until: string): Item => ({ ...base, kind: 'coupon', valid_from: from && dayStart(from), expires_at: dayEnd(until) });
  assert.deepEqual(statusChip(coupon('2026-11-01', '2026-11-30'), now, fmt), { text: 'From 2026-11-01', tone: 'upcoming' });
  assert.deepEqual(statusChip(coupon(null, '2026-10-19'), now, fmt), { text: 'Ends today', tone: 'soon' });
  assert.deepEqual(statusChip(coupon(null, '2026-10-20'), now, fmt), { text: 'Ends tomorrow', tone: 'soon' });
  assert.deepEqual(statusChip(coupon(null, '2026-10-22'), now, fmt), { text: 'Ends in 3 days', tone: 'soon' });
  assert.deepEqual(statusChip(coupon(null, '2026-10-23'), now, fmt), { text: 'Until 2026-10-23', tone: 'ok' });
  assert.deepEqual(statusChip(coupon(null, '2026-10-18'), now, fmt), { text: 'Expired 2026-10-18', tone: 'expired' });
  const ticket: Item = { ...base, expires_at: at(2026, 10, 20, 20) };
  assert.deepEqual(statusChip(ticket, now, fmt, (t) => fmt(t) + ' 20:00'), { text: 'Ends tomorrow, 2026-10-20 20:00', tone: 'soon' });
  assert.equal(statusChip({ ...base, kind: 'card', expires_at: null }, now, fmt), null);
});

test('store colour is stable per name and every format has a label', () => {
  assert.equal(storeHue('Tesco'), storeHue('Tesco'));
  assert.notEqual(storeHue('Tesco'), storeHue('Albert'));
  assert.ok(storeHue('Žabka') >= 0 && storeHue('Žabka') < 360);
  for (const f of FORMATS) assert.ok(FORMAT_LABEL[f]);
});

test('fallback tile uses the first letter, uppercased, including accents', () => {
  assert.equal(initialOf('tesco'), 'T');
  assert.equal(initialOf('  žabka'), 'Ž');
  assert.equal(initialOf(''), '?');
});

test('coupon dates cover whole local days', () => {
  assert.equal(dayStart('2026-10-20'), new Date(2026, 9, 20).getTime());
  assert.equal(dayEnd('2026-10-31'), new Date(2026, 10, 1).getTime() - 1);
  assert.equal(toDateInput(dayStart('2026-01-05')), '2026-01-05');
  assert.equal(toDateInput(dayEnd('2026-12-31')), '2026-12-31');
  for (const s of ['2026-03-29', '2026-10-25', '2028-02-29']) assert.equal(toDateInput(dayEnd(s)), s); // DST days, leap day
});

test('coupon is upcoming before valid_from, valid through the last day, then archived', () => {
  const c: Item = { ...base, kind: 'coupon', valid_from: dayStart('2026-10-20'), expires_at: dayEnd('2026-10-31') };
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
  assert.equal(isUpcoming(c, at(2026, 10, 19, 23)), true);
  assert.equal(isUpcoming(c, at(2026, 10, 20, 0)), false);
  assert.equal(isArchived(c, at(2026, 10, 31, 23)), false);
  assert.equal(isArchived(c, at(2026, 11, 1, 0)), true);
  assert.equal(isUpcoming({ ...c, valid_from: null }, at(2026, 1, 1)), false);
  const { valid_from, ...saved_before_coupons } = c; // old storage has no valid_from key at all
  assert.equal(isUpcoming(saved_before_coupons as Item, at(2026, 1, 1)), false);
  assert.equal(isArchived({ ...c, expires_at: null }, at(2030, 1, 1)), false);
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
  assert.throws(() => parseImport('{not json'), /isn't a wallet backup/);
  assert.throws(() => parseImport('{"version":1,"items":[{"kind":"x"}]}'), /Item 1 .* incomplete/);
  assert.equal(dedupe([base], out).length, 0);
  assert.equal(dedupe([], out).length, 1);
});

test('coupons survive a backup round trip; old backups without valid_from still import', () => {
  const [c] = parseImport(serialize([{ ...base, kind: 'coupon', valid_from: 5, expires_at: 9 }]));
  assert.equal(c.kind, 'coupon');
  assert.equal(c.valid_from, 5);
  const [old] = parseImport('{"version":1,"items":[{"kind":"card","name":"A","code":"1","format":"qr"}]}');
  assert.equal(old.valid_from, null);
  assert.equal(old.domain, null);
  assert.equal(parseImport(serialize([{ ...base, domain: 'tesco.cz' }]))[0].domain, 'tesco.cz');
  assert.equal(parseImport('{"version":1,"items":[{"kind":"card","name":"A","code":"1","format":"qr","domain":"not a domain"}]}')[0].domain, null);
});

test('detector format names map to ours', () => {
  assert.equal(fromDetector('ean_13'), 'ean13');
  assert.equal(fromDetector('qr_code'), 'qr');
  assert.equal(fromDetector('data_matrix'), 'datamatrix');
  assert.equal(fromDetector('itf'), null);
});
