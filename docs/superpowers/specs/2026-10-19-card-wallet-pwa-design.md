# Card Wallet PWA: Design Spec

Date: 2026-10-19
Supersedes the stack in `2026-10-19-card-wallet-design.md`; requirements there still apply except where this file says otherwise.

## Goal
Same app (loyalty cards + expiring tickets shown as barcodes/QR codes), built as an installable Progressive Web App instead of a React Native app.

## Changes from the original spec
- **Stack:** Vite + React + TypeScript static site in `web/`. Runs on any static HTTPS host (host chosen later; build uses relative paths so a sub-path like GitHub Pages works).
- **Reminders: dropped this iteration.** No notifications, no lead-time setting.
- **Max brightness: dropped** (not possible on the web). Detail screen keeps the screen awake via the Screen Wake Lock API.
- **Storage:** one JSON array in `localStorage` (key `wallet.items`), not SQLite. The app requests persistent storage (`navigator.storage.persist()`). JSON export is the backup.
- The React Native app in `app/` stays untouched until the PWA is confirmed working, then gets deleted.

## Unchanged
Data model fields (`notify_id` kept, always null, so backups stay compatible), derived archive, supported formats, code validation, expired-date warning, Cards/Tickets tabs with search and archive, add by camera / manual / image / share, PDFs not decoded, backup export/import with merge or replace, no edit screen, no UI for color/note.

## Browser mapping
- **Scan / decode:** `BarcodeDetector` (native in Chrome on Android); the `barcode-detector` polyfill fills in only where it is missing (desktop testing). Format names map between the detector (`qr_code`, `ean_13`, ...) and ours (`qr`, `ean13`, ...).
- **Render:** `bwip-js` browser build, SVG.
- **Expiry input:** `<input type="datetime-local">`.
- **Share target:** Web Share Target in the manifest (POST, multipart, field `file`, `image/*` and `application/pdf`). The service worker stores the file in Cache Storage and redirects to the Add screen, which picks it up. Works only once installed.
- **Offline:** service worker precaches the build (vite-plugin-pwa, injectManifest).
- **Routing:** hash routes `#/cards`, `#/tickets`, `#/add?kind=card|ticket[&shared=1]`, `#/item/<id>`, `#/settings`.
- **Export:** downloads `wallet-backup-YYYY-MM-DD.json`. **Import:** file input, then Merge / Replace all / Cancel.

## Errors
Camera unavailable or denied: alert, fall back to manual entry. No code in image: alert, manual entry. Malformed backup: alert "Import failed", nothing changes.

## Testing
The existing `logic.test.ts` plus a test for the detector format mapping. Manual check in a desktop browser; on-phone check by the user once hosted.
