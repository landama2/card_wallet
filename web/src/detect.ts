import 'barcode-detector/polyfill';
import { DETECTOR_FORMAT, FORMATS, fromDetector, type Format } from './logic';

type Result = { code: string; format: Format };

let detector: Promise<BarcodeDetector> | undefined;
// Ask only for formats this browser supports; unsupported ones make the constructor throw.
const getDetector = () =>
  (detector ??= BarcodeDetector.getSupportedFormats().then((supported) =>
    new BarcodeDetector({
      formats: FORMATS.map((f) => DETECTOR_FORMAT[f] as BarcodeFormat).filter((f) => supported.includes(f)),
    }),
  ));

export async function detect(source: ImageBitmapSource | HTMLVideoElement): Promise<Result | null> {
  for (const r of await (await getDetector()).detect(source as ImageBitmapSource)) {
    const format = fromDetector(r.format);
    if (format) return { code: r.rawValue, format };
  }
  return null;
}

export const detectBlob = async (blob: Blob) => detect(await createImageBitmap(blob));
