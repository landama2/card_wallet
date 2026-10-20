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

export const KINDS = ['card', 'ticket', 'coupon'] as const;
export type Kind = (typeof KINDS)[number];

// Coupons: valid_from = start of the first day, expires_at = end of the last day (local time).
// valid_from is null for cards, tickets and coupons without a start date (and in items saved before coupons existed).
export type Item = {
  id: number; kind: Kind; name: string; code: string; format: Format;
  color: string | null; note: string | null; expires_at: number | null; valid_from: number | null;
  domain: string | null; // store website, e.g. 'tesco.cz'; drives the logo. Missing in items saved before logos.
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

// '2026-10-20' (an <input type="date"> value) <-> local day boundaries.
const ymd = (s: string) => s.split('-').map(Number) as [number, number, number];
export const dayStart = (s: string) => { const [y, m, d] = ymd(s); return new Date(y, m - 1, d).getTime(); };
export const dayEnd = (s: string) => { const [y, m, d] = ymd(s); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };
export const FORMAT_LABEL: Record<Format, string> = {
  qr: 'QR', ean13: 'EAN-13', ean8: 'EAN-8', upc_a: 'UPC-A', code128: 'Code 128',
  code39: 'Code 39', pdf417: 'PDF417', aztec: 'Aztec', datamatrix: 'Data Matrix',
};

// Stable hue per store name: the colour of its tile, detail screen and fallback logo.
export const storeHue = (name: string) => [...name.trim().toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const shortDateTime = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// The chip on list rows: how soon a ticket/coupon ends, or when it starts. Cards have none.
export function statusChip(i: Item, now = Date.now(), date = shortDate, dateTime = shortDateTime):
  { text: string; tone: 'soon' | 'ok' | 'upcoming' | 'expired' } | null {
  if (i.kind === 'card' || i.expires_at == null) return null;
  const when = i.kind === 'ticket' ? dateTime : date;
  if (isUpcoming(i, now)) return { text: `From ${date(i.valid_from!)}`, tone: 'upcoming' };
  if (isArchived(i, now)) return { text: `Expired ${date(i.expires_at)}`, tone: 'expired' };
  const midnight = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const days = Math.round((midnight(i.expires_at) - midnight(now)) / 86_400_000);
  const suffix = i.kind === 'ticket' ? `, ${when(i.expires_at)}` : '';
  if (days === 0) return { text: `Ends today${suffix}`, tone: 'soon' };
  if (days === 1) return { text: `Ends tomorrow${suffix}`, tone: 'soon' };
  if (days <= 3) return { text: `Ends in ${days} days${suffix}`, tone: 'soon' };
  return { text: `Until ${when(i.expires_at)}`, tone: 'ok' };
}

// Row/detail subtitle: ticket = date + time, coupon = date range (time of day is irrelevant).
export function validityLabel(i: Item): string | null {
  if (i.expires_at == null) return null;
  if (i.kind !== 'coupon') return new Date(i.expires_at).toLocaleString();
  const until = new Date(i.expires_at).toLocaleDateString();
  return i.valid_from == null ? `Valid until ${until}` : `Valid ${new Date(i.valid_from).toLocaleDateString()} – ${until}`;
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

export function validateCode(format: Format, code: string): string | null {
  if (!code) return 'Code is empty';
  const n = DIGITS[format];
  if (n) {
    if (!new RegExp(`^\\d{${n}}$`).test(code)) return `${format} needs exactly ${n} digits`;
    if (!checkDigitOk(code)) return 'Check digit is wrong';
  }
  return null;
}

export const reminderTime = (expiresAt: number, leadMs: number, now: number) => {
  const t = expiresAt - leadMs;
  return t > now ? t : null;
};

export const serialize = (items: Item[]) =>
  JSON.stringify({ version: 1, items: items.map(({ id, notify_id, ...rest }) => rest) }, null, 2);

export function parseImport(json: string): NewItem[] {
  let data: any;
  try { data = JSON.parse(json); } catch { /* reported below */ }
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error("That file isn't a wallet backup. Choose a file made with Export.");
  return data.items.map((x: any, i: number) => {
    const ok = (KINDS as readonly string[]).includes(x?.kind) && typeof x.name === 'string'
      && typeof x.code === 'string' && (FORMATS as readonly string[]).includes(x.format);
    if (!ok) throw new Error(`Item ${i + 1} in the backup is incomplete, so nothing was imported.`);
    return {
      kind: x.kind, name: x.name, code: x.code, format: x.format,
      color: x.color ?? null, note: x.note ?? null,
      expires_at: typeof x.expires_at === 'number' ? x.expires_at : null,
      valid_from: typeof x.valid_from === 'number' ? x.valid_from : null,
      domain: typeof x.domain === 'string' ? toDomain(x.domain) : null, notify_id: null, created_at: x.created_at ?? Date.now(),
    };
  });
}

export const dedupe = (existing: Item[], incoming: NewItem[]) =>
  incoming.filter((n) => !existing.some((e) => e.kind === n.kind && e.code === n.code && e.name === n.name));

// BarcodeDetector API format names.
export const DETECTOR_FORMAT: Record<Format, string> = {
  qr: 'qr_code', ean13: 'ean_13', ean8: 'ean_8', upc_a: 'upc_a', code128: 'code_128',
  code39: 'code_39', pdf417: 'pdf417', aztec: 'aztec', datamatrix: 'data_matrix',
};

export const fromDetector = (f: string): Format | null =>
  FORMATS.find((k) => DETECTOR_FORMAT[k] === f) ?? null;
