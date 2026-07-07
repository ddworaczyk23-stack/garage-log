# Garage Log

A local-first Progressive Web App for tracking maintenance on the two household
vehicles:

- **2020 Ford F-150 STX** — 2.7L EcoBoost V6, 4WD
- **2020 Nissan Rogue SL** — 2.5L I4, AWD

All data lives in your browser (IndexedDB). Nothing is sent to a server. The app
installs to a phone home screen and works offline once loaded.

> **Milestone 1 (this build): scaffold only.** App shell, navigation, PWA
> install, the Dexie database with empty tables, and the two seed vehicles.
> Maintenance logging, the reminder engine, schedule templates, documents, and
> backup/export come in later milestones.

## Tech stack

Vite · TypeScript · Preact · Dexie.js (IndexedDB) · vite-plugin-pwa · plain CSS.

## Prerequisites

- **Node.js 18+** and npm. Check with `node -v`. If it prints a version you're set;
  if not, install the LTS from <https://nodejs.org> (or `winget install OpenJS.NodeJS.LTS`).

## Setup & run

```bash
cd garage-log
npm install
npm run dev
```

Vite prints a local URL (e.g. `http://localhost:5173`). Open it in a browser.

### Build a production bundle

```bash
npm run build     # outputs to dist/
npm run preview   # serve the built bundle locally
```

## Install to your phone home screen

A PWA install prompt requires a **secure context** — `https://` or `localhost`.
Two ways to test on a phone:

1. **Deploy to GitHub Pages (recommended)** — Pages serves over HTTPS, so the
   install prompt works. `base: './'` in `vite.config.ts` means the build works
   under a project subpath (`/garage-log/`) with no extra config. Publish the
   `dist/` folder.
2. **Same-Wi-Fi dev server** — `npm run dev -- --host` exposes it on your LAN,
   but phones treat `http://<laptop-ip>:5173` as insecure, so the install prompt
   usually won't appear. Fine for previewing, not for testing install.

**iPhone (Safari):** open the site → Share → *Add to Home Screen*.
**Android (Chrome):** open the site → menu → *Install app* / *Add to Home screen*.

## Verifying it works

- Dashboard loads with two vehicle cards (F-150, Rogue).
- **Vehicles** tab lists both; tapping one opens its detail page.
- **Debug** tab shows table row counts (vehicles = 2), and the "Write timestamp"
  button proves IndexedDB persists across reloads.
- Offline: after the first load, turn off the network / enable airplane mode and
  reload — the app shell still loads (service worker cache).

## Project layout

```
garage-log/
├─ index.html               # app entry + iOS home-screen meta tags
├─ vite.config.ts           # Vite + vite-plugin-pwa (manifest + service worker)
├─ tsconfig.json
├─ public/icons/            # PWA + Apple touch icons (192, 512, maskable, 180)
└─ src/
   ├─ main.tsx              # boot: persist storage, seed, render
   ├─ app.tsx               # app shell + hash router
   ├─ types.ts              # shared data model
   ├─ db/
   │  ├─ db.ts              # Dexie database + schema (v1)
   │  ├─ seed.ts            # two seed vehicles
   │  └─ useQuery.ts        # reactive liveQuery hook
   ├─ pages/                # Dashboard, Vehicles, VehicleDetail, Debug
   ├─ components/           # Nav (bottom tab bar)
   └─ styles/app.css        # theme (CSS variables) + layout
```

## Data & backups

Data is stored per-browser in IndexedDB under the database name `garage-log`.
Clearing browser/site data **erases everything** — a backup/export feature is a
later milestone. Until then, treat this build as scratch data.
