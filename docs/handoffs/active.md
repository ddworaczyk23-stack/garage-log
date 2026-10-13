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

- **Mobile redesign, rounds 2-4.** Plan: `docs/superpowers/plans/2026-10-13-mobile-redesign.md`
  (from the 2026-10-13 design review, `.impeccable/critique/2026-10-13T19-44-04Z__src.md`).
  Round 1 quick wins = PR #7. Next: Phase 1 (setup asks for last oil change).
  One PR per phase off `main`; verify at 375px.

- **Verify calendar export on a real iPhone.** "Add reminders to Calendar"
  downloads `car-maintenance.ics`; expected flow is open file → "Add All".
  Untested on iOS (cloud env has Chromium only). If iOS duplicates events on
  re-import, consider switching the per-day UID scheme in `domain/calendar.ts`.
- **Possible follow-up (not started, user chose calendar for now):** true
  push + email reminders need a server (e.g. Cloudflare Worker cron + Web Push
  for home-screen PWAs on iOS 16.4+, Resend for email). Means due dates leave
  the device, so confirm with the user before building.
