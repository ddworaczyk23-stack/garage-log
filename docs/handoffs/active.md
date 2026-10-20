# Active Handoff

Shared state between Claude Code and Codex on this repo. Read this before
starting work; update it when you finish.

**Hard rule: this file holds OPEN work only.** The moment a task is
confirmed done (live-verified, deployed, or explicitly dropped), delete its
entry — don't leave a "RESOLVED"/"DONE" paragraph sitting here. Before
deleting, fold anything future-you would need into the right place: a durable
rule goes in `CLAUDE.md`, and the story goes in git history / a changelog if
this project keeps one. This file is not the permanent record. Prune
aggressively, every time.

## Open

- **Home "answer boxes" layout — READY FOR CODEX (2026-10-20).** Branch
  `feat/home-answer-boxes` (off main). Approved look:
  `design/home-answer-boxes.html` (open it in a browser; sample numbers).
  David picked this Monarch-style direction; a polish pass across the rest of
  the app ("B") comes after, not in this task. Presentation + two pure
  helpers only: no schema change, no engine/ranking change, no new deps.
  1. `src/domain/cost.ts`: add pure `spendByMonth(events, year): number[]`
     (length 12, sum of `cost` for events whose `date` starts `${year}-MM`).
  2. `src/db/summary.ts`: add `spendByMonth: number[]` to `VehicleSummary`,
     computed from the same `events` the `spendThisYear` line already uses
     (same `year`). Its sum must equal `spendThisYear`.
  3. `src/domain/verdict.ts` (next to `comingUp`): add pure
     `recentWork(vehicles: {vehicleId, vehicleName, events: MaintenanceEvent[]}[], max = 3)`
     -> newest-first `{vehicleId, vehicleName, title, cost, date}[]`. Feed it
     each summary's `recentServices` + `recentRepairs`. Tie on date: keep
     input order (stable sort).
  4. `src/pages/Dashboard.tsx`: keep `PageHeader` + `GarageLine` +
     `QuickActions` and the `TodayCard`s as they are. Below the cars, one
     `.hm-grid` with three boxes, all sharing one header shape
     `<div class="hm-box-head"><h3>Title</h3><span class="hm-box-key">key fact</span>[optional right link]</div>`:
     - **Coming up** (replaces `.hm-next`): key = `N coming up`. Rows: dot,
       label, car tag pill (`vehicleName`), `window` right-aligned, chevron;
       row links to the car. Keep `comingUp()` as is (watch-next only; the
       car cards already show overdue/due). Move the existing
       `<CalendarExport />` card into this box's footer (only when
       `hasHistory`, same as now). Hide the box if the list is empty.
     - **Spent** (replaces the Costs list-row): key = `$X in <year>`; right
       link "All costs" -> `#/costs`. 12 month bars Jan..current month only,
       stacked per car (car 1 `var(--accent)`, car 2 a lighter blue; 3+ cars
       cycle a short list), plain divs + inline height %, no chart library.
       Legend under it: swatch + car name + that car's `spendThisYear`.
       Bars need an `aria-label` per month ("Mar: $412"). If the year total
       is 0, show the box with "No costs logged in <year> yet." and no bars.
     - **Recent service** (new): key = `Last: <formatShortDate(date)>`. Rows
       from `recentWork()`: green dot, title, car tag, cost (mono) with date
       under it, chevron; row links to the car. Hide if empty.
  5. `src/styles/app.css`: new `.hm-grid`, `.hm-box-head`, `.hm-box-key`,
     `.hm-row`, `.hm-tag`, `.hm-bars` rules (copy values from the mockup).
     Mobile: one column. >=1024px: 2 columns, Coming up | Spent, Recent
     service spans both. Delete the now-unused `.hm-next*` rules. Use
     existing tokens only (`--text-muted`, `--border`, `--bg-inset`,
     `--font-mono`, signal colors). Keep text at full contrast: no small
     grey all-caps labels.
  6. Tests: `tests/` cases for `spendByMonth` (year filter, month bucket,
     sum = spendThisYear) and `recentWork` (order, max, two cars mixed).
  Done = `npm test` + `npm run typecheck` + `npm run build` clean, and Home
  checked at 1440px and 375px with 2 cars (no horizontal scroll, boxes match
  the mockup). Verify on the local-only DB (no `.env.local`), never the cloud
  DB. Don't push or merge; leave the branch for Claude/David to review.

- **Add a car: instant model/trim pickers (2026-10-20).** Shipped in PRs
  #63, #67, #68 (all merged, deployed). The deploy bundles EPA data per make
  (`npm run catalog` -> `public/catalog/`, 145 makes / 2.8 MB in the
  2026-10-20 deploy log); NHTSA/EPA live calls only fill gaps. David
  confirmed the Ford model list now loads instantly. Model names switch to
  NHTSA's spelling ("F150" -> "F-150") a few seconds later when its list
  lands; a picked model is respelled in place. Still unconfirmed on the live
  site: (1) picking a Ford trim fills engine/drive, (2) 2020 Nissan -> Rogue
  lists instantly without Rogue Sport mixed in, (3) the live trim fallback
  (only for years EPA hasn't published) works against the real EPA service.
  Ask David to try (1) and (2); if both hold, delete this entry.

- **Calendar feed: confirm Google (2026-10-15).** Everything else shipped
  (PRs #32, #33) and was verified on David's iPhone 2026-10-14: logging a
  brake inspection moved the Apple Calendar event by itself. David added the
  feed to Google Calendar by URL on 2026-10-14; Google refreshes about once a
  day. Ask him whether the truck's brake inspection shows May 27, 2027 there.
  If yes, delete this entry. If not, check the feed was added as "From URL"
  (not imported) and that the calendar is turned on in the Google app.

- **Possible follow-up (not started, user chose calendar for now):** true
  push + email reminders need a server (e.g. Cloudflare Worker cron + Web Push
  for home-screen PWAs on iOS 16.4+, Resend for email). Means due dates leave
  the device, so confirm with the user before building.
