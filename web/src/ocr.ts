// On-device text recognition (Tesseract). Loaded lazily on first use: the engine (~4 MB) and language
// data (~2-3 MB per language) are self-hosted under ./ocr/ (see vite.config.ts) and kept by the
// service worker's 'ocr' cache, so after the first use OCR works offline.
import type Tesseract from 'tesseract.js';
import { OCR_LANGUAGES, type OcrLine } from './ocr-parse';

const ocrUrl = (p: string) => new URL(`${import.meta.env.BASE_URL}ocr/${p}`, document.baseURI).href;
const LOAD_TIMEOUT = 60_000;
const IDLE_TIMEOUT = 60_000; // free the engine's wasm heap when not in use
const MAX_SIDE = 2000; // px; bigger images only cost time and memory
const MIN_CONFIDENCE = 60; // below this it is usually barcode/graphics noise, not text

let worker: Promise<Tesseract.Worker> | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;

function getWorker() {
  return (worker ??= (async () => {
    const m = await import('tesseract.js');
    const created = (m.default ?? m).createWorker(OCR_LANGUAGES.map((l) => l.code), 1, {
      workerPath: ocrUrl('worker.min.js'),
      workerBlobURL: false, // load the worker script itself, same-origin, so the service worker sees its requests
      corePath: ocrUrl('core/'),
      langPath: ocrUrl('lang/'),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('OCR engine load timed out')), LOAD_TIMEOUT); });
    try {
      return await Promise.race([created, timeout]);
    } catch (e) {
      created.then((w) => w.terminate()).catch(() => {});
      throw e;
    } finally {
      clearTimeout(timer);
    }
  })());
}

// Drop the worker; the next job creates a fresh one.
function reset() {
  const w = worker;
  worker = undefined;
  w?.then((x) => x.terminate()).catch(() => {});
}

async function shrink(image: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return image;
  const bmp = await createImageBitmap(image);
  try {
    const scale = MAX_SIDE / Math.max(bmp.width, bmp.height);
    if (scale >= 1) return image;
    const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    bmp.close();
  }
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type Line = { text: string; bbox: Box; confidence: number };

async function pass(w: Tesseract.Worker, image: Blob, mode: '3' | '11'): Promise<Line[]> {
  await w.setParameters({ tessedit_pageseg_mode: mode as Tesseract.PSM });
  const { data } = await w.recognize(image, {}, { blocks: true });
  return (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .filter((l) => l.text.trim())
    .map((l) => ({ text: l.text.trim(), bbox: l.bbox, confidence: l.confidence }));
}

// The last read, for the developer "OCR details" panel: every line Tesseract returned, and its fate.
export type SeenLine = Line & { pass: '3' | '11'; status: 'kept' | 'low confidence' | 'duplicate' };
export let lastRead: { image: Blob; lines: SeenLine[]; parsed: OcrLine[] } | null = null;

const key = (t: string) => t.toLowerCase().replace(/\s+/g, '');
const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

// Tesseract's page-layout step sometimes drops big logo lettering, so also run its "sparse text"
// mode, which finds every line, and add only the lines the first pass missed. One image at a time.
let queue: Promise<unknown> = Promise.resolve();
export function readLines(image: Blob): Promise<OcrLine[]> {
  const job = queue.then(async () => {
    clearTimeout(idle);
    try {
      lastRead = null;
      const small = await shrink(image);
      const w = await getWorker();
      const lines: Line[] = [], seen: SeenLine[] = [];
      for (const mode of ['3', '11'] as const) {
        for (const l of await pass(w, small, mode)) {
          const status = l.confidence < MIN_CONFIDENCE ? 'low confidence'
            : mode === '11' && lines.some((e) => key(e.text).includes(key(l.text)) || overlap(e.bbox, l.bbox) > 0.5 * area(l.bbox)) ? 'duplicate'
            : 'kept';
          if (status === 'kept') lines.push(l);
          seen.push({ ...l, pass: mode, status });
        }
      }
      // Top to bottom, as the parser expects; heights are in (possibly downscaled) image pixels.
      const parsed = lines.sort((a, b) => a.bbox.y0 - b.bbox.y0).map((l) => ({ text: l.text, height: l.bbox.y1 - l.bbox.y0 }));
      lastRead = { image: small, lines: seen, parsed };
      return parsed;
    } catch (e) {
      reset();
      throw e;
    } finally {
      idle = setTimeout(reset, IDLE_TIMEOUT);
    }
  });
  queue = job.catch(() => {});
  return job;
}
