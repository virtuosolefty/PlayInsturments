import { test, expect } from '../fixtures/index.js';

/**
 * Phase 2 validates the `useAppData` refactor: components
 * never touch `storage.js` directly any more, they go through the hook —
 * these tests exercise that only through the UI, the same way Phase 1's
 * bug (a manual refresh being needed) would have been caught.
 */
test.describe('Phase 2 — useAppData settings persistence', () => {
  test('the daily practice goal survives a reload', async ({ page, appPage }) => {
    console.log('[phase2] setting the daily goal to 45 minutes via the Progress tab slider');
    await appPage.setDailyGoalMinutes(45);

    await expect.poll(async () => (await appPage.readLocalStorageDb()).settings?.dailyGoalMinutes).toBe(45);

    console.log('[phase2] reloading and re-reading the slider');
    await page.reload();
    await appPage.assertNoFatalError();
    await appPage.dismissFirstRunIfPresent();
    await appPage.waitForLibraryManifest();

    await appPage.selectDrawerTab('Progress');
    await expect(page.locator('.drawer-body > div:not([hidden]) .goal-field input[type="range"]')).toHaveValue('45');
    console.log('[phase2] goal minutes persisted across reload');
  });

  test('practice mode survives a reload', async ({ page, appPage }) => {
    console.log('[phase2] switching mode to "Wait for me"');
    const waitModeButton = page.getByRole('button', { name: /Wait for me/ });
    await waitModeButton.click();
    await expect(waitModeButton).toHaveClass(/on/);

    await expect.poll(async () => (await appPage.readLocalStorageDb()).settings?.mode).toBe('wait');

    await page.reload();
    await appPage.assertNoFatalError();
    await appPage.dismissFirstRunIfPresent();
    await appPage.waitForLibraryManifest();

    console.log('[phase2] re-checking that "Wait for me" is still the active mode');
    await expect(page.getByRole('button', { name: /Wait for me/ })).toHaveClass(/on/);
  });
});

test.describe('Phase 2 — storage centralization', () => {
  test('a UI-driven practice run reaches localStorage with the full storage-shaped record', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');
    await appPage.playCompleteSession();

    const db = await appPage.readLocalStorageDb();
    console.log('[phase2] verifying the top-level database shape written by recordSession/recordPracticeDay');

    // Structural shape storage.recordSession / recordPracticeDay /
    // saveSettings all write into (see emptyDb() in storage.js) — asserting
    // on this from a UI-driven run, rather than by calling storage.js
    // directly, is what proves the whole chain (Controls → usePracticeEngine
    // → storage.recordSession, and useAppData →
    // saveSettings) is actually wired up end to end.
    expect(db).toMatchObject({
      version: 1,
      songs: {
        'c-major-scale': {
          totalRuns: 1,
        },
      },
    });
    expect(db.settings).toBeTruthy();
    expect(Object.keys(db.days).length).toBeGreaterThan(0);

    const session = db.songs['c-major-scale'].sessions[0];
    for (const field of ['at', 'score', 'noteAccuracy', 'hit', 'wrongNotes', 'total', 'mode', 'variant']) {
      expect(session, `session record is missing "${field}"`).toHaveProperty(field);
    }
    console.log('[phase2] recorded session has every field the report/history UI reads');
  });

  test('the practice-day ledger updates through the same recordSession call', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');

    const before = await appPage.readLocalStorageDb();
    expect(Object.keys(before.days ?? {}).length).toBe(0);

    await appPage.playCompleteSession();

    // Note: this deliberately does not assert on the StreakStrip's flame
    // count. `streakFrom()` (streaks.js) only counts a day once its total
    // seconds cross DAY_SECONDS_THRESHOLD (180s) or a run is graded
    // "complete" — a short simulated run like this one clears neither bar,
    // by design (the whole point of the threshold is to resist being
    // gamed by a five-second "run"). What Phase 2 promises, and what this
    // asserts, is that `recordPracticeDay` reached storage through the same
    // UI-driven call as everything else — the ledger entry exists, with an
    // uncounted run logged on it.
    const after = await appPage.readLocalStorageDb();
    const today = Object.keys(after.days);
    expect(today.length).toBeGreaterThanOrEqual(1);
    expect(after.days[today[0]].runs).toBeGreaterThanOrEqual(1);
    console.log('[phase2] day ledger entry:', JSON.stringify(after.days[today[0]]));
  });
});

test.describe('Phase 2 — no historyVersion cache-busting needed', () => {
  test('three consecutive runs each update the History panel live, with no manual refresh', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');

    for (let run = 1; run <= 3; run += 1) {
      console.log(`[phase2] playing run ${run} of 3`);
      await appPage.playCompleteSession();
      await expect.poll(
        () => appPage.historyRunsCount(),
        { message: `History panel should read ${run} after run ${run}` },
      ).toBe(run);
    }

    const db = await appPage.readLocalStorageDb();
    expect(db.songs['c-major-scale'].totalRuns).toBe(3);
    expect(db.songs['c-major-scale'].sessions).toHaveLength(3);
  });
});
