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

- **Fewer words on every page — ready for Claude review.** Plan:
  `docs/superpowers/plans/2026-10-14-fewer-words.md`. Implemented on
  `copy/fewer-words`: removed redundant dashboard, vehicle, cost, document,
  backup, and add-car copy (including the Home side-by-side table), and fixed
  signed-out Settings showing sync status. `npm test` (403) and
  `npm run typecheck` pass; seeded 375px/390px layouts and the restored-config
  signed-out Settings card were checked. One PR only; do not merge. Claude
  reviews.

- **Next: re-run the design review** (`/impeccable critique src`) on the
  live site after PR #22 (Check flow + fuller Settings). Last score 27/40.

- **Possible follow-up (not started, user chose calendar for now):** true
  push + email reminders need a server (e.g. Cloudflare Worker cron + Web Push
  for home-screen PWAs on iOS 16.4+, Resend for email). Means due dates leave
  the device, so confirm with the user before building.
