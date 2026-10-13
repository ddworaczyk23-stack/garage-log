# Round 2: logic + bugs (from the post-redesign review)

Source: `.impeccable/critique/2026-10-13T21-08-48Z__src.md` (25/40, 14/20).
User decisions (2026-10-13): fix logic + bugs first; a service with no
logged history shows a gray "Unknown", has no date, and never counts toward
the verdict. Finish work (tap targets, fonts, service page) is a later round.

One PR. Keep the engine (`reminderEngine.ts`) unchanged: it still projects
never-serviced items, and the calendar already skips them. The fix is in
what the verdict, health, counts and UI do with those items.

## 1. Never-logged items stop driving urgency (P0)

Problem: after one logged oil change, `hasRealData` is true for the car, so
every never-logged item's projected status (often `due-next`) counts. The
car turns amber with "4 things to book soon" for items Coast knows nothing
about. This was listed as a "known limitation" in CLAUDE.md.

1. `src/domain/verdict.ts`: add and export
   `hasHistory(r) = r.lastDone.date != null || r.lastDone.miles != null`
   and `knownReminders(rs) = rs.filter(r => r.status !== 'not-applicable' && hasHistory(r))`.
   Reuse `hasHistory` inside `hasRealData`.
2. `vehicleVerdict`: `tracked = knownReminders(reminders)` (not every
   non-n/a reminder). So fixNow / bookSoon / watch / coastItems / ruler /
   safe window come only from logged items. Add
   `unknownCount: number` to `VehicleVerdict` = non-n/a reminders without
   history (0 for not-set-up, which already has its own sentence).
3. `src/domain/health.ts` `vehicleHealth`: same filter for `tracked`.
4. `src/db/summary.ts`: `counts` (`countByStatus`) and the attention feed
   use `knownReminders`, so ranking (`compareVehicleUrgency`), badges, the
   dashboard "N vehicles need attention" line, and the comparison table
   stop counting never-logged items.
5. Tests (`tests/verdict.test.ts`, `tests/health.test.ts`, summary tests):
   a car with one logged oil change and 13 never-logged items whose
   projections are `due-next` -> verdict band comes from the oil change
   only (e.g. all-clear/coast), `unknownCount` = 13, counts.dueNext = 0.
   Keep the existing not-set-up tests green.

## 2. "Unknown" in the UI

1. `ScheduleRow.tsx`: a row with no history on a set-up car shows a gray
   pill "Unknown" (reuse `.status-estimated` slate styling), no "est." date,
   and no progress bar (hide `BulletTrack`). Not-set-up cars keep
   "Estimated" from Phase 1. Remove the "No history" meta text added in
   Phase 4 (the pill says it).
2. `VehicleDetail.tsx` schedule: split into three groups. Actionable
   (overdue/due-next, logged only), then "Unknown" fold, then "On track"
   (logged, not actionable). Above the Unknown fold, one gray line:
   "N services we don't have dates for yet. Open one and log when you last
   did it." Hide the Unknown fold when N = 0.
3. Dashboard vehicle card and VehicleDetail verdict: when
   `verdict.unknownCount > 0`, one small muted line under the ruler:
   "N services not tracked yet." linking to `#/vehicle/<id>`.

## 3. Dashboard card lists what the headline says (P1)

`src/pages/Dashboard.tsx` card currently lists `verdict.coastItems` under a
"book soon" headline, so the list looks like it explains the headline.
Add `actionItems: { label, window }[]` to `VehicleVerdict` (fix-now then
book-soon items, logged only, top 3, same `windowText`). Card shows
actionItems first; coast items below them under a small "Can coast" label;
"+N more" if capped. Cap the total at 4 rows.

## 4. Cost per mile number is missing (P1 regression from Phase 3)

`src/pages/Costs.tsx` ~line 119: the note renders "Lifetime cost / mile
over X tracked." without the value. Render
`{formatMoney(summary.costPerMile)}/mi lifetime, over {miles} tracked.` with
the number in `.cost-vehicle-summary span` style (mono).

## 5. "+0 mi in 2026" on the odometer (P3 bug)

`VehicleDetail.tsx` `ytdMiles` has its own calculation (sorts by date only;
same-day ties can pick the higher reading as the baseline -> 0). Export
`milesThisYear` from `src/db/summary.ts` (or move it to a pure domain file
with a test) and use it in VehicleDetail so the page and the dashboard
always agree. Add a test for a same-day event + reading.

## 6. Small copy/consistency bugs

1. Dashboard status lamp: red only for fix-now; amber for book-soon
   (`Dashboard.tsx` `vd-lamp` class picks `is-overdue` for any attention).
2. Service schedule InfoTip says "Personalized from mechanic-consensus
   intervals" while the note says factory schedule. Make the tip say
   "Based on the factory schedule, adjusted when you set your own interval."
3. Missing space after "·" in the toast and service-page meta
   (e.g. "·89,500 mi"). Use " · " consistently.
4. Not-set-up verdict on VehicleDetail: the button under the slab should be
   "Log last oil change" (primary, opens EventForm with oil-change) and
   "Import service history" secondary, not import alone.

## Done when

- npm test + typecheck pass; new tests for items 1 and 5.
- At 375px with one logged oil change on a fresh car: verdict is not amber
  from unknown items, schedule shows the Unknown group, dashboard card list
  matches its headline, Costs shows a cost-per-mile number.
- CLAUDE.md: replace the "Known limitation" line with the new rule
  ("never-logged items are Unknown and never count toward verdicts").
