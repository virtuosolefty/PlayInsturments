import { test, expect } from '../fixtures/index.js';

/**
 * The critical path: open the app, pick a piece, play it, see the result,
 * and have that result still be there after a refresh.
 */
test.describe('Core flows', () => {
  test('the bundled library loads and a default piece is ready to play', async ({ appPage }) => {
    console.log('[core] waiting for the library manifest and a default piece');
    const title = await appPage.currentPieceTitle();
    expect(title.length).toBeGreaterThan(0);
    console.log('[core] default piece loaded:', title);
    await expect(appPage.playButton).toBeVisible();
    await expect(appPage.playButton).toBeEnabled();
  });

  test('selecting a song from the library loads its score', async ({ appPage }) => {
    console.log('[core] opening library and picking "Twinkle, Twinkle, Little Star"');
    await appPage.selectSongByTitle('Twinkle, Twinkle, Little Star');
    await expect(appPage.pieceTitleHeading.first()).toHaveText('Twinkle, Twinkle, Little Star');

    console.log('[core] switching to a second piece to confirm it is not sticky');
    await appPage.selectSongByTitle('Ode to Joy');
    await expect(appPage.pieceTitleHeading.first()).toHaveText('Ode to Joy');
  });

  test('a completed practice run displays results immediately and appears in history', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');

    console.log('[core] before any run: history panel should not exist yet');
    expect(await appPage.isHistoryPanelVisible()).toBe(false);
    expect(await appPage.historyRunsCount()).toBeNull();

    console.log('[core] playing a complete session (count-in, notes, stop)');
    await appPage.playCompleteSession();

    console.log('[core] asserting the result surfaced without a reload');
    await expect(appPage.practiceReport).toBeVisible();
    await expect(appPage.feedbackPanel).toBeVisible();

    console.log('[core] asserting the history panel now shows exactly one run');
    await expect(appPage.historyPanel).toBeVisible();
    await expect.poll(() => appPage.historyRunsCount()).toBe(1);

    console.log('[core] no console errors were logged during the run');
    expect(appPage.consoleErrors, appPage.consoleErrors.join('; ')).toEqual([]);
    if (appPage.sampleNetworkFailures.length) {
      console.log(`[core] ${appPage.sampleNetworkFailures.length} optional piano samples unavailable; checking offline fallback`);
      await expect(appPage.page.locator('.audio-slot')).toHaveAttribute('title',/Web Audio synth \(offline\)/);
    }
  });

  test('practice history survives a page refresh', async ({ page, appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');
    await appPage.playCompleteSession();
    await expect.poll(() => appPage.historyRunsCount()).toBe(1);

    console.log('[core] reloading the page');
    await page.reload();
    await appPage.assertNoFatalError();
    await appPage.dismissFirstRunIfPresent();
    await appPage.waitForLibraryManifest();

    console.log('[core] the same piece should reload as "active" with its run count intact');
    // The app re-opens whatever `rawScore` was, which on a fresh mount is
    // library[0] again (nothing persists *which* song was open) — reselect
    // it and confirm its history, rather than assuming it, survived.
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');
    await expect(appPage.historyPanel).toBeVisible();
    await expect.poll(() => appPage.historyRunsCount()).toBe(1);
  });
});
