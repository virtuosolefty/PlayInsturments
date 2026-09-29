import { defineConfig } from '@playwright/test';
import studio, { root } from './studio.config.js';

// Video encoding alongside software WebGL can delay browser teardown on CI.
// Keep the same assertions and screenshots without recording every frame.
export default defineConfig({
  ...studio,
  outputDir: `${root}test-results/reference-piano`,
  use: { ...studio.use, video: 'off' },
});
