# Coast responsive plan — desktop vs mobile differentiation

## Where it stands today

Coast is mobile-first and mostly *only* mobile-shaped. Current responsive handling:

- `.app-main` is capped at 700px (1080px on Dashboard/VehicleDetail via `.app-main-wide`) and
  centered — so on a wide screen the app is a phone-width column floating in empty space.
- The **bottom tab bar with a raised center "Check" FAB renders at every width** — a phone idiom
  sitting at the bottom of a 1440px monitor.
- Real desktop adaptation exists in only two places: the doc-preview modal becomes a centered
  dialog ≥640px, and VehicleDetail gets a two-column sticky rail ≥900px. Everything else is the
  phone layout, stretched or centered.

It's not broken on desktop — it's *unfinished* there. It reads as a stretched phone, not a
product that belongs on a big screen.

## Philosophy: two surfaces, two jobs

Don't just "make it wider." The two contexts are genuinely different and the design should follow:

- **Mobile is the primary surface and the anxious-moment tool.** Phone in hand at the roadside or
  the shop counter. One thing at a time, thumb-first, big tap targets, bottom-sheet reach. Keep it
  exactly this calm and linear — do not port desktop density down.
- **Desktop is the secondary, calm-moment surface.** Sitting down to review records, plan spend,
  browse documents, run a backup, compare both vehicles. It rewards *overview* — see more at once,
  denser rhythm, hover/keyboard, real multi-pane layout.

The triage flow itself stays a centered, linear, single-column card on *both* — a decision is
inherently one-question-at-a-time, and widening it would hurt clarity. Desktop earns its width on
the *overview* screens (Today, Documents, Costs, Vehicle detail), not the *flow* screens (Check).

**Frozen:** no product logic, routing, or data changes. This is presentation only — CSS plus one
`Nav` component that renders a different chrome per breakpoint. All existing class names kept, same
discipline as the M10/Stage-4 token passes.

## Breakpoint system

Adopt one coherent set (replacing today's ad-hoc 430/620/640/760/900):

- **Mobile** `< 700px` — the phone layout as-is, refined.
- **Tablet** `700–1023px` — transitional: wider column, modals centered, still bottom-nav.
- **Desktop** `≥ 1024px` — the differentiated layout: side nav, multi-column, denser.

Keep the existing fine-grain tweaks (430px etc.) folded under Mobile; don't add more one-off
widths.

---

## Stage R1 — Desktop navigation (the single biggest win)

The bottom tab bar is what most makes desktop feel like a blown-up phone. Split the chrome:

1. **`components/Nav.tsx`** — render two variants off a CSS-driven breakpoint (no JS width
   listener; use a `.nav-desktop` / `.bottom-nav` pair, each shown/hidden by media query so SSR/
   first paint is correct and there's no layout flash):
   - **Mobile/tablet (`< 1024px`):** the current bottom tab bar + raised center Check — unchanged.
   - **Desktop (`≥ 1024px`):** a **left sidebar** (~240px): wordmark + roundel at top, the four
     destinations as a vertical list with icon + label, and **Check as a prominent primary button**
     (not a floating disc — the FAB is a touch idiom). AccountBar (sync status) moves into the
     sidebar footer. Active item uses the accent, same `aria-current` semantics.
2. **`.app-shell`** becomes a two-column grid at `≥1024px` (sidebar + content); the sticky top
   header collapses into the content column (or is removed on desktop, since the sidebar now
   carries the brand). Content column gets its own scroll.
3. Sidebar is fixed/sticky full-height; content scrolls independently — the standard desktop app
   frame.

Exit: on desktop the app has a real left rail and no floating phone controls; mobile is untouched.
Low risk, pure chrome. **Highest visual payoff of the whole plan — do it first.**

## Stage R2 — Overview screens use the width

With a sidebar eating ~240px, give the remaining width to genuine multi-column layouts. All are
CSS-grid changes over existing markup:

1. **Today / Dashboard** — today the vehicle TodayCards stack vertically. On desktop, lay the
   vehicles out **side by side** (2-up grid) so a two-car household sees both verdicts at once
   without scrolling; the comparison table and CTA cards flow below in a denser grid. Raise
   `.app-main-wide` cap or drop it entirely on desktop (the sidebar already frames the width).
2. **Documents** — the results grid gets more columns on desktop; the filter row can become a
   left filter column beside the grid (a classic desktop browse pattern) instead of a stacked bar.
3. **Costs** — the per-vehicle metric tiles + category bars sit in a wider multi-column board;
   the all-time/year segmented control and grand total pin to a header row.
4. **VehicleDetail** — already has the ≥900px two-column rail; retune it to the new 1024 desktop
   breakpoint and widen the content column so the schedule/history lists don't run short-measure.

Exit: no screen is a 700px ribbon in a sea of whitespace; each overview screen earns its width.
Medium size — several screens, but each is a contained grid change.

## Stage R3 — Density & interaction polish per surface

The finish pass once the structure is right:

1. **Density tokens** — introduce a desktop-only tightening of vertical rhythm (card padding, row
   height, section gaps) via a `≥1024px` override on the spacing tokens, so desktop shows more per
   screen without shrinking type. Mobile keeps its airy, thumb-friendly spacing.
2. **Hover vs tap** — desktop gets richer hover affordances (row hover elevation already exists;
   extend to buttons, nav, cards). Mobile keeps 44px targets and no hover-dependent affordances.
3. **Keyboard** — desktop is mouse+keyboard: ensure the sidebar, Check flow choices, and modals
   are fully tab-navigable with the existing `:focus-visible` ring (mostly there; audit).
4. **Modals/sheets** — the pattern is already right (bottom sheet `<640`, centered dialog `≥640`);
   audit every modal uses it consistently (some may not) and align to the new breakpoints.
5. **Triage flow on desktop** — keep it a centered ~560px single-column card (do NOT widen), but
   center it vertically in the content area and let the answered-steps/verdict feel composed on the
   larger canvas rather than top-aligned like a phone.

Exit: desktop feels considered (hover, density, keyboard) and mobile stays calm and thumb-first.
Small–medium, mostly refinement.

---

## Sequencing & size

| Stage | What | Risk | Rough size |
|---|---|---|---|
| R1 Desktop nav | Nav sidebar variant + shell grid | Low — chrome only | 1–2 sessions |
| R2 Overview width | Grid layouts on Today/Docs/Costs/Detail | Low–med — per-screen CSS | 2–3 sessions |
| R3 Density & polish | Desktop density tokens, hover, keyboard, modal audit | Low | 1–2 sessions |

Order is the natural one: **R1 → R2 → R3.** R1 alone removes the "stretched phone" feeling and is
worth doing even if R2/R3 wait. Each stage ships independently and is pure presentation — verify
live at 375 / 768 / 1024 / 1440 (the Playwright-screenshot workflow from Stage 4 covers this well),
confirming mobile is byte-for-byte unaffected at each step.

## Honest scope note

Coast is installed on phones and used at the anxious moment — mobile is and stays the primary
surface. Desktop is worth making *feel finished and native to the big screen*, but it is not worth
a bespoke desktop-only feature set. The goal is "clearly designed for this screen," not "a second
app." If any idea here starts to become desktop-only functionality rather than a desktop-shaped
presentation of the same product, it's out of scope.
