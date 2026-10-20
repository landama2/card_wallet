export const FORMATS = ['qr', 'ean13', 'ean8', 'upc_a', 'code128', 'code39', 'pdf417', 'aztec', 'datamatrix'] as const;
export type Format = (typeof FORMATS)[number];

export const BCID: Record<Format, string> = {
  qr: 'qrcode', ean13: 'ean13', ean8: 'ean8', upc_a: 'upca', code128: 'code128',
  code39: 'code39', pdf417: 'pdf417', aztec: 'azteccode', datamatrix: 'datamatrix',
};

// bwip-js options used to draw a code; shared by CodeView and the barcode round-trip tests.
export const renderOptions = (code: string, format: Format) => ({
  bcid: BCID[format], text: code, scale: 4, paddingwidth: 10, paddingheight: 10, backgroundcolor: 'FFFFFF',
});

export const KINDS = ['card', 'ticket', 'coupon', 'receipt'] as const;
export type Kind = (typeof KINDS)[number];

// Coupons: valid_from = start of the first day, expires_at = end of the last day (local time).
// Receipts: expires_at = end of the claim deadline day (optional), purchased_at = start of the purchase day.
// valid_from is null for cards, tickets, receipts and coupons without a start date (and in items saved before coupons existed).
export type Item = {
  id: number; kind: Kind; name: string; code: string; format: Format;
  color: string | null; note: string | null; expires_at: number | null; valid_from: number | null;
  domain: string | null; // store website, e.g. 'tesco.cz'; drives the logo. Missing in items saved before logos.
  last_used_at?: number | null; // when its detail screen was last opened; missing in items saved before this
  purchased_at?: number | null; amount?: number | null; // receipts only (CZK); missing in items saved before receipts
  notify_id: string | null; created_at: number;
};

// 'https://www.Tesco.cz/club?x' -> 'tesco.cz'; null when the input isn't a domain.
export function toDomain(s: string): string | null {
  const host = s.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#:]/)[0].replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

// ponytail: Google's public favicon service; tells Google which store domains you have. Self-host icons if that matters.
export const logoUrl = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

export const initialOf = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '?';
export type NewItem = Omit<Item, 'id'>;

export const isArchived = (i: Item, now = Date.now()) =>
  i.kind !== 'card' && i.expires_at != null && i.expires_at < now;

export const isUpcoming = (i: Item, now = Date.now()) => i.valid_from != null && now < i.valid_from;

// Cards: most recently opened first; never-opened cards after them, A–Z.
export const byRecent = (a: Item, b: Item) =>
  (b.last_used_at ?? 0) - (a.last_used_at ?? 0) || a.name.localeCompare(b.name);

// '2026-10-20' (an <input type="date"> value) <-> local day boundaries.
const ymd = (s: string) => s.split('-').map(Number) as [number, number, number];
export const dayStart = (s: string) => { const [y, m, d] = ymd(s); return new Date(y, m - 1, d).getTime(); };
export const dayEnd = (s: string) => { const [y, m, d] = ymd(s); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };
export const FORMAT_LABEL: Record<Format, string> = {
  qr: 'QR', ean13: 'EAN-13', ean8: 'EAN-8', upc_a: 'UPC-A', code128: 'Code 128',
  code39: 'Code 39', pdf417: 'PDF417', aztec: 'Aztec', datamatrix: 'Data Matrix',
};
// 1D barcodes: in till mode they turn sideways so the bars use the long side of the screen.
export const LINEAR = new Set<Format>(['ean13', 'ean8', 'upc_a', 'code128', 'code39']);

// Stable hue per store name: the colour of its tile, detail screen and fallback logo.
export const storeHue = (name: string) => [...name.trim().toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const shortDateTime = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// The chip on list rows: how soon a ticket/coupon ends, or when it starts. Cards have none.
export function statusChip(i: Item, now = Date.now(), date = shortDate, dateTime = shortDateTime, time = shortTime):
  { text: string; tone: 'soon' | 'ok' | 'upcoming' | 'expired' } | null {
  if (i.kind === 'card' || i.expires_at == null) return null;
  const when = i.kind === 'ticket' ? dateTime : date;
  if (isUpcoming(i, now)) return { text: `From ${date(i.valid_from!)}`, tone: 'upcoming' };
  if (isArchived(i, now)) return { text: `Expired ${date(i.expires_at)}`, tone: 'expired' };
  const midnight = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const days = Math.round((midnight(i.expires_at) - midnight(now)) / 86_400_000);
  const suffix = i.kind !== 'ticket' ? '' : `, ${days === 0 ? time(i.expires_at) : when(i.expires_at)}`;
  if (days === 0) return { text: `Ends today${suffix}`, tone: 'soon' };
  if (days === 1) return { text: `Ends tomorrow${suffix}`, tone: 'soon' };
  if (days <= 3) return { text: `Ends in ${days} days${suffix}`, tone: 'soon' };
  return { text: `Until ${when(i.expires_at)}`, tone: 'ok' };
}

// Row/detail subtitle: ticket = date + time, coupon = date range, receipt = claim deadline (time of day is irrelevant).
export function validityLabel(i: Item): string | null {
  if (i.expires_at == null) return null;
  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' });
  if (i.kind === 'receipt') return `Claim by ${day(i.expires_at)}`;
  if (i.kind !== 'coupon') return new Date(i.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return i.valid_from == null ? `Valid until ${day(i.expires_at)}` : `Valid ${day(i.valid_from)} – ${day(i.expires_at)}`;
}

// 389.5 -> '389,50 Kč'; whole amounts without decimals: '1 250 Kč'.
export const formatAmount = (n: number) => {
  const digits = Number.isInteger(n) ? 0 : 2;
  return n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: digits, maximumFractionDigits: digits });
};

// '1 250,50', '1250.5 Kč' -> 1250.5; null when it isn't an amount (max 2 decimals).
export function parseAmount(s: string): number | null {
  const t = s.replace(/\s|Kč|CZK/gi, '').replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}

// Receipt subtitle: '1 250 Kč · Bought 3 Oct 2026'; null when neither is known.
export function receiptFacts(i: Item): string | null {
  const bought = i.purchased_at != null ? `Bought ${new Date(i.purchased_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : null;
  return [i.amount != null ? formatAmount(i.amount) : null, bought].filter(Boolean).join(' · ') || null;
}

export const toDateInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function checkDigitOk(code: string) {
  const d = code.split('').map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const DIGITS: Partial<Record<Format, number>> = { ean13: 13, ean8: 8, upc_a: 12 };

export function validateCode(format: Format, code: string, kind?: Kind): string | null {
  if (!code) return kind === 'receipt' ? null : 'Code is empty';
  const n = DIGITS[format];
  if (n) {
    if (!new RegExp(`^\\d{${n}}$`).test(code)) return `${FORMAT_LABEL[format]} needs exactly ${n} digits`;
    if (!checkDigitOk(code)) return 'Check digit is wrong';
  }
  return null;
}

// Best guess for a hand-typed code: retail barcodes by digit count and check digit, other text as Code 128.
// Many till scanners read 1D codes only, so QR is the last resort.
export function guessFormat(code: string): Format {
  const c = code.trim();
  if (/^\d+$/.test(c) && checkDigitOk(c)) {
    if (c.length === 13) return 'ean13';
    if (c.length === 12) return 'upc_a';
    if (c.length === 8) return 'ean8';
  }
  return /^[\x20-\x7e]+$/.test(c) ? 'code128' : 'qr';
}

export const reminderTime = (expiresAt: number, leadMs: number, now: number) => {
  const t = expiresAt - leadMs;
  return t > now ? t : null;
};

export const NOT_A_BACKUP = "That file isn't a wallet backup. Choose a file made with Export.";

// `photo` names the item's photo file inside a ZIP backup; plain JSON backups have none.
export const serialize = (items: Item[], photo: (i: Item, n: number) => string | undefined = () => undefined) =>
  JSON.stringify({ version: 1, items: items.map((i, n) => { const { id, notify_id, ...rest } = i; return { ...rest, photo: photo(i, n) }; }) }, null, 2);

export function parseImport(json: string): NewItem[] {
  let data: any;
  try { data = JSON.parse(json); } catch { /* reported below */ }
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error(NOT_A_BACKUP);
  return data.items.map((x: any, i: number) => {
    const ok = (KINDS as readonly string[]).includes(x?.kind) && typeof x.name === 'string'
      && typeof x.code === 'string' && (FORMATS as readonly string[]).includes(x.format);
    if (!ok) throw new Error(`Item ${i + 1} in the backup is incomplete, so nothing was imported.`);
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    return {
      // A code that breaks its format's rules (e.g. a bad EAN check digit) can't be drawn; Code 128 can draw any of them.
      kind: x.kind, name: x.name, code: x.code, format: validateCode(x.format, x.code, x.kind) ? 'code128' : x.format,
      color: x.color ?? null, note: x.note ?? null,
      expires_at: num(x.expires_at), valid_from: num(x.valid_from),
      domain: typeof x.domain === 'string' ? toDomain(x.domain) : null,
      last_used_at: num(x.last_used_at), purchased_at: num(x.purchased_at), amount: num(x.amount),
      notify_id: null, created_at: x.created_at ?? Date.now(),
    };
  });
}

// Receipts usually have no code, so amount and purchase date tell two receipts from the same shop apart.
export const dedupe = (existing: Item[], incoming: NewItem[]) =>
  incoming.filter((n) => !existing.some((e) => e.kind === n.kind && e.code === n.code && e.name === n.name
    && (e.amount ?? null) === (n.amount ?? null) && (e.purchased_at ?? null) === (n.purchased_at ?? null)));

// BarcodeDetector API format names.
export const DETECTOR_FORMAT: Record<Format, string> = {
  qr: 'qr_code', ean13: 'ean_13', ean8: 'ean_8', upc_a: 'upc_a', code128: 'code_128',
  code39: 'code_39', pdf417: 'pdf417', aztec: 'aztec', datamatrix: 'data_matrix',
};

export const fromDetector = (f: string): Format | null =>
  FORMATS.find((k) => DETECTOR_FORMAT[k] === f) ?? null;

const DAY = 86_400_000;
// The list asks for a backup when there's something to lose and the last export is over 30 days old (or never).
export const backupDue = (itemCount: number, lastExport: number | null, snoozedUntil: number, now = Date.now()) =>
  itemCount > 0 && now >= snoozedUntil && (lastExport == null || now - lastExport > 30 * DAY);

// 'today', 'yesterday', '3 days ago'.
export const daysAgo = (t: number, now = Date.now(), locale?: string) =>
  new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-Math.floor((now - t) / DAY), 'day');
