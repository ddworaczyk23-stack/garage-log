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

- **Home "answer boxes" layout (2026-10-20).** Built by Codex, reviewed and
  fixed by Claude on `feat/home-answer-boxes` (not merged). Checked live at
  1440px and 375px with 2 cars. Next: PR + merge on David's go. After that,
  "B": the same box header / row / contrast polish across the other pages.
  Mockup: `design/home-answer-boxes.html`.

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
