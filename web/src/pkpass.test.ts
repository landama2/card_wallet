import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { parsePkpass } from './pkpass';

test('pkpass: barcode, kind, name, date and strip image come from the zip', () => {
  const pass = { organizationName: 'CD', description: 'Train ticket', eventTicket: {}, relevantDate: '2026-12-01T08:30+01:00',
    barcodes: [{ format: 'PKBarcodeFormatAztec', message: 'ABC123' }] };
  const r = parsePkpass(zipSync({ 'pass.json': strToU8('﻿' + JSON.stringify(pass)), 'strip.png': new Uint8Array([1]), 'icon.png': new Uint8Array([2]) }));
  assert.deepEqual({ ...r, image: r.image?.size }, {
    name: 'CD', note: 'Train ticket', kind: 'ticket', code: { code: 'ABC123', format: 'aztec' }, date: Date.parse('2026-12-01T07:30Z'), image: 1,
  });
});

test('pkpass: old single barcode, no date, and a zip without pass.json throws', () => {
  const r = parsePkpass(zipSync({ 'pass.json': strToU8(JSON.stringify({ organizationName: 'Shop', storeCard: {}, barcode: { format: 'PKBarcodeFormatQR', message: '9' } })) }));
  assert.equal(r.kind, 'card'); assert.deepEqual(r.code, { code: '9', format: 'qr' }); assert.equal(r.date, null); assert.equal(r.image, null);
  assert.throws(() => parsePkpass(zipSync({ 'a.txt': strToU8('x') })));
});
