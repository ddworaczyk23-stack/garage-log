# Coast migration plan

Goal: re-front Garage Log with the Coast product (verdict-first proactive + triage + shop brief)
without rewriting the engine room. Reference prototype: `design/coast-prototype.html`.

**Frozen throughout (do not touch):** `domain/reminderEngine.ts`, `domain/reminderStatus.ts`,
`scheduleTemplates.ts`, `db/events.ts` CRUD, backup, Dexie Cloud sync, importer, VIN onboarding.
Every stage ships independently; `npm test` + `npm run typecheck` gate each one. Work on branch
`coast`; main stays deployable (pushing main auto-deploys — only push when told).

---

## Stage 1 — Verdict layer (proactive, no new data)

The engine already knows everything; this stage re-narrates it.

1. **`src/domain/verdict.ts` (pure, unit-tested).**
   - `SignalBand = 'fix-now' | 'book-soon' | 'coast' | 'all-clear'`
   - `bandFromStatus(s: MaintenanceStatus)`: overdue→fix-now, due-next→book-soon,
     watch-next→coast, completed→all-clear, not-applicable→excluded.
   - `vehicleVerdict(reminders, mileage)` → `{ band, headline, sentence, rulerPin,
     safeWindow, coastItems }`. Sentence generator: worst reminder dominates; template per band
     filled from `dueAtMiles/dueAtDate/milesRemaining/daysRemaining` + cost estimate when the
     vehicle has one. `odometerStale` → confidence line, never a scarier band.
2. **Signal tokens** appended to `styles/app.css`: `--sig-red:#B3402E --sig-amber:#D98A00
   --sig-blue:#1B5FAA --sig-green:#1E7A44` + tints. Fonts (Overpass, Overpass Mono, Newsreader)
   self-hosted woff2 in `public/fonts/` (PWA offline — no CDN), loaded via @font-face.
3. **UI.** New `components/VerdictPanel.tsx` + `UrgencyRuler.tsx` (markup from the prototype).
   `Dashboard.tsx` becomes Today: verdict panel per vehicle, ruler, "can coast" list, money strip
   (existing `getGarageCostSummary`/`getYearSpend`). `VehicleDetail.tsx` gets the verdict panel up
   top; schedule/history below unchanged.

Exit: dashboard reads as one sentence per vehicle; all existing tests + new verdict tests pass.

## Stage 2 — Triage ("Something's up?")

1. **`src/domain/playbooks.ts` (pure, unit-tested).** Playbook = question steps → result
   `{ band, likelyCause, costLow/High, escalationTriggers[], briefFacts }`. Hand-author 4:
   brake noise, other noises (turn/accel/constant), warning lights, leak/smell/smoke. Pure
   resolver walks answers → result. No LLM, no external data.
2. **Schema v4:** new synced table `concerns` (`id, vehicleId, createdDate`) storing open issues:
   band, title, dueBy estimate, playbook answers, status open/resolved. New `.version(4)` block.
3. **`pages/Check.tsx`** route `#/check/<vehicleId>`: chip flow → verdict screen (panel + ruler +
   cost card + escalation list) → "Add to my list" writes a concern. Today verdict becomes
   worst-of(engine reminders ∪ open concerns). Nav gains the raised center Check button
   (Today / Check / Docs / Backup collapse per prototype later, Stage 4).

Exit: grinding-brakes path works end-to-end on a real vehicle; concern shows on Today; resolving
it (logging the repair via existing EventForm) clears it.

## Stage 3 — Shop brief

1. **`src/domain/shopBrief.ts` (pure).** Compose from vehicle + concern/reminder + mileage +
   history-known flags: symptom translated, "please inspect X and report Y", fair range,
   fair-if-suggested / fine-to-decline, unknown-history lines ("service history unknown — verify
   pad thickness before replacing").
2. **`pages/ShopBrief.tsx`** route `#/brief/<concernId|ruleId>`: the show-your-phone card from the
   prototype. Share = print stylesheet + `navigator.share` where available (skip canvas export v1).

Exit: any verdict or due reminder produces a brief in two taps.

## Stage 4 — Identity cutover

1. Re-skin app-wide to signage tokens (M10 made CSS token-driven — mostly `:root` swap + verdict
   components already styled). Records/history keeps the editorial ledger treatment (ledger-v3
   work lives there). Nav: Today / Check (center) / The file. PWA manifest colors + icons redone
   (icon is still the scaffold "GL" placeholder anyway). Optional rename.
2. Merge `coast` → main when a week of household use surfaces no regressions; Pages deploy is
   automatic on push.

---

## Sequencing & size

| Stage | New code | Risk | Rough size |
|---|---|---|---|
| 1 Verdict layer | 1 pure module + 2 components + 2 page edits | Low — presentation only | 1–2 sessions |
| 2 Triage | 1 pure module + 1 table + 1 page | Medium — schema v4 | 2–3 sessions |
| 3 Shop brief | 1 pure module + 1 page | Low | 1 session |
| 4 Identity | CSS tokens + nav + icons | Low | 1–2 sessions |

Later (optional, post-cutover): receipt-photo OCR for records, more playbooks, regional cost
adjustment, LLM long-tail triage. None block the above.
