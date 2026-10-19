import type {} from 'barcode-detector/polyfill'; // global BarcodeDetector types only
import { DETECTOR_FORMAT, FORMATS, fromDetector, type Format } from './logic';

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
    if (format) return { code: r.rawValue, format };
  }
  return null;
}

export const detectBlob = async (blob: Blob) => detect(await createImageBitmap(blob));
