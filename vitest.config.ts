import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

// Separate from vite.config.ts (which has the PWA plugin — irrelevant for
// tests and best kept out of the test collection/build path).
export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
})
