import type {} from 'barcode-detector/polyfill'; // global BarcodeDetector types only
import { boostContrast, DETECTOR_FORMAT, FORMATS, fromDetector, tidyResult, type Format } from './logic';

type Result = { code: string; format: Format };

// Native detector when it supports our formats, else the lazily-loaded zxing ponyfill.
async function make(): Promise<BarcodeDetector> {
  const want = FORMATS.map((f) => DETECTOR_FORMAT[f] as BarcodeFormat);
  if ('BarcodeDetector' in globalThis) {
    const sup = await BarcodeDetector.getSupportedFormats();
    const formats = want.filter((f) => sup.includes(f));
    if (formats.length) return new BarcodeDetector({ formats });
  }
  const { BarcodeDetector: Poly } = await import('barcode-detector/ponyfill');
  return new Poly({ formats: want }) as unknown as BarcodeDetector;
}
let detector: Promise<BarcodeDetector> | undefined;
const getDetector = () => (detector ??= make().catch((e) => { detector = undefined; throw e; }));

export async function detect(source: ImageBitmapSource | HTMLVideoElement): Promise<Result | null> {
  for (const r of await (await getDetector()).detect(source as ImageBitmapSource)) {
    const format = fromDetector(r.format);
    if (format) return tidyResult(r.rawValue, format);
  }
  return null;
}

// Photos get a second, higher-contrast pass when the first finds nothing.
export async function detectBlob(blob: Blob) {
  const bmp = await createImageBitmap(blob);
  const r = await detect(bmp);
  if (r || typeof OffscreenCanvas !== 'function') return r;
  const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  boostContrast(img.data);
  return detect(img);
}
