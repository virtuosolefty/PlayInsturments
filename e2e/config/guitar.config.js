import { defineConfig } from '@playwright/test';
import studio, { root } from './studio.config.js';

// A fresh server avoids stale HMR module URLs when tests subscribe to MIDI.
// Video encoding is unnecessary alongside software-rendered WebGL screenshots.
export default defineConfig({
  ...studio,
  outputDir: `${root}test-results/guitar`,
  use: { ...studio.use, baseURL:'http://127.0.0.1:5189', video:'off' },
  webServer: {
    command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5189 --strictPort --open false',
    cwd: root,
    url:'http://127.0.0.1:5189', reuseExistingServer:false, timeout:60_000,
  },
});
