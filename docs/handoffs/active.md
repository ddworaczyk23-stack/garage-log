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

- **Change a car's traits after adding it: ready to build (2026-10-15).**
  Codex builds it. Plan approved by David: `docs/plans/change-traits.md`
  (read it in full; it is the spec). Branch `feat/change-traits` (plan
  committed, already rebased on `main` after the "Not sure" PR #56). Work in
  the folder `~/OS/active/garage-log-change-traits` (a git worktree).
  Summary: a "Maintenance type" row + "Change" link on the car page opens a
  sheet with the trait pickers and a live diff (added / removed / kept). Save
  updates all the car's rules in one transaction: kept rules keep their
  settings, removed rules are deleted (events stay), added rules take last done
  from matching events. Every rule ends on the same `templateKey`. Hidden for
  the F-150 and Rogue. Done = tests + typecheck + build pass, the plan's
  Verification steps pass at 375x812, committed on the branch. Do not push:
  David approves publishing. Claude reviews the PR after.
