# Mobile redesign plan (round 2 of the design review)

Source: `.impeccable/critique/2026-10-13T19-44-04Z__src.md` (24/40 critique,
13/20 audit, mobile 375-390px). Round 1 (quick wins: button font, cents in
cost, tap targets, tooltip clipping, red status text, cost bars) is PR #7.

This round covers the three bigger findings the user chose to fix:
setup flow (critique P0), the crowded vehicle page (P1), and screens that
don't match (P2). Plus the form polish (P2) and early "empty furniture" (P3).

Ground rules: refinement, not a new look. Keep the road-sign verdict panel,
urgency ruler, four signal colors, and DESIGN.md. Every phase is its own
small PR off `main`. Verify each at 375px in the browser pane before PR.

---

## Phase 1: Setup asks for the last oil change (critique P0)

Problem: copy says "add an odometer reading and real verdicts start". The
engine (`hasRealData` in `src/domain/verdict.ts`) ignores odometer readings,
so the verdict stays "Not set up yet" while rows below say BOOK SOON.

Decision (user, 2026-10-13): ask "When was your last oil change?" first.
A logged oil change is real history, so the verdict turns real at once.

1. `src/domain/verdict.ts:330` not-set-up sentence ->
   "Coast doesn't know this car yet. Log your last oil change (or import
   your service history) and real verdicts start."
2. `src/pages/Dashboard.tsx:71` step 2 -> "**Log your last oil change**:
   the date and mileage are enough."
3. `src/pages/VehicleDetail.tsx` welcome banner (`justAdded`): sentence ->
   "When was its last oil change? That one entry gives you a real verdict."
   Button "Log last oil change" -> `openForm('service', 'oil-change')`.
   Secondary link: "Import service history".
4. Not-set-up rows: while the vehicle verdict band is `not-set-up`, the
   schedule rows show a neutral slate "Estimated" pill instead of
   BOOK SOON / FIX NOW (`ScheduleRow.tsx`). The engine is unchanged.
5. Show the "No history yet" explainer ONCE at the top of the schedule
   (not on every row). Row meta becomes "Every 10,000 mi · est. Oct 23".
   Text is in `reminderEngine.ts:270-271`; move the sentence to a schedule
   header note and shorten the per-row reason when `lastDone` is empty.
6. Success feedback: after any EventForm/OdometerForm save, a `role="status"`
   toast: "Oil change logged · next due 94,650 mi". One small `Toast`
   in `ui.tsx`, used by VehicleDetail.
7. Tests: update any verdict/engine tests that assert the old strings.

## Phase 2: Vehicle page, composed not stacked (critique P1)

Today ~12 sections and 7+ ways to add something. Target order:

1. Masthead (back link, eyebrow, name, specs line). Remove the duplicate
   "SERVICE RECORD · 2020 FORD" eyebrow; use "Vehicle".
2. Verdict panel + ruler (unchanged).
3. Odometer as a quiet white row inside the cover card: mono numeral, "mi",
   YTD on the right, "Update" text action. Remove the solid blue
   `.instrument` plate (blue = "can coast"; it competed with the verdict).
   Restyle in `app.css` `.instrument`/`.odo*` to ink on `--bg-inset`.
4. ONE add action: the floating "+ Log" button opens a small sheet with
   three choices (Service, Repair, Odometer). Remove the three-button row
   (`+ Service / + Repair / + Odometer`). Move the floating button so it
   does not sit directly over the center Check disc (dock it bottom-right,
   above the nav).
5. Schedule card: rows keep name, interval + Edit, status pill. Move
   "Brief" and "Log" off the row into the service page
   (`#/service/<id>:<cat>`), which already exists. Row stays tappable.
6. Below the schedule, one "History & documents" card with three folds:
   Maintenance log, Repair log, Glovebox. Receipts live inside Glovebox.
7. Milestones and Calendar export: keep, but Calendar shows only when at
   least one item has a real due date.
8. Delete vehicle stays last, but as a plain text action that opens the
   existing confirm (not a red card on every visit).

## Phase 3: Screens that match (critique P2)

1. One `PageHeader` component in `src/components/ui.tsx`: eyebrow, title,
   optional meta on the right, double rule. Use it on Dashboard, Vehicles,
   VehicleDetail, Documents, Costs, Backup, AddVehicle, Check.
2. Type voices (decision, update DESIGN.md §3 to match):
   page titles and vehicle names = Newsreader (keep the current serif look);
   card titles = Overpass 600; explanatory sentences = Newsreader;
   numbers = Overpass Mono. Remove the mono prose on schedule rows.
3. Icons: replace emoji (vehicle 🛻/🚙 in `domain/vehicle.ts:66`, docs 📄
   in Documents/DocumentGrid, ⚠️ in ScheduleRow:70) with the stroke SVG
   set Nav already uses.
4. Wording: one name for the action, "Add a car", everywhere.
   Money: thousands separators, no ".00" on whole dollars ("$2,721").
   Costs: "Total spent", not "Total invested".
5. Costs page: replace the stat-tile grid with a single sentence summary +
   the per-vehicle bars (no tile grid, per PRODUCT.md anti-reference).

## Phase 4: Forms and early empty states (critique P2/P3)

1. EventForm/AddVehicle: white fields (DESIGN.md), 16px gap under headers,
   styled file button instead of native "Choose Files", hide "Quick fill"
   on edit, Year as a select (current year back 40), Drivetrain as chips
   (FWD / RWD / AWD / 4WD).
2. Cost sanity check, from the owner's OWN history only (no typical-price
   ranges: `costHeuristics.ts` was removed in 2cabb95 because sample prices
   misled). New pure helper in `domain/cost.ts`, unit-tested:
   `costLooksOff(cost, priorCosts)` returns true when there is at least one
   prior cost > 0 for the same vehicle + category and `cost` is more than 3x
   the highest of them. No prior cost -> never warn. EventForm shows a
   non-blocking inline note under Cost ("That's much higher than you've paid
   before for this ($25). Double-check the amount.") and still saves.
3. AddVehicle: one time promise ("about a minute") to match the welcome.
   VIN mode: hint "Find it on the driver-side dashboard or your insurance
   card". Keep the slate hero but drop the double border; it is a page
   intro, not a verdict.
4. Dashboard: hide the side-by-side table and calendar export until a car
   has history; show "—" instead of "0 overdue" for unknown cars.
5. Documents filters: stack under 400px so they don't truncate.
6. Backup: move "Developer & debug tools" link to the Debug route only.
7. From the Phase 1 review: on a set-up car, never-logged rows lost their
   "no history" cue (ScheduleRow hides `reason` when there is no history).
   Add a short "No history" meta or pill text for those rows.
8. From the Phase 1 review: `Toast` mounts its `role="status"` region with
   the message already inside, which some screen readers skip. Keep one
   empty live region mounted and set its text on save.

## Done when

- Re-run `/impeccable critique` and `/impeccable audit` at 375/390.
  Target: critique >= 32/40, audit >= 17/20, no P0/P1.
- 393+ tests pass, typecheck clean, no console errors.
- User checks on iPhone after each phase deploys.
