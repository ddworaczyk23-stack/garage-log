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

- **Car page: name headline + two-car toggle (2026-10-20) — ready for
  Codex — implementation complete, awaiting David's 1440px/375px review.** Since PR #64 the navy title band runs full width. The two car
  chips are the page title, so they sit small in the top-left with empty
  navy beside them, and the page has no big car name. David picked: the car
  name is the headline, and a small toggle sits on the right of the band.

  Build on a branch off `main` (`feat/vd-name-toggle`). No push, no merge.
  Files: `src/pages/VehicleDetail.tsx` (the `<PageHeader>` around line 276)
  and `src/styles/app.css` (`.vd-picker*` around line 5049). No new
  component; `PageHeader` already has a `meta` slot on the right of its row.

  1. `title` = `vehicleLabel(vehicle)` + the pencil button, always (drop the
     picker branches from `title`). The existing `.vd-masthead .page-title`
     34px / 28px-on-phone size stays.
  2. `meta` = the picker: the 2-car `<nav class="vd-picker">` or the 3+
     `<select class="vd-picker-menu">`, same markup and links as today.
     Nothing in `meta` for a 1-car garage.
  3. CSS: `.vd-masthead .page-header-row { align-items: center; }`. Restyle
     the in-band picker as one segmented track, not two loose chips: a
     single `1px var(--frame-line)` rounded track, `padding: 3px`, segments
     `padding: 6px 14px`, 14px/600, no gap. Active segment = filled
     `var(--on-frame)` with `color: var(--text)`; inactive = transparent,
     `var(--on-frame-muted)`, hover `var(--on-frame)`. Auto width
     (`flex: none`), `max-width: 340px`, labels ellipsis. Min tap height
     36px on desktop, 44px under 600px. Delete the now-dead
     `.page-title .vd-picker*` rules.
  4. Under 600px: `meta` wraps below the name (the row already has
     `flex-wrap: wrap`); make the toggle full width there (`flex: 1 1 100%`,
     segments `flex: 1`). The `.vd-spec` line stays under the row.

  Done when: at 1440px the name is big on the left and the toggle sits on
  the right, vertically centered on the name; at 375px the toggle is full
  width under the name with no horizontal scroll; switching cars still
  works; the pencil still opens the nickname editor; `npm run typecheck`,
  `npm test`, `npm run build` pass. Verify on the local-only DB (a worktree
  with no `.env.local`). Claude reviews and checks both widths before
  David approves.

  Codex completed the implementation locally on `feat/vd-name-toggle` (no
  push): the vehicle label and pencil are now always the headline; the
  existing two-car links / 3+-car select use `PageHeader`'s `meta` slot;
  the two-car control is a segmented track and becomes full-width below
  600px. `npm.cmd run typecheck`, `npm.cmd test` (502 passing), and
  `npm.cmd run build` passed. This workspace does have an `.env.local`, so
  the local-only DB check still needs a clean worktree. David should inspect
  at 1440px and 375px, verify the car switcher and nickname pencil, then
  approve or return feedback.

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
