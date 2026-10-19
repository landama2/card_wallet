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

test('prices, times, card numbers and impossible dates are not dates', () => {
  assert.deepEqual(guessFromText([L('Cena 10.10 Kč, otevřeno 8:30'), L('4006381333931'), L('31.02.2026')], NOW), { name: 'Cena 10.10 Kč, otevřeno 8:30' });
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
