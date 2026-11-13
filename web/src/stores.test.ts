import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, STORES, findStore, searchStores } from './stores';
import { FORMATS, toDomain } from './logic';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('every store colour keeps white text readable and every format is real', () => {
  for (const s of Object.values(STORES).flat()) {
    assert.match(s.color, /^#[0-9a-f]{6}$/, s.name);
    assert.ok(1.05 / (lum(s.color) + 0.05) >= 4.5, `${s.name} ${s.color} is too light for white text`);
    assert.ok(FORMATS.includes(s.format), s.name);
    assert.ok(CATEGORIES.includes(s.cat), s.name);
    if (s.domain) assert.equal(toDomain(s.domain), s.domain, s.name);
  }
});

test('findStore ignores case, accents and punctuation, and knows aliases', () => {
  assert.equal(findStore('albert')?.name, 'Albert');
  assert.equal(findStore('  MŮJ ALBERT ')?.name, 'Albert');
  assert.equal(findStore('Bata')?.name, 'Baťa');
  assert.equal(findStore('dr max')?.name, 'Dr. Max');
  assert.equal(findStore('Lidl Plus')?.format, 'qr');
  assert.equal(findStore('Corner shop'), null);
});

test('searchStores matches the start of any word, across words, ignoring accents', () => {
  const names = (q: string) => searchStores(q).map((s) => s.name);
  assert.deepEqual(names('kn'), ['Knihy Dobrovský', 'Knihy BASIC']);
  assert.ok(names('dobro').includes('Knihy Dobrovský'));
  assert.ok(names('clubcard').includes('Tesco')); // alias
  assert.ok(names('drma').includes('Dr. Max')); // across "Dr. Max"
  assert.ok(names('drac').includes('Dráčik'));
  assert.ok(!names('esco').includes('Tesco')); // not mid-word
  assert.equal(searchStores('').length, Object.values(STORES).flat().length);
});
