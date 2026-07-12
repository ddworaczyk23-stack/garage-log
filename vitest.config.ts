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
  },
})
