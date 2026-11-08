import { strFromU8, unzipSync } from 'fflate';
import type { Format, Kind } from './logic';

const FORMAT: Record<string, Format> = {
  PKBarcodeFormatQR: 'qr', PKBarcodeFormatPDF417: 'pdf417', PKBarcodeFormatAztec: 'aztec', PKBarcodeFormatCode128: 'code128',
};
const KIND: Record<string, Kind> = { boardingPass: 'ticket', eventTicket: 'ticket', coupon: 'coupon', storeCard: 'card', generic: 'card' };

export const isPkpass = (f: Blob) => f.type === 'application/vnd.apple.pkpass' || (f instanceof File && /\.pkpass$/i.test(f.name));

// Apple Wallet pass: a zip with pass.json. ponytail: the signature isn't checked and
// pass.strings localisation is ignored (same as Portmonka); add if passes show raw keys.
export function parsePkpass(zip: Uint8Array) {
  const files = unzipSync(zip, { filter: (f) => f.name === 'pass.json' || /^(strip|logo|thumbnail)(@[23]x)?\.png$/.test(f.name) });
  if (!files['pass.json']) throw new Error('Not a Wallet pass');
  const p = JSON.parse(strFromU8(files['pass.json']).replace(/^﻿/, ''));
  const b = (p.barcodes ?? [])[0] ?? p.barcode;
  const kind = Object.keys(KIND).find((k) => p[k]);
  const date = Date.parse(p.relevantDate ?? p.expirationDate ?? '');
  const img = ['strip@2x', 'strip', 'thumbnail@2x', 'thumbnail', 'logo@2x', 'logo'].map((n) => files[`${n}.png`]).find(Boolean);
  return {
    name: String(p.organizationName || p.description || '').trim(),
    note: p.description && p.description !== p.organizationName ? String(p.description) : '',
    kind: kind ? KIND[kind] : 'card' as Kind,
    code: b && FORMAT[b.format] ? { code: String(b.message), format: FORMAT[b.format] } : null,
    date: Number.isNaN(date) ? null : date,
    image: img ? new Blob([img], { type: 'image/png' }) : null,
  };
}
