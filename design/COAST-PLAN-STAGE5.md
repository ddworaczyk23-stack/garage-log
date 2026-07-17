# Coast Stage 5 plan — the advocate layer (Tier 1)

Follow-up to `design/COAST-PLAN.md` (Stages 1–4 shipped + merged to main at `604802b`).
Three features that all extend the loop already built — mostly content + light pure logic over
existing data, no new architecture:

- **5A — Action cards**: turn each verdict from "what/how urgent/what cost" into "…and here's
  your next move" (self-check, drive-vs-tow, what to bring, independent-vs-dealer).
- **5B — Context-aware verdicts + health score**: let a vehicle's maintenance history nudge a
  triage verdict, and give each vehicle one honest health read.
- **5C — Quote verification**: check a shop's quote against the fair range and the diagnosis, on
  the owner's side of the counter.

**Frozen throughout (do not touch):** `domain/reminderEngine.ts`, `reminderStatus.ts`,
`scheduleTemplates.ts`, the reminder-rule sync in `db/events.ts`, Dexie Cloud sync. Backup format
is already v2 (concerns) — only bump again if 5C persists quotes (see 5C). Each sub-stage ships
independently; `npm test` + `npm run typecheck` gate each. Work on a `coast-stage5` branch off
`main`; don't push main (auto-deploys) without the user's say-so.

Guiding rule unchanged: every addition must tighten the triage loop, not widen Coast into a
generic "everything car" app. If a piece starts to feel like a content library or a hardware
integration, it belongs to a later stage or nowhere.

---

## 5A — Action cards (feature #1)

Verdicts currently answer what/urgency/cost. Add the missing "simplest next step for THIS
vehicle." All additive — no decision-tree logic changes.

1. **`domain/playbooks.ts` — extend `PlaybookOutcome` (all optional, backward-compatible):**
   - `selfCheck?: string[]` — "try this first" steps a non-mechanic can do safely (check oil on
     the dipstick, tighten the gas cap, look at tire pressure).
   - `driveOrTow?: { verdict: 'drive-ok' | 'short-trip-only' | 'tow'; note: string }` — clear
     threshold in plain terms (distance / speed / weather).
   - `whatToBring?: string[]` — service records, a photo of the leak/noise spot, any codes.
   - `shopChoice?: string` — one line on independent-vs-dealer/warranty for THIS job (pads →
     any independent; ABS module / head gasket → dealer or warranty worth it). Anchored to the
     job, not generic.
   - **No insurance/financial field.** Generic "cosmetic vs deductible" copy MAY live in
     `explanation` prose, but never as personalized advice and never a dollar recommendation —
     liability + out of scope.
   - Curate these for the high-traffic outcomes first (brake grind, flashing CEL, coolant, oil
     pressure); outcomes without them simply render fewer cards. A brief is never blocked on
     missing curation — same discipline as `CATEGORY_BRIEFS`.
2. **`pages/Check.tsx` — render an action-card block** under the existing
   causes/cost/escalation, before the shop-brief. New `.chk-action-*` CSS reusing card tokens.
   `driveOrTow: 'tow'` gets the strongest treatment (danger tint) since it's the safety call.
3. Same fields flow into the printed shop brief only where already relevant (`whatToBring` is
   for the driver, not the shop — keep it Check-only).

Tests: `playbooks.test.ts` — assert the curated high-traffic outcomes carry a `driveOrTow` and
that `resolveStep` still returns them unchanged (additive fields don't perturb resolution).
Exit: brake-grind and flashing-CEL verdicts each show self-check + drive/tow + what-to-bring.

## 5B — Context-aware verdicts + health score (feature #3)

The merge payoff: the engine (what's overdue) informs the triage (what's wrong). Half the wiring
already exists — `resolvedEventId` links a concern to the service that fixed it.

1. **`domain/playbooks.ts` — a PURE contextualizer, decision tree untouched:**
   - `interface TriageContext { overdueCategories: Set<MaintenanceCategory>; dueSoonCategories:
     Set<MaintenanceCategory>; mileage: number | null }`
   - `contextualizeOutcome(outcome, context): PlaybookOutcome` — returns an annotated COPY:
     when the outcome's `category` (or a small related-category map, e.g. brake-noise →
     brake-inspection) is overdue/due-soon, prepend a context note to `explanation`
     ("Your brakes are also past due for service — that raises the odds this is worn pads")
     and, where it changes nothing about safety, reorder `likelyCauses` to surface the
     wear-related cause. **Never downgrades a band or relaxes an escalation** — context can only
     sharpen or confirm, never reassure away a real symptom (same fail-safe rule as the engine).
   - `resolveStep` stays pure and context-free; contextualization is a separate, testable pass
     the page applies to the resolved outcome.
2. **`pages/Check.tsx`** — the `CheckVehicle` query already loads mileage + concerns; add
   `getVehicleReminders(vehicleId)` (exists in `db/summary.ts`) to the `FlowData`, derive the
   overdue/due-soon category sets, and pass the outcome through `contextualizeOutcome` before
   render. Reactive already (liveQuery).
3. **Health score — new PURE `domain/health.ts`:**
   - `vehicleHealth(reminders, openConcerns, mileageStale): { band: SignalBand; score: number;
     reasons: string[] }` — combine overdue count, worst open-concern band, and stale odometer
     into one read on the four-signal scale (reuses `bandFromStatus`/worst-wins, NOT a new
     vocabulary). `score` 0–100 for a compact meter; `reasons` explain it ("1 overdue, 1 open
     concern").
   - Add `health: VehicleHealth` to `VehicleSummary` (`db/summary.ts`) — a summary field only,
     it does NOT feed `compareVehicleUrgency` (ranking stays the audited lexicographic order).
   - Show it as a small meter on the Dashboard vehicle card and VehicleDetail header, colored by
     band.

Tests: new `health.test.ts` (worst-wins, score monotonicity, all-clear when nothing pending);
`playbooks.test.ts` — `contextualizeOutcome` adds a note when category overdue, is a no-op when
not, and never lowers a band.
Exit: a grinding-brake check on a vehicle whose brake-inspection is overdue shows the context
note; each vehicle shows a health read that matches its worst signal.

## 5C — Quote verification (feature #5)

The advocate feature. Pure logic + existing cost data; no shop network, no referral (that would
break the owner's-side thesis).

1. **New PURE `domain/quoteCheck.ts`:**
   - `interface QuoteInput { fairLow: number | null; fairHigh: number | null; quotedTotal:
     number; diagnosisChecks: { id: string; label: string; done: boolean | null }[] }`
   - `checkQuote(input): { rating: 'reasonable' | 'a-bit-high' | 'worth-a-second-look';
     reasons: string[]; secondOpinionScript: string[] }` — compare quoted vs fair band with
     tolerance bands (e.g. ≤ fairHigh = reasonable; up to ~1.3× = a-bit-high; beyond, or a
     missing diagnostic step, = worth-a-second-look). **Framing only, never absolute** — the
     labels are "worth a second look," not "fraud"; every rating carries a plain-language reason.
   - `diagnosisChecks` = the outcome's `askShopTo` turned into checkboxes ("Did they measure pad
     thickness?", "Pressure-test before quoting a head gasket?"). A "no" on a key check is the
     strongest signal — a head-gasket quote with no pressure test is the canonical flag.
   - `secondOpinionScript` — plain lines the driver can say: "Can you show me the worn part?",
     "Which test pointed to this?", "Is there a lower-cost parts option?"
2. **Fair-range source:** reuse what a brief already computes — `outcomeToBriefFacts` (playbook
   path) or `CATEGORY_BRIEFS` / `briefFromReminder` (schedule path) already produce
   `costLow/costHigh`. `quoteCheck` consumes those, so there's one source of truth for "fair."
3. **UI — a section on `pages/ShopBrief.tsx`** ("Got a quote? Check it"): a number field for
   the quote + the diagnosis checkboxes, rendering the rating card + second-opinion script. Lives
   on the brief because that's where the fair range already is and where the driver is at the
   counter.
4. **Persistence — DEFER.** v1 is a stateless calculator (no schema change, no backup bump). If
   the user later wants quotes saved to a concern for the resale packet, that's a `Quote[]` on
   `Concern` + a backup v3 — a separate, small follow-up, not in this stage.

Tests: `quoteCheck.test.ts` — reasonable/high/second-look thresholds, missing-check escalation,
null fair range (no anchor → advisory-only rating), script always present.
Exit: entering a $1,400 quote against a $180–520 brake range flags "worth a second look" with the
missing-pressure-test reason and a usable script.

---

## Sequencing & size

| Sub-stage | New code | Risk | Rough size |
|---|---|---|---|
| 5A Action cards | additive `PlaybookOutcome` fields + Check card block + content | Low — pure content/UI | 1–2 sessions |
| 5B Context + health | 1 pure contextualizer + `domain/health.ts` + summary field + 2 UI meters | Low–med — new pure module, no engine change | 2 sessions |
| 5C Quote verification | 1 pure module + ShopBrief section | Low | 1 session |

Recommended order: **5A → 5C → 5B.** 5A and 5C are pure content/logic wins with the least
surface; 5B touches `VehicleSummary` and two shared pages, so land it once the cheaper two are
settled. All three are independent — any can be dropped or reordered.

Deferred (explicitly NOT this stage): OBD-II dongle (breaks no-hardware thesis; Web Bluetooth
absent on iOS PWA anyway) — but a hardware-free P-code → playbook lookup could be a later stage;
a standalone education/"Learn" library (playbook content already teaches in context); quote
persistence + resale packet (small v3 follow-up if wanted); tire module + safety-critical view
(Tier 2).
