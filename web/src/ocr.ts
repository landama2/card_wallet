// On-device text recognition (Tesseract). Loaded lazily on first use: the engine and language data
// (~3 MB + ~2 MB per language) come from jsDelivr once, then from the service-worker cache / IndexedDB.
import type Tesseract from 'tesseract.js';
import { OCR_LANGUAGES, type OcrLine } from './ocr-parse';

let worker: Promise<Tesseract.Worker> | undefined;
const getWorker = () =>
  (worker ??= import('tesseract.js')
    .then((m) => (m.default ?? m).createWorker(OCR_LANGUAGES.map((l) => l.code)))
    .catch((e) => { worker = undefined; throw e; }));

const MIN_CONFIDENCE = 60; // below this it is usually barcode/graphics noise, not text

async function pass(w: Tesseract.Worker, image: Blob, mode: '3' | '11'): Promise<OcrLine[]> {
  await w.setParameters({ tessedit_pageseg_mode: mode as Tesseract.PSM });
  const { data } = await w.recognize(image, {}, { blocks: true });
  return (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .filter((l) => l.confidence >= MIN_CONFIDENCE)
    .map((l) => ({ text: l.text.trim(), height: l.bbox.y1 - l.bbox.y0 }));
}

// Tesseract's page-layout step sometimes drops big logo lettering, so also run its "sparse text"
// mode, which finds every line, and merge the two (duplicates removed). One image at a time.
let queue: Promise<unknown> = Promise.resolve();
export function readLines(image: Blob): Promise<OcrLine[]> {
  const job = queue.then(async () => {
    const w = await getWorker();
    const lines = await pass(w, image, '3');
    const key = (t: string) => t.toLowerCase().replace(/\s+/g, '');
    const seen = new Set(lines.map((l) => key(l.text)));
    for (const l of await pass(w, image, '11')) if (!seen.has(key(l.text))) lines.push(l);
    return lines;
  });
  queue = job.catch(() => {});
  return job;
}
