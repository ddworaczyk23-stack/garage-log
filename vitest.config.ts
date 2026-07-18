import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

// Separate from vite.config.ts (which has the PWA plugin — irrelevant for
// tests and best kept out of the test collection/build path).
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      // See tests/dexieCloudAddonStub.ts for why the real addon isn't used here.
      'dexie-cloud-addon': fileURLToPath(new URL('./tests/dexieCloudAddonStub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Tests must never configure Dexie Cloud, even on a dev machine whose
    // .env.local sets the URL (Vite loads it here too): db/cloud.ts would call
    // db.cloud.configure() at import, and the stubbed addon has no `cloud`.
    env: { VITE_DEXIE_CLOUD_URL: '' },
  },
})
