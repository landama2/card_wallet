// One original photo per item (keyed by item id) in IndexedDB: localStorage only holds ~5 MB.
// The database opens on first use, so importing this module is safe where IndexedDB doesn't exist (tests).
let db: Promise<IDBDatabase> | undefined;
const open = () => new Promise<IDBDatabase>((ok, fail) => {
  const r = indexedDB.open('wallet-photos', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('photos');
  r.onsuccess = () => ok(r.result);
  r.onerror = () => fail(r.error);
});
let asked = false; // storage.persist() is requested at most once per page load

function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return (db ??= open().catch((e) => { db = undefined; throw e; })).then((d) => new Promise<T>((ok, fail) => {
    const tx = d.transaction('photos', mode);
    const r = f(tx.objectStore('photos'));
    tx.oncomplete = () => ok(r.result);
    tx.onerror = tx.onabort = () => fail(tx.error);
  }));
}

export const getPhoto = (id: number) => run<Blob | undefined>('readonly', (s) => s.get(id));
export const listPhotoIds = () => run('readonly', (s) => s.getAllKeys()) as Promise<number[]>;
export const deletePhoto = (id: number) => run('readwrite', (s) => s.delete(id)).then(() => {});
export const clearPhotos = () => run('readwrite', (s) => s.clear()).then(() => {});

export function putPhoto(id: number, b: Blob) {
  // Without this, browsers may clear site data; iOS Safari does after 7 days unused unless the app is installed.
  if (!asked) { asked = true; navigator.storage?.persisted?.().then((p) => p || navigator.storage.persist()).catch(() => {}); }
  return run('readwrite', (s) => s.put(b, id)).then(() => {});
}

export async function photoUsage() {
  const all = await run<Blob[]>('readonly', (s) => s.getAll());
  return { count: all.length, bytes: all.reduce((n, b) => n + b.size, 0) };
}

const MAX_SIDE = 1600; // px; plenty to read a receipt, ~200-400 KB as JPEG
// Scaled down to MAX_SIDE and re-encoded as JPEG; the original where the browser can't.
export async function shrinkPhoto(image: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return image;
  const bmp = await createImageBitmap(image);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } finally {
    bmp.close();
  }
}
