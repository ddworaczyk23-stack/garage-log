# Next sessions — backlog + handoff

State as of 2026-07-18. Findings come from a full app review (Fable session);
context docs are in place: PRODUCT.md (strategy), DESIGN.md (visual system),
CLAUDE.md (architecture). Each session below is scoped to run standalone.

## DONE — onboarding polish (commit `380af1e`, deployed)

The `/impeccable onboard` pass: `AddVehicle.tsx` manual mode needs only
year/make/model; `Dashboard.tsx` first-run hero for an empty garage;
`VehicleDetail.tsx` not-set-up setup strip instead of the 0/0/N tally.
Verified live and pushed to main.

## DONE — Session A: playbook coverage (safety content)

Added to `src/domain/playbooks.ts` (research in
`design/playbooks-research/05-warning-lights-addendum.md`,
`06-car-wont-start.md`, `07-steering-vibration.md`):
- Coolant-temperature light + overheating outcome on the existing
  `warning-light` playbook (fix-now, drive verdict tow).
- Red brake warning light as its own top-level light option (was only
  reachable as an aside inside the ABS flow) — asks whether the parking
  brake is fully released first (the most common false alarm) before
  landing on the hydraulic-system fix-now outcome.
- New "The car won't start" playbook (dead battery / starter / cranks-but-
  won't-catch / starts-then-dies — every outcome is fix-now, a no-start is
  never coast/all-clear).
- New "Steering feels wrong or vibrates" playbook (loose steering and
  sudden heaviness are fix-now; balance/alignment/CV-joint/tie-rod wear are
  book-soon), deliberately scoped away from the existing brake-pulse outcome.

Also fixed `src/domain/quoteCheck.ts`: when there's no fair-range anchor and
no diagnosis check is marked skipped, the rating is now the neutral
`'no-anchor'` (UI label "Amount not checked", slate tone) instead of
`'reasonable'` — previously a reminder-based brief (no cost data) showed a
green "Looks reasonable" even though the dollar amount was never checked, a
skipped-check overrides it regardless. `ShopBrief.tsx`/`app.css` got a
`qc-neutral` tone reusing `--c-stale`.

Tests: 33 new tests across `tests/playbooks.test.ts` (58 total) and
`tests/quoteCheck.test.ts` (17 total) — 325/325 tests pass, tsc clean.
Verified live: both new light options and both new playbooks appear and
resolve correctly in the Check flow; a reminder-based shop brief (no cost
data) now shows "Amount not checked" instead of a false-positive green.

## DONE — Session B: hardening (glue code, no design)

- `src/db/events.ts` — `recordCompletedEvent`/`deleteEvent`'s multi-write
  sequences (event + rule sync + concern resolve/reopen) now run inside one
  `db.transaction`, like db/backup.ts. Care point: file attachment
  (`attachEventDocument`) does canvas/`createImageBitmap` compression work
  outside Dexie's tracked promise zone, which can silently commit an open
  transaction early — so `recordCompletedEvent` now generates the event id
  up front, attaches files BEFORE opening the transaction, and only wraps
  the pure-Dexie event-write + rule-sync + concern-resolve trio.
  `deleteEvent` has no such hazard (bulk-deleting stored blobs isn't
  compression) so its whole sequence is wrapped. Two new tests
  (`tests/events.test.ts`) force a mid-transaction failure via
  `vi.spyOn(db.reminderRules, 'update')` and assert the event write/delete
  actually rolls back — proving the atomicity, not just re-testing the
  already-covered happy path.
- Concern↔playbook coupling: documented (not schema-migrated) — added a
  "FROZEN IDS" header block to `src/domain/playbooks.ts` and strengthened
  the `Concern.playbookId`/`outcomeId` comments in `types.ts`: new outcomes
  are free to add, but an id must never be renamed/removed/reused or every
  saved concern pointing at it silently orphans its shop brief.
- `reopenConcern`'s `resolvedEventId: undefined` write: verified against
  Dexie's own source (`applyUpdateSpec`/`setByKeyPath` calls `delete
  obj[keyPath]` for an `undefined` value) that the key is genuinely removed,
  not stored as literal `undefined` — already correct, no code change
  needed. Added a regression test in `tests/concerns.test.ts` asserting
  `'resolvedEventId' in c` is `false` after reopening, so a future Dexie
  upgrade can't silently regress this.
- Concern age: `concernSentence` (src/domain/verdict.ts) now takes an
  explicit `today` ISO date (same convention as the reminder engine's
  `asOf` — no wall-clock reads inside the pure domain layer) and a fix-now
  concern open 14+ days says "N weeks ago" instead of repeating an
  increasingly-stale-looking date; under the threshold it still shows the
  actual date. `vehicleVerdict`'s new `today` param is required, not
  defaulted — a silently-wrong default would render "NaN weeks ago" for an
  unmigrated caller, so tsc catches every call site instead. Updated both
  production call sites (Dashboard.tsx, VehicleDetail.tsx) and all test call
  sites; 2 new age-threshold tests in `tests/verdict.test.ts`.
- `src/pages/Check.tsx`: "Add to my list" is hidden for `all-clear` outcomes
  (a saved all-clear concern is invisible everywhere else — never surfaces
  in `vehicleVerdict`'s sentence or coast list — so it would become a
  permanently-orphaned row with no way to see or clear it).

330/330 tests pass (5 new since Session A's 325: 2 verdict age tests, 1
concerns regression test, 2 events atomicity tests), tsc + build clean.
Verified live:
logging a service now writes through the transaction-wrapped path with the
rule cache correctly synced and zero console errors; the all-clear
"condensation" outcome in the Check flow shows no "Add to my list" button
(only "Make my shop brief" / "Check something else"), while fix-now/
book-soon/coast outcomes still show it.

## DONE — Session C: polish + brand cutover

- Brand strings → all converged on **Coast** (Garage Log stays the internal/
  engine-room name per the merge plan, e.g. `types.ts`'s header comment and
  CLAUDE.md — those are code-facing, not user-facing). Fixed every remaining
  user-visible "Garage Log": `VehicleDetail.tsx`'s colophon ("Garage Log · The
  glovebox, kept honest" → "Coast · The service record, kept honest", matching
  the page's own "Service Record" eyebrow), `shopBrief.ts`'s `briefToText`
  footer ("— Generated by Garage Log" → "— Generated by Coast"), `main.tsx`'s
  DB-boot-failure fallback ("Garage Log couldn't start" → "Coast couldn't
  start"), `domain/backup.ts`'s two `validateBackup` user-facing error strings
  (wrong-format / future-format-version messages), and `ImportHistory.tsx`'s
  paste-flow instructions ("Open Garage Log..." → "Open Coast..."). The
  colophon and footer strings weren't caught by an initial grep (mixed-case
  source text rendered uppercase via CSS `text-transform`) — found instead by
  driving the app live in the browser, which is why every fix in this session
  was verified live, not just grepped.
- Button hierarchy: added `.btn.btn-secondary` (app.css, accent-tint fill —
  `var(--accent-tint)` bg + `var(--accent)` text, same pattern the quick-add
  buttons already used) and applied it to the secondary half of both stacked
  pairs: Check's "Make my shop brief" (`pages/Check.tsx`) and the brief's
  "Print it" (`pages/ShopBrief.tsx`) — "Add to my list" / "Share this brief"
  stay filled primary. Also fixed `.btn.quick-add-btn:hover`, which still had
  a hardcoded olive `rgba(79,91,42,.18)` left over from the pre-Coast M12
  theme (should have tracked `--accent`) — now shares the same
  `color-mix(in srgb, var(--accent) 18%, transparent)` hover as the new
  secondary variant.
- Today-card instrument redundancy: removed `<HealthMeter>` from Dashboard's
  `TodayCard` (`pages/Dashboard.tsx`) — the card now shows VerdictPanel +
  UrgencyRuler only. `VehicleDetail.tsx` keeps all three (meter + panel +
  ruler); `s.health` is still read elsewhere on Dashboard (needs-attention /
  not-set-up filters) so only the render was dropped, not the underlying
  computation. This also matches a documented PRODUCT.md design principle
  ("Two instruments saying the same thing is one too many") noticed while
  making the change, not the original reason for it.
- Check flow: the per-question eyebrow (`pages/Check.tsx`) now reads
  "Checking `<vehicle>` · `<topic>`" on every question screen (was
  "Checking `<vehicle>`" only on the playbook-choice screen, then just the
  topic label like "A braking noise" on every question after) — carries
  vehicle context through instead of dropping it after step 1. Confirmed no
  overflow at 1280 with a real playbook walkthrough.

330/330 tests pass (unchanged — this was CSS/copy/JSX-prop only, nothing
newly pure to unit-test), tsc + build clean. Verified fully live in the
browser end-to-end on a throwaway local-only vehicle (not signed in, no cloud
writes; added then deleted after verification, per the standing sandbox
gotcha — the sandbox dev server points at the real Dexie Cloud DB): Today card
single-panel layout, Check flow eyebrow carrying "Checking Camry · A braking
noise" through a grind→fix-now path, the verdict screen's primary/secondary
button contrast, the standalone shop brief's Share (filled) vs Print (tinted)
buttons, and the "Coast · The service record, kept honest" colophon on
Vehicle Detail.

## STANDING RULES

- npm test + npm run typecheck gate every session.
- Pushing main auto-deploys — commit freely, push only when asked.
- Reminder-engine math (domain/reminderEngine.ts, reminderStatus.ts,
  scheduleTemplates.ts curated entries) is frozen unless a session says so.
