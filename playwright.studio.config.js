import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Isolated port: never run the review against somebody else's dev server.
export default defineConfig({
  ...base,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/studio',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5187' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5187 --strictPort --open false',
    url: 'http://127.0.0.1:5187', reuseExistingServer: !process.env.CI, timeout: 60_000,
  },
});
