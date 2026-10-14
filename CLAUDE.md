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
    This is the last REAL reading. `getProjectedMileage()` (summary.ts) rolls it
    forward to today at the effective mi/yr (custom > history > 12k default)
    and is what reminders, the odometer gauge and the dashboard use. Form
    defaults and cost-per-mile stay on the real reading.
- **`src/db/documents.ts`** — the SINGLE attachment write path. `prepareDocument`
  re-encodes large raster images to downscaled JPEG via canvas, best-effort (any
  failure, or <10% smaller, stores the original). `attachEventDocument` /
  `attachVehicleDocument` / `deleteDocument` / `getVehicleLevelDocuments` /
  `buildDocumentIndex()` (joins docs×vehicles×events, reactive) /
  `reassignDocument` (moves ONLY attachment pointers — no reminder recompute) /
  `setDocumentTags`.
- **`src/db/summary.ts`** — `getProjectedMileage()`, `getVehicleReminders()` (the ONE shared
  rules+events+mileage → `computeVehicleReminders` composition; don't re-duplicate
  this query shape), `getGarageSummary()` (per-vehicle `VehicleSummary` + capped
  `AttentionItem[]` feed), `getGarageCostSummary()`. Reads every table inside the
  caller's liveQuery so the dashboard recomputes on any write.
- **`src/db/milestones.ts`** — milestone checkup writes (check item, notes,
  complete, skip, reopen) + `getMilestoneContext()`. Progress lives on
  `Vehicle.milestones` (non-indexed, no schema bump, syncs/backs up with the
  vehicle). **Deliberately independent of reminder rules** — never touches them.
- **`src/db/vehicleOnboarding.ts`** — `addVehicle()` (dedup-checked via
  `matchesExistingVehicle`; creates the vehicle + its generic maintenance
  schedule in one transaction).
- **`src/domain/`** — PURE logic, all unit-tested:
  - `reminderEngine.ts` — `computeReminder(rule, inputs)` + `computeVehicleReminders`.
  - `reminderStatus.ts` — `resolveInterval(rule)`, `resolveLastDone()`.
  - `vehicleRanking.ts` — lexicographic `compareVehicleUrgency` + `vehicleBadges`.
  - `milestones.ts` — 30k/60k/90k/100k/120k/150k (+every 30k) checklists,
    tailored by `componentProfile()` (turbo/4WD/CVT/etc. inferred from engine,
    drivetrain and the vehicle's schedule categories). General guidance only.
  - `serviceHistory.ts` — per-service history/stats for `#/service/<id>`.
  - `calendar.ts` — .ics export for "Add reminders to Calendar"
    (`components/CalendarExport.tsx`, on Dashboard + schedule card). No server:
    the phone's Calendar delivers the alerts (one alert, 9am on the due day). One
    event per car per day; never-logged items excluded; 12-month horizon.
    Verified on iPhone 2026-10-13 (open the .ics, tap "Add All").
  - `documents.ts`, `cost.ts`, `backup.ts`, `format.ts`, `vehicle.ts`,
    `vehicleIdentity.ts`, `importHistory.ts`, `practicalTiming.ts`.
- **`src/db/calendarFeed.ts`** — live calendar feed. Uploads the .ics to the
  Worker in `worker/calendar-feed/` (Cloudflare Worker + D1, stores bytes
  only) so Apple/Google Calendar subscribe and get date changes by themselves.
  Off unless `VITE_CALENDAR_FEED_URL` is set at build time. Credentials in
  `appMeta['calendarFeed']` (local, device-only: never exported, and a restore
  keeps the device's copy). Pushes on start, after data writes (5 s debounce),
  and on return to foreground; skips if items unchanged. Push/enable/disable
  run one at a time. Subscribed calendars drop alerts by default (iOS "Remove
  Alerts", Google ignores VALARM), so the sheet tells the user how to keep them.
  Verified on iPhone 2026-10-14 (Apple subscription updated by itself after a
  logged service).
  `db/calendarExport.ts` (`collectCalendarItems`) is the one item source for
  the download, the text copy and the feed. Worker live at
  `https://coast-calendar-feed.calendar-feed.workers.dev`; redeploy from
  `worker/calendar-feed/` with `npx wrangler deploy` (David's Cloudflare login).
- **`src/services/`** — `vinDecode.ts` (REAL NHTSA vPIC `decodevinvalues` call,
  no key). The onboarding "reference data" adapters that used to live here
  (`maintenanceProvider.ts`, mock-only) were removed — see git history.
- **`src/components/`** — `EventForm` (shared maintenance+repair, add+edit via
  `kind`/`existing`; owns attachment picker + next-due override), `OdometerForm`,
  `EventListItem`/`OdometerListItem`, `DocumentGrid`, `DocumentPreviewModal`,
  `VehicleDocuments` (Glovebox), `NicknameEditor`, `ui.tsx`
  (`Loading`, `EmptyState`, `ConfirmButton`, `ErrorBoundary`).
- **`src/app.tsx`** — shell + a tiny **hash router** (`#/`, `#/vehicles`,
  `#/vehicle/<id>`, `#/service/<vehicleId:category>`,
  `#/milestone/<vehicleId>/<miles>`, `#/documents`, `#/costs`, `#/settings`, `#/backup`, `#/add-vehicle`,
  `#/import/<id>`, `#/debug`, `#/template`, `#/reminders-debug`). Hash routing is
  deliberate — deep-links on static hosts with no 404-rewrite, survives
  `base: './'`. Don't swap in a History-API router without a Pages fallback.
- **`src/pages/`** — `Dashboard`, `Vehicles`, `VehicleDetail` (main CRUD hub),
  `Documents`, `Costs`, `Settings` (sync account + link to Backup; the bottom-nav tab), `Backup`, `AddVehicle`, `ImportHistory`, `Debug`,
  `TemplateAdmin`, `ReminderDebug` (read-only inspection — don't re-add input
  forms, it'd duplicate `EventForm`/`OdometerForm`).
- **`vite.config.ts`** — `base: './'` (domain root AND `/garage-log/` subpath).
  PWA manifest + SW here; `registerType: 'autoUpdate'`, SW enabled in dev.

## Engine constants & invariants (don't drift these)

- **Thresholds** (`reminderEngine.ts`): `DUE_LEAD_MILES/DAYS` = 500mi/30d (inner
  "due-next"), `WATCH_LEAD_MILES/DAYS` = 1500mi/90d (outer "watch-next"). Hybrid
  rules take whichever axis is more urgent. `STALE_ODOMETER_DAYS` = 90 (age of
  the last REAL reading; a gentle "confirm mileage" nudge).
  `DEFAULT_ANNUAL_MILEAGE` = 12000 (only for ranking mileage- vs date-based items).
- **Red is for safety only** (`itemBand()` / `SAFETY_CATEGORIES` in
  `verdict.ts`): an overdue brake, tire-replacement/inspection or timing-belt
  item is red "fix now"; any other overdue item is amber "book soon". Use
  `itemBand(r)`, not `bandFromStatus(r.status)`, for anything shown (user
  decision 2026-10-13).
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
- **Never-logged items are "Unknown"** (`knownReminders()` in `verdict.ts`):
  their engine status is a factory projection, so they never count toward the
  verdict, health, counts, ranking or attention feed, and the UI shows a gray
  "Unknown" pill with no date. A car with no history at all is "Not set up"
  (rows show "Estimated"). All-clear with untracked items reads "All clear on
  what's logged", never "Just drive".

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
  `undefined`, tree-shaking out the Settings sync card).
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

## Working with Codex

This repo is worked on with both Claude Code and Codex. `AGENTS.md` is
Codex's entry point (thin pointer to this file, not a duplicate).
`docs/handoffs/active.md` is shared state — current task, done/next.
**Before starting any task, read `docs/handoffs/active.md` first** — update
it when you finish instead of leaving progress only in chat.

## Next up

Design work is paused (decided 2026-10-14). The mobile redesign is done
(PRs #38-#47). David uses the app with real data for a few weeks; the next
round of fixes should come from that use, not from more design review.

Do NOT invent new feature milestones unless asked.
