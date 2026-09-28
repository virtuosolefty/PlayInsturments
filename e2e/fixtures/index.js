import { test as base, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage.js';

/**
 * Every test gets an `appPage` that has already:
 *   1. loaded the app once (so the origin, and therefore localStorage/
 *      IndexedDB, exists),
 *   2. wiped both persistence layers, so no test inherits another test's
 *      practice history, streak or settings,
 *   3. reloaded so the app boots from that clean slate,
 *   4. dismissed the first-run onboarding card, and
 *   5. waited for the bundled song library to load.
 *
 * `fullyParallel: false` in playwright.config.js keeps these tests from
 * racing each other over the same browser-profile storage.
 */
export const test = base.extend({
  appPage: async ({ page }, use) => {
    const app = new AppPage(page);

    const consoleErrors = [];
    const sampleNetworkFailures = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // The optional sample CDN can be unavailable in offline/restricted runs.
      // Keep those failures visible separately; never exclude app/runtime errors.
      const sampleUrl = msg.location().url?.startsWith('https://tonejs.github.io/audio/salamander/');
      if (sampleUrl && msg.text().startsWith('Failed to load resource:')) {
        sampleNetworkFailures.push({ url: msg.location().url, error: msg.text() });
      } else consoleErrors.push(msg.text());
    });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await app.goto();
    await app.clearAllPersistence();
    await page.reload();
    await app.assertNoFatalError();
    await app.waitForLibraryManifest();
    // The welcome is mounted only after the asynchronous manifest arrives.
    // Checking isVisible before that can skip dismissal just before it opens.
    await app.dismissFirstRunIfPresent();

    // Exposed on the page object so individual tests can assert "no console
    // errors happened during my flow" without wiring up their own listeners.
    app.consoleErrors = consoleErrors;
    app.sampleNetworkFailures = sampleNetworkFailures;
    app.pageErrors = pageErrors;

    await use(app);
  },
});

export { expect };
