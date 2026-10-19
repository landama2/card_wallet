// Turns OCR'd lines of a card/coupon screenshot into a best guess for the store name, its website,
// and a coupon's validity dates. Pure: no OCR engine here, so it is unit-tested with plain text.
import { toDomain } from './logic';

export type OcrLine = { text: string; height: number }; // height = line box height in px (bigger = more prominent)
export type OcrGuess = { name?: string; domain?: string; from?: string; until?: string }; // dates as YYYY-MM-DD

// One entry per OCR language. To add one: its Tesseract code (e.g. 'deu') plus the words that
// introduce a start or end date on coupons in that language.
export const OCR_LANGUAGES = [
  { code: 'ces', from: ['platí od', 'platnost od', 'platný od', 'platné od', 'od'], until: ['platí do', 'platnost do', 'platný do', 'platné do', 'do', 'nejpozději'] },
  { code: 'eng', from: ['valid from', 'from', 'starts'], until: ['valid until', 'valid till', 'valid thru', 'valid through', 'expires', 'expiry', 'exp', 'until', 'till', 'use by'] },
];

const words = (pick: 'from' | 'until') => OCR_LANGUAGES.flatMap((l) => l[pick]).sort((a, b) => b.length - a.length);
const endsWithWord = (prefix: string, list: string[]) =>
  list.some((w) => new RegExp(`(?:^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:.]?\\s*$`, 'iu').test(prefix));
const FROM_WORDS = words('from');
const UNTIL_WORDS = words('until');

// "1.–15. 11. 2026": two days sharing month (and year).
const RANGE = /(?<!\d)(\d{1,2})\.\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4}))?/g;
// "2026-10-31"
const ISO = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g;
// "31.10.2026", "31. 10. 26", "31/10/26", "31.10." (year optional; trailing dot or a keyword needed without one)
const DMY = /(?<!\d)(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{4}|\d{2})(?!\d)|(\.))?/g;

const DAY = 86_400_000;

function toYmd(d: number, m: number, y: number | undefined, now: number): string | null {
  let year = y ?? new Date(now).getFullYear();
  if (year < 100) year += 2000;
  const make = (yy: number) => new Date(yy, m - 1, d);
  let date = make(year);
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null; // 31.02. etc.
  if (y === undefined && date.getTime() < now - 31 * DAY) date = make(year + 1); // "do 15.1." seen in October = next January
  return `${date.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

type Hit = { date: string; role: 'from' | 'until' | null };

function datesIn(text: string, now: number): Hit[] {
  const line = text.replace(/[–—]/g, '-');
  const found: { start: number; end: number; hits: Hit[]; weak?: boolean }[] = [];
  const taken = (s: number, e: number) => found.some((f) => s < f.end && e > f.start);
  for (const m of line.matchAll(RANGE)) {
    const y = m[4] ? Number(m[4]) : undefined;
    const a = toYmd(Number(m[1]), Number(m[3]), y, now), b = toYmd(Number(m[2]), Number(m[3]), y, now);
    if (a && b) found.push({ start: m.index, end: m.index + m[0].length, hits: [{ date: a, role: 'from' }, { date: b, role: 'until' }] });
  }
  for (const m of line.matchAll(ISO)) {
    const ymd = toYmd(Number(m[3]), Number(m[2]), Number(m[1]), now);
    if (ymd && !taken(m.index, m.index + m[0].length)) found.push({ start: m.index, end: m.index + m[0].length, hits: [{ date: ymd, role: null }] });
  }
  for (const m of line.matchAll(DMY)) {
    if (taken(m.index, m.index + m[0].length)) continue;
    const ymd = toYmd(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined, now);
    if (ymd) found.push({ start: m.index, end: m.index + m[0].length, hits: [{ date: ymd, role: null }], weak: !m[3] && !m[4] });
  }
  found.sort((a, b) => a.start - b.start);
  const out: Hit[] = [];
  let prevEnd = 0;
  for (const f of found) {
    const prefix = line.slice(prevEnd, f.start);
    const role = endsWithWord(prefix, UNTIL_WORDS) ? 'until' : endsWithWord(prefix, FROM_WORDS) ? 'from' : null;
    // A bare "10.10" with no year, no trailing dot and no keyword is more likely a price than a date.
    if (f.weak && !role) continue;
    out.push(...f.hits.map((h) => ({ ...h, role: h.role ?? role })));
    prevEnd = f.end;
  }
  return out;
}

const DOMAIN = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,6}(?![a-z0-9-])/gi;
const domainIn = (text: string) => [...text.matchAll(DOMAIN)].map((m) => toDomain(m[0])).find(Boolean) ?? null;

function cleanName(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const letters = t.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 2 || letters / t.replace(/ /g, '').length < 0.5 || t.length > 40) return null;
  const allCaps = t === t.toUpperCase();
  return allCaps ? t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, s, c) => s + c.toUpperCase()) : t;
}

export function guessFromText(lines: OcrLine[], now = Date.now()): OcrGuess {
  const guess: OcrGuess = {};
  const hits: Hit[] = [];
  let best: { name: string; height: number } | null = null;
  for (const l of lines) {
    const dates = datesIn(l.text, now);
    hits.push(...dates);
    const domain = domainIn(l.text);
    if (domain && !guess.domain) guess.domain = domain;
    const name = !dates.length && !domain ? cleanName(l.text) : null;
    if (name && (!best || l.height > best.height)) best = { name, height: l.height };
  }
  if (best) guess.name = best.name;

  const free = hits.filter((h) => !h.role).map((h) => h.date).sort();
  const until = hits.filter((h) => h.role === 'until').at(-1)?.date ?? free.at(-1);
  const from = hits.find((h) => h.role === 'from')?.date ?? free.filter((d) => d !== until)[0];
  if (until) guess.until = until;
  if (from && (!until || from <= until)) guess.from = from;
  // Re-order keys so results compare predictably in tests and logs.
  return Object.fromEntries((['name', 'domain', 'from', 'until'] as const).filter((k) => guess[k]).map((k) => [k, guess[k]]));
}
