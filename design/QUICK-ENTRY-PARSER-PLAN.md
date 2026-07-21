# Quick-entry parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a driver type one free-text line on `EventForm` (e.g. "Oil change at Jiffy Lube, $45.99") and tap a button to prefill category/cost/vendor/title, cutting the manual-entry friction the competitive research flagged as the top pain point against every driver-aligned tracking app.

**Architecture:** A new pure parsing module (`src/domain/quickEntry.ts`) reuses the existing category-matcher from `src/domain/importHistory.ts` and adds cost/vendor regex extraction. `EventForm.tsx` gets one new input + button wired to it; everything the parser finds lands in the form's existing state, fully editable before submit. No schema/DB changes.

**Tech Stack:** TypeScript, Preact (`src/components/EventForm.tsx`), Vitest.

**Design doc:** `design/QUICK-ENTRY-PARSER.md` — read it first; this plan implements it exactly.

## Global Constraints

- Reuse `mapServiceToCategories`/`primaryCategoryOf` from `src/domain/importHistory.ts` — do not duplicate category-keyword logic.
- `parseQuickEntry` must never throw.
- Cost/vendor/title are only overwritten in the form when currently blank; category/additionalCategories are always overwritten when a match is found.
- No changes to `reminderEngine.ts`, `reminderStatus.ts`, `scheduleTemplates.ts`, `db/events.ts` CRUD, or the Dexie schema.
- `npm test` + `npm run typecheck` must pass before each commit.

---

### Task 1: `parseQuickEntry` pure domain module

**Files:**
- Create: `src/domain/quickEntry.ts`
- Test: `tests/quickEntry.test.ts`

**Interfaces:**
- Consumes: `mapServiceToCategories(service: string): MaintenanceCategory[]` and `primaryCategoryOf(categories: MaintenanceCategory[]): MaintenanceCategory` — both already exported from `src/domain/importHistory.ts` (verified: `src/domain/importHistory.ts:65` and `:105`).
- Produces (used by Task 2): `parseQuickEntry(text: string): QuickEntryResult` where
  ```ts
  export interface QuickEntryResult {
    category: MaintenanceCategory | null
    additionalCategories: MaintenanceCategory[]
    cost: number | null
    vendor: string | null
    hadMatch: boolean
  }
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/quickEntry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseQuickEntry } from '../src/domain/quickEntry'

describe('parseQuickEntry', () => {
  it('detects category, cost, and vendor from a natural sentence', () => {
    const r = parseQuickEntry('Oil change at Jiffy Lube, $45.99')
    expect(r.category).toBe('oil-change')
    expect(r.additionalCategories).toEqual([])
    expect(r.cost).toBe(45.99)
    expect(r.vendor).toBe('Jiffy Lube')
    expect(r.hadMatch).toBe(true)
  })

  it('promotes the primary category and keeps the rest as additional', () => {
    const r = parseQuickEntry('Oil change and tire rotation, $89')
    expect(r.category).toBe('oil-change')
    expect(r.additionalCategories).toEqual(['tire-rotation'])
    expect(r.cost).toBe(89)
  })

  it('does not misfire a vendor on lowercase phrasing', () => {
    const r = parseQuickEntry('Replaced the battery by hand')
    expect(r.vendor).toBeNull()
  })

  it('returns a null cost when no dollar amount is present', () => {
    const r = parseQuickEntry('Replaced wiper blades')
    expect(r.cost).toBeNull()
  })

  it('reports hadMatch=false when no category keyword is found, even if other fields matched', () => {
    const r = parseQuickEntry('Paid $45 for something')
    expect(r.category).toBeNull()
    expect(r.cost).toBe(45)
    expect(r.hadMatch).toBe(false)
  })

  it('returns an all-empty result for blank input', () => {
    const r = parseQuickEntry('   ')
    expect(r).toEqual({ category: null, additionalCategories: [], cost: null, vendor: null, hadMatch: false })
  })

  it('caps the vendor phrase at 4 words', () => {
    const r = parseQuickEntry('Oil change at Ford Lincoln Mercury Dealership Downtown, $200')
    expect(r.vendor).toBe('Ford Lincoln Mercury Dealership')
  })

  it('never throws on arbitrary text', () => {
    expect(() => parseQuickEntry('$$$ at at at from from !!! ###')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/quickEntry.test.ts`
Expected: FAIL — `Cannot find module '../src/domain/quickEntry'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/domain/quickEntry.ts`:

```ts
// Pure free-text prefill parser for EventForm's "Quick fill" field. NOT the
// bulk paste importer (see importHistory.ts) — this handles a single typed
// line, e.g. "Oil change at Jiffy Lube, $45.99", and reuses that module's
// category matcher rather than duplicating it. No Dexie, no DOM.

import { mapServiceToCategories, primaryCategoryOf } from './importHistory'
import type { MaintenanceCategory } from '../types'

export interface QuickEntryResult {
  category: MaintenanceCategory | null
  additionalCategories: MaintenanceCategory[]
  cost: number | null
  vendor: string | null
  /** True only when a category was found — drives the form's "couldn't detect
   * a category" hint. A cost/vendor hit alone doesn't count as a match. */
  hadMatch: boolean
}

const COST_RE = /\$\s?(\d+(?:\.\d{1,2})?)/

// 1-4 consecutive capitalized words after at/from/by — e.g. "at Jiffy Lube".
// Stops at the first lowercase-initial word so "by hand"/"from memory" never
// misfire a vendor name. Best-effort: a genuine lowercase shop name is missed,
// which is an accepted tradeoff (the field stays editable either way).
const VENDOR_RE = /\b(?:at|from|by)\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3})/

export function parseQuickEntry(text: string): QuickEntryResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { category: null, additionalCategories: [], cost: null, vendor: null, hadMatch: false }
  }

  const categories = mapServiceToCategories(trimmed)
  const category = categories.length ? primaryCategoryOf(categories) : null
  const additionalCategories = category ? categories.filter((c) => c !== category) : []

  const costMatch = trimmed.match(COST_RE)
  const cost = costMatch ? Number(costMatch[1]) : null

  const vendorMatch = trimmed.match(VENDOR_RE)
  const vendor = vendorMatch ? vendorMatch[1].trim() : null

  return { category, additionalCategories, cost, vendor, hadMatch: category !== null }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/quickEntry.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/domain/quickEntry.ts tests/quickEntry.test.ts
git commit -m "Add pure quickEntry parser for EventForm's quick-fill field"
```

---

### Task 2: Wire "Quick fill" into `EventForm.tsx`

**Files:**
- Modify: `src/components/EventForm.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `parseQuickEntry(text: string): QuickEntryResult` from Task 1 (`src/domain/quickEntry.ts`).
- Produces: nothing new for later tasks — this is the final consumer.

- [ ] **Step 1: Add the import**

In `src/components/EventForm.tsx`, add to the top import block (after the existing `format` import, `src/components/EventForm.tsx:4`):

```ts
import { parseQuickEntry } from '../domain/quickEntry'
```

- [ ] **Step 2: Add quick-entry state**

In `src/components/EventForm.tsx`, immediately after the `date`/`odometerMiles` state declarations (`src/components/EventForm.tsx:49-52`), add:

```ts
  const [quickEntryText, setQuickEntryText] = useState('')
  const [quickEntryHint, setQuickEntryHint] = useState('')
```

- [ ] **Step 3: Add the fill-in handler**

Directly above the `return (` statement in `EventForm` (i.e. right after the `remainingDocs` line, `src/components/EventForm.tsx:98`), add:

```ts
  function handleQuickFill() {
    const result = parseQuickEntry(quickEntryText)
    let expandMore = false

    if (result.category) {
      setCategory(result.category)
      setAdditionalCategories(result.additionalCategories)
      if (result.additionalCategories.length > 0) setShowAlso(true)
    }
    if (result.cost != null && !cost.trim()) {
      setCost(String(result.cost))
    }
    if (result.vendor && !vendor.trim()) {
      setVendor(result.vendor)
      expandMore = true
    }
    if (!title.trim() && quickEntryText.trim()) {
      setTitle(quickEntryText.trim())
      expandMore = true
    }
    if (expandMore) setShowMore(true)
    setQuickEntryHint(result.hadMatch ? '' : 'Couldn’t detect a category — pick one below.')
  }
```

- [ ] **Step 4: Add the UI**

In `src/components/EventForm.tsx`, insert this block right after the `<h3 class="card-title">...</h3>` line and before the existing `<div class="admin-when">` (Date/Odometer row) (`src/components/EventForm.tsx:171`):

```jsx
      <div class="admin-field quick-entry">
        <span class="muted small">Quick fill (optional)</span>
        <div class="quick-entry-row">
          <input
            type="text"
            placeholder="e.g. Oil change at Jiffy Lube, $45.99"
            value={quickEntryText}
            onInput={(e) => setQuickEntryText((e.target as HTMLInputElement).value)}
          />
          <button type="button" class="btn-link" onClick={handleQuickFill}>
            Fill in ↓
          </button>
        </div>
        {quickEntryHint && <p class="muted small quick-entry-hint">{quickEntryHint}</p>}
      </div>
```

- [ ] **Step 5: Add supporting CSS**

In `src/styles/app.css`, right after the existing `.event-form .admin-field { gap: 5px; }` rule (`src/styles/app.css:569-571`), add:

```css
.quick-entry-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.quick-entry-row input {
  flex: 1;
}
.quick-entry-hint {
  margin: 2px 0 0;
}
```

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, all existing tests still pass (this task adds no new automated tests — `EventForm.tsx` has no existing unit tests in this codebase; verification is live, next step).

- [ ] **Step 7: Verify live in the browser**

Start the dev server (`preview_start` with the `garage-log` launch config, or `npm run dev`) and drive it end to end:
1. Open a vehicle's detail page, click "+ Service" to open `EventForm`.
2. Confirm the new "Quick fill" input + "Fill in ↓" button render above the Date/Odometer row.
3. Type `Oil change at Jiffy Lube, $45.99` and click "Fill in ↓".
4. Confirm: Category select shows "Engine oil & filter"; the "More details" section auto-expands showing Vendor = "Jiffy Lube" and Label = "Oil change at Jiffy Lube, $45.99"; Cost = 45.99.
5. Clear the form (cancel, reopen), type `Something weird happened` (no category keyword), click "Fill in ↓" — confirm the hint "Couldn't detect a category — pick one below." appears and the category select is unchanged.
6. Manually type a cost of `10` first, then type `Oil change, $45.99` in quick-fill and click "Fill in ↓" — confirm Cost stays `10` (not overwritten), proving the "only fill if blank" rule.
7. Check the browser console for errors (expect none).

- [ ] **Step 8: Commit**

```bash
git add src/components/EventForm.tsx src/styles/app.css
git commit -m "Wire quick-fill field into EventForm"
```

---

## Self-review notes

- **Spec coverage:** every behavior in `design/QUICK-ENTRY-PARSER.md` (explicit button, always-overwrite category, fill-only-if-blank cost/vendor/title, auto-expand More details, hadMatch hint, no schema change, cost `$`-only, vendor capitalized-phrase heuristic capped at 4 words) is implemented in Task 1 or Task 2 above.
- **Placeholder scan:** none — every step has literal code, exact file paths/line anchors, and concrete verification steps.
- **Type consistency:** `QuickEntryResult` is defined once in Task 1 and consumed with the same shape (`category`/`additionalCategories`/`cost`/`vendor`/`hadMatch`) in Task 2's handler — no renamed fields.
