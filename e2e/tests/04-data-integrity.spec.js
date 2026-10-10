import { test, expect } from '../fixtures/index.js';

test.describe('Data integrity — localStorage', () => {
  test('each song keeps its own isolated session history', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');
    await appPage.playCompleteSession();

    await appPage.selectSongByTitle('Twinkle, Twinkle, Little Star');
    await appPage.playCompleteSession();

    const db = await appPage.readLocalStorageDb();
    console.log('[integrity] songs recorded:', Object.keys(db.songs).join(', '));

    expect(db.songs['c-major-scale'].sessions).toHaveLength(1);
    expect(db.songs['twinkle'].sessions).toHaveLength(1);
    expect(db.songs['c-major-scale'].totalRuns).toBe(1);
    expect(db.songs['twinkle'].totalRuns).toBe(1);
  });

  test('a session record has plausible, self-consistent values', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');
    await appPage.playCompleteSession();

    const session = (await appPage.readLocalStorageDb()).songs['c-major-scale'].sessions[0];
    console.log('[integrity] session:', JSON.stringify(session));

    expect(new Date(session.at).toString()).not.toBe('Invalid Date');
    expect(session.total).toBe(60); // C Major Scale — Two Octaves has 60 notes (songs.json)
    expect(session.hit + session.missed).toBeLessThanOrEqual(session.total);
    expect(session.hit).toBeGreaterThanOrEqual(0);
    expect(session.wrongNotes).toBeGreaterThanOrEqual(0);
    expect(session.hit + session.wrongNotes).toBeGreaterThan(0); // finish()'s own persistence guard
    expect(session.noteAccuracy).toBeCloseTo(session.hit / session.total, 4);
    expect(['practice', 'timed', 'listen', 'wait']).toContain(session.mode);
  });
});

test.describe('Data integrity — IndexedDB backup', () => {
  test('the IndexedDB backup is a faithful mirror of the localStorage practice database', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');
    await appPage.playCompleteSession();
    await appPage.selectSongByTitle('Twinkle, Twinkle, Little Star');
    await appPage.playCompleteSession();

    const localDb = await appPage.readLocalStorageDb();

    await expect.poll(async () => {
      const backup = await appPage.readIndexedDbBackup();
      return backup.ok;
    }, { message: 'IndexedDB backup write should complete', timeout: 10_000 }).toBe(true);

    const backup = await appPage.readIndexedDbBackup();
    console.log('[integrity] comparing localStorage vs IndexedDB backup songs');
    expect(backup.data.songs).toEqual(localDb.songs);
    expect(backup.data.days).toEqual(localDb.days);
  });
});

test.describe('Data integrity — settings', () => {
  test('multiple settings changed together all survive a reload', async ({ page, appPage }) => {
    console.log('[integrity] changing fit mode, hand filter and daily goal together');
    await appPage.setFit('As written');
    await page.getByRole('button', { name: 'R', exact: true }).click(); // hands: right only
    await appPage.setDailyGoalMinutes(25);

    await expect.poll(async () => {
      const s = (await appPage.readLocalStorageDb()).settings;
      return s && [s.fit, s.hands, s.dailyGoalMinutes].join(',');
    }).toBe('off,right,25');

    await page.reload();
    await appPage.assertNoFatalError();
    await appPage.dismissFirstRunIfPresent();
    await appPage.waitForLibraryManifest();

    const settings = (await appPage.readLocalStorageDb()).settings;
    console.log('[integrity] settings after reload:', JSON.stringify(settings));
    expect(settings.fit).toBe('off');
    expect(settings.hands).toBe('right');
    expect(settings.dailyGoalMinutes).toBe(25);

    await appPage.openMoreOptions();
    await expect(page.getByRole('button', { name: 'As written', exact: true })).toHaveClass(/on/);
  });
});

test.describe('Data integrity — practice day ledger', () => {
  test('two runs on the same day accumulate rather than overwrite', async ({ appPage }) => {
    await appPage.selectSongByTitle('C Major Scale — Two Octaves');
    await appPage.playCompleteSession();

    const afterFirst = await appPage.readLocalStorageDb();
    const todayKey = Object.keys(afterFirst.days)[0];
    const runsAfterFirst = afterFirst.days[todayKey].runs;

    await appPage.playCompleteSession();

    const afterSecond = await appPage.readLocalStorageDb();
    console.log('[integrity] day ledger after two runs:', JSON.stringify(afterSecond.days[todayKey]));
    expect(afterSecond.days[todayKey].runs).toBe(runsAfterFirst + 1);
    expect(afterSecond.days[todayKey].seconds).toBeGreaterThanOrEqual(afterFirst.days[todayKey].seconds);
  });
});
