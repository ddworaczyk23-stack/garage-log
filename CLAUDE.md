# Garage Log

Local-first, installable **PWA** for tracking maintenance on two household
vehicles. Vite + TypeScript + Preact + Dexie.js (IndexedDB) + vite-plugin-pwa,
plain CSS. Offline-first: all data lives in IndexedDB and the app is fully usable
with no account. Optional per-user private sync via **Dexie Cloud** (no
self-hosted backend) layers on top — see the runbook below.

Vehicles:
- **2020 Ford F-150 STX** — 2.7L EcoBoost V6, **4WD**
- **2020 Nissan Rogue SL** — 2.5L I4, **FWD** (confirmed FWD, not AWD)

> History note: this project was built in 13 milestones (M1–M13) plus several
> follow-on features. That per-milestone narrative lived here and bloated the
> file to ~800 lines; it's now in git history. This file is current-state only.

## Run / build

Requires **Node 18+** (this machine: Node 24.18.0 / npm 11.16.0 at
`C:\Program Files\nodejs\`). Open a fresh terminal so Node is on PATH.

```
npm install       # first time only
npm run dev       # dev server, http://localhost:5173
npm run build     # production bundle -> dist/
npm run preview   # serve the built dist/ locally
npm test          # vitest run (pure engine + DB-layer CRUD via fake-indexeddb)
npm run typecheck # tsc --noEmit — same check build does, without emitting
```

## Verifying changes

Use the preview MCP tools: `preview_start` with config name **`garage-log`**
(`.claude/launch.json`), then `preview_snapshot` / `preview_console_logs` /
`preview_eval`.

- The launch config runs Vite via `node node_modules/vite/bin/vite.js`, **not**
  `npm`. The preview tool spawns without a shell, so `npm`/`npm.cmd` fails with
  `ENOENT` on Windows; calling `node` directly avoids it.
- State persists in IndexedDB (DB name `garage-log`) across reloads. For a fresh
  first-run: Debug tab's "Delete database & re-seed", or console
  `indexedDB.deleteDatabase('garage-log')` then reload.

## Architecture

- **`src/types.ts`** — the full data model. One shared `category` vocabulary
  (`MaintenanceCategory`) ties `MaintenanceEvent` to `ReminderRule`.
- **`src/db/db.ts`** — single Dexie DB with the `dexieCloud` addon attached,
  schema at **version 6**, seven tables: `vehicles, odometerReadings, events,
  documents, reminderRules, appMeta, concerns`. Index strings list only indexed
  keys. **`orderBy(field)` requires `field` indexed** (this bit us once;
  `vehicles: 'id, name'` exists so lists sort by name). Change schema only by
  adding a new `.version(n).stores()` block — never edit an existing version.
  Adding a NON-indexed field (e.g. `ReminderRule.templateKey`,
  `VehicleDocument.tags`) needs no bump — seed.ts backfills those. Three onboarding
  "reference" cache tables (`factoryMaintenanceData`, `consensusData`,
  `costEstimateData`) were added and later removed (see git history) — all three
  only ever held sample/mock data with no feasible free real source, and showing
  fabricated-looking placeholders was misleading rather than useful.
- **`src/db/cloud.ts`** — Dexie Cloud config + auth glue. `db.cloud.configure()`
  runs only when `VITE_DEXIE_CLOUD_URL` is set. `login()`/`logout()`/
  `useCloudUser()`. `appMeta` is the one `unsyncedTables` entry (local-only
  bookkeeping, deterministic key).
- **`src/db/seed.ts`** — seeds the two vehicles on a fresh DB only
  (`seedIfEmpty`). Vehicle ids are fresh `veh-<uuid>` (globally unique — required
  for Dexie Cloud; the old `f150-2020`/`rogue-2020` would collide across users).
  Fixed template lookup lives on `ReminderRule.templateKey` instead; backfills it
  for pre-existing rules. Reconciles rules ADDITIVELY by id (never overwrites user edits).
- **`src/db/useQuery.ts`** — reactive hook over Dexie `liveQuery`. `undefined` =
  loading; return `null` for "loaded but not found". Resets to `undefined` on dep
  change so a heavier query doesn't briefly render the previous vehicle's stale data.
- **`src/db/events.ts`** — event/odometer CRUD, the only place real-history
  writes happen:
  - `recordCompletedEvent(input, files?, ruleOverride?)` — inserts the immutable
    `MaintenanceEvent`, stores attached files via `attachEventDocument`, syncs the
    rule's cached `lastDoneDate/Miles` via `applyEventToRule` (adopt-if-newer),
    optionally applies a rule override/custom-interval.
  - `updateEvent`/`deleteEvent` — call `syncRuleFromHistory` (recompute lastDone
    from ALL remaining matching events, not adopt-if-newer) — can correctly
    REGRESS the cache or null it. `deleteEvent` also bulk-deletes attached docs.
  - `getCurrentMileageEstimate()` — newest of odometer readings and service
    events; same-day ties go to HIGHER mileage (dates are day-only). Tested.
- **`src/db/documents.ts`** — the SINGLE attachment write path. `prepareDocument`
  re-encodes large raster images to downscaled JPEG via canvas, best-effort (any
  failure, or <10% smaller, stores the original). `attachEventDocument` /
  `attachVehicleDocument` / `deleteDocument` / `getVehicleLevelDocuments` /
  `buildDocumentIndex()` (joins docs×vehicles×events, reactive) /
  `reassignDocument` (moves ONLY attachment pointers — no reminder recompute) /
  `setDocumentTags`.
- **`src/db/summary.ts`** — `getVehicleReminders()` (the ONE shared
  rules+events+mileage → `computeVehicleReminders` composition; don't re-duplicate
  this query shape), `getGarageSummary()` (per-vehicle `VehicleSummary` + capped
  `AttentionItem[]` feed), `getGarageCostSummary()`. Reads every table inside the
  caller's liveQuery so the dashboard recomputes on any write.
- **`src/db/vehicleOnboarding.ts`** — `addVehicle()` (dedup-checked via
  `matchesExistingVehicle`; creates the vehicle + its generic maintenance
  schedule in one transaction).
- **`src/domain/`** — PURE logic, all unit-tested:
  - `reminderEngine.ts` — `computeReminder(rule, inputs)` + `computeVehicleReminders`.
  - `reminderStatus.ts` — `resolveInterval(rule)`, `resolveLastDone()`.
  - `vehicleRanking.ts` — lexicographic `compareVehicleUrgency` + `vehicleBadges`.
  - `documents.ts`, `cost.ts`, `backup.ts`, `format.ts`, `vehicle.ts`,
    `vehicleIdentity.ts`, `importHistory.ts`, `practicalTiming.ts`,
    `costHeuristics.ts`.
- **`src/services/`** — `vinDecode.ts` (REAL NHTSA vPIC `decodevinvalues` call,
  no key). The onboarding "reference data" adapters that used to live here
  (`maintenanceProvider.ts`, mock-only) were removed — see git history.
- **`src/components/`** — `EventForm` (shared maintenance+repair, add+edit via
  `kind`/`existing`; owns attachment picker + next-due override), `OdometerForm`,
  `EventListItem`/`OdometerListItem`, `DocumentGrid`, `DocumentPreviewModal`,
  `VehicleDocuments` (Glovebox), `NicknameEditor`, `AccountBar`, `ui.tsx`
  (`Loading`, `EmptyState`, `ConfirmButton`, `ErrorBoundary`).
- **`src/app.tsx`** — shell + a tiny **hash router** (`#/`, `#/vehicles`,
  `#/vehicle/<id>`, `#/documents`, `#/costs`, `#/backup`, `#/add-vehicle`,
  `#/import/<id>`, `#/debug`, `#/template`, `#/reminders-debug`). Hash routing is
  deliberate — deep-links on static hosts with no 404-rewrite, survives
  `base: './'`. Don't swap in a History-API router without a Pages fallback.
- **`src/pages/`** — `Dashboard`, `Vehicles`, `VehicleDetail` (main CRUD hub),
  `Documents`, `Costs`, `Backup`, `AddVehicle`, `ImportHistory`, `Debug`,
  `TemplateAdmin`, `ReminderDebug` (read-only inspection — don't re-add input
  forms, it'd duplicate `EventForm`/`OdometerForm`).
- **`vite.config.ts`** — `base: './'` (domain root AND `/garage-log/` subpath).
  PWA manifest + SW here; `registerType: 'autoUpdate'`, SW enabled in dev.

## Engine constants & invariants (don't drift these)

- **Thresholds** (`reminderEngine.ts`): `DUE_LEAD_MILES/DAYS` = 500mi/30d (inner
  "due-next"), `WATCH_LEAD_MILES/DAYS` = 1500mi/90d (outer "watch-next"). Hybrid
  rules take whichever axis is more urgent. `STALE_ODOMETER_DAYS` = 45.
  `DEFAULT_ANNUAL_MILEAGE` = 12000 (only for ranking mileage- vs date-based items).
- **5 states** (`MaintenanceStatus`): completed, watch-next, due-next, overdue,
  not-applicable. "watch/due soon" → `watch-next`; "due now/next" → `due-next`.
- **Interval selection order:** `custom ?? consensus ?? factory`. Custom is the
  ONLY per-vehicle interval override. Templates are NEVER mutated.
- **Next due is anchored to actual completion** (`lastDone + interval`), never a
  fixed original slot — an early service pulls the next one forward.
- **Rule ids** are `${vehicleId}:${category}`. Condition-based items never go overdue.
- **Dates are TZ-safe:** use `localDateISO()` (not `toISOString().slice(0,10)`,
  which reads the UTC date). `addMonths()` clamps month-end (Jan 31 +1mo = Feb 28,
  not Mar 3). Number inputs use `parseNumberInput()` → null, never NaN.
- **Scope boundary:** the engine runs only on curated templates (`scheduleTemplates.ts`)
  + logged history — never on sample/mock data. (The three onboarding "reference"
  cards that used to sit outside this boundary — factory maintenance, consensus,
  cost estimates — were removed entirely rather than kept mock; see git history.)
- **Backup = full REPLACE** in one Dexie transaction (rolls back on failure).
  Records keep ids so all relationships survive. Templates are NOT exported
  (code-derived; `seedIfEmpty` forward-fills on next boot).
- **Ranking is pure/lexicographic;** the attention feed caps each vehicle at 3
  items (`ATTENTION_MAX_PER_VEHICLE`) so one vehicle can't crowd out the other.
- Known limitation: a fresh/unlogged vehicle shows every rule as baseline
  "due-next"; self-resolves once history is logged.

## Deployment

Live at **https://ddworaczyk23-stack.github.io/garage-log/** via
`.github/workflows/deploy.yml` (GitHub Actions builds Vite + publishes `dist/`
on every push to `main`; Pages Source = "GitHub Actions"). Hash routing + HTTPS
so it installs to a phone home screen. **Pushing to main auto-deploys — don't
push unless asked.**

## Dexie Cloud (sync) — operations runbook

Optional per-user private sync. The app runs fully local without any of this;
sync activates only when `VITE_DEXIE_CLOUD_URL` is present at build time.

- **Database:** `https://zcrqdxpc7.dexie.cloud` (owner/admin = the email used for
  `npx dexie-cloud create`). CLI files `dexie-cloud.json` (`dbUrl`, non-secret) +
  `dexie-cloud.key` (SECRET admin key) live in project root, gitignored — never
  commit `.key`; back it up in a password manager, rotate via CLI if it leaks.
- **Local dev:** `VITE_DEXIE_CLOUD_URL=https://zcrqdxpc7.dexie.cloud` in
  `.env.local` (gitignored; template in `.env.example`). Without it, dev/build
  produce the byte-identical local-only bundle (Vite constant-folds it to
  `undefined`, tree-shaking out the AccountBar branch).
- **Deployed build:** the workflow injects the URL from a **repository** secret
  (not environment secret — the build job has no `environment:` key) named
  `VITE_DEXIE_CLOUD_URL`. If missing, the deploy still succeeds but ships
  local-only — verify the deployed bundle contains `zcrqdxpc7` / `Sign in to sync`.
- **Whitelist origins:** `npx.cmd dexie-cloud whitelist http://localhost:5173`
  and `... whitelist https://ddworaczyk23-stack.github.io`.
- **End-user management is NOT in the CLI** — use **https://manager.dexie.cloud**
  (admin email). Promote users evaluation→production there (evaluation sync stops
  after ~30 active sync-days). CLI `authorize`/`clients` are for API admins.
- **Free tier:** 3 production users, 100 MB, 10 DBs, 10 connections, 20 req/s.
- **Windows:** call the CLI as `npx.cmd dexie-cloud …` (bare `npx` hits the
  PowerShell execution-policy block), or `Set-ExecutionPolicy -Scope Process
  -ExecutionPolicy Bypass` for the session.

Do NOT invent new feature milestones unless asked.
