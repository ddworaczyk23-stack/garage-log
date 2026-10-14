# Calendar options: live feed + copy as text

Date: 2026-10-14. Status: planned, not started.

## Goal

Give the "Add reminders to Calendar" button more ways out:

1. **Apple Calendar — subscribe** (auto-updates)
2. **Google Calendar — subscribe** to the same feed (auto-updates, slower)
3. **Download file** (today's .ics, one-time snapshot, kept as fallback)
4. **Copy / share as text** (plain list for Notes, Messages)

When due dates change (service logged, mileage moves the projection), events
already on the phone must update by themselves. That is the "update past
events" ask.

## Decisions (David, 2026-10-14)

- Apple: **subscription feed** (needs a small server), not re-adding the file.
- Google: **same feed** as Apple. No Google Cloud project, no Google sign-in.
  Accepted cost: Google refreshes subscribed calendars only every ~12-24h.
- Text: **copy/share as text**, not SMS. No server for this part.
- Reminders app (via Apple Shortcut): **later**, not in this plan.
- Accepted: the feed means due dates leave the device (see Privacy).

## Why a feed solves "update"

A subscribed calendar is read-only on the phone. On every refresh the phone
re-downloads the whole file and replaces the old events. So moved dates move,
finished items disappear, new ones appear. We do NOT need stable per-rule UIDs
for this; the current per-car-per-day grouping in `domain/calendar.ts` stays.
`buildCalendar()` is reused unchanged for the feed body.

## Architecture

```
app (phone)  --PUT .ics-->  Cloudflare Worker + KV  <--GET .ics--  Apple / Google Calendar
```

- The app builds the .ics on the device (as today) and uploads it.
- The Worker only stores and serves bytes. It never sees the database, never
  holds the Dexie Cloud key, and does no maintenance logic.
- Free tier is enough: KV allows 1,000 writes/day; we write only when the
  file content changes.

### Worker (`worker/calendar-feed/`, its own `wrangler.toml`)

- `PUT /feed/<feedId>` — body = .ics text (max 100 KB), header
  `Authorization: Bearer <writeKey>`. First PUT claims the feedId and stores
  `sha256(writeKey)`. Later PUTs must match. Stores `{ keyHash, ics, updated }`.
- `GET /feed/<feedId>.ics` — returns the .ics with
  `Content-Type: text/calendar; charset=utf-8`. 404 if unknown.
- `DELETE /feed/<feedId>` (same auth) — "Stop sharing".
- CORS: allow only `https://ddworaczyk23-stack.github.io` and
  `http://localhost:5173` for PUT/DELETE. GET is open (calendar apps fetch it).
- `feedId` and `writeKey`: 32 random bytes each, base64url, made on the device
  with `crypto.getRandomValues`.

### App

- **Config:** `VITE_CALENDAR_FEED_URL` at build time (same pattern as
  `VITE_DEXIE_CLOUD_URL`). Not set → the subscribe options are hidden and the
  app works as today. Add to `.env.example`, `.env.local`, and the deploy
  workflow (repository secret).
- **Feed state:** `{ feedId, writeKey, lastHash }` in `appMeta` (local-only,
  never synced, not in backup). One feed per device. That is fine: the phone
  is the device that subscribes and opens the app.
- **New `src/db/calendarFeed.ts`:** `enableFeed()`, `pushFeed()`,
  `disableFeed()`. `pushFeed()` reuses `collectItems()` (move it out of
  `CalendarExport.tsx` so both use it), builds the .ics, hashes it, and PUTs
  only if the hash changed.
- **When to push:** on app start, and after writes (subscribe to a
  `liveQuery` over the same tables, debounce ~5 s). Projected dates move
  every day, so the push on app start matters most. Failures are silent and
  retried next time; show "Last updated <date>" in the sheet.
- **Pure text builder:** `calendarText(items)` in `domain/calendar.ts`
  (unit-tested), e.g. `Oct 30 - F-150: Oil change (est.)`, one line per item,
  grouped by car. Share with `navigator.share({ text })`; fallback to
  `navigator.clipboard.writeText` and a "Copied" status.

### UI (`CalendarExport.tsx`)

The button opens a small sheet with:

- **Apple Calendar** → enables the feed if needed, then opens
  `webcal://<host>/feed/<feedId>.ics`. iPhone shows "Subscribe".
  Tip: Settings > Calendar > Accounts > Subscribed > set "Fetch" to hourly.
- **Google Calendar** → copies the `https://` feed link and opens
  `https://calendar.google.com/calendar/r/settings/addbyurl`. Tip: paste the
  link; updates take up to a day. (Google's phone app can't add by URL; this
  step is one time in a browser.)
- **Download file** → today's behavior, labeled "One-time copy, won't update".
- **Copy as text**.
- When the feed is on: "Live feed on · updated <date>" and a **Stop sharing**
  button (`disableFeed()` → DELETE, clear `appMeta`). Tell the user to also
  remove the subscription from their calendar.

Keep copy short (see `2026-10-14-fewer-words.md`). Two fonts only.

## Privacy

What leaves the device: car nickname, service names, due dates, app links.
No VIN, no costs, no notes, no mileage history. Anyone with the feed link can
read it; the link is a 256-bit random secret. Say this in one line in the
sheet before the first subscribe.

## Phases

1. **Text + sheet (no server).** Move `collectItems()` out, add
   `calendarText()` + tests, build the sheet with Download + Copy as text.
   Shippable alone.
2. **Worker.** Write the Worker + a small test (vitest with Miniflare or plain
   fetch handler unit tests). David creates a free Cloudflare account and runs
   `npx wrangler login`; then deploy with `npx wrangler deploy`.
3. **Feed in the app.** `calendarFeed.ts`, push triggers, Apple + Google
   options, Stop sharing, env var + workflow secret.
4. **Real-device check.** Subscribe on David's iPhone and in Google Calendar.
   Log a service, open the app, confirm the event moves (Apple: after the
   fetch interval; Google: within a day).

## What David must do

- Phase 2: make a free Cloudflare account, run `npx wrangler login` once.
- Phase 3: add repository secret `VITE_CALENDAR_FEED_URL` in GitHub.
- Phase 4: subscribe on the iPhone and in Google Calendar, then test.

## Out of scope

- Reminders app via Apple Shortcut (later).
- SMS / push / email at due time (see handoff "Possible follow-up").
- Google Calendar API sign-in (rejected: setup + hourly re-auth).
