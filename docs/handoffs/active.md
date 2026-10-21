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

- **App Store + Google Play launch, free (decided 2026-10-20, not started).**
  David picked "ship free on both stores" over a paid product. Paid is parked
  until free users show demand (multi-car sharing or small-fleet asks). Start
  Steps 1-2 are done on branch `feat/capacitor-wrap` (Capacitor 8.5.3,
  `android/` + `ios/` added, `capacitor.config.json`). `npm run build:app` =
  `vite build --mode capacitor && cap sync`. That mode drops VitePWA (no
  service worker: iOS WKWebView won't run one on `capacitor://`) and forces
  `VITE_DEXIE_CLOUD_URL` undefined, so the store build is local-only. This
  avoids Apple's account-deletion rule and Dexie Cloud's 3-user cap; the web
  build is unchanged and keeps sync. Not yet run on a device: this Windows
  machine has no Android SDK (install Android Studio), and iOS needs the Mac
  (Xcode, Swift Package Manager). Run `npm run catalog` before `build:app`,
  or Add a car falls back to the live NHTSA lookup.
  Open decision: `appId` is `com.ddworaczyk.coast`. It is permanent once
  uploaded to a store, so confirm it before step 6.
  Remaining, in order:
  3. **Local reminders** via `@capacitor/local-notifications`, scheduled from
     `getVehicleReminders()` (`src/db/summary.ts`) for date-based items only;
     reschedule after every event write. This is the "real phone feature"
     that keeps Apple guideline 4.2 (web-wrapper rejection) away. Replaces the
     server push idea below for native users.
  4. **Fix web-only APIs inside the webview:** backup export (file download
     doesn't work in a webview; use `@capacitor/share` or filesystem), the
     calendar feed button, and document/photo attachments. Test each. The
     calendar feed sends due dates to the Worker, which conflicts with the
     "no data leaves the device" privacy claim. Hide it in `--mode capacitor`
     or name it in the privacy policy.
  5. **Store paperwork:** privacy policy page on GitHub Pages ("no data
     leaves the device"), Play data-safety form = no data collected, icons and
     screenshots, Apple Developer ($99/yr, build on the Mac with Xcode) and
     Play Console ($25 once).
  6. **Release:** cut `release/1.0.0` off `main`, build both stores from it,
     tag `v1.0.0`. Android internal test track and iOS TestFlight first.
  Done = both apps live in the stores, reminders fire on a real phone,
  backup round-trips. Building is Codex work per the role split.

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
