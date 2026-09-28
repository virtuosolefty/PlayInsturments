import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Piano Practice Coach E2E suite.
 *
 * The app talks to Web MIDI, Web Audio and IndexedDB — all of which behave
 * consistently in Chromium under Playwright (synthetic input events are
 * trusted, so `audio.start()`'s user-gesture requirement is satisfied by a
 * simulated click/keypress). Firefox/WebKit are not enabled by default
 * because Web MIDI is Chromium-only; the practice engine itself still works
 * without a MIDI device (computer-keyboard input goes through the same
 * `emitSyntheticMidi` path), but keeping the matrix to one real target keeps
 * this suite fast and avoids asserting on a code path (Web MIDI feature
 * detection) that would just report "unsupported" everywhere else.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // each test asserts against its own localStorage/IndexedDB state
  workers: 1,
  // One retry even outside CI: this suite exercises real Web Audio/MIDI
  // timing (count-ins, note scheduling) that has an inherent small amount
  // of jitter no amount of `expect.poll` fully absorbs. A test that fails
  // twice in a row is a real regression; a test that fails once and then
  // passes is what `trace: 'on-first-retry'` below exists to help debug.
  retries: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  use: {
    baseURL: 'http://localhost:5173',
    // Wider than COMPACT_QUERY/NARROW_QUERY (useMediaQuery.js) so the deck
    // renders its full desktop layout — the hand-filter and view switches
    // otherwise move into a popover, which several tests click directly.
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Autoplay policies otherwise block Tone.js/Web Audio from starting even
    // on a trusted synthetic gesture in headless Chromium.
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Reuse the dev server the task description says is already running on
  // :5173; start one automatically otherwise (e.g. in CI).
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
