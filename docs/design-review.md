# Card Wallet (web) design review

Date: 2026-10-20 · Reviewed at commit `6050f69` · Scope: `web/` (Vite + React PWA)

Method: I read all of `web/src`, `index.html`, `vite.config.ts` (manifest) and `docs/`, then ran the dev server and used the app at 375×812 (mobile) and desktop width, in both light and dark colour schemes. The test data was made up: 6 cards, 3 tickets (1 expired) and 2 coupons (1 not yet valid). I went through these flows: add card, validation errors, card/ticket/coupon detail, edit, delete dialog, search, Settings import (preview → replace → undo). I couldn't test the camera, so the scanner findings come from reading the code. The test data was removed afterwards.

**Scope weighting.** This app is for one person on their own phone. Findings are weighted toward daily use: getting the right card up fast at the till, a code the till can actually scan, and not losing data. I left out onboarding, multi-user and growth concerns on purpose.

---

## Executive summary

The app is focused and calm, and mostly well built. The Claude Design look holds together: store-coloured tiles, a white "sheet" holding the code, one blue accent and Manrope/Inter. The import flow (preview → confirm → result → undo) is the most polished part. The wake lock and the status bar taking the store's colour are nice touches.

The weak spots are the moments that matter most:

1. **The code shown at the till can be the wrong symbology.** Typing an EAN number keeps the default `QR` format and saves it silently (verified: `4006381333931` was saved and rendered as a QR). Imported backups skip code validation, so one bad check digit shows a raw `bwipp.ean13badCheckDigit#6915` error where the barcode should be.
2. **Finding a card at the till is slower than it needs to be.** Cards are listed in storage order. There is no "recent" or "favourite" ordering, search covers names only, and a search with no matches shows a blank grid. The detail screen gives the code at most 42vh, has no fullscreen or landscape mode, and repeats a brightness tip every time.
3. **Backup safety relies on the user remembering.** All data is in `localStorage`. Nothing records or shows when you last exported, nothing nudges you to back up, and Undo after a replace only exists until you leave Settings.

There is no dark mode at all: the app looks the same with `prefers-color-scheme: dark`. Some of the accessibility basics are slipping: the search field has no focus ring, format pills are 36px tall, and the destructive dialog button has autofocus.

---

## What works well

- **One-tap path from list to code.** Tile → detail → code takes a single tap, and the code card is plain white with a proper quiet zone (`logic.ts:10-12`, `paddingwidth/height: 10`). It sits above the fold on cards.
- **The screen stays awake on the detail screen** and the wake lock is taken again when the page becomes visible (`Detail.tsx:17-27`). The status bar takes the store's colour (`Detail.tsx:30-36`).
- **The import flow is genuinely good.** It previews new versus duplicate items before acting, puts Replace behind a second confirm that states both counts, gives a success card with "View cards", and offers Undo (`Settings.tsx`). Friendly parse errors replace the raw exceptions (`logic.ts:117,121`).
- **OCR assist is respectful.** It never overwrites what you typed, marks auto-filled fields with a badge, shimmers the fields it may still fill, and shows a "still working" hint that fades in after 8 seconds (`Add.tsx:57-82`, `style.css:96-111`). Reduced motion is respected for those animations.
- **The ticket/coupon model is clear.** Items are split into "Valid now" / "Not yet valid" / "Show expired (n)", and the status chips use plain words ("Ends tomorrow", "From Oct 24").
- **Fallback logos keep text readable.** Initial tiles are always dark enough for white text (`Logo.tsx:17-18`). Logos fail back to the initial.
- **Offline thinking is deliberate.** Fonts, logos, OCR data and the barcode wasm are cached at runtime (`sw.ts:27-49`).
- **Touch targets on the main controls are at least 44px:** icon buttons 44, tabs ~64, FAB 60, primary button 56, inputs 52.

---

## Findings by area

Severity: **critical** = can fail at the till or lose data · **high** = daily friction or likely error · **medium** = noticeable quality/a11y gap · **low** = polish.

### 1. Scan reliability (the code shown to the cashier)

| # | Sev | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 1.1 | **critical** | Manual entry defaults to **QR**, whatever the code looks like. A 13-digit EAN typed by hand is saved and shown as a QR code. Many supermarket hand scanners and older lasers read 1D codes only. | `Add.tsx:29` (`useState<Format>(editing?.format ?? 'qr')`). Verified: typed `4006381333931`, saved, detail shows a QR. | Infer the format as the user types: 13 digits with a valid check digit → EAN-13, 8 → EAN-8, 12 → UPC-A, other alphanumeric → Code 128. Keep QR only when the user picks it or the scanner reports it. When the code is all digits and QR is selected, show an inline hint: "Looks like an EAN-13 barcode. Use that?" |
| 1.2 | **high** | Imported items skip `validateCode`, so a bad check digit or length shows a raw library error **in place of the barcode**. | `logic.ts:114-130` (no validation); `CodeView.tsx:9` prints `String(e)`. Verified: "Cannot render this code: Error: bwipp.ean13badCheckDigit#6915…". | (a) Validate in `parseImport`; on failure downgrade the format to `code128` and keep the item, rather than rejecting the whole backup. (b) Make CodeView's fallback friendly: show the number large and monospaced (so the cashier can type it) plus "This code can't be drawn as EAN-13. Edit". |
| 1.3 | **high** | The code is small for what it's for. Its height is capped at `42vh` and it sits inside 16px padding plus a 20px sheet margin. There is no fullscreen mode and no landscape layout. Wide 1D barcodes with long Code 128 values get thin bars on a 375px phone. | `style.css:79-81`; `Detail.tsx:73-77`. | Make tapping the code open a "till mode": a full-bleed white overlay with the code as large as possible. Rotate 1D codes 90° (or use landscape) so the bars use the long side of the screen. Put the number underneath in a large font. Close on tap or back. |
| 1.4 | medium | The brightness tip appears on every view, takes ~70px, and pushes the actions below the fold on tickets (812px tall: Edit/Logo/Delete are cut off). It's advice the user reads once. | `Detail.tsx:78`; screenshot of ticket detail. | Show it the first 2–3 times (count in `localStorage`), then hide it, or fold it into the till-mode overlay. |
| 1.5 | low | The sun icon inside the tip is squashed to ~10px because the flex item has no `flex: none`. | `style.css:85` + `Icon` without `flex-shrink:0`. | Add `.tip svg { flex: none; }`. |

### 2. Finding a card at checkout (IA & navigation)

| # | Sev | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 2.1 | **high** | Cards are not ordered usefully. They appear in storage order (new ones prepended, imports in file order). With 15+ cards the one you need is often below the fold. | `Lists.tsx:45,51,68`; `db.ts:14,26`. | Record `last_used_at` when Detail opens and sort tiles by it (most recent first), with an optional ★ pin group above. A–Z is an acceptable fallback for items never opened. |
| 2.2 | medium | Searching with no matches shows "LOYALTY CARDS · 0" and an empty area. There is no feedback and no way forward. | `Lists.tsx:67-68`; verified with "zzz". | Show "No card matches 'zzz'" plus an "Add 'zzz'" button that prefills the name. |
| 2.3 | medium | Search only covers card **names**. It doesn't cover notes or the code, and tickets/coupons have no search at all. | `Lists.tsx:51,61`. | Also match `note` and `code`. Optional: search across all kinds from the Cards tab. |
| 2.4 | medium | Coupons for a store aren't shown on that store's card. At the till you open the Albert card and miss the Albert coupon that expires in 2 days. | No cross-link in `Detail.tsx`. | On card detail, show "1 coupon for Albert · ends in 2 days" (matched by `name` or `domain`) and link to it. |
| 2.5 | low | The header says "Wallet" on the Cards tab but "Tickets" and "Coupons" on the others, while the tab itself says "Cards". | `Lists.tsx:8-11`. | Use "Cards" so the title matches the tab, or accept "Wallet" as the home name on purpose. |
| 2.6 | low | Tile colour comes from a hash of the name, not from the brand: Tesco purple, IKEA olive, Lidl maroon. The `color` field exists in the data but is always `null`. | `Logo.tsx:18`; `Add.tsx:129` (`color: null`). | Let the user pick from ~8 swatches in Edit, saved to `item.color`. Brand colour makes recognition faster than reading names. |

### 3. Adding and editing

| # | Sev | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 3.1 | **high** | The camera scanner is component state, not a route. Android's back button (or the gesture) leaves the **whole Add screen** and throws away what was typed. Dialogs behave the same way: back moves the page behind them. | `Add.tsx:137-139`; `Dialog.tsx` has no history handling. | Push a history entry (`#/add?…&scan=1`) when scanning starts and close the scanner on `popstate`/`hashchange`. Do the same for dialogs, or at least have Back cancel the top dialog. |
| 3.2 | **high** | The scanner has no torch toggle and no "type it instead" button. If the camera is denied, a modal says so after the scanner closes. | `Scanner.tsx:19-36`. | Add a torch button (`track.applyConstraints({advanced:[{torch:true}]})` where supported) and a secondary "Enter code manually" button that focuses the Code field. |
| 3.3 | medium | Validation uses modal dialogs, one error at a time, and shows internal ids: "Invalid code: ean13 needs exactly 13 digits". | `Add.tsx:110-117`; `logic.ts:100` (`${format}`). Verified. | Show errors inline under the field (`aria-invalid` and `aria-describedby`), focus the first invalid field, and use `FORMAT_LABEL[format]` ("EAN-13 needs 13 digits; you have 5"). |
| 3.4 | medium | Field order puts the main thing, the **code**, below Store name and Store website. The "Scan code / From image" buttons sit between website and code. | `Add.tsx:165-194`. | Order it: [Scan code] [From image] → Code + format → Store name → website (folded under "More": website, note). |
| 3.5 | medium | All 9 format pills are always shown and they dominate the form. Most loyalty cards are EAN-13, Code 128 or QR. | `Add.tsx:190-194`. | With auto-detection (1.1), show the detected format as one chip with "Change", and put the full list behind it. |
| 3.6 | medium | Leaving with unsaved edits (back button) gives no warning. | `Add.tsx:39`. | If fields differ from the initial values, `ask('Discard changes?')`. |
| 3.7 | low | Shared images always open as **Ticket**. Most images you share in practice are coupon screenshots or card photos. | `sw.ts:21` (`kind=ticket`). | Default to `coupon` (OCR fills dates for coupons), or remember the last kind used. |
| 3.8 | low | The detail screen has a "Logo" action that duplicates the website field in Edit, and it gets a top-level slot next to Edit/Delete. | `Detail.tsx:49-56,81`. | Remove it, which leaves Edit / Delete. Delete could move to the bottom of the Edit screen so it can't be hit by accident at the till. |
| 3.9 | low | The Edit header "Edit Tesco Clubcard" has no ellipsis, so it will wrap or overflow with long names. | `style.css:33`. | Add `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` and `min-width:0`. |

### 4. Lists: tickets and coupons

| # | Sev | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 4.1 | **high** | The status chip squeezes the name to nothing: "Pra…" for *Prague Metro 24h* next to "Ends today, Oct 20, 03:40 PM". The note wraps onto 2 lines. | `Lists.tsx:32-36`; `style.css:54,57` (`chip` `white-space:nowrap; flex:none`). Verified in screenshot. | Stack the chip under the name (name / chip / note). Shorten ticket chips to "Ends 15:40" when the date is today. |
| 4.2 | medium | Ticket subtitle and detail show `toLocaleString()` with seconds ("10/20/2026, 3:40:54 PM"), and it repeats the chip. | `logic.ts:77`; detail screenshot. | Use `{dateStyle:'medium', timeStyle:'short'}` and show it once (chip *or* subtitle). |
| 4.3 | medium | Expired rows use `opacity: 0.6`, so the muted text drops to ~2.4:1 contrast. | `style.css:52`. | Use the `--muted` colour for text and grey out only the logo, rather than fading the whole row. |

### 5. Backup and trust

| # | Sev | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 5.1 | **critical** | The only copy of the data is in `localStorage`. `persist()` is requested but the result is ignored. Nothing records when you last exported, and nothing ever reminds you. Clearing site data or switching phones loses everything without warning. | `db.ts`; `main.tsx:9`; `Settings.tsx:53`. | Save `wallet.lastExport` when you export. Show "Last backup: 3 weeks ago · 4 changes since" in Settings. Show a dismissible banner on the list when the last export is >30 days old and there are changes since. Show whether `navigator.storage.persisted()` was granted. |
| 5.2 | **high** | Export is an `<a download>` click. On mobile the file disappears into Downloads (on iOS standalone it can fail or open a viewer), and there is no confirmation. | `backup.ts:4-10`. | Use `navigator.share({ files: [file] })` when `navigator.canShare` allows it, so you can save it to Drive, Files or email. Fall back to download. Show "Backup saved (11 items)" afterwards. |
| 5.3 | medium | Undo after Replace lives only in component state. It's gone once you leave Settings, even though the copy says "You can undo it right after". | `Settings.tsx:11,31,40`. | Before replacing, store the previous list in `localStorage` (`wallet.items.beforeReplace`) and offer "Restore previous wallet" in Settings until the next replace. |
| 5.4 | medium | Every count says "cards" even when it includes tickets and coupons: "This deletes your 11 cards" (it was 6 cards + 3 tickets + 2 coupons). The preview lists the first 3 names even when they're duplicates. | `Settings.tsx:15,79,89`. Verified. | Say "items", or break it down ("6 cards, 3 tickets, 2 coupons"). Preview the **new** names first. |
| 5.5 | medium | Deleting an item has a confirm dialog but no undo. The dialog's destructive button **has autofocus**, so Enter/Space deletes. | `Dialog.tsx:40`; `Detail.tsx:48`. Verified: the focused element is "Delete". | Autofocus Cancel when `danger`. Better: delete straight away and show a 5-second "Deleted Rossmann · Undo" snackbar. |
| 5.6 | low | Logos come from Google's favicon service, which tells Google which stores you use. The code knows (`ponytail` comment) but the user isn't told. | `logic.ts:32-33`. | Add one line in Settings: "Logos are fetched from Google using the store website." Optionally add a toggle to turn logos off. |

### 6. Visual design

| # | Sev | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 6.1 | **high** | No dark mode: only light tokens exist, with no `prefers-color-scheme` and no `color-scheme`. With dark mode on, the screenshot is identical to light. Opening the wallet in a dark shop or cinema queue blasts a light-grey screen. | `style.css:3-18`; `index.html:5`. | Add a dark token set (`--bg #0f1115`, `--surface #1a1d23`, …) under `@media (prefers-color-scheme: dark)`. **Keep `.code-card` pure white with black bars in both themes.** Set `color-scheme: light dark`. Switch `theme-color` with a `media` attribute. Hard-coded colours (`#fff` inputs, `#e6e8ee` segmented, chip tints, `.tip`, `.banner`) need tokens too. |
| 6.2 | medium | Logo presentation is inconsistent. On tiles a favicon gets a white rounded square inside a translucent square. In Add/Edit the same favicon is a raw 52px image with no padding. The Tesco favicon renders as an abstract red shape. | `Logo.tsx:11-14`; `style.css:46-47,56`; Edit screenshot. | Use one logo component with the same padded white plate everywhere. Treat favicons under 64px as "no logo" and use the initial. |
| 6.3 | low | Desktop/tablet: no max-width, so tiles stretch to ~380px and the tab bar and save bar span the full width. The detail sheet is 800px wide. | Desktop screenshot; `style.css:29`. | `.screen, .detail { max-width: 520px; margin: 0 auto }`. Centre the fixed bars to the same width. |
| 6.4 | low | Danger has a weak hierarchy. The "Delete" confirm uses `accent-soft` (light blue) with red text, and "Yes, replace" is a white button with red text. | `style.css:143-144`; `Settings.tsx:81`. | Make destructive confirms a solid `--danger` background with white text. |
| 6.5 | low | Type scale is good: Manrope 800 for titles, Inter for body. The section-label uppercase 13px muted style is used consistently. No action needed. Fonts load from Google Fonts at first launch, so a first offline launch falls back to system-ui. That's acceptable. | `index.html:11`. | Optional: self-host the 3 font files in `public/` to drop the external dependency. |

### 7. Accessibility basics

| # | Sev | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 7.1 | medium | The search input has **no visible focus**. `.search input { outline: none }` (0,1,1) beats `:focus-visible` (0,1,0). | `style.css:26,40`. Verified. | Add `.search:focus-within { outline: 3px solid var(--accent); outline-offset: 2px }`. |
| 7.2 | medium | Targets are too small: format pills are 36px and segmented buttons 40px, both below 44px. | `style.css:93,115`. | Raise both to 44px (pills could get 44px hit areas with 36px visuals). |
| 7.3 | medium | The dialog doesn't trap focus or put focus back on the trigger. Focus falls to `<body>` after closing (verified). `aria-label` repeats the message, so screen readers read it twice. The page behind isn't inert. | `Dialog.tsx:29-42`. | Use native `<dialog>` with `showModal()`, which gives a focus trap, Esc and inert background for free. Use `aria-describedby` for the message. Restore focus to `document.activeElement` saved on open. |
| 7.4 | low | `<html lang="en">`, but the stores, OCR and placeholders are Czech (`albert.cz`, `−20 %`). Dates follow the browser locale, which is good. | `index.html:2`. | Fine for an English UI. If Czech copy is planned, set `lang` to match. |
| 7.5 | low | Reduced motion covers the banner, shimmer and spinner, but not `scrollIntoView({behavior:'smooth'})`. | `Settings.tsx:23`. | Use `behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'`. |

### 8. Mobile / PWA fit

| # | Sev | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 8.1 | medium | `env(safe-area-inset-*)` is used throughout, but the viewport meta has no `viewport-fit=cover`, so on iOS those values are always 0 and that CSS does nothing. | `index.html:5`; `style.css:17,66,91,119,151`. | Add `viewport-fit=cover`, then check the top bar against the notch (the `.topbar` padding would need `env(safe-area-inset-top)`). |
| 8.2 | low | `theme-color` is `#f4f5f7` in HTML but `#ffffff` in the manifest, and so is `background_color`. The splash and status bar flash between the two greys. | `index.html:6`; `vite.config.ts:45-46`. | Use `#f4f5f7` (the `--bg` token) in both, plus a dark variant once 6.1 lands. |
| 8.3 | low | Thumb reach is good: tab bar, FAB and save bar are all at the bottom. The topbar Settings button is far from the thumb but rarely used, so that's fine. The fixed `.bottom-bar` can cover the focused Note field while the keyboard is open on Android. | `style.css:119`. | Add `scroll-padding-bottom: 120px` on the form, or hide the bottom bar while an input is focused on small heights. |
| 8.4 | low | No app shortcuts. A long-press "Show last used card" would be the fastest path to the till. | `vite.config.ts` manifest. | Add `shortcuts: [{ name: 'Last card', url: './#/last' }]` and have `#/last` route to the most recent `last_used_at` (depends on 2.1). |

### 9. Copy / microcopy

- The empty state says "Tap + to scan or **import** your first loyalty card", but there is no "import" on Add. It's "From image", and backup import lives in Settings. Use "Tap + to scan a card or add it from a photo." (`Lists.tsx:13`)
- "Store website, for the logo" is clear. Keep it.
- "Already expired. Save anyway?" is good: short and honest.
- "Text recognition is unavailable right now (it needs internet the first time)" is good. Keep it.
- "Cannot render this code: Error: bwipp…" is a raw error. See 1.2.
- The Settings intro "Your cards are stored only on this phone" is accurate and matters. Add the last-backup line beside it (5.1).

---

## Top 10 actions (prioritised)

Each item stands on its own: what to change, which files, and how to verify it.

1. **Auto-detect the barcode format on manual entry · S**
   *Change:* add `guessFormat(code)` to `web/src/logic.ts` (13 digits + valid check → `ean13`, 8 → `ean8`, 12 → `upc_a`, other printable ASCII → `code128`, else `qr`). In `web/src/screens/Add.tsx`, call it in the code `onChange` until the user taps a pill (track a `formatTouched` ref). Scanner and OCR results still set the format explicitly.
   *Verify:* unit tests in `logic.test.ts` for each branch. In the app, type `4006381333931` and EAN-13 becomes selected; save, and the detail shows a 1D barcode.

2. **Validate imported codes and render failures gracefully · S**
   *Change:* in `logic.ts` `parseImport`, run `validateCode`; on failure set `format: 'code128'` and keep the item. In `web/src/CodeView.tsx`, replace `String(e)` with a fallback block: the code text large and monospaced, plus "Can't draw this as <label>. Edit the format." with a link to `#/edit/<id>` (pass `id` in as a prop).
   *Verify:* import a backup with `{"format":"ean13","code":"2900000000017"}`. It imports as Code 128 and renders bars. Force a bad item in `localStorage`, and the fallback shows no "bwipp" text.

3. **Till mode: fullscreen, larger barcode · M**
   *Change:* in `web/src/screens/Detail.tsx`, tapping `.code-card` opens a fixed full-bleed white overlay (`role="dialog"`, close on tap, Esc or back via a history entry). For 1D formats rotate the SVG 90° to fill the height. Show the code text at 24px+. In `web/src/style.css`, keep the overlay white in every theme. Show the brightness tip only the first 3 times (`localStorage` counter).
   *Verify:* at 375×812 the EAN-13 bars span ≥ 85% of the screen height. Tapping or back closes it. The tip disappears after the 3rd view.

4. **Order cards by last use (+ optional pin) · M**
   *Change:* add an optional `last_used_at: number | null` to `Item` (`logic.ts`). Set it in `Detail.tsx` on mount via `updateItem`. Sort the tiles in `web/src/screens/Lists.tsx` by `last_used_at desc`, then name. Keep `serialize`/`parseImport` backward compatible (default `null`).
   *Verify:* open card C, then go back, and C is first. Old backups import without errors. Add a `logic.test.ts` case for the sort.

5. **Backup reminder and last-export status · M**
   *Change:* in `web/src/backup.ts`, store `wallet.lastExport` (timestamp + item count) on export, and use `navigator.share({files})` when `navigator.canShare?.({files})` is true, otherwise download. In `web/src/screens/Settings.tsx`, show "Last backup: <relative date>" and the result of `navigator.storage.persisted()`. In `Lists.tsx`, show a dismissible banner when there are >0 items and no export in 30 days (or never).
   *Verify:* with a fresh profile and 1 card the banner shows; after Export it disappears and Settings shows "Last backup: today". On Android the share sheet opens.

6. **Durable undo for Replace, and undo for Delete · S/M**
   *Change:* in `Settings.tsx` `run('replace')`, write the previous items to `localStorage['wallet.beforeReplace']` and show "Restore previous wallet" in the Backup panel whenever that key exists. In `Detail.tsx`, delete without a dialog, navigate back, and show an undo snackbar (add a `toast(message, action)` to `web/src/Dialog.tsx`). Until then, in `Dialog.tsx`, autofocus **Cancel** when `danger` is true.
   *Verify:* replace, leave Settings, come back, and Restore is still there and works. Delete a card and tap Undo within 5 seconds, and the card returns. Pressing Enter on a danger dialog does not delete.

7. **Back button cancels scanner and dialogs instead of leaving the screen · M**
   *Change:* in `web/src/screens/Add.tsx`, make scanning a route flag (`#/add?…&scan=1`, read in `App.tsx`) or push a history state and listen for `popstate` to `setScanning(false)`. In `web/src/Scanner.tsx`, add an "Enter code manually" button and a torch toggle when `getCapabilities().torch` is true. In `Dialog.tsx`, push a state when a dialog opens and cancel on `popstate`.
   *Verify:* fill the name, open the scanner, press browser Back, and you're on Add with the name intact. Open the Delete dialog, press Back, and the dialog closes while the detail stays.

8. **Fix ticket/coupon row layout and dates · S**
   *Change:* in `web/src/screens/Lists.tsx` `Row`, move the chip inside `.text` under the name. In `style.css`, make `.chip` `align-self:flex-start` and drop `flex:none` truncation pressure. Expired rows (`.row-card.dim`) should use muted colours, not `opacity`. In `logic.ts`, `validityLabel` uses `{dateStyle:'medium', timeStyle:'short'}`, and the ticket chip says "Ends today, 15:40" without the date.
   *Verify:* "Prague Metro 24h" shows its full name at 375px. The detail subtitle has no seconds. Expired text measures ≥ 4.5:1.

9. **Dark mode for the app chrome · M**
   *Change:* in `web/src/style.css`, move every literal colour (`#fff` inputs/buttons, `#e6e8ee`, chip/tip/banner/result tints, `#c9cdd6`) into `:root` tokens and add a `@media (prefers-color-scheme: dark)` override. Add `color-scheme: light dark`. `.code-card` and the till overlay stay `#fff`. In `web/index.html`, add a second `theme-color` meta with `media="(prefers-color-scheme: dark)"`.
   *Verify:* set colour scheme to dark and check the list, Add, Settings and dialogs are all dark, with text ≥ 4.5:1, while the barcode card stays white.

10. **Form and search polish: inline errors, empty results, focus, targets · S**
    *Change:* in `Add.tsx`, replace the `notify(...)` validation calls with an `errors` state shown under each field (`aria-invalid`, `aria-describedby`), focus the first invalid field, and use `FORMAT_LABEL` in `logic.ts` `validateCode`. In `Lists.tsx`, show "No card matches 'q'" plus "Add 'q'" when `cards.length === 0 && q`, and include `note` and `code` in the match. In `style.css`, add `.search:focus-within` outline and set `.pills button` and `.segmented button` to `min-height:44px`. Add `viewport-fit=cover` in `index.html`.
    *Verify:* saving an empty form highlights Name inline with no modal. Searching "zzz" shows the empty state. Tabbing into search shows a ring. Pills measure 44px in devtools.

---

## Biggest risks

1. **Data loss.** The only copy is in `localStorage`. There are no backup reminders, nothing shows when you last exported, and Undo disappears once you leave Settings. One "clear site data" or phone switch loses everything.
2. **Codes the till can't scan.** QR is the default for hand-typed EANs, imported codes are never validated (so raw errors show instead of bars), and the code area is small with no till mode.
3. **Losing what you typed through the back button.** The scanner and dialogs aren't in history, so Android back leaves the Add screen and discards what you entered. There's also no unsaved-changes guard.
