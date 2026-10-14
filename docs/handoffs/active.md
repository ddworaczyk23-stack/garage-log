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

- **Calendar options (2026-10-14):** plan
  `docs/superpowers/plans/2026-10-14-calendar-feed.md`.
  - Phase 1 (sheet + copy as text): PR #32, branch `feat/calendar-text`.
    Claude fixed iOS share (items load on sheet open) and checked the sheet
    with test data on Dashboard + VehicleDetail.
  - Phases 2-3 (Worker + live feed in app): built on `feat/calendar-feed`
    (stacked on `feat/calendar-text`). 415 tests green; round trip checked
    against a local copy of the Worker (logging a service moved the feed date).
  - **Blocked on David:** Cloudflare account + `npx wrangler login`. Then in
    `worker/calendar-feed/`: `npx wrangler kv namespace create FEEDS`, paste
    the id into `wrangler.toml`, `npx wrangler deploy`. Then add repo secret
    `VITE_CALENDAR_FEED_URL` = the workers.dev URL. Then Phase 4 (iPhone +
    Google subscribe test).

- **Possible follow-up (not started, user chose calendar for now):** true
  push + email reminders need a server (e.g. Cloudflare Worker cron + Web Push
  for home-screen PWAs on iOS 16.4+, Resend for email). Means due dates leave
  the device, so confirm with the user before building.
