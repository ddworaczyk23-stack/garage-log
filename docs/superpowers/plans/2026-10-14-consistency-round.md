# Consistency round (from the 2026-10-13 visual review)

Source: `.impeccable/critique/2026-10-13T21-47-02Z__src.md` (28/40, 16/20).
Weakest heuristics: Consistency 2/4 and Aesthetic/minimalist 2/4. Target
after this round: ~33-35/40. Rules that still apply: only two fonts
(Overpass + Overpass Mono), navy is chrome only, red only for safety items.

Branch: `design/consistency-round` (already has the start, see "Done").
One PR. Verify every route at 375 and 390px in the browser before the PR.

## Done on the branch (Claude, compiles, 402 tests pass)

- `src/components/icons.tsx`: `ChevronRightIcon`, `DisclosureIcon`, `ArrowRightIcon`.
- `src/components/VehicleRow.tsx`: the ONE vehicle row (icon tile, name,
  year/make/model, optional status, chevron). Used on `Vehicles.tsx` and the
  Check vehicle picker (`Check.tsx`).
- `Check.tsx`: back button is now text "‹ Back" with class `back-link chk-back`;
  step dots have `role="img"` + "Step N of M" label; local `Chevron` uses
  `ChevronRightIcon`.

## To do

1. **"Synced as …" account bar is still grey on mobile (user called this out).**
   `.account-bar` (app.css ~line 180, markup in `src/components/AccountBar.tsx`)
   sits between the navy header and the navy title band. Make it navy on ALL
   widths (today only the >=1024px block does): background `var(--frame)`,
   text `var(--on-frame-muted)`, button `var(--on-frame-accent)`, border
   `var(--frame-line)` or none, and bleed it edge to edge like the title band
   (`box-shadow: 0 0 0 100vmax var(--frame); clip-path: inset(0 -100vmax)`).
   Check it joins the header and band with no grey seam. Note: it only shows
   when `VITE_DEXIE_CLOUD_URL` is set (`.env.local`), so test with it set.
2. **CSS for the new pieces.**
   - `.chk-back`: drop the 40px circle; style like `.back-link` (text, accent
     color, 44px tall tap area). It sits on the canvas, not in the band.
   - `.chevron-icon` (20px, `var(--text-muted)`, flex-shrink 0) replaces the
     old text `.chevron`; delete `.chevron` if unused.
   - `.disclosure-icon` (14px, rotates 90deg when `.is-open`, 0.15s, no
     transition under reduced motion).
   - `.chk-steps i`: undone dots are invisible (`var(--border)` on concrete).
     Use `rgba(35,39,43,0.18)`; done stays `var(--sig-blue)`.
   - `.vehicle-row` on the Check picker: keep the 44px min height, no extra
     margins vs the Vehicles list.
3. **One disclosure style.** `EventForm.tsx` lines ~274, ~340, ~488 use text
   `▸`/`▾`. Replace with `<DisclosureIcon open={…} />`.
4. **One in-app link arrow.** `Dashboard.tsx` ~136, ~140, ~212 use the
   diagonal ↗ SVG for in-app links ("Set it up", "Open service record",
   "Cost summary", "Add a car"). Replace with `ArrowRightIcon`. (Keep the ↗
   in `Instrument.tsx`: that one means "up this year".)
5. **Costs card header** (`Costs.tsx` `vehicle-card-head`): match VehicleRow's
   name/sub spacing (same `.list-row-title` + `.muted.small`, no big gap).
6. **Redundant copy (Aesthetic 2/4).**
   - Not-set-up sign: tag says "TODAY · NOT SET UP YET" over the headline
     "Not set up yet." When band is `not-set-up`, `VerdictPanel` shows only
     the scope in the tag ("Today" / "This vehicle"), no band label.
   - Costs: a car with $0 shows "$0 spent all time: $0 … $0" plus "No costs
     logged". Collapse to one muted line "No costs logged yet."
   - Docs: header meta "No documents yet" repeats the empty-state title.
     Drop the meta when there are 0 docs; hide the search + 3 filters until
     there is at least 1 doc.
   - Calendar instructions (`CalendarExport.tsx` hint) are 4 lines and appear
     on Home and Vehicle. Shorten to one line: "One alert at 9am on each due
     date. Re-add every month or two." and move the iPhone how-to into an
     `InfoTip`.
7. **Small layout slips.**
   - `.btn-link` text sits 4px inside its column (`padding: 8px 4px`, no
     negative inline margin). Add `margin-inline: -4px` (keep the vertical
     -4px). Check nothing shifts in `.row-actions`.
   - `.vd-row.is-overdue` uses `margin: 0 -18px` inside a 16px-padded card:
     overflows by 2px each side. Use `-16px` and matching `padding-inline`.
   - Form action row: "Cancel" (33px) and the primary button (44px) are not
     center-aligned. `align-items: center`, Cancel min-height 44px.

## Done when

- Every route at 375/390: no grey account strip, no text `›`/`▸`/`↗` for
  in-app links, one vehicle row look, no doubled copy listed above.
- `npm test` + `npm run typecheck` pass; no console errors.
- Do not merge. Claude reviews, then re-runs the design review.
