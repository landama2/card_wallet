// Round-trip: render every format exactly as CodeView does (same bwip-js options), decode the
// image with zxing (the engine behind the app's fallback detector), and compare content + format.
// Also decodes real card images listed in test/fixtures/fixtures.json, if present.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import bwipjs from 'bwip-js';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { DETECTOR_FORMAT, fromDetector, renderOptions, type Format } from './logic';

const require = createRequire(import.meta.url);
prepareZXingModule({ overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) } });

// zxing names formats differently from BarcodeDetector; map back to ours.
const ZXING: Record<string, Format> = {
  QRCode: 'qr', EAN13: 'ean13', EAN8: 'ean8', UPCA: 'upc_a', Code128: 'code128',
  Code39: 'code39', PDF417: 'pdf417', Aztec: 'aztec', DataMatrix: 'datamatrix',
};

async function decode(image: Uint8Array) {
  // Same format list the app's detector asks for.
  const [r] = await readBarcodes(image, { formats: Object.keys(ZXING) as any, tryHarder: true, maxNumberOfSymbols: 1 });
  if (!r) return undefined;
  const format = ZXING[r.format] ?? r.format;
  // UPC-A is EAN-13 with a leading 0 (identical bars); zxing reports it as EAN-13 when both are allowed.
  if (format === 'ean13' && r.text.length === 13 && r.text.startsWith('0')) return { code: r.text.slice(1), format: 'upc_a' };
  return { code: r.text, format };
}

const CASES: [Format, string][] = [
  ['ean13', '4006381333931'],
  ['ean8', '96385074'],
  ['upc_a', '036000291452'],
  ['code128', 'CLUB-0042-xyz'],
  ['code128', '9780201379624'],
  ['code39', 'ABC-123 $/+%'],
  ['qr', '1234567890123'],
  ['qr', 'https://example.com/loyalty?id=8812&x=1'],
  ['qr', 'Žluťoučký kůň úpěl ďábelské ódy'],
  ['qr', 'x'.repeat(500)],
  ['pdf417', 'M1DOE/JOHN            E1A2B3C VIEFRALH 1234 123Y012A0001 100'],
  ['aztec', 'TICKET:2026-10-19:SEAT-12A'],
  ['aztec', 'Vstupenka Žižkov'],
  ['datamatrix', '(01)09506000134352(17)261231'],
  ['datamatrix', 'Plzeň č. 7'],
];

for (const [format, code] of CASES) {
  test(`round-trip ${format}: ${code.slice(0, 40)}`, async () => {
    const png = await bwipjs.toBuffer(renderOptions(code, format));
    assert.deepEqual(await decode(png), { code, format });
  });
}

test('every format name maps between zxing, BarcodeDetector and ours', () => {
  for (const f of Object.values(ZXING)) assert.equal(fromDetector(DETECTOR_FORMAT[f]), f);
});

// Real cards: test/fixtures/fixtures.json = [{ "file": "my-card.png", "format": "qr", "code": "..." }]
const FIXTURES = new URL('../test/fixtures/', import.meta.url);
const list = new URL('fixtures.json', FIXTURES);
if (existsSync(list)) {
  for (const f of JSON.parse(readFileSync(list, 'utf8')) as { file: string; format: Format; code: string }[]) {
    test(`fixture ${f.file}`, async () => {
      assert.deepEqual(await decode(readFileSync(new URL(f.file, FIXTURES))), { code: f.code, format: f.format });
    });
  }
}
