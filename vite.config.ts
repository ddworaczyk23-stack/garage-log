import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// NOTE: `base` is relative so the built app works both at a domain root
// (custom domain) and under a GitHub Pages project subpath (e.g. /garage-log/)
// without any extra config. Hash-based routing keeps deep links working there too.
export default defineConfig({
  base: './',
  plugins: [
    preact(),
    VitePWA({
      // Milestone 1: auto-update the shell in the background. A "tap to refresh"
      // prompt can replace this later if mid-session swaps become annoying.
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'The Glovebox',
        short_name: 'The Glovebox',
        description: 'Local-first maintenance tracker for the household vehicles.',
        theme_color: '#f3efe4',
        background_color: '#f3efe4',
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
      },
      // Let the service worker run during `npm run dev` so offline/install
      // behaviour can be tested without a production build.
      devOptions: { enabled: true },
    }),
  ],
})
