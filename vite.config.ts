import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

const buildSha = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.GITHUB_SHA

// NOTE: `base` is relative so the built app works both at a domain root
// (custom domain) and under a GitHub Pages project subpath (e.g. /garage-log/)
// without any extra config. Hash-based routing keeps deep links working there too.
export default defineConfig({
  base: './',
  define: {
    __COAST_BUILD__: JSON.stringify(buildSha?.slice(0, 7) ?? 'dev'),
  },
  plugins: [
    preact(),
    VitePWA({
      // Milestone 1: auto-update the shell in the background. A "tap to refresh"
      // prompt can replace this later if mid-session swaps become annoying.
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.ico', 'icons/favicon-32.png'],
      manifest: {
        // Display identity is "Coast" (Stage 4 cutover); start_url/scope and the
        // repo/deploy path deliberately stay as-is — see design/COAST-PLAN.md.
        name: 'Coast',
        short_name: 'Coast',
        description: 'Plain answers about your cars — what needs attention, what can wait, and what it should cost.',
        theme_color: '#0f2a44',
        background_color: '#efefea',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Per-make model/trim files (scripts/build-vehicle-catalog.mjs): cached
        // on first use so a make's pickers work offline after that, refreshed
        // in the background on the next deploy's data.
        runtimeCaching: [
          {
            urlPattern: /\/catalog\/[^/]+\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'vehicle-catalog', expiration: { maxEntries: 30 } },
          },
        ],
      },
      // Let the service worker run during `npm run dev` so offline/install
      // behaviour can be tested without a production build.
      devOptions: { enabled: true },
    }),
  ],
})
