# Amber sign + shop brief ending (from the 2026-10-14 15:03 design review)

Source: `.impeccable/critique/2026-10-14T15-03-57Z__src.md` (26/40).
David chose: fix the brown amber with a bright box + dark text, and make the
shop brief the strong ending of a check. Branch `design/amber-and-brief`, one
PR, do not merge. Verify at 375/390 with seeded cars (move `.env.local` out
while testing, put it back). Rules: two fonts only, navy is chrome only, red
only for safety, never-logged = Unknown.

## 1. Amber "Book soon" sign: bright box, dark text (all screens)

Today `.cv-panel.cv-amber` (app.css ~3271) uses `--sig-amber-ink` #8a5800 so
white text passes contrast. It reads brown next to the #d98a00 ruler.

- `.cv-panel.cv-amber`: `background: var(--sig-amber)`; `color: var(--text)`
  (#23272b). Contrast ink on #d98a00 ≈ 5.5:1, AA at all sizes used.
- Inner border on amber: `rgba(35, 39, 43, 0.45)` instead of the white one.
- Update the comment above it (the old "white on #d98a00 fails" note).
- This class is shared: Home cards, vehicle page, service page, Check
  verdict. Check all four. Also check any other white-on-amber spot that
  used `--sig-amber-ink` as a fill (grep it); text-on-light uses of
  `--sig-amber-ink` stay as they are.
- Add one line to DESIGN.md: amber sign = #d98a00 with ink text, like a
  yellow road sign.

## 2. Check verdict page: order + one label style (`src/pages/Check.tsx` ~290-400)

New order, top to bottom:
1. Verdict sign + ruler (as now).
2. Drive-or-tow card. On a `fix-now` verdict, put the escalation list
   ("Stop driving if:") INSIDE this card, under its note, so the safety
   message is one block, not two. On other bands keep the separate
   "Treat it as “fix now” if:" box but place it right after this card.
   Safety info is never hidden in a disclosure.
3. Cost (the "What it'll likely cost" block, moved up).
4. Primary button "Make my shop brief" (for fix-now and book-soon, as now).
5. A `Collapsible` (src/components/motion/Collapsible.tsx) titled "Details"
   holding: Most likely, Try this first, What to bring, Where to take it.
6. Action row: "Save to {car}'s record" (secondary), "Check something
   else" (text link).

One section label style for every heading on the page: `.chk-sect`. The
`.chk-action-title` caps-sans labels inside the old action cards become
`.chk-sect` too (or the same look).

## 3. Shop brief is the ending, not a toggle

- Tapping "Make my shop brief" shows the brief and scrolls it into view
  (`scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })`)
  and moves focus to the brief heading (tabIndex -1).
- Once shown, the button row above changes: no big "Hide the shop brief"
  primary. Use a small text link "Hide brief" instead.
- Inside the inline brief (`ShopBriefCard`): put the fair range FIRST,
  right under the head (it's the counter anchor). Then Symptom, then the
  request.
- Rename the label "Please" → "Ask the shop to" (the text already starts
  with "Please…", so drop that word from the text if `brief.request` starts
  with it, or just rely on the new label).
- Add a "Share brief" primary button at the bottom of the inline brief. It
  works WITHOUT saving first: `briefToText` (src/domain/shopBrief.ts:323),
  `navigator.share` → clipboard fallback, same error handling as
  `src/pages/ShopBrief.tsx` `share()` (move that into a small shared helper,
  don't copy it twice). Status line `role="status"` for "Copied".
- The dark `.chk-brief-head` slab: make it navy `var(--frame)` with
  `--on-frame` text, so it uses the app's chrome color instead of a fifth
  near-black.

## 4. Small text floor (cheap, same PR)

- Ruler labels `.cv-ruler-labels span` 9.5px → 11px (check they still fit
  4-across at 375; shorten letter-spacing if needed).
- Bottom nav `.nav-label` ~10.9px → 11.5px.
- `.kicker` 10.5px → 11px.

## Done when

- Amber sign is bright yellow-amber with dark text everywhere; passes AA.
- Check verdict: sign, drive/tow (+ stop-driving list on fix-now), cost,
  brief button, Details fold, actions.
- Brief scrolls into view, fair range first, Share works before saving.
- `npm test` + `npm run typecheck` pass; no console errors; 375/390 clean.
- Do not merge. Claude reviews.
