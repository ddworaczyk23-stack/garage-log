# Garage Log

Local-first, installable **PWA** for tracking maintenance on the two household
vehicles. Vite + TypeScript + Preact + Dexie.js (IndexedDB) + vite-plugin-pwa,
plain CSS. No backend — all data lives in the browser (IndexedDB).

Vehicles:
- **2020 Ford F-150 STX** — 2.7L EcoBoost V6, **4WD**
- **2020 Nissan Rogue SL** — 2.5L I4, **FWD** (confirmed FWD, not AWD)

## Run / build

Requires **Node 18+** (installed on this machine: Node 24.18.0 / npm 11.16.0 at
`C:\Program Files\nodejs\`). Open a fresh terminal so Node is on PATH.

```
npm install       # first time only
npm run dev       # dev server, http://localhost:5173
npm run build     # production bundle -> dist/
npm run preview   # serve the built dist/ locally
npm test          # vitest run — tests/reminderEngine.test.ts (pure engine) +
                  # tests/events.test.ts (DB-layer CRUD/resync, via fake-indexeddb)
```

## Verifying changes

Use the preview MCP tools: `preview_start` with config name **`garage-log`**
(defined in `.claude/launch.json`), then inspect via `preview_snapshot` /
`preview_console_logs` / `preview_eval`.

- The launch config runs Vite via `node node_modules/vite/bin/vite.js` — **not**
  `npm`. The preview tool spawns without a shell, so `npm`/`npm.cmd` fails with
  `ENOENT` on Windows; calling `node` directly avoids it.
- State persists in IndexedDB (DB name `garage-log`) across reloads. To test a
  fresh first-run, use the Debug tab's "Delete database & re-seed", or in the
  console: `indexedDB.deleteDatabase('garage-log')` then reload.

## Architecture

- **`src/types.ts`** — the full data model (one shared `category` vocabulary ties
  `MaintenanceEvent` to `ReminderRule` for auto-personalization in later milestones).
- **`src/db/db.ts`** — single Dexie database, schema **version 1**, six tables:
  `vehicles, odometerReadings, events, documents, reminderRules, appMeta`. Index
  strings list only indexed keys. **`orderBy(field)` requires `field` to be
  indexed** — this bit us once (`vehicles: 'id, name'` exists so the lists can
  sort by name). To change schema after real data exists on a device, add a new
  `.version(n).stores({...})` block; never edit version 1.
- **`src/db/seed.ts`** — seeds the two vehicles on a fresh DB only (`seedIfEmpty`).
  Stable string ids (`f150-2020`, `rogue-2020`) so later backup import dedupes.
- **`src/db/useQuery.ts`** — reactive hook wrapping Dexie `liveQuery`; screens
  re-render automatically after writes. Return `undefined` = loading; have the
  querier return `null` for "loaded but not found" so the two are distinguishable.
  Resets to `undefined` on every dep change (e.g. switching vehicles) so a
  heavier query (like the reminders engine) doesn't briefly render the
  previous vehicle's stale data while its own first emission is still pending.
- **`src/db/events.ts`** — full event/odometer CRUD, the only place writes
  happen as a result of logging real history:
  - `recordCompletedEvent(input, files?, ruleOverride?)` — inserts the
    `MaintenanceEvent` (permanent history, never touched by later template/
    interval edits), stores any attached files via `attachDocument`, syncs the
    matching rule's cached `lastDoneDate`/`lastDoneMiles` via the pure
    `applyEventToRule` (adopt-if-newer), and optionally applies a rule
    override/custom-interval (`ruleOverride`) — the same fields TemplateAdmin
    writes, just reachable from the event-logging form too.
  - `updateEvent`/`deleteEvent` — editing or deleting can change (or remove)
    which event was "latest" for a rule, so both call `syncRuleFromHistory`
    (recompute lastDone from ALL remaining matching events, not adopt-if-newer)
    — this can correctly REGRESS the cache, e.g. undoing a mis-typed future
    date, or nulling it out if the only event is deleted. `deleteEvent` also
    `bulkDelete`s the event's attached documents so nothing orphans.
  - `recordOdometerReading`/`updateOdometerReading`/`deleteOdometerReading` —
    reading CRUD; no rule to sync (odometer readings don't map to a category).
  - `getCurrentMileageEstimate()` — best current mileage from the newer of
    odometer readings and service events; same-day entries tie-break to the
    HIGHER mileage (dates are day-only, so insertion order isn't tracked —
    odometer only moves forward). Covered by `tests/events.test.ts`.
  - `attachDocument()` — stores a `File` as a `VehicleDocument` linked to an event.
- **`src/db/summary.ts`** — `getVehicleReminders()` (the one shared
  rules+events+mileage → `computeVehicleReminders` composition, used by Vehicle
  Detail, Vehicles list, and the reminders debug panel — avoid re-duplicating
  this query shape), `getYearSpend()`, and the M5 cross-vehicle layer:
  `getGarageSummary()` builds a `VehicleSummary` per vehicle (counts, urgency,
  badges, top/next reminders, recent service+repairs, mileage confidence,
  miles-this-year, spend, doc count, last activity), ranks them via
  `compareVehicleUrgency`, and flattens a capped `AttentionItem[]` feed. Reads
  every table inside the caller's liveQuery, so the whole dashboard recomputes
  reactively on any Dexie write.
- **`src/domain/vehicleRanking.ts`** — PURE cross-vehicle ranking (never
  recomputes a reminder, only counts/compares engine output). `countByStatus`,
  a lexicographic `compareVehicleUrgency` (overdue count → due-next → watch-next
  → stale odometer → recent repair cost → neglect; urgency always dominates so
  any overdue vehicle outranks a watch-only one), and `vehicleBadges` (the
  explain-the-ranking chips). Unit-tested in `tests/vehicleRanking.test.ts`.
- **`src/components/`** — `EventForm` (one shared component for both the
  maintenance and repair forms, add AND edit, via `kind`/`existing` props;
  owns the attachment picker and the maintenance-only "next-due override"
  section that writes directly to `ReminderRule.override`/`customInterval*`),
  `OdometerForm`, `EventListItem`/`OdometerListItem` (history rows that toggle
  into their form for editing — no manual refetch plumbing needed, Dexie's
  `liveQuery` already re-runs every dependent query when the tables change),
  `DocumentGrid` (thumbnails/links via `URL.createObjectURL`, revoked on unmount).
- **`src/app.tsx`** — app shell + a tiny **hash router** (`#/`, `#/vehicles`,
  `#/vehicle/<id>`, `#/debug`, `#/template`, `#/reminders-debug`). Hash routing
  (not History API) is deliberate: it deep-links on GitHub Pages / static
  hosts with no 404-rewrite and survives `base: './'`. Don't swap in a
  History-API router without adding a Pages fallback.
- **`src/pages/`** — `Dashboard` (M5 cross-vehicle: "needs attention first"
  feed, vehicles ranked by urgency with explain badges + per-vehicle summary,
  side-by-side comparison table), `Vehicles` (list + top-status badge per
  vehicle), `VehicleDetail`
  (the main CRUD hub: reminders, quick-add for service/repair/odometer, full
  history lists with edit/delete, attached documents), `Debug`, `TemplateAdmin`,
  `ReminderDebug` (now just a raw read-only inspection table — data entry
  happens on Vehicle Detail; don't re-add input forms here, it'd duplicate
  `EventForm`/`OdometerForm`).
- **`vite.config.ts`** — `base: './'` (works at domain root AND under a
  `/garage-log/` Pages subpath). PWA manifest + service worker are configured
  here; `registerType: 'autoUpdate'`, SW enabled in dev (`devOptions.enabled`).

## Deployment (not set up yet)

No git repo or host configured yet. Target is GitHub Pages (HTTPS) so the app can
be installed to a phone home screen — a LAN dev URL (`http://<ip>:5173`) is not a
secure context and won't offer install. Publish the `dist/` folder.

## Build roadmap (milestone-based)

- **M1 — scaffold: DONE.** Shell, nav, PWA install, Dexie schema, 2 seed
  vehicles, dashboard, vehicle list/detail, debug view.
- **M2 — schedule templates + override/status plumbing: DONE** (revised to a
  three-tier interval system — see below).
  - `src/types.ts` — `Interval` (`{ miles, months, conditionBased? }`); shared
    vocab `MAINTENANCE_CATEGORIES`/`CATEGORY_LABELS`; `OverrideKind`/
    `RuleOverride`/`OVERRIDE_LABELS` (already-replaced, dealer-performed, diy,
    inspect-next-oil-change, replace-at-next-interval, not-needed);
    `MaintenanceStatus`/`STATUS_LABELS` (completed, watch-next, due-next,
    overdue, not-applicable). `ReminderRule` holds `customIntervalMiles`/
    `customIntervalMonths` (the ONLY per-vehicle interval override — both null
    = no override) plus `override`/`notes`.
  - `src/db/scheduleTemplates.ts` — static, code-only schedules for F-150 (14
    items) and Rogue (13 items), each with a **factoryInterval** (manufacturer
    reference, kept forever) and an optional **mechanicConsensusInterval**
    (practical longevity default — what the app recommends unless a vehicle-
    specific reason says otherwise, e.g. Rogue CVT fluid overriding Nissan's
    "lifetime" claim). `consensusNote` explains any factory/consensus gap.
    Wheel alignment uses `conditionBased: true` instead of a fixed interval.
    `getTemplateEntry()` returns the pristine entry — template is NEVER mutated.
  - `src/domain/reminderStatus.ts` — `resolveInterval(rule)` implements the
    default-selection order **custom ?? consensus ?? factory**, returning
    `{ miles, months, conditionBased, source }`. Plus the M4 engine CONTRACT
    (no computation yet): `WATCH_LEAD_MILES/DAYS`, `StatusInputs`,
    `resolveLastDone()`, `isNotApplicable()`.
  - `src/domain/format.ts` — shared `formatInterval(miles, months, conditionBased?)`.
  - `seed.ts` — seeds vehicles + reconciles rules ADDITIVELY by id (never
    overwrites user edits) and migrates older rule shapes (drops the old single
    `intervalMiles`/`intervalMonths` fields, which were seeded defaults not user
    data; adds `customIntervalMiles`/`Months`/`override`/`notes` if missing).
  - UI: Vehicle Detail shows the EFFECTIVE interval read-only; admin view
    `src/pages/TemplateAdmin.tsx` (route `#/template`, linked from Debug) shows
    Factory / Consensus / Effective per rule, a custom-interval editor + "Clear
    custom interval" button, and the status-override editor.
  - Consensus intervals are practical defaults (not the shortest possible, not
    excessive) compiled from independent-mechanic guidance — verify vs owner's
    manuals; user overrides always take precedence and are preserved.
- **M3/M4 — reminders engine + due-status: DONE** (event logging + the engine
  landed together, since the engine needed real history to personalize
  against — see events.ts above).
  - `src/domain/reminderEngine.ts` — the pure engine. `computeReminder(rule,
    inputs)` returns `{ status, interval, lastDone, dueAtMiles, dueAtDate,
    milesRemaining, daysRemaining, odometerStale, reason }`. Per-axis
    thresholds: `DUE_LEAD_MILES/DAYS` (500mi/30d, inner "due-next" window) and
    `WATCH_LEAD_MILES/DAYS` (1500mi/90d, outer "watch-next" window); hybrid
    rules take whichever axis is more urgent. Reuses the 5-state
    `MaintenanceStatus` from types.ts rather than adding more — "watch next"/
    "due soon" both map to `watch-next`, "due now"/"due next" both map to
    `due-next" (documented in the file header).
  - `matchesRule`/`latestMatchingEvent`/`applyEventToRule` — pure event-history
    helpers; `computeVehicleReminders(rules, events, inputs)` personalizes each
    rule against its matching events before scoring, ties
    `inspect-next-oil-change` rules to the oil-change rule's computed status,
    and returns the list ranked by `rankReminders` (overdue → due-next →
    watch-next → completed → not-applicable; `DEFAULT_ANNUAL_MILEAGE=12000`
    only used to compare mileage- vs date-based items on one axis for ranking).
  - `STALE_ODOMETER_DAYS=45` — `odometerStale` is true when there's no current
    mileage estimate at all, or the estimate is older than this.
  - `resolveLastDone()` (reminderStatus.ts) now merges the cached rule fields
    AND an `already-replaced` override, picking whichever is more recent — a
    real logged event supersedes a pre-app-use override once one exists.
  - Next due is always anchored to the actual completion point
    (`lastDone.miles/date + interval`), never a fixed original schedule slot —
    an early service pulls the next one forward too.
  - 27 unit tests in `tests/reminderEngine.test.ts` (vitest) cover mileage-only,
    date-only, combined/hybrid, overdue, due-soon, all override kinds,
    condition-based (never overdue), stale/missing odometer, event-history
    helpers, ranking, and the inspect-next-oil-change tie-in.
  - UI: Vehicle Detail now shows real ranked status pills + reasons + a
    read-only recent-history list; `#/reminders-debug` (linked from Debug) lets
    you inject test odometer readings / completed events and see the raw
    per-rule computation in a table.
- **M5 — full CRUD (service/repair/odometer/documents): DONE.**
  - `types.ts` — `MaintenanceEvent` gained `kind: 'maintenance' | 'repair'`
    (one table/type for both — same history list, same document attachments,
    same category-matching; only the form fields shown differ) plus optional
    fields per kind: `servicePerformed`/`parts`/`fluids`/`performedBy`
    (maintenance) and `symptom`/`diagnosis`/`fix`/`labor`/`parts` (repair).
    `category` is now typed `MaintenanceCategory` (was loosely `string`).
    New `PerformedBy`/`PERFORMED_BY_LABELS` (dealer/independent-shop/diy/other).
  - Full CRUD wired through `db/events.ts` (see above) + the new UI components.
    "Next-due override" in the service form reuses the existing `OverrideKind`/
    `RuleOverride` system from M2/M3 — no new override concept.
  - A repair CAN still update a tracked rule's last-done if you tag it with a
    real category (e.g. logging a brake-pad repair as `brake-inspection`) —
    verified live: the rule synced even though the event's `kind` was `repair`.
  - `tests/events.test.ts` (12 tests, new `vitest.config.ts` +
    `fake-indexeddb` dev dep so Dexie has a real IndexedDB under Node) covers
    the sync-on-add/edit/delete branches specifically — including the
    regression case unit tests would otherwise miss: editing/deleting the
    LATEST event must fully recompute from remaining history (can regress the
    cache), unlike the simple adopt-if-newer path used on a plain add.
  - Reminder math itself is UNCHANGED this milestone — `reminderEngine.ts` /
    `reminderStatus.ts` / `scheduleTemplates.ts` were not touched.
  - Verified live end-to-end in the browser (not just unit tests): logged an
    early oil change with an attachment + a DIY override → confirmed the rule
    resynced and the reminder recomputed to `completed`; edited the event's
    mileage → cache updated; deleted it → cache correctly regressed to
    null and the orphaned document was removed; logged/edited/deleted
    odometer readings and confirmed the same-day tie-break still picks the
    higher mileage; confirmed switching vehicles never flashes stale data even
    with the heavier new queries (Vehicle Detail now queries events + odometer
    readings + documents + reminders, not just reminders).
- **M6 — cross-vehicle dashboard + ranking: DONE** (user called it "Milestone
  5"; it's the cross-vehicle work). Pure `domain/vehicleRanking.ts` + the
  `getGarageSummary` aggregation + Dashboard rebuild (see above). Reminder math,
  CRUD, and templates were NOT touched. 12 new unit tests (51 total, all pass).
  Ranking is lexicographic/deterministic; the attention feed caps each vehicle
  at 3 items (`ATTENTION_MAX_PER_VEHICLE`) so one vehicle's baseline "due-next"
  flood can't crowd the other out. Verified live: F-150 (1 overdue) ranked above
  Rogue (watch-only) with explain badges; comparison table correct (spend
  excludes prior-year events; miles-this-year = current − pre-year baseline);
  reactivity confirmed via a real form write.
  - Known limitation: a fresh/unlogged vehicle shows every rule as baseline
    "due-next", which dominates its own badges + feed slots. On a populated DB
    most items are `completed` so this self-resolves; a follow-up could
    distinguish "never logged (setup)" from a real due-next in the feed.
- **M7 — richer document handling: DONE.** Two pieces: (1) automatic image
  compression on upload, (2) vehicle-level ("Glovebox") documents not tied to an
  event. New PURE `domain/documents.ts` (`fitWithin`, `shouldCompressImage`,
  `keptSmaller`, `toJpegName`, `formatBytes` + constants `MAX_IMAGE_DIMENSION`
  1600 / `IMAGE_QUALITY` 0.8 / `MIN_COMPRESS_BYTES` 200 KB / `COMPRESSIBLE_TYPES`
  jpeg|png|webp) — all unit-tested (17 new tests in `tests/documents.test.ts`,
  68 total). New impure `db/documents.ts` is now the SINGLE attachment write
  path: `prepareDocument` re-encodes large raster images to a downscaled JPEG via
  canvas (`createImageBitmap` + `toBlob`), best-effort — any failure or a blob
  that didn't get ≥10% smaller falls back to storing the original untouched;
  `storeDocument` (shared) + `attachEventDocument` / `attachVehicleDocument` +
  `deleteDocument` (unlinks from its event's `documentIds` when linked to one) +
  `getVehicleLevelDocuments` (uses the existing `[linkedTo.type+linkedTo.id]`
  compound index). `db/events.ts` no longer defines its own `attachDocument` — it
  imports `attachEventDocument`, so event attachments now compress too.
  `VehicleDocument` gained optional `optimized?`/`originalSizeBytes?` (non-indexed,
  no schema migration). UI: new `components/VehicleDocuments.tsx` (Glovebox card:
  upload + reactive grid + per-doc delete); `DocumentGrid` extended with an
  optional `onRemove` (delete "✕" overlay) and a size/"optimized" meta line;
  VehicleDetail renders the Glovebox and relabels the event-docs section "Service
  & repair receipts" (read-only there — managed by editing the event). Reminder
  math / CRUD / templates NOT touched. Verified live: uploaded a 10.3 MB noise PNG
  to the Glovebox → stored as a 1.0 MB JPEG (`optimized:true`,
  `originalSizeBytes` recorded, filename `.png`→`.jpg`, `linkedTo` vehicle), UI
  updated reactively to "Glovebox (1)" with the "optimized" badge, then per-doc
  delete removed both the row and the blob (liveQuery, no reload). NOTE: canvas
  isn't available under `fake-indexeddb`/Node, so compression itself is verified
  live in the browser, not in unit tests (the unit tests cover the pure
  decision/math helpers; the impure path gracefully falls back to the original
  when canvas is unavailable).
  - **Second pass (the full M7 prompt): a cross-vehicle documents browser +
    preview + tags + reassign.** PURE additions to `domain/documents.ts`:
    `fileTypeOf` (image|pdf|other), `DocumentIndexEntry`/`DocumentFilter` types,
    `filterDocuments` (facets: vehicle / source `maintenance|repair|glovebox` /
    file type + free-text over filename·context·vehicle·tags), `sortDocumentsByDateDesc`,
    `parseTags` (trim/lowercase/dedupe), `collectTags` — all unit-tested (27
    tests in `tests/documents.test.ts`, **78 total**). IMPURE additions to
    `db/documents.ts`: `buildDocumentIndex()` joins documents×vehicles×events into
    `DocumentIndexEntry[]` (nothing denormalized onto the doc — `linkedTo` stays
    source of truth; reads all 3 tables inside the caller's liveQuery so the view
    is reactive), `getVehicleEvents` (reassign targets), `reassignDocument(docId,
    target)` (moves ONLY attachment pointers — the doc's `linkedTo` + both events'
    `documentIds`; never touches event date/mileage/category, so **no reminder
    recompute** and older history is preserved; rejects cross-vehicle moves as a
    backstop), `setDocumentTags`. `VehicleDocument` also gained optional `tags?`.
    New route `#/documents` (+ `#/documents/<vehicleId>` deep-link, wired in
    `app.tsx`); new "Docs" item in `Nav.tsx`. New `pages/Documents.tsx` (search +
    3 filter selects + result list, filtering/sorting via the pure helpers) and
    `components/DocumentPreviewModal.tsx` (bottom-sheet: inline `<img>` for images,
    `<iframe>` for PDFs, metadata card otherwise; always an Open/Download link;
    tag editor; reassign `<select>` of same-vehicle events + Glovebox; Remove).
    VehicleDetail's receipts card got a "Browse all →" deep-link. `db/summary.ts`
    `documentCount` now also counts glovebox docs (a summary field, NOT ranking
    input — `compareVehicleUrgency` is unchanged). Verified live end-to-end:
    logged a service event; uploaded a 6.6 MB image (→1.2 MB JPEG) + a PDF to the
    Glovebox; browsed/filtered by vehicle/source/file-type/search; previewed image
    (img) and PDF (iframe rendered "M7 test PDF"); tagged (`insurance, Warranty,
    insurance`→`["insurance","warranty"]`); reassigned the image glovebox→event
    (doc `linkedTo` + event `documentIds` updated, tags kept, **event
    title/date/odo/category and the oil-change rule's lastDone all unchanged**);
    file-type filter narrowed to the PDF; removed the event-linked image (**event
    survived with `documentIds` emptied**); `#/documents/<id>` pre-filtered the
    vehicle; dashboard Documents row counted the glovebox doc. tsc + build clean,
    78/78 tests, no console errors.
- Next: M8 backup/export + storage durability (`navigator.storage.persist`
  already called at boot in `main.tsx`, but no export/import yet) → M9 cost/resale
  summary (per-category breakdown; `getYearSpend`/comparison only total).

Do NOT implement later-milestone features (backup/export, cost breakdown) until
that milestone.
