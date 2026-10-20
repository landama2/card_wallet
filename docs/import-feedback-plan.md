# Import feedback: improvement plan

Based on the designer review of the backup import flow (Settings → Import). Files: `web/src/screens/Settings.tsx`, `web/src/backup.ts`, `web/src/logic.ts` (`parseImport`), `web/src/style.css`.

## Step 1: Report what actually happened (fixes the wrong number)
- `applyImport` returns `{ added, skipped }` (merge) or `{ added }` (replace).
- Messages: "Added 2 cards. 3 were already in your wallet." / "Replaced your wallet with 30 cards." / "Nothing new. All 5 are already in your wallet."
- Done when: merging 3 duplicates + 2 new reports 2 added, 3 skipped.

## Step 2: Success card instead of a grey line
- Tinted card (`--accent-soft`, check icon, bold line, muted detail) with a primary **View cards** button (`go('/cards')`), `role="status"`.
- Persists until the next pick; no toast, no timer. Move focus to the card so it doesn't fall to `body`.

## Step 3: Friendly errors
- `parseImport` throws typed messages: "That file isn't a wallet backup. Choose a file made with Export." and "Item N in the backup is incomplete, so nothing was imported."
- Show in `--danger` colour with `role="alert"`; never print `String(e)`.

## Step 4: Guard empty backups
- 0 items → message "This backup has no cards", no action panel (so Replace can't wipe the wallet).

## Step 5: Preview before choosing
- Compute dedupe at pick time: "5 in backup: 2 new, 3 already here", plus the first 3 names and "and N more".
- Buttons: **Add new cards** (primary, hidden/disabled when 0 new) / **Replace everything** / **Cancel**.
- Panel: `role="region"` + `aria-live="polite"`, scrolled into view (not a fake modal `dialog`).

## Step 6: Safer Replace
- Confirm text states both counts: "This deletes your 5 cards and loads 30 from the backup."
- Keep the previous list in memory and offer **Undo** in the success card until navigation. Skip auto-export and full history.

## Explicitly not doing
Spinner (import takes milliseconds), toast system, scrollable full preview, undo history.

## Order and checks
Steps 1–4 first (small, same two files), then 5–6. After each: `tsc --noEmit`, add a small test for `applyImport` counts and `parseImport` errors in `logic.test.ts`, then re-walk the flow in the browser (merge, replace, bad file, empty file, duplicates).
