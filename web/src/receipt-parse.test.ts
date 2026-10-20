import test from 'node:test';
import assert from 'node:assert/strict';
import { guessReceipt } from './receipt-parse';

const NOW = new Date(2026, 9, 20).getTime(); // 2026-10-20

test('Czech pharmacy receipt: "Celkem k úhradě" and a d.m.yyyy date', () => {
  const lines = ['Dr. Max Lékárna', 'IČ: 12345678', 'Ibalgin 400 1x 89,00', 'Celkem k úhradě 1 250,50 Kč', 'Datum: 3.10.2026 14:22'];
  assert.deepEqual(guessReceipt(lines, NOW), { amount: 1250.5, purchased: '2026-10-03' });
});

test('the last total line wins over a subtotal; spaced date with two-digit year', () => {
  const lines = ['Subtotal 300,00', 'TOTAL 389.00 CZK', 'Date 03. 10. 26'];
  assert.deepEqual(guessReceipt(lines, NOW), { amount: 389, purchased: '2026-10-03' });
});

test('tax breakdown and item-count lines after the total are not the total', () => {
  const lines = ['Celkem k úhradě 1 250,50 Kč', 'Celkem DPH 217,44', 'Celkem položek: 5', 'Datum 3.10.2026'];
  assert.deepEqual(guessReceipt(lines, NOW), { amount: 1250.5, purchased: '2026-10-03' });
});

test('future and impossible dates are skipped; no total means no amount', () => {
  assert.deepEqual(guessReceipt(['Platnost do 31.12.2026', '31.02.2026', 'Vystaveno 1.9.2026'], NOW), { purchased: '2026-09-01' });
  assert.deepEqual(guessReceipt(['Hello', 'Suma'], NOW), {});
});
