import test from 'node:test';
import assert from 'node:assert/strict';
import { guessFromText, type OcrLine } from './ocr-parse';

const NOW = new Date(2026, 9, 19).getTime(); // 2026-10-19
const L = (text: string, height = 20): OcrLine => ({ text, height });

test('Czech coupon with "platí od / do" and full dates', () => {
  const g = guessFromText([L('ALBERT', 60), L('Sleva 20 % na ovoce'), L('Platí od 20. 10. 2026 do 31. 10. 2026'), L('www.albert.cz')], NOW);
  assert.deepEqual(g, { name: 'Albert', domain: 'albert.cz', from: '2026-10-20', until: '2026-10-31' });
});

test('Czech day range sharing month and year: "1.–15. 11. 2026"', () => {
  assert.deepEqual(guessFromText([L('Akce platí 1.–15. 11. 2026')], NOW), { from: '2026-11-01', until: '2026-11-15' });
});

test('English coupon: "Valid until 31/12/26" and an email domain', () => {
  const g = guessFromText([L('Pizza Hut', 48), L('2 for 1 on Tuesdays'), L('Valid until 31/12/26'), L('help@pizzahut.co.uk')], NOW);
  assert.deepEqual(g, { name: 'Pizza Hut', domain: 'pizzahut.co.uk', until: '2026-12-31' });
});

test('date without a year: this year, or next year if it already passed', () => {
  assert.equal(guessFromText([L('platí do 31.10.')], NOW).until, '2026-10-31');
  assert.equal(guessFromText([L('platí do 15.1.')], NOW).until, '2027-01-15');
});

test('ISO date and two unlabelled dates become from/until in order', () => {
  assert.deepEqual(guessFromText([L('2026-11-30'), L('2026-11-01')], NOW), { from: '2026-11-01', until: '2026-11-30' });
});

test('prices, times, card numbers and impossible dates are not dates (nor names)', () => {
  assert.deepEqual(guessFromText([L('Cena 10.10 Kč, otevřeno 8:30'), L('4006381333931'), L('31.02.2026')], NOW), {});
});

test('"d.m.-d.m.yyyy" range: "Platnost 1.11.-15.11.2026"', () => {
  assert.deepEqual(guessFromText([L('Platnost 1.11.-15.11.2026')], NOW), { from: '2026-11-01', until: '2026-11-15' });
  assert.deepEqual(guessFromText([L('Platnost 20.12.-5.1.2027')], NOW), { from: '2026-12-20', until: '2027-01-05' });
});

test('"od"/"do" before a price or opening hours is not a date', () => {
  assert.deepEqual(guessFromText([L('Cena od 10.10 Kč')], NOW), {});
  assert.deepEqual(guessFromText([L('Otevřeno od 8-12 hod')], NOW), {});
  assert.deepEqual(guessFromText([L('Sleva do 31.10. Kč')], NOW), {});
});

test('issue/print dates are ignored; labelled dates win over unlabelled ones', () => {
  assert.deepEqual(guessFromText([L('Vydáno 3.9.2025'), L('Platí do 31.10.2026')], NOW), { until: '2026-10-31' });
  assert.deepEqual(guessFromText([L('Tisk 3.9.2026')], NOW), {});
  assert.deepEqual(guessFromText([L('Issued 01/09/2026'), L('Valid until 31/12/26')], NOW), { until: '2026-12-31' });
  assert.deepEqual(guessFromText([L('Platí do 31.10.2026'), L('2026-11-05')], NOW), { until: '2026-10-31' });
});

test('an unlabelled date long in the past is not a validity date', () => {
  assert.deepEqual(guessFromText([L('3.9.2025')], NOW), {});
});

test('keyword at the end of one line applies to the first date on the next', () => {
  assert.deepEqual(guessFromText([L('Platí od'), L('1.11.2026')], NOW), { from: '2026-11-01' });
  assert.deepEqual(guessFromText([L('Valid until:'), L('2026-12-24'), L('2026-11-01')], NOW), { until: '2026-12-24' });
});

test('month names in Czech and English, year optional', () => {
  assert.equal(guessFromText([L('Platí do 31. října 2026')], NOW).until, '2026-10-31');
  assert.equal(guessFromText([L('31 October 2026')], NOW).until, '2026-10-31');
  assert.equal(guessFromText([L('Expires Oct 31, 2026')], NOW).until, '2026-10-31');
  assert.equal(guessFromText([L('platí do 15. ledna')], NOW).until, '2027-01-15');
  assert.deepEqual(guessFromText([L('Valid from 1 Nov until 30 November 2026')], NOW), { from: '2026-11-01', until: '2026-11-30' });
  assert.deepEqual(guessFromText([L('31. 10.')], NOW), { until: '2026-10-31' });
});

test('generic coupon words are not a store name', () => {
  assert.equal(guessFromText([L('SLEVA', 80), L('Albert', 40)], NOW).name, 'Albert');
  assert.equal(guessFromText([L('DÁRKOVÁ KARTA', 80), L('Gift card', 70), L('Lidl', 40)], NOW).name, 'Lidl');
});

test('lines with a validity keyword are not a store name', () => {
  assert.equal(guessFromText([L('Platí do konce roku', 60), L('Billa', 40)], NOW).name, 'Billa');
});

test('among similarly tall lines the topmost wins', () => {
  assert.equal(guessFromText([L('Kaufland', 50), L('Lidl', 55)], NOW).name, 'Kaufland');
});

test('short all-caps acronyms stay uppercase', () => {
  assert.equal(guessFromText([L('IKEA', 60)], NOW).name, 'IKEA');
  assert.equal(guessFromText([L('H&M', 60)], NOW).name, 'H&M');
  assert.equal(guessFromText([L('KFC', 60)], NOW).name, 'KFC');
});

test('no name line: fall back to the domain', () => {
  assert.deepEqual(guessFromText([L('www.albert.cz')], NOW), { name: 'Albert', domain: 'albert.cz' });
});

test('domain: skips social hosts and dotted dates', () => {
  assert.equal(guessFromText([L('www.facebook.com/tesco'), L('tesco.cz')], NOW).domain, 'tesco.cz');
  assert.equal(guessFromText([L('Sleva 31.10.2026.sleva na')], NOW).domain, undefined);
  assert.equal(guessFromText([L('Get the app: play.google.com')], NOW).domain, undefined);
});

test('name is the tallest mostly-letter line, not numbers or barcode noise', () => {
  const g = guessFromText([L('|||| ||| |', 80), L('1234 5678 9012', 70), L('TESCO', 50), L('Clubcard', 30)], NOW);
  assert.equal(g.name, 'Tesco');
});

test('keeps accents and multi-word names; ignores "s.r.o." as a domain', () => {
  const g = guessFromText([L('ŽABKA ČESKÁ REPUBLIKA', 40), L('Žabka Česká republika s.r.o.')], NOW);
  assert.deepEqual(g, { name: 'Žabka Česká Republika' });
});

test('nothing recognisable gives an empty guess', () => {
  assert.deepEqual(guessFromText([], NOW), {});
  assert.deepEqual(guessFromText([L('12 34'), L('!!!')], NOW), {});
});

test('trace explains each line', () => {
  const trace: import('./ocr-parse').LineTrace[] = [];
  guessFromText([L('ALBERT', 60), L('Platí do 31. 10. 2026'), L('www.albert.cz')], NOW, trace);
  assert.deepEqual(trace.map((t) => [t.name, t.dates.map((d) => `${d.role} ${d.date}`), t.domain]), [
    ['Albert', [], null], [null, ['until 2026-10-31'], null], [null, [], 'albert.cz'],
  ]);
});
