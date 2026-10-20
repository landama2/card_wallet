// Turns OCR'd lines of a card/coupon screenshot into a best guess for the store name, its website,
// and a coupon's validity dates. Pure: no OCR engine here, so it is unit-tested with plain text.
import { toDomain } from './logic';

// Lines in reading order (top to bottom); height = line box height in px (bigger = more prominent).
export type OcrLine = { text: string; height: number };
export type OcrGuess = { name?: string; domain?: string; from?: string; until?: string }; // dates as YYYY-MM-DD

// One entry per OCR language. To add one, add a single entry: its Tesseract code (e.g. 'deu'), the
// words that introduce a start date, an end date or an issue/print date (ignored), month names
// (12 entries, every form a date may use), and generic coupon words that are never a store name.
export const OCR_LANGUAGES = [
  {
    code: 'ces',
    from: ['platí od', 'platnost od', 'platný od', 'platné od', 'od'],
    until: ['platí do', 'platnost do', 'platný do', 'platné do', 'do', 'nejpozději'],
    issued: ['vydáno', 'vystaveno', 'tisk', 'datum vystavení'],
    months: [
      ['leden', 'ledna'], ['únor', 'února'], ['březen', 'března'], ['duben', 'dubna'], ['květen', 'května'], ['červen', 'června'],
      ['červenec', 'července'], ['srpen', 'srpna'], ['září'], ['říjen', 'října'], ['listopad', 'listopadu'], ['prosinec', 'prosince'],
    ],
    generic: ['sleva', 'slevy', 'kupón', 'kupon', 'voucher', 'poukaz', 'poukázka', 'dárková', 'karta', 'akce', 'zdarma', 'platí', 'platnost', 'věrnostní'],
  },
  {
    code: 'eng',
    from: ['valid from', 'from', 'starts'],
    until: ['valid until', 'valid till', 'valid thru', 'valid through', 'expires', 'expiry', 'exp', 'until', 'till', 'use by'],
    issued: ['issued', 'printed', 'date of issue'],
    months: [
      ['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'], ['may'], ['june', 'jun'],
      ['july', 'jul'], ['august', 'aug'], ['september', 'sept', 'sep'], ['october', 'oct'], ['november', 'nov'], ['december', 'dec'],
    ],
    generic: ['coupon', 'voucher', 'discount', 'off', 'free', 'card', 'gift', 'loyalty', 'valid', 'offer', 'sale'],
  },
];

type Role = 'from' | 'until' | 'issued';
const ROLES: Role[] = ['until', 'from', 'issued'];

// Everything below is built once from OCR_LANGUAGES.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (list: string[]) => [...new Set(list)].sort((a, b) => b.length - a.length).map(esc).join('|');
const KEYWORDS = Object.fromEntries(ROLES.map((r) => [r, alt(OCR_LANGUAGES.flatMap((l) => l[r]))])) as Record<Role, string>;
// Keyword right before a date (allowing "Platí do: 31.10.") or anywhere in a line.
const KW_END = Object.fromEntries(ROLES.map((r) => [r, new RegExp(`(?:^|[^\\p{L}])(?:${KEYWORDS[r]})\\s*[:.]?\\s*$`, 'iu')])) as Record<Role, RegExp>;
const KW_ANY = new RegExp(`(?:^|[^\\p{L}])(?:${ROLES.map((r) => KEYWORDS[r]).join('|')})(?!\\p{L})`, 'iu');
const GENERIC = new Set(OCR_LANGUAGES.flatMap((l) => l.generic));
const MONTH_INDEX = new Map(OCR_LANGUAGES.flatMap((l) => l.months.flatMap((forms, i) => forms.map((f) => [f, i + 1] as const))));
const MONTHS = alt([...MONTH_INDEX.keys()]);

const roleBefore = (prefix: string): Role | null => ROLES.find((r) => KW_END[r].test(prefix)) ?? null;

// "1.–15. 11. 2026" and "1.11.-15.11.2026": two days (and months) sharing the year.
const RANGE = /(?<![\d.])(\d{1,2})\.(?:\s*(\d{1,2})\.)?\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4})(?!\d))?/g;
// "2026-10-31"
const ISO = /(?<![\d.])(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g;
// "31. října 2026", "31 October", "1 Nov."
const DAY_MONTH = new RegExp(`(?<![\\d.])(\\d{1,2})\\.?\\s*(${MONTHS})(?!\\p{L})\\.?(?:\\s*,?\\s*(\\d{4})(?!\\d))?`, 'giu');
// "Oct 31, 2026", "October 31"
const MONTH_DAY = new RegExp(`(?<!\\p{L})(${MONTHS})(?:\\.\\s*|\\s+)(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:\\s*,?\\s*(\\d{4})(?!\\d))?`, 'giu');
// "31.10.2026", "31. 10. 26", "31/10/26", "31.10." (without a year only with the trailing dot)
const DMY = /(?<![\d.])(\d{1,2})\s*([./-])\s*(\d{1,2})(?:\s*\2\s*(\d{4}|\d{2})(?!\d)|(\.))?(?!\d)/g;
// A "date" followed by a currency, hours or percent is a price / opening time / discount.
const NOT_A_DATE_AFTER = /^\s*(?:Kč|CZK|€|\$|£|,-|hod|h\b|%)/iu;

const DAY = 86_400_000;
const ymdOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function toYmd(d: number, m: number, y: number | undefined, now: number): string | null {
  let year = y ?? new Date(now).getFullYear();
  if (year < 100) year += 2000;
  const make = (yy: number) => new Date(yy, m - 1, d);
  let date = make(year);
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null; // 31.02. etc.
  if (y === undefined && date.getTime() < now - 31 * DAY) date = make(year + 1); // "do 15.1." seen in October = next January
  return ymdOf(date);
}

export type Hit = { date: string; role: Role | null };
// What the parser made of one line; filled only when a trace array is passed (developer panel).
export type LineTrace = { text: string; height: number; dates: Hit[]; domain: string | null; name: string | null };

function datesIn(text: string, now: number, pending: Role | null): Hit[] {
  const line = text.replace(/[–—]/g, '-');
  const found: { start: number; end: number; hits: Hit[] }[] = [];
  const add = (m: RegExpMatchArray, hits: (Hit | null)[]) => {
    const start = m.index!, end = start + m[0].length;
    if (hits.some((h) => !h) || found.some((f) => start < f.end && end > f.start)) return;
    if (NOT_A_DATE_AFTER.test(line.slice(end))) return;
    found.push({ start, end, hits: hits as Hit[] });
  };
  const free = (date: string | null): Hit | null => (date ? { date, role: null } : null);
  const year = (s: string | undefined) => (s ? Number(s) : undefined);

  for (const m of line.matchAll(RANGE)) {
    const y = year(m[5]), m2 = Number(m[4]), m1 = m[2] ? Number(m[2]) : m2;
    const a = toYmd(Number(m[1]), m1, y !== undefined && m1 > m2 ? y - 1 : y, now), b = toYmd(Number(m[3]), m2, y, now);
    add(m, [a ? { date: a, role: 'from' } : null, b ? { date: b, role: 'until' } : null]);
  }
  for (const m of line.matchAll(ISO)) add(m, [free(toYmd(Number(m[3]), Number(m[2]), Number(m[1]), now))]);
  for (const m of line.matchAll(DAY_MONTH)) add(m, [free(toYmd(Number(m[1]), MONTH_INDEX.get(m[2].toLowerCase())!, year(m[3]), now))]);
  for (const m of line.matchAll(MONTH_DAY)) add(m, [free(toYmd(Number(m[2]), MONTH_INDEX.get(m[1].toLowerCase())!, year(m[3]), now))]);
  for (const m of line.matchAll(DMY)) {
    // Without a year only Czech "31.10." (trailing dot) counts; a bare "10.10" or "8-12" is a price or hours.
    if (!m[4] && !(m[2] === '.' && m[5])) continue;
    add(m, [free(toYmd(Number(m[1]), Number(m[3]), year(m[4]), now))]);
  }

  found.sort((a, b) => a.start - b.start);
  const out: Hit[] = [];
  let prevEnd = 0;
  for (const [i, f] of found.entries()) {
    const role = roleBefore(line.slice(prevEnd, f.start)) ?? (i === 0 ? pending : null);
    prevEnd = f.end;
    if (role === 'issued') continue;
    out.push(...f.hits.map((h) => ({ ...h, role: h.role ?? role })));
  }
  return out;
}

const DOMAIN = /(?<![a-z0-9.-])(?:https?:\/\/)?(?:www\.)?[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,6}(?![a-z0-9-])/gi;
// Sites printed on coupons that are not the store's own.
const NOT_STORE = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'gmail.com', 'google.com', 'apple.com'];
const domainIn = (text: string) =>
  [...text.matchAll(DOMAIN)].map((m) => toDomain(m[0])).find((d) => d && !NOT_STORE.some((h) => d === h || d.endsWith('.' + h))) ?? null;

const titleCase = (t: string) =>
  t.split(' ').map((w) => ((w.match(/\p{L}/gu)?.length ?? 0) <= 4 ? w : w.toLowerCase().replace(/\p{L}/u, (c) => c.toUpperCase()))).join(' ');

function cleanName(text: string): string | null {
  if (KW_ANY.test(text) || /Kč|CZK|€|\$|£|,-/i.test(text) || text.search(DOMAIN) >= 0) return null;
  const t = text.replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const letters = t.match(/\p{L}/gu)?.length ?? 0, digits = t.match(/\d/g)?.length ?? 0;
  if (letters < 2 || letters / t.replace(/ /g, '').length < 0.5 || digits / (letters + digits) > 0.3 || t.length > 40) return null;
  const tokens = t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (tokens.every((w) => GENERIC.has(w) || /^\d+$/.test(w))) return null; // "SLEVA", "Dárková karta"
  return t === t.toUpperCase() ? titleCase(t) : t;
}

export function guessFromText(lines: OcrLine[], now = Date.now(), trace?: LineTrace[]): OcrGuess {
  const guess: OcrGuess = {};
  const hits: Hit[] = [];
  const names: { name: string; height: number }[] = [];
  let pending: Role | null = null; // keyword that ended the previous line, e.g. "Platí od" / "1.11.2026"
  for (const l of lines) {
    const dates = datesIn(l.text, now, pending);
    hits.push(...dates);
    pending = !dates.length ? roleBefore(l.text) : null;
    const domain = domainIn(l.text);
    if (domain && !guess.domain) guess.domain = domain;
    const name = !dates.length ? cleanName(l.text) : null;
    if (name) names.push({ name, height: l.height });
    trace?.push({ text: l.text, height: l.height, dates, domain, name });
  }
  // Among the tallest lines (within ~15%), the topmost: logos sit at the top.
  const tallest = Math.max(...names.map((n) => n.height));
  const name = names.find((n) => n.height >= tallest * 0.85)?.name;
  if (name) guess.name = name;
  else if (guess.domain) guess.name = guess.domain.replace(/\..*/, '').replace(/^./, (c) => c.toUpperCase());

  // Labelled dates win; unlabelled ones are used only without any, and not when long past (likely a print date).
  const labelled = hits.filter((h) => h.role);
  let from: string | undefined, until: string | undefined;
  if (labelled.length) {
    until = labelled.filter((h) => h.role === 'until').at(-1)?.date;
    from = labelled.find((h) => h.role === 'from')?.date;
  } else {
    const oldest = ymdOf(new Date(now - 31 * DAY));
    const free = hits.map((h) => h.date).filter((d) => d >= oldest).sort();
    until = free.at(-1);
    from = free.find((d) => d !== until);
  }
  if (until) guess.until = until;
  if (from && (!until || from <= until)) guess.from = from;
  // Re-order keys so results compare predictably in tests and logs.
  return Object.fromEntries((['name', 'domain', 'from', 'until'] as const).filter((k) => guess[k]).map((k) => [k, guess[k]]));
}
