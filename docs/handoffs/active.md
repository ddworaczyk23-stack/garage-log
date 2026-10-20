# Active Handoff

Shared state between Claude Code and Codex on this repo. Read this before
starting work; update it when you finish.

**Hard rule: this file holds OPEN work only.** The moment a task is
confirmed done (live-verified, deployed, or explicitly dropped), delete its
entry — don't leave a "RESOLVED"/"DONE" paragraph sitting here. Before
deleting, fold anything future-you would need into the right place: a durable
rule goes in `CLAUDE.md`, and the story goes in git history / a changelog if
this project keeps one. This file is not the permanent record. Prune
aggressively, every time.

## Open

- **"Do these together" visit bundles — READY FOR CODEX (2026-10-20).**
  David's idea: when several simple jobs come due close together, show them
  as one group and suggest doing them at one shop visit. One branch
  `feat/visit-bundles` off `main`, one PR. No schema change, no engine
  change, no ranking change, no new deps.
  1. **New pure module `src/domain/bundles.ts`** (no DB calls):
     - `SAME_VISIT: ReadonlySet<MaintenanceCategory>` = oil-change,
       tire-rotation, tire-inspection, tire-balancing, engine-air-filter,
       cabin-air-filter, wiper-blades, multi-point-inspection, battery-check,
       brake-inspection. Comment why: quick jobs a shop does during an
       oil-change visit. Fluid flushes, spark plugs, belts, alignment, tire
       replacement stay out (bigger jobs, own visit).
     - `BUNDLE_WINDOW_DAYS = 60` (about 2,000 mi at the engine's 12k/yr).
     - `visitBundle(reminders: ComputedReminder[]): ComputedReminder[]`.
       Candidates = `knownReminders(reminders)` (verdict.ts) with status
       overdue / due-next / watch-next and category in `SAME_VISIT` and a
       finite `urgencyValue` (reminderEngine.ts, already exported).
       Anchor = the candidate with the lowest `urgencyValue`. Bundle = every
       candidate with `urgencyValue(r) <= urgencyValue(anchor) +
       BUNDLE_WINDOW_DAYS`, in engine order (sort by urgencyValue, stable),
       max 5. Return `[]` when fewer than 2.
  2. **Tests `tests/bundles.test.ts`**, built from real engine output like
     `tests/verdict.test.ts` (`computeVehicleReminders` + `makeRule`):
     groups 3 near items; leaves out a near item that is not in SAME_VISIT
     (e.g. spark plugs); leaves out a same-visit item more than 60 days
     after the anchor; returns `[]` for one item; ignores items with no
     history; caps at 5; an overdue anchor still groups watch-next items
     within the window.
  3. **Log form:** `src/components/EventForm.tsx` gets an optional
     `initialAdditionalCategories?: MaintenanceCategory[]` prop that seeds
     the existing `additionalCategories` state on a fresh add only (ignored
     when `existing` is set). In `src/pages/VehicleDetail.tsx`, `openForm`
     gains an optional third arg for it, held in state next to
     `serviceCategory`, cleared in `closeForm`, passed to the maintenance
     `EventForm` (include it in that form's `key` so it remounts).
  4. **Car page (`VehicleDetail.tsx`):** when `visitBundle(list).length >=
     2`, add a footer inside the "Next N jobs" box (or, if that box is
     hidden, a small `.card.box` of its own right after where it would be):
     title line "Do these together", muted line "One visit: A, B and C"
     (labels in bundle order, `joinAnd`-style, export `joinAnd` from
     verdict.ts rather than copying it), and a `btn btn-secondary` "Log as
     one visit" -> `openForm('service', bundle[0].rule.category,
     bundle.slice(1).map((r) => r.rule.category))`. Reuse `.box-footer`.
  5. **Home (`src/pages/Dashboard.tsx` `TodayCard`):** when the car's
     bundle has 2+ items, add one line under the existing also-line:
     "Save a trip: A, B and C at one visit". Same dot + muted style as
     `.hm-also`. Don't change `compactSign`.
  6. Leave Coming up, Check, ShopBrief, and the schedule ledger as they
     are (v1).
  Done = `npm test` + `npm run typecheck` + `npm run build` clean; on the
  local-only DB (no `.env.local`) a car with oil + air filter + inspection
  due within ~2,000 mi shows the group on Home and the car page, and "Log
  as one visit" opens the form with oil selected and the other two already
  ticked under "Also"; saving resets all three (they leave the group).
  Check 1440px and 375px. Don't push or merge; leave for Claude to review.

- **Add a car: instant pickers (2026-10-20).** Shipped in PRs #63, #67,
  #68, #71, #75 (all merged, deployed). Model list comes from bundled EPA data
  (145 makes in the deploy log), with NHTSA names merged in a few seconds
  later ("F150" becomes "F-150", a picked model is respelled in place). Trim
  is a typed field (hint "As on the badge", no make-specific examples); EPA's engine/transmission/drive versions are a separate
  "Engine & drive" picker that fills the schedule questions. David confirmed
  on the live site: Ford models load instantly, and 2020 Nissan Rogue loads
  its versions. Still unconfirmed: (1) picking an Engine & drive version
  fills Engine and the questions, (2) the Rogue list has no Rogue Sport
  mixed in. Ask David to try both; if they hold, delete this entry. (The
  live trim fallback, for years EPA hasn't published yet, can only be
  exercised next model year.)

- **Calendar feed: confirm Google (2026-10-15).** Everything else shipped
  (PRs #32, #33) and was verified on David's iPhone 2026-10-14: logging a
  brake inspection moved the Apple Calendar event by itself. David added the
  feed to Google Calendar by URL on 2026-10-14; Google refreshes about once a
  day. Ask him whether the truck's brake inspection shows May 27, 2027 there.
  If yes, delete this entry. If not, check the feed was added as "From URL"
  (not imported) and that the calendar is turned on in the Google app.

- **Possible follow-up (not started, user chose calendar for now):** true
  push + email reminders need a server (e.g. Cloudflare Worker cron + Web Push
  for home-screen PWAs on iOS 16.4+, Resend for email). Means due dates leave
  the device, so confirm with the user before building.
