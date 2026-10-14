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

- **Calendar options (planned 2026-10-14, not started):** live subscription
  feed for Apple + Google Calendar (Cloudflare Worker + KV), plus copy/share
  as text. Plan with decisions and 4 phases:
  `docs/superpowers/plans/2026-10-14-calendar-feed.md`. Phase 1 needs no
  server. Phase 2 needs David's Cloudflare login.
  - **Phase 1 implemented on `feat/calendar-text` (2026-10-14):**
    `collectCalendarItems()` is now reusable outside `CalendarExport`,
    `calendarText()` is pure and unit-tested, and the action opens a sheet
    with Download file (one-time copy) plus Copy as text (native share,
    clipboard fallback). `npm test` (405), `npm run typecheck`, and
    `npm run build` are green. The local preview had no vehicle/history, so
    its conditional Dashboard and VehicleDetail Calendar actions could not be
    visually opened without adding test records. Check the sheet against an
    existing vehicle with logged history before merging, then open the PR; do
    not merge. Next after Phase 1 is Phase 2 (Cloudflare Worker), which needs
    David's Cloudflare login.

- **Possible follow-up (not started, user chose calendar for now):** true
  push + email reminders need a server (e.g. Cloudflare Worker cron + Web Push
  for home-screen PWAs on iOS 16.4+, Resend for email). Means due dates leave
  the device, so confirm with the user before building.
