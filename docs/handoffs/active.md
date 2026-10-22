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

- **Checkup redesign: confirm on real data (2026-10-22).** Branch
  `feat/checkup-log-to-schedule`: each checkup item has "Checked, OK" and
  "Log service", with Safety/Important labels listed first. "Checked, OK" on
  brakes/tires/battery logs that inspection. Old ticks show as "Checked, OK".
  David should open his truck's 100k checkup and tap "Log service" on the
  work that was really done. If the schedule updates, delete this entry.

- **App Store + Google Play launch, free (decided 2026-10-20).**
  David picked "ship free on both stores" over a paid product. Paid is parked
  until free users show demand (multi-car sharing or small-fleet asks).
  Steps 1-4 are built (PRs #90, #91, and `feat/native-files`):
  - `npm run build:app` = `vite build --mode capacitor && cap sync` (Capacitor
    8, `android/` + `ios/`, `capacitor.config.json`). That mode drops the
    service worker (iOS WKWebView won't run one on `capacitor://`) and forces
    `VITE_DEXIE_CLOUD_URL` and `VITE_CALENDAR_FEED_URL` undefined: the store
    build keeps all data on the phone (no Apple account-deletion rule, no
    Dexie Cloud user cap). The web build is unchanged and keeps both.
  - Phone reminders: `src/db/localReminders.ts` turns `collectCalendarItems`
    into 9am alerts (`localAlerts()` in `domain/calendar.ts`, max 60 for
    iOS's 64-pending limit), rescheduled on data change and on foreground.
  - Files: `src/components/saveFile.ts` writes to the app cache and opens
    the native share sheet (backup, .ics export, document open/thumbnails via
    `openInApp`). The shop brief's Print button is hidden in the app.
  - All of it loads only under `--mode capacitor`; the web bundle has none.
  Not yet run on a real phone. This PC has no Android SDK (install Android
  Studio); iOS needs the Mac (Xcode). On first device run, check: alerts fire
  and a tap opens the right page; backup saves via the share sheet and
  restores; .ics export; opening a photo and a PDF (Android WebView can't
  show the PDF iframe preview, so Open is the path there); file pickers for
  attachments. Run `npm run catalog` before `build:app`, or Add a car falls
  back to the live NHTSA lookup.
  Open decision: `appId` is `com.ddworaczyk.coast`, permanent once uploaded.
  Confirm before step 6.
  Remaining:
  5. **Store paperwork:** privacy policy page on GitHub Pages ("no data
     leaves the device"), Play data-safety form = no data collected, app icon
     and splash for both platforms, screenshots, Apple Developer ($99/yr) and
     Play Console ($25 once).
  6. **Release:** cut `release/1.0.0` off `main`, build both stores from it,
     tag `v1.0.0`. Android internal test track and iOS TestFlight first.
  Done = both apps live in the stores, reminders fire on a real phone,
  backup round-trips.

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
