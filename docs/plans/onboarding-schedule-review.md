# Plan: schedule review step when adding a car

## Context

Today "Add a car" creates the car and its trait schedule in one tap. The user
never sees the schedule until later, then has to open each item one by one to
change an interval, switch it off, or say when it was last done. Every new car
also starts with every item "Unknown".

Goal: after the car details, show the full schedule on one screen. The user can
accept it as is, or change items there: interval, on/off, and when it was last
done. One tap saves it all. The mockup David saw in chat is the target look.

David's decision (2026-10-15): the step also asks "last done" per item.

## Flow (all on `#/add-vehicle`, no new route)

1. **Car** (step 1 of 3): today's VIN / manual form + trait pickers. The button
   becomes "Next: review schedule". No database write yet. The duplicate check
   runs here (pure `matchesExistingVehicle` against `db.vehicles`), so the user
   never fills step 2 for a car that already exists.
2. **Schedule** (step 2 of 3): see "Screen" below. "Back to car details" keeps
   every value. Changing a trait on step 1 rebuilds the list but keeps edits for
   categories that still exist.
3. **Done**: save in one transaction, then go to `#/vehicle/<id>` with the
   existing `gl_just_added_vehicle` welcome banner. (Step 3 is the landing, not
   a separate screen.)

## Screen (step 2)

Mobile first, matches the mockup:

- Navy header (`--frame`): 3-segment progress bar, mono eyebrow
  "STEP 2 OF 3 · SCHEDULE", title "Here's the plan for your <year make model>",
  one line naming the traits ("Built for gas, automatic, AWD") and how to edit.
- **Current miles** field at the top of the list (optional, number). Saved as an
  odometer reading. Hint: "Helps us work out what's due."
- White card, items grouped under mono group labels: Engine, Tires and brakes,
  Fluids, Other.
- Each row: name, "Every 5,000 mi or 6 mo" in mono, a switch on the right.
  A "CHANGED" tag when the interval differs from suggested, a "Last done …" line
  when set. Off rows: struck-through, "Not tracked".
- Tap a row to expand it (one open at a time):
  - Interval chips: "Suggested · <consensus>", "Maker · <factory>" (one chip
    if equal), "Custom". Custom shows two small inputs: miles, months.
  - Template note (`consensusNote ?? note`) in small muted text.
  - "Last done": date input + miles input, both optional. Empty = "Don't know".
  - "Reset to suggested" link when changed.
- Sticky footer: mono summary "11 OF 12 TRACKED · 2 CHANGED · 3 WITH HISTORY",
  primary button "Add car" (one accent button only), "‹ Back to car details".
- Footnote: "You can still change any item later from the car's schedule."
- Fonts: Overpass + Overpass Mono only. Existing tokens in `src/styles/app.css`.
  Reuse `.choice-chip`. Respect `prefers-reduced-motion` for the expand.
  Switch is a real `<button role="switch" aria-checked>`.

## Validation (inline, under the field)

- Last-done date can't be in the future.
- Last-done miles can't be higher than current miles (when both given).
- Custom interval needs at least one of miles/months, whole numbers > 0.
  Use `parseNumberInput()` (never NaN).
- Rows with an error block "Add car" and auto-expand.

## Data (no schema change)

How each edit is stored on the `ReminderRule`, inside the same transaction that
creates the vehicle:

| Edit | Stored as |
|---|---|
| Switched off | `override = { kind: 'not-needed', note: null, atDate: null, atMiles: null }` |
| Custom / Maker interval | `customIntervalMiles/Months` (only when it differs from the suggested interval) |
| Last done | `override = { kind: 'already-replaced', atDate, atMiles }` |

Off wins over last done. `already-replaced` is the existing pre-app-history path:
`resolveLastDone()` (`src/domain/reminderStatus.ts`) reads it, and it survives
`syncRuleFromHistory` recomputes (which would wipe a direct `lastDoneDate`).
No fake events: no cost, no shop, no clutter in history.

## Code changes

- **New `src/domain/scheduleReview.ts`** (pure, tested):
  - `type ScheduleEdit = { enabled: boolean; customMiles: number|null; customMonths: number|null; lastDoneDate: string|null; lastDoneMiles: number|null }`
  - `reviewItems(templateKey)` → per-category display rows from
    `templateEntries()` (`src/db/scheduleTemplates.ts`): label, group, suggested
    and maker intervals, note.
  - `scheduleGroup(category)` → group name.
  - `applyScheduleEdits(rules, edits)` → rules with the table above applied.
  - `validateEdit(edit, currentMiles, today)` → field errors.
- **`src/db/vehicleOnboarding.ts`**: `AddVehicleInput` gains optional
  `edits?: Record<MaintenanceCategory, ScheduleEdit>` and `currentMiles?: number | null`.
  Inside the existing transaction (add `db.odometerReadings`): apply
  `applyScheduleEdits` to `rulesForVehicle(...)`, and add an odometer reading
  (same shape as `recordOdometerReading` in `src/db/events.ts`, dated
  `localDateISO()`) when miles are given. Without edits it behaves as today.
- **New `src/components/ScheduleReview.tsx`**: the step 2 screen. Props:
  identity, traits, templateKey, edits, currentMiles, onChange, onBack, onSubmit,
  submitting, error.
- **`src/pages/AddVehicle.tsx`**: add `step: 'car' | 'schedule'` state, edits
  state, current-miles state. Step 1 submit → dup check → step 2. Step 2 submit
  → `addVehicle({ ..., edits, currentMiles })`. Both VIN and manual modes share
  one "Next" path (remove the duplicated submit form blocks while there).
- **`src/styles/app.css`**: a small `.schedule-review` block (header, groups,
  rows, switch, sticky footer).

Untouched: reminder engine, verdict/"Unknown" rules (an item with last done now
simply has history), F-150/Rogue templates, `RuleOverrideEditor`.

## Tests

- `tests/scheduleReview.test.ts`: grouping, maker = suggested collapses to one
  chip, `applyScheduleEdits` for off / custom / maker / last done / off+last done,
  no custom stored when equal to suggested, validation cases.
- `tests/vehicleOnboarding.test.ts` (or extend the existing addVehicle test):
  edits land on rules, odometer reading created, nothing written on duplicate,
  no-edits path unchanged.
- `npm test`, `npm run typecheck`, `npm run build`.

## Verification

`preview_start` config `garage-log`, mobile viewport (375×812):
1. Manual entry → traits → Next. List shows grouped items.
2. Switch one off, set a custom interval, set last done on oil. Summary updates.
3. Back, change a trait, Next: edits kept where the item still exists.
4. Add car → car page: off item shows N/A, custom interval shown, oil shows a
   real due date (not "Unknown"), mileage gauge uses the entered miles.
5. Try a duplicate car → stopped on step 1.
6. Screenshot step 2 for David.

## Handoff

Branch `feat/onboarding-schedule-review` off `main`. Codex builds per repo role
split. Write this plan to `docs/plans/onboarding-schedule-review.md` and the task
to `docs/handoffs/active.md` (also remove the stale "trait schedules awaiting PR"
entry: PR #54 is merged). Claude reviews the PR.
