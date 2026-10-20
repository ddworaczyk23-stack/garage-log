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

- **Polish pass "B" — READY FOR CODEX (2026-10-20).** Bring the Home
  answer-box look (PR #72, live) to the other pages: one box header shape,
  one row shape, no faint tiny labels. Presentation only: no logic, data,
  routing or schema change. Do it as 3 short branches off `main`, one PR
  each, in this order. Each = `npm test` + `npm run typecheck` + `npm run
  build` clean, then check the touched pages at 1440px and 375px on the
  local-only DB (no `.env.local`). Don't push or merge; leave for review.
  Out of scope (leave alone): navy title bands and their eyebrows, the
  Check flow, ShopBrief, AddVehicle, forms/sheets, the schedule ledger rows
  (`.vd-row`), the verdict sign + ruler, and the debug pages
  (Debug/ReminderDebug/TemplateAdmin).
  1. **`polish/b1-labels`: DONE, merged (PR #76).** Check flow and
     ShopBrief labels stayed caps on purpose (out of scope).
  2. **`polish/b2-box-heads` — one header shape.** Rename Home's
     `.hm-box-head` / `.hm-box-key` / `.hm-box` / `.hm-row` / `.hm-tag` /
     `.hm-row-title` / `.hm-row-value` / `.hm-box-footer` to shared names
     `.box-head` / `.box-key` / `.box` / `.box-row` / `.box-tag` /
     `.box-row-title` / `.box-row-value` / `.box-footer` (CSS +
     `src/pages/Dashboard.tsx`; move the rules out of the `hm-` block to sit
     after `.card`). Then use `.box` + `.box-head` (title + one muted key fact
     + optional right link) on these cards, keeping their existing content:
     - `src/pages/VehicleDetail.tsx`: "Next N jobs" (key: none), "Service
       schedule" (key: "N due" when any are overdue/due-next, else nothing;
       Import history link goes in the head's right slot; keep the InfoTip
       after the title), "History & documents" (key: total entries).
     - `src/components/MilestoneCard.tsx`: "Milestone checkups" (key: next
       milestone name, e.g. "Next: 120k").
     - `src/pages/Costs.tsx`: each per-vehicle card head (`.vehicle-card-head`
       -> `.box-head`, key = that car's total for the selected year).
     - `src/pages/Backup.tsx`: "Export" (key: last backup date or "No backup
       yet"), "Restore".
     - `src/pages/ServiceDetail.tsx`: "History" (key: N times logged).
     - `src/pages/Settings.tsx`: "Sync" and "Vehicles" cards.
     Body content inside each card keeps its own padding: wrap the old body in
     a `<div class="box-body">` with `padding: 16px 20px` rather than
     restyling the content. Collapsibles inside a box keep working as now.
     **B2 built** on `polish/b2-box-heads` (Codex), reviewed + checked live
     at 1440/375 by Claude. Review fixes: `.card.box` (plain `.box` lost to
     the desktop `.card` padding, which also hit Home since PR #72); Backup
     date goes through `localDateISO` (it read the UTC day). Start B3 from
     `main` after B2 merges.
  3. **`polish/b3-rows` — one row shape.** Where a list shows logged items,
     use `.box-row` (dot or icon, title, optional `.box-tag`, right-aligned
     `.box-row-value` with a small muted line under it, chevron when the row
     links somewhere): Maintenance log + Repair log entries in
     VehicleDetail, `MileageHistory` + `OdometerListItem` rows, Costs
     `.cost-row`, ServiceDetail History rows, the Settings Vehicles rows (no
     chevron; Delete stays on the right). Money and miles stay in
     `var(--font-mono)`, colour `var(--text)` (not blue). Remove the CSS of
     the old row classes once nothing uses them.
  Mockup for the look: `design/home-answer-boxes.html`.

- **Add a car: instant pickers (2026-10-20).** Shipped in PRs #63, #67,
  #68, #71, #75 (all merged, deployed). Model list comes from bundled EPA data
  (145 makes in the deploy log), with NHTSA names merged in a few seconds
  later ("F150" becomes "F-150", a picked model is respelled in place). Trim
  is a typed field (hint "As on the badge", no make-specific examples); EPA's engine/transmission/drive versions are a separate
  "Engine & drive" picker that fills the schedule questions. David confirmed
  on the live site: Ford models load instantly, and 2020 Nissan Rogue loads
  its versions. Still unconfirmed: (1) picking an Engine & drive version
  fills Engine and the questions, (2) the Rogue list has no Rogue Sport
  mixed in. Ask David to try both; if they hold, delete this entry. (The
  live trim fallback, for years EPA hasn't published yet, can only be
  exercised next model year.)

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
