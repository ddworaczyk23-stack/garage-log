# Plan: trait-based maintenance schedules for new cars

## Context

Today every car added with "Add Car" gets one fixed list (`generic-gas-vehicle`
in `src/db/scheduleTemplates.ts`). That list leaves out the transmission, 4WD/AWD
and timing-belt items, and it is wrong for EVs (oil changes) and diesels (spark
plugs). We researched 4 groups of "traits" (power, transmission, drive, timing
belt) instead of researching each model. The results and decisions are in
`docs/research/trait-modules/*.md`. Goal: a new car's schedule is built from its
traits. The F-150 and Rogue keep their hand-made lists.

## Core idea: the traits live in the templateKey

`ReminderRule.templateKey` is already the only link from a rule to its
intervals (`getTemplateEntry(templateKey, category)`, used by
`resolveInterval()`, `RuleOverrideEditor`, `TemplateAdmin`, and seed reconcile).
So a trait car gets a key that spells out its traits:

```
traits:v1:<power>.<trans>.<drive>.<belt>
power: gas | turbo | diesel | hybrid | ev
trans: auto | cvt | dct | manual | none      (none = unknown, hybrid, or EV)
drive: fwd | rwd | awd | 4wd | none
belt:  yes | no                              ("Not sure" = no)
```

Example: `traits:v1:turbo.auto.4wd.no`. The list is built in code from the key
every time (same as today: templates are code, never stored). Benefits:
- No schema bump, no new Vehicle field. Syncs and backs up as-is.
- Number fixes in code reach every trait car on the next boot.
- `seedIfEmpty` reconcile already calls `rulesForVehicle(id, templateKey)`
  additively, so it works for trait keys with no change.
- Old "Add Car" cars keep `generic-gas-vehicle`. Untouched.

## Changes

### 1. `src/db/traitTemplates.ts` (new, pure)
- `type VehicleTraits = { power, trans, drive, belt }` + `traitsKey(t)` and
  `parseTraitsKey(key): VehicleTraits | null`.
- `composeTraitTemplate(t): ScheduleTemplateEntry[]`:
  1. Start from the generic base list (step 3).
  2. Power: `ev` removes oil-change, engine-air-filter, spark-plugs,
     fuel-filter, serpentine-belt; adds EV `coolant` 120k/60mo; relabels
     battery-check "12V battery check"; adds the regen note to
     brake-inspection. `hybrid` relabels 12V + brake note, forces trans=none.
     `diesel` removes spark-plugs, adds fuel-filter 15k/12mo, oil 10k/12mo
     factory, 7.5k/6mo consensus. `turbo` adds only an oil-spec note line.
  3. Transmission (one): `auto` transmission-fluid 60k/72mo; `cvt` cvt-fluid
     60k/72mo factory, 40k/48mo consensus; `dct` transmission-fluid label
     "Dual-clutch fluid (and filter)" 40k/48mo; `manual` transmission-fluid
     label "Manual gearbox oil" 60k/48mo, + "also covers clutch fluid" on the
     brake-fluid note.
  4. Drive: `awd` differential-fluid label "Rear differential / AWD unit
     fluid" 60k/48mo. `4wd` transfer-case-fluid 50k/60mo + differential-fluid
     "Front & rear axle fluid" 50k/60mo. fwd/rwd add nothing.
  5. Belt `yes` (and power not ev): timing-belt 100k/96mo factory, 90k/84mo
     consensus, note about water pump/tensioner.
  Exact numbers and note text: copy from the "Decisions" part of each
  research file. Every note ends with "check your manual".
- Pure, no Dexie import, so it is easy to test.

### 2. `src/db/scheduleTemplates.ts`
- Add `templateEntries(key)`: `traits:` key → `composeTraitTemplate(parse(key))`
  (cache in a Map); else `SCHEDULE_TEMPLATES[key] ?? []`.
- `getTemplateEntry` and `rulesForVehicle` use `templateEntries`. No other
  caller changes.
- Generic base fixes from research (helps old Add Car cars too):
  spark-plugs consensus 90k→100k + softer turbo note; engine-air-filter add
  36mo; cabin-air-filter factory 30k/36mo, consensus 20k/24mo; coolant and
  brake-fluid note lines (coolant type, DOT type).
- Rogue `cvt-fluid` note: remove the wrong "Nissan says lifetime" claim
  (Nissan lists inspect 10k, replace 60k/72mo severe). Numbers unchanged.

### 3. `src/db/vehicleOnboarding.ts`
- `AddVehicleInput` gets optional `traits?: VehicleTraits`. With traits →
  `rulesForVehicle(id, traitsKey(traits))`; without → generic (keeps the
  current tests and any old caller working).

### 4. `src/services/vinDecode.ts`
- Read 3 more vPIC fields: `Turbo`, `ElectrificationLevel`, `TransmissionStyle`
  (plus the existing `FuelTypePrimary`, `DriveType`). Return
  `suggestedTraits` (partial, best-effort). Blank fields → no suggestion.

### 5. `src/pages/AddVehicle.tsx`
- Three more chip pickers, same pattern as `DrivetrainPicker` (generalize it
  into one `ChipPicker` in this file):
  - "Engine type": Gas · Turbo gas · Diesel · Hybrid · Electric (default Gas)
  - "Transmission": Automatic · CVT · Dual-clutch · Manual · Not sure
    (hidden for Hybrid/Electric)
  - "Timing belt?": Yes · No · Not sure (default Not sure; hidden for
    Electric). Small hint: "Not sure? Check your manual. Most newer cars have
    a chain."
- Prefill from `suggestedTraits`. Drive comes from the existing drivetrain
  chip. Pass `traits` to `addVehicle`.

### Not in this change (on purpose)
- Changing traits after a car is added (a follow-up; needs rule add/remove).
- Moving old generic cars to traits.
- Milestone `componentProfile()` still infers turbo/automatic from text and
  categories; a manual car's `transmission-fluid` reads as "automatic" there.
  Small follow-up if it shows up in use.

## Tests (vitest)
- `tests/traitTemplates.test.ts` (new): key round-trip; EV has no oil-change
  / spark-plugs / engine-air-filter and has 12V label + coolant; CVT car has
  cvt-fluid and no transmission-fluid; hybrid has no transmission item;
  diesel has fuel-filter and no spark-plugs; 4WD has transfer-case +
  differential; belt yes adds timing-belt, belt no does not; no duplicate
  categories in any combination (loop over all combos).
- `tests/vehicleOnboarding.test.ts`: addVehicle with traits writes rules with
  the traits key and `resolveInterval` returns the trait numbers; seedIfEmpty
  reconcile on a trait car adds nothing extra and drops nothing.

## Verification
1. `npm test` and `npm run typecheck`.
2. `preview_start` config `garage-log`. Add Car (manual): 2021 Toyota RAV4
   Hybrid AWD → schedule shows 12V battery check + AWD fluid, no
   transmission item. Add a Tesla-style EV → no oil change. Add a diesel 4WD
   truck with belt "No" → fuel filter + transfer case, no spark plugs, no belt.
3. Confirm F-150 and Rogue lists are unchanged (Rogue CVT note text only).
4. Reload: no duplicate rules appear (reconcile is additive).

## Workflow
- Branch `feat/trait-schedules` off `main`. One PR. Do not push to main
  (it auto-deploys).
- Per CLAUDE.md: after approval, write this plan into
  `docs/handoffs/active.md` for Codex to build; Claude reviews the PR.
