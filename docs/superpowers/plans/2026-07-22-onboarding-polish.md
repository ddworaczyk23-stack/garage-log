# Onboarding Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the "Add a car" page the same editorial visual language as the rest of the app, and add a one-time "you're in" welcome banner on a freshly-added vehicle's detail page that nudges straight into logging a mileage reading.

**Architecture:** Two existing pages get additive UI changes only — no new domain logic, no new DB fields, no new routes. `AddVehicle.tsx` gains a hero header reusing existing `cv-*` CSS classes. `AddVehicle.tsx` + `VehicleDetail.tsx` together implement a one-shot `sessionStorage` handoff flag (same pattern as `useIntroGate` in `src/motion/hooks.ts`) so `VehicleDetail` knows "this vehicle was *just* created in this browser session" and shows a banner exactly once.

**Tech Stack:** Preact + TypeScript, no new dependencies. Existing CSS classes (`cv-card`, `cv-panel`, `cv-inner`, `cv-tag`, `cv-headline`, `cv-sentence`, `fr-actions`, `vd-setup`) defined in `src/styles/app.css` — no new CSS is added.

## Global Constraints

- No new npm dependencies (spec: targeted polish, reuse what exists).
- No new DB schema, no new fields on `Vehicle` or any table (spec: no new DB fields).
- No new screens, routes, or step/progress-tracking state (spec: explicitly out of scope — user ruled out a wizard).
- Do not modify `src/domain/verdict.ts` or any not-set-up band copy/logic — that layer is domain-owned and already correct (spec).
- Reuse existing CSS classes for the hero/banner treatment; do not add new CSS rules unless a class genuinely doesn't exist yet.
- `npm run typecheck` and `npm test` must both pass after every task (project CLAUDE.md: these are the standard verification commands).
- Verify visually with the preview MCP tools (`preview_start` with config `garage-log`, then `preview_snapshot`) per project CLAUDE.md — this project's UI has no component test harness, so visual verification is the only way to confirm rendered output.

---

### Task 1: Editorial restyle of the Add-a-car page

**Files:**
- Modify: `src/pages/AddVehicle.tsx:106-133` (the header block and opening of the return statement)
- Modify: `src/pages/AddVehicle.tsx:133-216` (wrap the VIN-entry and manual-entry forms in `Reveal`)

**Interfaces:**
- Consumes: existing `Reveal` component (`src/components/motion/Reveal.tsx`, already imported in this file), existing CSS classes `cv-card`/`cv-panel`/`cv-panel.cv-slate`/`cv-inner`/`cv-tag`/`cv-headline`/`cv-sentence` (defined in `src/styles/app.css`, already used by `src/pages/Dashboard.tsx`'s empty-state hero — no new CSS needed).
- Produces: no new exports; page-level markup change only. Nothing downstream depends on this task's output.

- [ ] **Step 1: Replace the plain header with the `cv-*` hero block**

In `src/pages/AddVehicle.tsx`, replace:

```tsx
      <a class="back-link" href="#/vehicles">
        ‹ Vehicles
      </a>
      <h2 class="page-title">Add a car</h2>
      <p class="muted small">
        Enter a VIN to decode its identity, or fill in the details manually.
      </p>

      <div class="seg" role="group" aria-label="Add car mode">
```

with:

```tsx
      <a class="back-link" href="#/vehicles">
        ‹ Vehicles
      </a>

      <div class="cv-card">
        <div class="cv-panel cv-slate">
          <div class="cv-inner">
            <div class="cv-tag">Add a car</div>
            <h3 class="cv-headline">Two minutes, then Coast knows your car.</h3>
            <p class="cv-sentence">
              Enter a VIN and Coast decodes the rest, or fill in year, make, and model by hand.
            </p>
          </div>
        </div>
      </div>

      <div class="seg" role="group" aria-label="Add car mode">
```

- [ ] **Step 2: Wrap the VIN-entry form in `Reveal`**

Replace:

```tsx
      {mode === 'vin' && (
        <form class="card admin-form" onSubmit={runDecode}>
```

with:

```tsx
      {mode === 'vin' && (
        <Reveal>
        <form class="card admin-form" onSubmit={runDecode}>
```

and its closing tag — replace:

```tsx
          <div class="form-actions">
            <button class="btn" type="submit" disabled={decoding || vin.trim().length !== 17}>
              {decoding ? 'Decoding…' : 'Decode VIN'}
            </button>
          </div>
        </form>
      )}
```

with:

```tsx
          <div class="form-actions">
            <button class="btn" type="submit" disabled={decoding || vin.trim().length !== 17}>
              {decoding ? 'Decoding…' : 'Decode VIN'}
            </button>
          </div>
        </form>
        </Reveal>
      )}
```

(This mirrors the indentation style already used for the decoded-identity `Reveal` block further down this same file — `Reveal` is not given extra indentation over the form it wraps.)

- [ ] **Step 3: Wrap the manual-entry form in `Reveal`**

Replace:

```tsx
      {mode === 'manual' && (
        <form class="card admin-form" onSubmit={submit}>
```

with:

```tsx
      {mode === 'manual' && (
        <Reveal>
        <form class="card admin-form" onSubmit={submit}>
```

and replace its closing:

```tsx
          <div class="form-actions">
            <button class="btn" type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add car'}
            </button>
          </div>
        </form>
      )}

      {mode === 'vin' && identity && (
```

with:

```tsx
          <div class="form-actions">
            <button class="btn" type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add car'}
            </button>
          </div>
        </form>
        </Reveal>
      )}

      {mode === 'vin' && identity && (
```

- [ ] **Step 4: Typecheck and unit tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all existing tests still pass (this task touches no logic these tests cover).

- [ ] **Step 5: Visual verification**

Start the preview (`preview_start`, config `garage-log`), navigate to `#/add-vehicle`, and take a `preview_snapshot`. Confirm:
- The hero block renders above the VIN/Manual segmented control with the slate background, "Add a car" tag, headline, and sentence.
- Switching to "Manual entry" still shows all fields (Year, Make, Model, Trim, Engine, Drivetrain) and submits correctly.
- Decoding a VIN still shows the decoded-identity confirmation form below.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AddVehicle.tsx
git commit -m "Restyle Add-a-car page with the editorial cv-* hero treatment"
```

---

### Task 2: One-time "you're in" welcome banner on first vehicle landing

**Files:**
- Modify: `src/pages/AddVehicle.tsx` (set a one-shot `sessionStorage` flag on successful creation, in the `submit` function)
- Modify: `src/pages/VehicleDetail.tsx` (read/consume the flag on mount, render the banner)

**Interfaces:**
- Consumes: `sessionStorage` key `'gl_just_added_vehicle'` (a plain string, the created vehicle's `id`) — this task defines and consumes it entirely; no other file reads or writes this key. Consumes existing `openForm('odometer')` (already defined in `VehicleDetail.tsx`, sets `activeForm` and scrolls to the form), existing `Reveal` component, existing `vehicleLabel(vehicle)` (already imported), existing CSS classes `cv-card`/`cv-panel.cv-slate`/`cv-inner`/`cv-tag`/`cv-headline`/`cv-sentence`/`fr-actions`.
- Produces: no new exports. Page-level state and markup only.

- [ ] **Step 1: Set the handoff flag on successful vehicle creation**

In `src/pages/AddVehicle.tsx`, inside the `submit` function, replace:

```tsx
      if (created) {
        window.location.hash = `#/vehicle/${vehicle.id}`
      } else {
```

with:

```tsx
      if (created) {
        try {
          sessionStorage.setItem('gl_just_added_vehicle', vehicle.id)
        } catch {
          // sessionStorage unavailable (private browsing) — banner just won't show
        }
        window.location.hash = `#/vehicle/${vehicle.id}`
      } else {
```

- [ ] **Step 2: Read and consume the flag in `VehicleDetail`**

In `src/pages/VehicleDetail.tsx`, add a new piece of state right after the existing `showSticky` state declaration. Replace:

```tsx
  const [showSticky, setShowSticky] = useState(false)
```

with:

```tsx
  const [showSticky, setShowSticky] = useState(false)
  // One-shot flag set by AddVehicle right before redirecting here on a fresh
  // creation. Consumed (removed) immediately so the welcome banner below can
  // only ever show once, even across a reload of this same page.
  const [justAdded] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false
    try {
      if (sessionStorage.getItem('gl_just_added_vehicle') !== id) return false
      sessionStorage.removeItem('gl_just_added_vehicle')
      return true
    } catch {
      return false
    }
  })
```

- [ ] **Step 3: Render the welcome banner above the existing verdict card**

In `src/pages/VehicleDetail.tsx`, replace:

```tsx
      {reminders && reminders.length > 0 && (
        <div class="cv-card">
          {(() => {
            const verdict = vehicleVerdict(reminders, openConcerns ?? [], localDateISO(new Date()))
            return (
              <>
                <VerdictPanel verdict={verdict} tag="This vehicle" />
                <UrgencyRuler verdict={verdict} />
                {verdict.band === 'not-set-up' && (
                  <div class="vd-setup">
                    <a class="btn-link" href={`#/import/${id}`}>
                      Import service history →
                    </a>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
```

with:

```tsx
      {reminders && reminders.length > 0 && (() => {
        const verdict = vehicleVerdict(reminders, openConcerns ?? [], localDateISO(new Date()))
        return (
          <>
            {justAdded && verdict.band === 'not-set-up' && (
              <Reveal class="cv-card">
                <div class="cv-panel cv-slate">
                  <div class="cv-inner">
                    <div class="cv-tag">You're in</div>
                    <h3 class="cv-headline">{vehicleLabel(vehicle)} is in your garage.</h3>
                    <p class="cv-sentence">
                      Log a mileage reading and Coast gives you a real verdict.
                    </p>
                    <div class="fr-actions">
                      <button type="button" class="btn btn-primary" onClick={() => openForm('odometer')}>
                        Log mileage
                      </button>
                    </div>
                  </div>
                </div>
              </Reveal>
            )}
            <div class="cv-card">
              <VerdictPanel verdict={verdict} tag="This vehicle" />
              <UrgencyRuler verdict={verdict} />
              {verdict.band === 'not-set-up' && (
                <div class="vd-setup">
                  <a class="btn-link" href={`#/import/${id}`}>
                    Import service history →
                  </a>
                </div>
              )}
            </div>
          </>
        )
      })()}
```

- [ ] **Step 4: Typecheck and unit tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all existing tests still pass (no domain logic changed).

- [ ] **Step 5: Visual verification — the full flow**

Start the preview (`preview_start`, config `garage-log`) and, using `preview_eval` or the debug tab, start from an empty database (`indexedDB.deleteDatabase('garage-log')` then reload, or the Debug tab's "Delete database & re-seed" — whichever leaves zero vehicles).

1. Go to `#/add-vehicle`, add a car (either mode).
2. Confirm you land on `#/vehicle/<id>` and the welcome banner is visible: tag "You're in", headline naming the vehicle, "Log mileage" button.
3. Click "Log mileage" and confirm it opens the same odometer form the "+ Odometer" quick-add button opens (`activeForm === 'odometer'`), scrolled into view.
4. Submit an odometer reading, confirm the banner is gone once real data exists (verdict band is no longer `not-set-up`, so the `justAdded &&` condition's sibling check also correctly stops rendering it).
5. Reload the same `#/vehicle/<id>` page directly (address-bar refresh). Confirm the banner does NOT reappear, even though the flag consumption happens client-side (the flag was already removed from `sessionStorage` in step 2 above, before the reload happened).
6. Add a second vehicle, confirm the banner shows on the second vehicle's page (not on the first vehicle's page if revisited) — this checks the flag is scoped by `id`, not just "any flag present."

- [ ] **Step 6: Commit**

```bash
git add src/pages/AddVehicle.tsx src/pages/VehicleDetail.tsx
git commit -m "Add one-time welcome banner nudging a freshly-added vehicle toward its first mileage reading"
```
