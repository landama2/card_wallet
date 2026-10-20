// The total and purchase date from OCR'd receipt lines. Pure, like ocr-parse.ts, so it's tested with plain text.
import { parseAmount } from './logic';

const TOTAL = /celkem|k úhradě|total|suma/i;
// Lines that also match TOTAL but are not the grand total: tax breakdown and subtotals; item counts
// ("Celkem položek: 5") only when the number has no decimals, so "Celkem 2 položky 389,00" still counts.
const NOT_TOTAL = /dph|vat|tax|subtotal|mezisoučet/i;
const COUNT = /položek|položky|items/i;
const NUMBER = /\d[\d  ]*(?:[.,]\d{1,2})?/g;
// "3.10.2026", "03. 10. 26"
const DATE = /(?<![\d.])(\d{1,2})\.[ ]?(\d{1,2})\.[ ]?(\d{4}|\d{2})(?!\d)/g;

export function guessReceipt(lines: string[], now = Date.now()): { amount?: number; purchased?: string } {
  const out: { amount?: number; purchased?: string } = {};
  for (const l of lines.filter((l) => TOTAL.test(l) && !NOT_TOTAL.test(l))) {
    const last = l.match(NUMBER)?.at(-1) ?? ''; // last number on the line: "Celkem 2 položky 389,00"
    const n = COUNT.test(l) && !/[.,]/.test(last) ? null : parseAmount(last);
    if (n != null) out.amount = n; // the last total line wins (after any subtotal)
  }
  for (const m of lines.join('\n').matchAll(DATE)) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3]) + (m[3].length === 2 ? 2000 : 0)];
    const date = new Date(y, mo - 1, d);
    if (date.getMonth() !== mo - 1 || date.getDate() !== d || date.getTime() > now) continue;
    out.purchased = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    break;
  }
  return out;
}
