import { test, expect } from '../fixtures/index.js';

/**
 * Phase 1 fix validation.
 *
 * Two of these (`race condition`, `IndexedDB fallback`) validate fixes that
 * hold up under test. The third (`variant mismatch`) does not — see the
 * comment on that test for the reproduction and root cause found while
 * writing this suite.
 */
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

  test.fail(
    'REGRESSION: the practice-history backup store and the imported-files vault ' +
      'collide in the same IndexedDB database',
    async ({ appPage }) => {
      // `src/lib/indexedDbBackup.js` and `src/lib/vault.js` both call
      // `indexedDB.open('piano-practice-coach', ...)` — indexedDbBackup.js
      // implicitly at version 1 (no version argument), vault.js explicitly
      // at `DB_VERSION = 1`. Only one of them gets to run its
      // `onupgradeneeded` and create its object stores; whichever module's
      // first `open()` call loses the race never gets its store created, and
      // every later call into it throws
      // "NotFoundError: One of the specified object stores was not found."
      // In this app that currently means vault.js's "scores"/"samples"
      // stores are never created (confirmed on a fresh browser profile —
      // see the schema read below, and the "Your imported files could not
      // be read back" error banner it produces on every cold start).
      //
      // Fix direction: give the two modules either separate database names,
      // or one shared `onupgradeneeded` that creates every store the app
      // needs (bump DB_VERSION for existing users either way).
      console.log('[phase1] reading the IndexedDB schema for the shared "piano-practice-coach" database');
      const schema = await appPage.readIndexedDbSchema();
      console.log('[phase1] stores present:', schema.stores.join(', ') || '(none)');

      expect(schema.stores).toEqual(expect.arrayContaining(['backup', 'scores', 'samples']));
    },
  );
});

test.describe('Phase 1 — variant mismatch fix ("show runs in other arrangements")', () => {
  test.fail(
    'REGRESSION: switching to an arrangement with no runs of its own hides the History panel ' +
      'entirely, instead of offering "N more runs in other arrangements"',
    async ({ appPage }) => {
      // Reproduction:
      //  1. Force a keyboard profile narrow enough that the default "Fit my
      //     keys" mode actually folds the piece (a 25-key MPK Mini folds
      //     C Major Scale's 3-octave span) — this is what makes the
      //     recorded session's `variant` different from the unfolded one
      //     (see variantOf() in arrange.js).
      //  2. Play and record a run under that folded arrangement.
      //  3. Switch to a keyboard profile the piece fits without folding —
      //     the variant flips to "full", which has zero sessions of its own.
      //
      // Expected (per the task's Phase 1 spec): the History panel should
      // still render, offering "N more runs in other arrangements" — that
      // button is HistoryPanel.jsx's whole reason for having
      // `showAllArrangements` state.
      //
      // Actual: `App.jsx` gates whether `<HistoryPanel>` renders at all on
      // `(history?.sessions?.length ?? 0) > 0`, where `history` is already
      // filtered to the *current* variant. With zero sessions in the new
      // variant, the panel — and therefore the button that lives inside it
      // — never mounts. The piece panel instead reads "You haven't played
      // this one yet.", even though a run exists. Root cause is in
      // `src/App.jsx` (both places `<HistoryPanel ... />` is conditionally
      // rendered); `HistoryPanel.jsx` itself implements the "N more runs"
      // feature correctly once it is allowed to mount.
      await appPage.setKeyboardProfile('mpk-mini');
      await appPage.selectSongByTitle('C Major Scale — Two Octaves');
      await appPage.playCompleteSession();

      const recordedVariant = (await appPage.readLocalStorageDb()).songs['c-major-scale'].sessions[0].variant;
      console.log('[phase1] recorded under the folded arrangement, variant =', recordedVariant);
      expect(recordedVariant).not.toBe('full');

      console.log('[phase1] switching to a keyboard the piece fits unfolded');
      await appPage.setKeyboardProfile('generic-88');

      console.log('[phase1] expecting the History panel to stay visible with a cross-arrangement hint');
      await expect(appPage.historyPanel).toBeVisible();
      await expect(appPage.moreRunsButton).toBeVisible();

      await appPage.moreRunsButton.click();
      await expect.poll(() => appPage.historyRunsCount()).toBe(1);
    },
  );
});
