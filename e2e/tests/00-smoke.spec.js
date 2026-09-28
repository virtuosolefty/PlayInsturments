import { test, expect } from '../fixtures/index.js';

/**
 * Smoke tests — the last line of defense against the app failing to render
 * at all.
 *
 * This exact class of bug is why this file exists: at the start of this
 * test run, `src/App.jsx` used `<Drawer>`, `<SongLibrary>`, `<PathTab>`,
 * `<ProgressTab>` and `<KeyboardPanel>` in its JSX without importing any of
 * them, so every single page load threw `ReferenceError: ... is not
 * defined`, was caught by the top-level `<ErrorBoundary>`, and the entire
 * app showed nothing but "Something in the app broke" — for every user, on
 * every load. See the test run report for the full writeup; the imports
 * were restored in `src/App.jsx` so the rest of this suite could run at
 * all. This test is what would have caught it in CI before it shipped.
 */
test.describe('Smoke — the app boots', () => {
  test('loads the main UI without hitting the top-level error boundary', async ({ page, appPage }) => {
    console.log('[smoke] app loaded, asserting core chrome is present');
    await appPage.assertNoFatalError();
    await expect(page.getByRole('heading', { name: 'Practice Deck' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Library/i }).first()).toBeVisible();
    await expect(page.locator('.pad-play')).toBeVisible();

    console.log('[smoke] asserting no uncaught page errors were thrown during boot');
    expect(appPage.pageErrors, `Uncaught page errors: ${appPage.pageErrors.join('; ')}`).toEqual([]);
  });

  test('survives a hard reload without regressing to the error boundary', async ({ page, appPage }) => {
    await page.reload();
    await appPage.assertNoFatalError();
    await expect(page.getByRole('heading', { name: 'Practice Deck' })).toBeVisible();
    console.log('[smoke] reload did not resurface the missing-import crash');
  });

  test('every drawer tab renders without crashing', async ({ appPage }) => {
    // Each of these mounts a component that, at the start of this task, was
    // one of the five missing imports — walking every tab is a direct,
    // low-effort regression guard against that whole bug class recurring
    // one component at a time.
    for (const tab of ['Songs', 'Path', 'Keyboard', 'Progress']) {
      console.log(`[smoke] opening drawer tab: ${tab}`);
      await appPage.selectDrawerTab(tab);
      await appPage.assertNoFatalError();
    }
  });
});
