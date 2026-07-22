# Onboarding polish — design

Date: 2026-07-22

## Problem

The first-run empty dashboard (welcome card + 3-step list) and the "not set up
yet" verdict already do real work — this isn't a from-scratch onboarding
build. Two narrower gaps remain:

1. `AddVehicle.tsx` is a bare admin form — plain labeled inputs, no motion,
   doesn't match the editorial visual language the rest of the app uses
   (verdict panels, `Reveal`, serif headlines, the `cv-*` hero classes already
   built for the dashboard's empty state).
2. After adding a car, the user lands on `VehicleDetail` and sees the exact
   same generic "not set up" state a 5th neglected car would show. Nothing
   marks "you just finished step 1, here's step 2" for a first-time user, even
   though the odometer-CTA that step 2 needs already exists on that page.

## Approach

Targeted polish, not a wizard. No new screens, no progress/step-tracking
state, no new DB fields. Two file changes:

### 1. `AddVehicle.tsx` — editorial restyle

Wrap the page in the same hero framing the dashboard's empty state already
uses (reuse `cv-card` / `cv-panel` / `cv-tag` / `cv-headline` classes — no new
CSS component). Short headline + one-sentence framing above the form. VIN
stays the default mode, framed as the fastest path (it auto-fills
engine/drivetrain). Form fields, validation, and submit logic are unchanged —
this is visual/copy only.

### 2. `VehicleDetail.tsx` — one-time "you're in" welcome banner

- `AddVehicle.tsx`: when `addVehicle()` returns `created: true`, set a
  one-shot `sessionStorage` flag (same pattern as `useIntroGate` in
  `src/motion/hooks.ts`) before redirecting to `#/vehicle/<id>`.
- `VehicleDetail.tsx`: on mount, check the flag. If set, consume it
  (remove immediately, so it can never show again — even on refresh) and
  render a small `Reveal`-animated banner above the existing not-set-up
  verdict panel: *"[Vehicle] is in your garage. Log a mileage reading and
  Coast gives you a real verdict."* with a button wired to the existing
  `openForm('odometer')` — reuses the quick-add form already on the page,
  not a new form or step.
- The verdict panel's own copy and the odometer card's existing "+ Add
  odometer reading" CTA are untouched — the banner sits above them, it
  doesn't replace or duplicate that domain-owned messaging.

## Explicitly out of scope

- Multi-step wizard / progress indicator spanning Add Car → Log Mileage → See
  Verdict as separate screens (user ruled this out).
- Changing `verdict.ts` copy or the not-set-up band logic — that's
  domain-owned and already correct.
- Tooltips/tutorial walkthrough — nothing in the current flow is confusing
  enough to need one.

## Testing

Both changes are page-level UI; no new domain logic to unit test. Manual
verification via the preview MCP tools (per project CLAUDE.md): add a vehicle
by VIN and by manual entry, confirm the welcome banner appears once and not on
a subsequent reload/revisit, confirm the odometer CTA in the banner opens the
same form as the existing "+ Odometer" quick-add button.
