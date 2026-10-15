# Plan: change a car's traits after it is added

## Context

A car's schedule is built from 4 traits picked at "Add a car": engine type,
transmission, drive, timing belt. They live only inside
`ReminderRule.templateKey` (`traits:v1:<power>.<trans>.<drive>.<belt>`). Today
there is no way to change them after the car is added. If a trait was wrong
(or "Not sure" was a guess), the schedule stays wrong and each item has to be
fixed by hand. Cars added before trait schedules (`generic-gas-vehicle` key)
can't get a trait schedule at all.

Goal: from the car page, change the traits, see exactly what the schedule
change does, confirm, done. Keep all history and the user's own settings.

## Decisions (made here, not asked)

- **Who can change traits:** cars on a trait key or the generic key. The
  F-150 and Rogue (`f150-2020`, `rogue-2020`) keep their hand-built schedules,
  so the option is hidden for them.
- **Removed items** (e.g. CVT fluid after switching to automatic): the rule is
  deleted. Logged service events are never touched, so history stays. The diff
  screen says so.
- **Kept items:** keep custom interval, override, and last done. Only
  `templateKey` and `label` update (label can change, e.g. "Dual-clutch fluid").
- **Added items:** new rules. Their last done comes from any matching logged
  events (same logic as `syncRuleFromHistory`), so past service counts.
- **Timing:** build after the "Not sure rows off" session
  ([local_b1bf2e6e](#local_b1bf2e6e-c01b-4be5-9e88-84d3ed975647)) merges. Both
  touch the trait pickers in `src/pages/AddVehicle.tsx`.

## Flow (UI)

1. **Car page → Specifications card** (`src/pages/VehicleDetail.tsx`): new row
   "Maintenance type" showing the traits in plain words ("Gas · Automatic · AWD
   · Timing chain"), or "Not set" for generic cars. A "Change" link opens a
   `Sheet` (`src/components/ui.tsx`), the same pattern as the other edit forms.
2. **Sheet, part 1: pickers.** The same chip pickers as "Add a car", pre-filled
   from the current traits. Extract `ScheduleTraitPickers` + `ChipPicker` from
   `AddVehicle.tsx` into `src/components/TraitPickers.tsx` and use it in both
   places (no copy).
3. **Sheet, part 2: what changes** (shows live as chips change, under the
   pickers):
   - "Added" list (green dot): e.g. Timing belt.
   - "Removed" list (gray, struck): e.g. CVT fluid, with the line "Your logged
     service stays in history."
   - "Kept: 11 items, your settings stay."
   - No changes → "Same schedule." and the save button is off.
4. **Save** button "Update schedule". One transaction. Sheet closes, a toast
   says "Schedule updated". Schedule card re-renders by itself (liveQuery).

Fonts Overpass + Overpass Mono only, existing tokens, one accent button.

## Code

- **New `src/domain/traitChange.ts`** (pure, tested):
  - `traitSummary(traits)` → "Gas · Automatic · AWD · Timing chain".
  - `diffSchedules(currentRules, newTemplateKey)` →
    `{ added: MaintenanceCategory[]; removed: ReminderRule[]; kept: ReminderRule[] }`
    using `templateEntries()` from `src/db/scheduleTemplates.ts`.
  - `canChangeTraits(templateKey)` → true for `parseTraitsKey()` keys and
    `GENERIC_TEMPLATE_KEY`.
- **New `src/db/traitChange.ts`**: `changeVehicleTraits(vehicleId, traits)`.
  One `rw` transaction over `reminderRules` + `events`:
  1. Read the vehicle's rules; refuse if `!canChangeTraits`.
  2. Kept → `update` `templateKey` + `label` (from the new template entry).
  3. Removed → `bulkDelete` ids.
  4. Added → `rulesForVehicle(vehicleId, newKey)` filtered to added categories,
     with `lastDoneDate/Miles` from the newest matching event (`matchesRule`,
     as in `syncRuleFromHistory` in `src/db/events.ts`; export a small shared
     helper instead of copying the loop).
  Every rule of the car ends on the same `templateKey`. That matters:
  `seedIfEmpty` (`src/db/seed.ts`) reconciles by one key per vehicle on every
  boot and would re-add removed rules if keys were mixed.
- **New `src/components/TraitChangeSheet.tsx`**: pickers + diff + save.
- **`src/pages/VehicleDetail.tsx`**: the "Maintenance type" row + open the
  sheet. Use the vehicle's rules already loaded via `getVehicleReminders`.
- **`src/pages/AddVehicle.tsx`**: import the extracted pickers.
- **`src/styles/app.css`**: small `.trait-diff` block.

No schema change. Milestones (`componentProfile()`) are not touched.

## Tests

- `tests/traitChange.test.ts` (pure): diff for CVT→auto, belt no→yes,
  FWD→AWD, generic→traits, same→same; summary text; curated keys refused.
- `tests/traitChangeDb.test.ts` (fake-indexeddb): kept rule keeps custom
  interval + override + last done; removed rule gone but its events remain;
  added rule picks up last done from an old matching event; all rules share the
  new key; running `seedIfEmpty()` afterward adds nothing back.
- `npm test`, `npm run typecheck`, `npm run build`.

## Verification

`preview_start` config `garage-log`, 375×812:
1. Add a car: gas, CVT, FWD, no belt. Log a CVT fluid service. Set a custom oil
   interval.
2. Car page → Change → Automatic + belt Yes. Diff shows Added: transmission
   fluid, timing belt; Removed: CVT fluid. Save.
3. Schedule shows the new items; oil keeps its custom interval; the CVT fluid
   service is still in history.
4. Reload: removed item does not come back.
5. F-150: no "Change" link.
6. Screenshot the sheet for David.

## Handoff

Branch `feat/change-traits` off `main`, cut after the "Not sure" PR merges.
Codex builds. Save this as `docs/plans/change-traits.md` and add the task to
`docs/handoffs/active.md`. Claude reviews the PR.
