# Saved problems everywhere + one shop brief (from the 2026-10-14 15:42 review)

Source: `.impeccable/critique/2026-10-14T15-42-04Z__src.md` (28/40).
David chose problems 1-3. Branch `fix/concerns-and-brief`, one PR, do not
merge. Verify at 375/390 with seeded cars (move `.env.local` out while
testing, put it back). Rules: two fonts only, navy is chrome only (never
inside a card), red only for safety, never-logged = Unknown.

Test setup for this whole plan: run a Check on the F-150 (braking noise →
grind), tap "Save to F-150 STX's record". That creates an open fix-now
concern. Clear it after testing (Handled or Remove).

## 1. [P1 bug] Vehicles list must count saved problems (`src/pages/Vehicles.tsx` ~15-25)

Today the row band comes only from `knownReminders(reminders)`, so a saved
fix-now brake concern shows "Book soon" on #/vehicles while Home and the
vehicle page say "Fix now". Use the same composition as Dashboard
(`Dashboard.tsx` ~97) and VehicleDetail (~162):
`vehicleVerdict(reminders, await getOpenConcerns(v.id), localDateISO(new Date())).band`.
Keep the "not-set-up" result when there's no real history (vehicleVerdict
already handles it; confirm). Add a unit/DB test if the loader can be
reached; otherwise a domain test that vehicleVerdict with a fix-now concern
wins over book-soon reminders.

## 2. [P1] One shop brief, used in both places

Today there are two: the inline one in Check (`InlineBrief`, Check.tsx
~575-615, 4 sections, no quote check) and the page `#/brief/<id>`
(`ShopBrief.tsx`, 8 sections + `QuoteCheck`), reachable only after Save.

- Move the page's brief body into ONE component,
  `src/components/ShopBriefView.tsx`: head, then sections in this order:
  Fair range (+ DIY note + footer), Item, Symptom, Ask the shop to, Fair if
  suggested / Fine to decline, Gets urgent if, notes. Then a full-width
  "Share brief" button (existing `shareBrief` helper), then `QuoteCheck`
  ("Got a quote? Check it.").
- `ShopBriefPage` renders `<ShopBriefView brief={brief} />` (keeps Print +
  its page chrome). Check's inline brief renders the SAME component with
  the brief from `composeBrief(vehicle, mileage, outcomeToBriefFacts(outcome))`.
  Delete `InlineBrief`.
- "Ask the shop to": strip a leading "Please" and capitalize, ONCE, inside
  the shared component (today Check does it and ShopBrief.tsx:125 doesn't).
- `ShopBrief.tsx` page title "Show this at the counter." goes inside the
  navy title band like every other page (use `PageHeader`).
- The quote input placeholder: use the range midpoint (e.g. "500"), not
  "e.g. 1400".

## 3. [P1] A saved problem is actionable from the car page

Move `ConcernList` (Check.tsx ~512) to `src/components/ConcernList.tsx`
and use it in two places: the Check car picker (as now) and the vehicle
page, right under the verdict sign + ruler (only when the car has open
concerns).
- Each row: band dot, title, "raised <date>", and a "Shop brief →" link to
  `#/brief/<id>`.
- Actions: "Handled" (resolveConcern) and "Remove" (deleteConcern, keep the
  ConfirmButton). Rename "Dismiss" → "Remove". Both ≥44px tall, with a gap
  between them.
- After "Handled", show a `role="status"` line "Marked handled. Undo" where
  Undo calls `reopenConcern(id)` (src/db/concerns.ts:50). Keep it until the
  page changes.
- Home card: if a car's verdict comes from a concern, the card's "Open →"
  still goes to the vehicle page, where the row now is. No change needed.

## 4. Red only for safety (same PR, small)

- "Remove" button: neutral text (`btn-link`), not red.
- Brief "Fine to decline today" label (`.sb-no`): neutral ink, not red.
- Quote check "Worth a second look" box and its "No" pills (`.qc-flag`
  etc.): amber tint + `--sig-amber-ink` text, not red. Money is never red.
- Brief labels `.chk-brief-tag` / `.chk-brief-lbl` 10.5px → 11px.

## Done when

- With a saved fix-now brake concern: #/vehicles, Home and the vehicle page
  all show Fix now.
- The vehicle page lists the concern with Shop brief / Handled / Remove;
  Handled shows Undo and Undo brings it back.
- The inline brief and #/brief/<id> look the same, both with Share and the
  quote checker; "Ask the shop to" starts with a capital.
- No red on money or non-safety controls.
- `npm test` + `npm run typecheck` pass; no console errors; 375/390 clean.
- Do not merge. Claude reviews.
