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
  - Phase 1 merged (PR #32). Phases 2-3 + review fixes: PR #33 (base
    `main`), waiting on David's merge. Repo secret `VITE_CALENDAR_FEED_URL`
    is set.
  - **Worker live:** `https://coast-calendar-feed.calendar-feed.workers.dev`,
    storage D1 `coast-calendar-feed` (exact 60 writes/IP/hour cap). The old
    KV namespace `FEEDS` (c3100bd2…) is unused; delete only with David's OK.
  - **Next:** after #33 merges and deploys, Phase 4: subscribe on David's
    iPhone (turn off Remove Alerts) + Google Calendar, log a service, confirm
    the event moves.

- **Possible follow-up (not started, user chose calendar for now):** true
  push + email reminders need a server (e.g. Cloudflare Worker cron + Web Push
  for home-screen PWAs on iOS 16.4+, Resend for email). Means due dates leave
  the device, so confirm with the user before building.
