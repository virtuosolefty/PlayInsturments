import { test, expect } from '../fixtures/index.js';

/** Persistence and cross-arrangement history regression checks. */
test.describe('Phase 1 — race condition fix', () => {
  test('a finished run is written to localStorage synchronously, before any UI settling', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');
    await appPage.playCompleteSession();

    console.log('[phase1] reading localStorage the instant Stop resolves — no extra waits');
    const db = await appPage.readLocalStorageDb();
    expect(db, 'localStorage practice database should exist immediately after stop').not.toBeNull();
    expect(db.songs['c-major-scale']?.sessions?.length).toBe(1);
  });

  test('the History panel updates in the same tick as the write, with no page reload', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');

    expect(await appPage.historyRunsCount()).toBeNull();
    await appPage.playCompleteSession();

    // Deliberately no page.reload() / page.waitForNavigation() anywhere in
    // this test — the old bug this guards against required a manual
    // refresh (or a `historyVersion`-style cache key) before a just-played
    // run showed up anywhere in the UI.
    console.log('[phase1] asserting the run count updated without navigating away');
    await expect.poll(() => appPage.historyRunsCount(), {
      message: 'History panel should reflect the new run without a reload',
    }).toBe(1);

    console.log('[phase1] playing a second run back-to-back to confirm it keeps updating live');
    await appPage.playCompleteSession();
    await expect.poll(() => appPage.historyRunsCount()).toBe(2);
  });
});

test.describe('Phase 1 — IndexedDB fallback', () => {
  test('a session is backed up to IndexedDB alongside the localStorage write', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');
    await appPage.playCompleteSession();

    const localDb = await appPage.readLocalStorageDb();
    expect(localDb.songs['c-major-scale'].sessions).toHaveLength(1);

    console.log('[phase1] polling IndexedDB for the async backup write to land');
    await expect.poll(async () => {
      const backup = await appPage.readIndexedDbBackup();
      return backup.ok && backup.data?.songs?.['c-major-scale']?.sessions?.length;
    }, {
      message: 'IndexedDB backup should mirror the localStorage session count',
      timeout: 10_000,
    }).toBe(1);

    const backup = await appPage.readIndexedDbBackup();
    expect(backup.data.songs['c-major-scale'].sessions[0].score).toEqual(
      localDb.songs['c-major-scale'].sessions[0].score,
    );
    console.log('[phase1] IndexedDB backup content matches localStorage for this run');
  });

  test('practice backup and imported files use separate IndexedDB databases', async ({ appPage }) => {
    const schema = await appPage.readIndexedDbSchema();
    expect(schema.backup.name).not.toBe(schema.vault.name);
    expect(schema.backup.stores).toEqual(['data']);
    expect(schema.vault.stores).toEqual(expect.arrayContaining(['scores', 'samples']));
  });
});

test.describe('Phase 1 — history in other arrangements', () => {
  test('an arrangement with no runs offers the history of other arrangements', async ({ appPage }) => {
    await appPage.setKeyboardProfile('mpk-mini');
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');
    await appPage.playCompleteSession();

    const recordedVariant = (await appPage.readLocalStorageDb()).songs['c-major-scale'].sessions[0].variant;
    expect(recordedVariant).not.toBe('full');

    await appPage.setKeyboardProfile('generic-88');
    await expect(appPage.historyPanel).toBeVisible();
    await expect(appPage.moreRunsButton).toHaveText('1 more run in other arrangements');
    expect(await appPage.historyRunsCount()).toBeNull();

    await appPage.moreRunsButton.click();
    await expect.poll(() => appPage.historyRunsCount()).toBe(1);
  });
});
