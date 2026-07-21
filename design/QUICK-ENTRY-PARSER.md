# Quick-entry parser (EventForm)

Goal: reduce manual-entry friction on `EventForm` — the top-cited pain point against
every driver-aligned tracking app in the competitive research (`design/perplexity-prompts.md`
context) and the one piece of that research nothing had been built for yet. Scope is
deliberately narrow: this is a prefill assist on the existing form, not a new entry flow,
not OCR, not a schema change.

## What it does

A driver types one free-text line describing the visit — e.g. `"Oil change at Jiffy Lube,
$45.99"` — and taps an explicit "Fill in" button. The form's existing fields (category,
additional categories, cost, vendor, title) get prefilled from that text; everything
stays visible and editable before submit, same as today.

## Architecture

- **`src/domain/quickEntry.ts`** (new, pure, unit-tested). Exports
  `parseQuickEntry(text: string): QuickEntryResult` where
  `QuickEntryResult = { category: MaintenanceCategory | null, additionalCategories:
  MaintenanceCategory[], cost: number | null, vendor: string | null, hadMatch: boolean }`.
  - Category matching reuses `mapServiceToCategories`/`primaryCategoryOf` from
    `src/domain/importHistory.ts` as-is — no duplicated keyword logic.
  - Cost: a new regex for a `$` amount (`$45`, `$45.99`) — no bare-number or "45 dollars"
    handling; if the driver is quoting a price they'll use a `$`.
  - Vendor: a new regex, `(?:\bat\b|\bfrom\b|\bby\b)\s+(<Capitalized Phrase>)` — matches
    1–4 consecutive words where EVERY word starts with a capital letter (e.g. "Jiffy
    Lube", "Ford Dealership"), stopping at the first lowercase-initial word or
    punctuation. This means lowercase phrasing like "did it myself" or "changed the oil
    by hand" never misfires a vendor name, at the cost of missing a genuine lowercase
    shop name (acceptable — best-effort, and the field stays editable either way).
  - `hadMatch` is true only when at least a category was found — drives the "couldn't
    detect a category" hint in the UI. No exceptions are ever thrown; worst case every
    field comes back `null`/empty.

- **`src/components/EventForm.tsx`** (edit). New field at the very top of the form, above
  the existing Date/Odometer row:
  - A text input (`quickEntryText` local state, never persisted — transient UI only) +
    an explicit "Fill in ↓" button (no live/debounced parsing, per the earlier decision:
    explicit action only, so it's always undoable and never fights an in-progress edit).
  - On click: call `parseQuickEntry(quickEntryText)`.
    - `category`/`additionalCategories`: **always overwritten** when a category was
      found — pressing the button is the explicit signal to do this, matching the
      current single-select category dropdown having no real "blank" state.
    - `cost`, `vendor`, `title`: filled **only if currently blank** — never clobbers
      something the driver already typed manually into those fields.
    - If `vendor` or `title` end up newly filled, `showMore` (the "More details"
      collapsible, which currently hides the Vendor field) is force-expanded so nothing
      lands in a field the driver can't currently see.
    - If `hadMatch` is false, show an inline `muted small` note: "Couldn't detect a
      category — pick one below."
  - The quick-entry text itself is not cleared after Fill-in and is not part of the
    submitted event — it's scratch input that seeds the real fields, same spirit as the
    bulk paste importer's "parse then review" pattern, just for one line instead of many.

## Data flow

No Dexie/schema changes. `parseQuickEntry` is pure text-in/struct-out; `EventForm`'s
existing `submit()` is untouched — it already reads from `category`/`cost`/`vendor`/
`title` state, which quick-entry now has one more way to populate.

## Error handling

`parseQuickEntry` never throws (pure regex/string logic over arbitrary text). The only
"failure" mode is "nothing matched," surfaced as the inline hint above — never a
console error, never a blocked submit.

## Testing

- `tests/quickEntry.test.ts` (new, mirrors `tests/importHistory.test.ts`'s style): cost
  extraction, vendor extraction (including the "don't misfire on lowercase" cases),
  category passthrough via the reused matcher, and the `hadMatch` flag.
- `EventForm.tsx`'s wiring is verified live in the browser (Check flow / Vehicle Detail),
  matching this codebase's existing convention — no other component in `src/components/`
  or `src/pages/` has its own unit test file; UI correctness is proven live, not via
  component tests.

## Explicitly out of scope

- Receipt photo OCR (a much larger, separate feature — this is the cheap first step).
- Parsing date/odometer out of the text — those already have fast native inputs
  (`<input type="date">`, numeric input) directly below; re-parsing them out of prose
  would add regex surface for no real friction reduction.
- Any change to reminder-engine math, schedule templates, or the CRUD/backup layer.
