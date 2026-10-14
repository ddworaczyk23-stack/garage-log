# Fewer words on every page (David, 2026-10-14)

Ask: "remove as much wording from the home page, and really all pages, as
you can. At least as much as is reasonable."

Branch: `copy/fewer-words`. One PR, do not merge. Verify at 375/390 with
seeded cars (move `.env.local` out while testing, put it back after).

## Keep (do NOT cut)

- Verdict headline + its one sentence (the product's core answer).
- Safety words: "Stop driving if", restore "replaces all data" warning,
  delete confirms.
- Honesty states: gray "Unknown" pills, "Not set up yet", "All clear on
  what's logged". Never let missing data read as all clear.
- Check flow content (causes, costs, steps). It's the value; leave as is.
- Labels on buttons, form fields, and tabs.

## Cuts

Rule of thumb: if the screen already shows it (a pill, the band ruler, a
section title, a button), the sentence saying it goes.

### Home (`Dashboard.tsx`, `VerdictPanel.tsx`, `CalendarExport.tsx`)
1. Header meta "1 vehicle needs attention · 2 vehicles": remove.
2. Verdict tag ("TODAY · BOOK SOON", "THIS VEHICLE · BOOK SOON", "TODAY"):
   remove the whole `.cv-tag` line. The band ruler right below already
   marks the band. (Same on VehicleDetail.)
3. Ruler caption ("Book it in the next few weeks." etc.): remove. The
   verdict sentence already says it.
4. Home card "12 services not tracked yet.": remove (VehicleDetail keeps
   its Unknown section).
5. Attention list under the verdict: hide it when it has exactly 1 item
   (the verdict sentence already names that item).
6. Card link "OPEN SERVICE RECORD →" → "Open →". Keep "Set it up →".
7. Not-set-up sentence → "Log your last oil change to start."
8. "Side-by-side" table: remove the whole section.
9. Reminders block: remove the "Reminders" heading and the "Get alerts…"
   line and the "One alert at 9am…" line. Keep the "Add reminders to
   Calendar" button + the "?" InfoTip; put this in the tip: "One alert at
   9am on each due date. Re-add every month or two. On iPhone, open the
   file and tap Add All."  (Applies on VehicleDetail too.)
10. Footer links: keep "Cost summary". Remove "Back up your garage" (it's
    in Settings) and "Add a car" (it's on Vehicles).
11. Empty Home (no cars): keep title "Plain-English answers about your
    car.", the "Add a car" button, and "Takes about a minute." Remove the
    paragraph and the 3 steps.

### Vehicle page (`VehicleDetail.tsx` and its cards)
12. "12 services not tracked yet. They're listed under Unknown below.":
    remove.
13. Specifications "4 FIELDS" count: remove.
14. Average mileage "Calculated from your logged history.": remove.
15. "12 services we don't have dates for yet. Open one and log when you
    last did it.": remove (the Unknown section + pills say it).
16. Glovebox description → remove. Empty line → "No documents yet."
17. "Service & repair receipts" description "Files attached to a logged
    service or repair.": remove.
18. "Nothing logged yet — use + Log to add a repair." → "No repairs yet."
    (same pattern for the maintenance log empty line: "Nothing logged yet.")
19. Page footer "COAST · THE SERVICE RECORD, KEPT HONEST": remove.

### Costs (`Costs.tsx`)
20. Header prose "Where your maintenance money goes, per vehicle.": remove.
21. "Total spent: $X on maintenance and repairs across 2 cars." →
    "$X total".
22. Per car "$X spent all time: $Y on maintenance and $Z on repairs." →
    show only "$X"; add "· $Z repairs" only when repairs > 0 AND
    maintenance > 0.
23. Per car sub-line "2020 Ford · F-150 STX": remove.
24. "$0.02/mi lifetime, over 6,620 mi tracked." → "$0.02/mi".
25. Empty hint → "Costs you log show up here."

### Documents (`Documents.tsx`)
26. Empty hint → "Receipts and photos you attach show up here."

### Settings / Backup (`Settings.tsx`, `Backup.tsx`)
27. Not signed in: status line → "Not signed in". ALSO hide the sync
    status and "Last synced" lines when not signed in (today it says "Up to
    date · Last synced 42 min ago" while signed out, which is wrong).
28. Backup header prose → "Stored only on this device."
29. Export description → "One file with everything, photos included."
30. Restore: keep the bold warning, cut the rest → "Replaces **all data on
    this device**."

### Add a car (`AddVehicle.tsx`)
31. Header prose ("About a minute. Enter a VIN…"): remove.
32. VIN hint → "On the driver-side dashboard or insurance card."

## Done when

- Home (2 seeded cars) well under 100 words of visible text in `main`
  (was 177); empty Home under 30 (was 94); VehicleDetail noticeably
  shorter (was 498).
- No layout holes where text was removed (check spacing at 375/390).
- `npm test` + `npm run typecheck` pass. Update any tests that match the
  removed strings.
- Do not merge. Claude reviews.
