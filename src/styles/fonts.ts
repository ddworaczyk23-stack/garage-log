// Self-hosted type identity for the Coast design system (design/COAST-PLAN.md
// Stage 4 — identity cutover from the editorial-motion Spectral/Plex trio).
//
// Bundled (not CDN) so the installable PWA renders its real fonts fully offline
// and on first launch — the woff2 files are emitted into the build and precached
// by the service worker. Latin subsets only, to keep the precache lean.
//
// Two fonts:
//   Overpass       — descended from US Highway Gothic; every word: UI,
//                    headings, buttons, verdict panels, explanations
//                    (400/600 UI, 700/800 display).
//   Overpass Mono  — the data spine: money, miles, dates, safe windows.
// (Newsreader serif was dropped 2026-10-13 — three fonts read as a mix.)
import '@fontsource/overpass/latin-400.css'
import '@fontsource/overpass/latin-500.css'
import '@fontsource/overpass/latin-600.css'
import '@fontsource/overpass/latin-700.css'
import '@fontsource/overpass/latin-800.css'
import '@fontsource/overpass-mono/latin-400.css'
import '@fontsource/overpass-mono/latin-500.css'
import '@fontsource/overpass-mono/latin-600.css'
