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

- **Check flow fixes + fuller Settings — ready for Claude review.** Plan:
  `docs/superpowers/plans/2026-10-14-check-flow-and-settings.md` (from the
  2026-10-14 design review, 27/40). Implemented on `fix/check-flow`: Check
  only uses logged services, its Back control is in the navy header and obeys
  browser back, verdict actions are reordered, and Settings now exposes backup,
  sync, and build status. `npm test` (403) and `npm run typecheck` pass; the
  seeded 375px/390px Check walkthrough and 375px sync-card layout were checked.
  Claude should review the one PR and re-run the design review. Do not merge.

- **Possible follow-up (not started, user chose calendar for now):** true
  push + email reminders need a server (e.g. Cloudflare Worker cron + Web Push
  for home-screen PWAs on iOS 16.4+, Resend for email). Means due dates leave
  the device, so confirm with the user before building.
