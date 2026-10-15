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
