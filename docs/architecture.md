# Garage Log architecture (moved from CLAUDE.md)

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
  `matchesExistingVehicle`; creates the vehicle + its trait schedule in one
  transaction, applying the "Add a car" step-2 review edits and an optional
  current-miles reading). Review edits are pure in `domain/scheduleReview.ts`:
  off = `not-needed` override, last done = `already-replaced` override,
  interval = `customInterval*` (only when it differs from suggested). UI:
  `components/ScheduleReview.tsx`.
- **`src/db/traitChange.ts`** — `changeVehicleTraits()`: re-keys a car's rules
  to new trait answers ("Maintenance type" sheet on the car page,
  `components/TraitChangeSheet.tsx`). Kept rules keep settings, removed rules
  are deleted (events stay), added rules take last done from events. All rules
  must share one `templateKey` (seed.ts reconciles one key per car). Pure diff +
  "Not sure" read-back in `domain/traitChange.ts`. Hidden for the hand-built
  F-150/Rogue keys. Trait chips shared via `components/TraitPickers.tsx`.
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
  no key). "Add a car" manual pickers: `catalogBundle.ts` reads
  `public/catalog/<make>.json`, built at deploy time by
  `scripts/build-vehicle-catalog.mjs` (`npm run catalog`) from the EPA's full
  vehicle CSV, so models and trims fill instantly and offline (service worker
  runtime cache). Gitignored; absent in local dev unless you run the script.
  The live lookups fill gaps: `vehicleCatalog.ts` (NHTSA models; merges in
  models EPA doesn't rate, e.g. heavy-duty pickups) and `trimCatalog.ts`
  (EPA menus, used only when a year isn't bundled). The onboarding
  "reference data" adapters that used to live here
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

