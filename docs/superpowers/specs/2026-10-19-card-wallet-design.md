# Card Wallet: Design Spec

Date: 2026-10-19

## Goal
A personal Android app that stores loyalty cards and temporary (expiring) barcode/QR tickets, and shows them full screen at a checkout.

## Scope
- Audience: single user (the author), Android only, sideloaded APK / dev build. No accounts, no store release.
- Storage: local on device, plus manual JSON export/import for backup.

### Out of scope for v1 (YAGNI)
Home-screen widget, biometric/app lock, cloud sync, per-ticket reminder times, auto-purging the archive.

## Stack
- Expo (React Native, TypeScript), expo-router with two tabs: **Cards** and **Tickets**.
- expo-sqlite for storage (one table, no ORM).
- expo-camera for scanning and `scanFromURLAsync` for decoding gallery images.
- `bwip-js` (SVG output) to render QR, Code128, EAN-13, PDF417, Aztec.
- expo-notifications for local scheduled reminders (no server).
- expo-brightness + expo-keep-awake on the detail screen.
- expo-file-system, expo-sharing, expo-document-picker for export/import.
- Android intent filter for shared images/PDFs (requires a dev build, not Expo Go).

## Data model
Table `items`:

| Field | Type | Notes |
|---|---|---|
| id | integer PK | |
| kind | text | `card` or `ticket` |
| name | text | display name |
| code | text | barcode/QR value |
| format | text | barcode type |
| color | text, nullable | optional |
| note | text, nullable | optional |
| expires_at | integer, nullable | epoch ms; null for cards |
| notify_id | text, nullable | scheduled notification id |
| created_at | integer | epoch ms |

**Archived is derived**: a ticket is archived iff `expires_at < now`. No background job and no stored status flag, so nothing can go stale if the app was not running at expiry.

## UI
- **Cards tab:** searchable list of cards. Tap opens the detail screen.
- **Tickets tab:** Active section (soonest expiry first) and a collapsed Archive section (viewable, greyed out).
- **Add screen** (shared by both tabs): choose scan / manual / import image / shared file; for tickets also set the expiry date.
- **Detail screen:** code rendered full screen, brightness set to max and screen kept awake; both restored on leave.
- **Settings:** export, import, reminder lead time (default 1 day, global).

## Flows
- **Scan:** camera reads code and format, user fills name (and expiry for tickets), save.
- **Import image / shared file:** decode the code from the image (or the PDF page image). On failure, fall back to manual entry with a clear message.
- **Manual:** user types the code and picks the format.
- **Reminder:** on saving an active ticket, schedule a local notification at `expires_at - lead time` and store `notify_id`. On edit/delete, cancel it. Skip scheduling if that time is already past.
- **Export:** write all items to one JSON file and share it via the system share sheet.
- **Import:** pick a JSON file, choose merge or replace, then re-schedule reminders for tickets still active.

## Validation and errors
- Camera permission denied: show manual entry instead.
- Validate the code against the chosen format before saving (e.g. EAN-13 checksum), since an invalid code fails at the register.
- Expired date entered for a ticket: warn, but allow saving.
- Import of malformed JSON: reject with a message and change nothing.

## Testing
One small test file for the pure logic: archive derivation, export/import round-trip, format validation. No UI test framework.
