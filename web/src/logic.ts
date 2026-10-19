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
  notify_id: string | null; created_at: number;
};
export type NewItem = Omit<Item, 'id'>;

export const isArchived = (i: Item, now = Date.now()) =>
  i.kind !== 'card' && i.expires_at != null && i.expires_at < now;

export const isUpcoming = (i: Item, now = Date.now()) => i.valid_from != null && now < i.valid_from;

// '2026-10-20' (an <input type="date"> value) <-> local day boundaries.
const ymd = (s: string) => s.split('-').map(Number) as [number, number, number];
export const dayStart = (s: string) => { const [y, m, d] = ymd(s); return new Date(y, m - 1, d).getTime(); };
export const dayEnd = (s: string) => { const [y, m, d] = ymd(s); return new Date(y, m - 1, d + 1).getTime() - 1; };
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
  const data = JSON.parse(json);
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error('Not a wallet backup');
  return data.items.map((x: any) => {
    const ok = (KINDS as readonly string[]).includes(x.kind) && typeof x.name === 'string'
      && typeof x.code === 'string' && (FORMATS as readonly string[]).includes(x.format);
    if (!ok) throw new Error('Bad item in backup');
    return {
      kind: x.kind, name: x.name, code: x.code, format: x.format,
      color: x.color ?? null, note: x.note ?? null, expires_at: x.expires_at ?? null,
      valid_from: x.valid_from ?? null, notify_id: null, created_at: x.created_at ?? Date.now(),
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
