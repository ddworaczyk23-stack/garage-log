# Check flow fixes + fuller Settings (from the 2026-10-14 design review)

Source: `.impeccable/critique/2026-10-14T13-16-33Z__src.md` (27/40).
Branch: `fix/check-flow`. One PR, do not merge. Rules that still apply: two
fonts only, navy is chrome only, red only for safety, never-logged = Unknown.
Verify at 375 and 390px in the browser (with seeded cars, i.e. WITHOUT
`.env.local`; then once WITH it for the Settings sync card) before the PR.

## 1. [P1] Check must not use never-logged items (`src/pages/Check.tsx` ~120)

`overdueCategories` / `dueSoonCategories` are built from raw
`getVehicleReminders()`. Run the list through `knownReminders()` from
`src/domain/verdict.ts` first. Today an F-150 brake grind says "Your brake
inspection is also due soon" though it was never logged (Unknown).
Add a unit test if the context-building can be reached from a pure function;
otherwise cover it in `playbooks` tests via `contextualizeOutcome` inputs.

Same rule on `src/pages/ServiceDetail.tsx` (~lines 118-140): when the item has
never been logged (`lastDone.date == null && lastDone.miles == null`), do NOT
show "Next due" or "Estimated". Show one muted line instead:
"Log the last time this was done and Coast can tell you when it's next due."

## 2. [P1] Check "‹ Back" button (`FlowTop`, Check.tsx ~523)

- Remove the `<Tooltip>` wrapper (the button already says "Back").
- Reset the button: `border: 0; background: none; padding: 0; font: inherit`.
- Put `FlowTop` inside the navy title band, like other pages' back links:
  color `var(--on-frame-accent)`, 44px tall tap area. No concrete strip
  between the top bar and the band, no hairline seam.
- Step dots sit in the band too: undone `rgba(255,255,255,0.25)`, done
  `var(--on-frame-accent)`. Keep `role="img"` + "Step N of M".

## 3. [P2] Phone back-swipe stays inside Check

The app router listens to `hashchange` (see `src/app.tsx`). Each forward step
in Check (choosePlaybook, answer) calls `history.pushState({ chk: depth }, '')`
with the SAME hash, so the router does not re-render. A `popstate` listener in
`Check` (useEffect, cleaned up) runs the existing pop-one-step logic. The
on-screen "‹ Back" calls `history.back()` while depth > 0, so on-screen and
swipe back share one path. At depth 0, back leaves to `#/check` as today.
"Check something else" resets to depth 0 (`history.go(-depth)`).
Test by hand: pick symptom, answer, swipe/browser back steps back one screen;
back from the first screen returns to "Which car?".

## 4. [P2] Verdict ending (Check.tsx ~300-365)

- For `fix-now` and `book-soon`: "Make my shop brief" becomes the primary
  button (`btn btn-primary`), first in the row.
- "Add to my list" becomes secondary and is renamed
  "Save to {vehicleLabel}'s record". Success notice:
  "Saved. It now counts in {vehicleLabel}'s verdict." + the existing
  shareable-brief link. (Saved concerns feed the vehicle verdict; no separate
  list screen exists, so don't promise one.)
- Escalation box title: on a `fix-now` verdict say "Stop driving if:";
  otherwise keep "Treat it as “fix now” if:".
- Symptom picker hint "Describe it like you'd tell a friend" → "Pick what's closest."

## 5. Settings page earns its tab (`src/pages/Settings.tsx`, `Nav.tsx`)

- Tab icon: replace the person icon with a gear (same stroke style, 24 grid).
- Backup row sub-line shows the last backup: store `lastBackupAt` (ISO date)
  in `appMeta` when Export succeeds (`src/pages/Backup.tsx` onExport). Row
  reads "Last backup: Oct 14, 2026" or "No backup yet" (amber is NOT needed,
  plain muted text).
- Sync card (only when cloud configured): status line from
  `db.cloud.syncState` (phase: in-sync / pushing / pulling → "Up to date",
  offline → "Offline. Will sync when you're back online.", error → "Sync
  problem: <short message>") and "Last synced <relative time>" from
  `db.cloud.persistedSyncState.timestamp`. Subscribe like `useCloudUser` in
  `src/db/cloud.ts` (add `useSyncState()` there).
- Sign out: wrap in the existing `ConfirmButton` ("Sign out? Data stays on
  this device.").
- Footer line, muted small: "Coast · build <short sha or date>". Inject via
  `define` in `vite.config.ts` from `process.env.GITHUB_SHA` (first 7 chars),
  fallback `'dev'`.

## Done when

- Brake-grind check on the F-150 no longer mentions brake inspection as due.
- Check back button in the navy band, no default border; swipe-back steps back.
- Shop brief is the primary verdict action.
- Settings shows gear tab, last backup, sync status (with sync on).
- `npm test` + `npm run typecheck` pass; no console errors; 375/390 clean.
- Do not merge. Claude reviews, then re-runs the design review.
