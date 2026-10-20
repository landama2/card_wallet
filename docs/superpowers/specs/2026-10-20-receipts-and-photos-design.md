# Receipts and saved photos — design

Status: approved 2026-10-20. Experimental feature.

## Why

1. OCR and barcode reading sometimes get a card, ticket or coupon wrong. The original photo should stay available, out of the way, so the user can fall back on it.
2. Users keep receipts to claim reimbursement later (e.g. from a health insurer such as VZP or VoZP). For now the app only stores them generically: no claim workflow.

## Decisions

- Receipts are a new item **kind**, not a separate gallery.
- **One photo per item.** More than one photo is left for later.
- Photos are **not** taken from the live scanner. They come from "From image" on the Add screen, or from the Detail screen later.
- There are **two backup types**: JSON without photos (the current format) and a ZIP with photos.

## 1. Data model (`logic.ts`)

- `KINDS = ['card', 'ticket', 'coupon', 'receipt']`. This adds a fourth tab, "Receipts".
- `Item` gains two fields, `purchased_at: number | null` and `amount: number | null`. Both are optional (`?`) because items saved before this feature don't have them. Amounts are in CZK and no currency field is stored.
- For receipts, `expires_at` is the **claim deadline**. It is optional, so a receipt can have none.
  - Receipts reuse `statusChip` and the archive logic of the other kinds. `isArchived` already applies to every kind except `card`, so a receipt moves to the archive once its deadline has passed.
  - The receipts list is sorted like tickets and coupons, soonest deadline first. Receipts without a deadline go after those with one, newest `purchased_at` first.
- `code` may be empty, for receipts only. `validateCode` returns no error for an empty code on a receipt. `parseImport` accepts that case and doesn't force the format to `code128`.
- Merge-import duplicate detection (`dedupe`) also compares `amount` and `purchased_at`. Without that, two receipts from the same shop with no code would count as duplicates.
- No deadline notifications are sent. `notify_id` and `reminderTime` exist, but nothing sends a notification today.

## 2. Photo storage (`photos.ts`, new file)

- IndexedDB database `wallet-photos` with one object store `photos`. Each entry's key is the item id and its value is a JPEG `Blob`. No library is used.
- The module exports `getPhoto(id)`, `putPhoto(id, blob)`, `deletePhoto(id)`, `listPhotoIds()`, `clearPhotos()` and `photoUsage()`. `photoUsage()` returns the photo count and the total size in bytes.
- `putPhoto` shrinks the image to at most 1600 px on its longest side and saves it as JPEG at quality 0.8, using `createImageBitmap` and `OffscreenCanvas`. Shrinking works like `shrink()` in `ocr.ts`; share that code if it fits without changes. If `OffscreenCanvas` is missing, the original blob is stored.
- The first time a photo is saved, the app calls `navigator.storage.persist()` once. Without it, iOS Safari can wipe a site's storage after 7 days of non-use when the app is not installed.
- When an item is deleted, its photo is deleted too:
  - The Delete action reads the photo before deleting.
  - "Undo after Delete" keeps the photo blob in memory and writes it back under the id that `restoreItem` returns.
- Settings shows how much space photos use, e.g. "12 photos · 3.1 MB".

## 3. User interface

### Add / Edit (`screens/Add.tsx`)
- When an image was picked with "From image", a **"Keep photo"** switch appears. It is on by default for every kind, and the picked image is saved under the new id when the item is saved.
- **Kind = receipt:**
  - The picker comes first: "Take or choose photo", using `<input type="file" accept="image/*">`.
  - Barcode detection still runs. If a code is found, it is filled in.
  - OCR tries to fill the purchase date and the amount, and never overwrites what the user typed (same rule as today).
  - The fields are: name (shop or provider), purchase date (`<input type="date">`), amount (`<input inputmode="decimal">`, accepts `,` or `.`), claim deadline (`<input type="date">`, end of that day), and note. The code and format fields sit in a collapsed "Barcode (optional)" section.
  - A receipt needs only a name. A photo is recommended but not required.
- When editing, the photo is not shown here; it is managed from the Detail screen. Picking an image while editing with "Keep photo" on replaces the stored photo.

### OCR parsing (`receipt-parse.ts`, new; kept apart from the coupon parser in `ocr-parse.ts`)
- **Amount:** the number on the line containing `Celkem`, `Celkem k úhradě`, `K úhradě`, `Total` or `Suma` (any case). A space may separate thousands, the decimal separator may be `,` or `.`, and a trailing `Kč`/`CZK` is allowed. If several lines match, the last one wins.
- **Purchase date:** the first date in `d.m.yyyy` or `d. m. yyyy` format (also `dd.mm.yy`) that is not in the future.

### Detail (`screens/Detail.tsx`)
- A collapsed row reads **"Original photo"** (or **"Add photo"** when none is stored). Expanding it shows:
  - a thumbnail;
  - **View**, which opens a full-screen overlay. Tapping the image switches between fit-to-screen and full resolution with scrolling; tapping the backdrop, Back or Esc closes it. It uses the existing overlay and Back handling;
  - **Replace** (camera or gallery);
  - **Remove**, which asks for confirmation through the existing `ask` dialog.
- A receipt **without a code** shows its photo thumbnail where the barcode card would be (tapping it opens the overlay), plus its amount, purchase date and deadline. A receipt with a code shows the barcode as usual.

### Lists (`screens/Lists.tsx`)
- A new "Receipts" tab, with an empty-state text and a FAB that adds a receipt.
- Receipt rows show the name, the amount (e.g. `1 250 Kč`) and the deadline chip. Lists never show photos.

## 4. Backups (`backup.ts`, `logic.ts`)

- **"Export without photos"** produces the existing `.json` file, still `version: 1`. It now includes `purchased_at` and `amount`, which older versions of the app ignore.
- **"Export with photos"** produces `wallet-backup-YYYY-MM-DD.zip`, built with `fflate` (new dependency, ~8 KB):
  - `wallet.json` holds the same contents as the JSON export. Items that have a photo carry an extra field `photo: "photos/<n>.jpg"`, where `<n>` is the item's position in the list.
  - The photos are stored under `photos/<n>.jpg`, uncompressed, because JPEG doesn't compress further.
  - Export uses the same share sheet as the JSON export, falling back to a plain download.
- **Import** checks the file type (zip magic bytes `PK`, otherwise JSON). Then:
  - **Merge:** photos are written only for items that are actually added (those not removed as duplicates).
  - **Replace:** all stored photos are deleted, then the zip's photos are written.
  - **A JSON file:** stored photos are left as they are on Merge. On Replace they are cleared, since the items they belong to are gone.
- The saved copy of the wallet from before a Replace keeps item text only, no photos. Restoring it brings back the items without photos.
- `insertMany` must return the new ids (or the caller must work them out) so that each photo can be linked to its new item.

## 5. Errors

- If `putPhoto` fails (storage full, IndexedDB unavailable), the item is still saved and a `notify` message says "Saved, but the photo couldn't be kept."
- If a photo is missing or unreadable on the Detail screen, it is treated as having no photo, and the row offers "Add photo".
- If the zip can't be read or lacks `wallet.json`, import shows the same "not a wallet backup" error a bad JSON file gets. If a single photo is missing or corrupt inside an otherwise valid zip, that item is imported without its photo, and the result message counts the skipped photos.

## 6. Tests (`tsx --test`)

- `ocr-parse.test.ts`: reading the amount and date from sample Czech pharmacy and shop receipt text.
- `logic.test.ts`: `validateCode` and `parseImport` accept a receipt with no code, and reject a card with no code. Receipts are sorted and archived by their deadline.
- `backup.test.ts`: zip round trip (items and photo references), Merge adding photos only for added items, Replace clearing first, a zip missing `wallet.json` being rejected, and an old JSON backup still importing. Use a small fake photo store in place of IndexedDB, which `tsx` doesn't provide.
- `photos.ts` is tested by hand in the browser preview: save, view, replace, remove, delete with Undo, and export then import with photos.

## Out of scope (later)

More than one photo per item, a "claimed" status, currency, deadline notifications, saving photos from the live scanner, keeping photos in the saved copy from before a Replace, and any insurer-specific claim flow.
