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

## Architecture — full file-by-file notes in `docs/architecture.md`

Read that file before changing `src/db/**` or `src/domain/**`. Rules that bite:

- Dexie schema is at **version 6**. Change it only by adding a new
  `.version(n).stores()` block, never by editing an old one. Non-indexed fields
  need no bump. `orderBy(field)` requires `field` to be indexed.
- `src/db/events.ts` is the only place real-history writes happen.
  `updateEvent`/`deleteEvent` recompute a rule's last-done from ALL matching
  events (can regress it). `recordCompletedEvent` adopts only if newer.
- `src/db/documents.ts` is the single attachment write path.
- `getVehicleReminders()` in `src/db/summary.ts` is the one shared reminder
  query. Do not duplicate it.
- Vehicle ids are `veh-<uuid>` (unique for Dexie Cloud). `seedIfEmpty` only
  reconciles rules additively; it never overwrites user edits.
- Hash router is deliberate (static hosting, `base: './'`). No History-API
  router without a Pages fallback.
- `ReminderDebug` is read-only. Do not add input forms to it.
- `src/domain/` is pure logic and unit-tested. Keep it free of DB calls.
- One card shape app-wide: `.card.box` + `.box-head` (title, one muted
  `.box-key` fact, optional right link) + `.box-body`, and `.box-row` for
  list rows (`src/styles/app.css`). Reuse them; don't add per-page heads.


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
  (rows show "Estimated"). All-clear with untracked items reads "You can coast
  on what's logged", never a plain "Nothing due".
- **All-clear shows as "Can coast"** (user decision 2026-10-20): same blue,
  same label, one ruler zone. The `all-clear` band still exists in code (saved
  concerns, backups, health score); only the screen merges it.

## Deployment

Live at **https://ddworaczyk23-stack.github.io/garage-log/** via
`.github/workflows/deploy.yml` (GitHub Actions builds Vite + publishes `dist/`
on every push to `main`; Pages Source = "GitHub Actions"). Hash routing + HTTPS
so it installs to a phone home screen. The workflow also runs `npm run catalog`
(EPA vehicle data for Add a car's pickers, `continue-on-error`): its step goes
green even when it fails, so check the log for the `catalog: N makes` line. **Pushing to main auto-deploys — don't
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
