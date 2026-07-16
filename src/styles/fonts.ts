// Self-hosted type identity for the editorial-motion design system.
//
// Bundled (not CDN) so the installable PWA renders its real fonts fully offline
// and on first launch — the woff2 files are emitted into the build and precached
// by the service worker. Latin subset only, weights 400/500/600, to keep the
// precache lean. Families: Spectral (serif display), IBM Plex Sans (body),
// IBM Plex Mono (the data spine — numbers, labels, machined captions).
import '@fontsource/spectral/latin-400.css'
import '@fontsource/spectral/latin-500.css'
import '@fontsource/spectral/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
// Coast verdict layer (design/COAST-PLAN.md): Overpass — descended from US
// Highway Gothic — is the "road sign" voice of verdict panels and signal
// labels. Weights 700/800 only (it's a display/label face here, never body).
import '@fontsource/overpass/latin-700.css'
import '@fontsource/overpass/latin-800.css'
