/**
 * @vitest-environment jsdom
 *
 * Backup and restore. Everything the app knows about a player is in one
 * localStorage key that a browser may evict without asking, so this is the only
 * path by which months of practice survive a cleared cache — and the import
 * side is a system boundary, so it trusts nothing it is handed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_FORMAT,
  clearAllHistory,
  exportHistory,
  getSongHistory,
  importHistory,
  onStorageFailure,
  parseBackup,
  recordSession,
} from './storage.js';

const summary = {
  score: 0.9, noteAccuracy: 0.9, timingAccuracy: 0.8, dynamicsAccuracy: 0.8,
  velocitySpread: 0.05, hit: 9, missed: 1, wrongNotes: 0, total: 10,
  meanAbsDeviationMs: 40, meanSignedDeviationMs: -5, wrongNoteKinds: {},
};

describe('backup', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllHistory();
  });

  it('survives a full round trip', () => {
    recordSession('song-a', summary, [{ time: 1, name: 'C4', missed: 1, wrong: 0, late: 0 }], { stars: 4, overall: 88 });
    const json = exportHistory();
    clearAllHistory();
    expect(getSongHistory('song-a').sessions).toHaveLength(0);

    expect(importHistory(json).ok).toBe(true);
    const restored = getSongHistory('song-a');
    expect(restored.sessions).toHaveLength(1);
    expect(restored.sessions[0].stars).toBe(4);
    expect(restored.totalRuns).toBe(1);
  });

  it('labels its own format so a foreign file can be told apart', () => {
    const parsed = JSON.parse(exportHistory());
    expect(parsed.format).toBe(BACKUP_FORMAT);
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('still accepts a bare database from an older export', () => {
    // Refusing this would be refusing exactly the backup somebody made
    // because they were worried about losing their history.
    const bare = JSON.stringify({ version: 1, songs: { x: { sessions: [{ stars: 3 }], troubleMap: {}, totalRuns: 1 } } });
    expect(importHistory(bare).ok).toBe(true);
    expect(getSongHistory('x').sessions).toHaveLength(1);
  });

  it('refuses anything that is not a backup', () => {
    expect(parseBackup('not json at all').ok).toBe(false);
    expect(parseBackup('{"hello":"world"}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ songs: [] })).ok).toBe(false);
    expect(parseBackup('null').ok).toBe(false);
  });

  it('does not let a malformed file through as a session array', () => {
    const junk = JSON.stringify({ songs: { x: { sessions: 'nope', troubleMap: 7, totalRuns: 'lots' } } });
    const parsed = parseBackup(junk);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.songs.x).toEqual({ sessions: [], troubleMap: {}, totalRuns: 0 });
  });

  it('drops non-objects sitting in a sessions array', () => {
    const junk = JSON.stringify({ songs: { x: { sessions: [null, 3, { stars: 5 }, 'x'] } } });
    expect(parseBackup(junk).data.songs.x.sessions).toEqual([{ stars: 5 }]);
  });

  it('replaces rather than merges', () => {
    // Merging two histories would invent practice that never happened, and the
    // streak is meant to be evidence.
    recordSession('old-song', summary, [], { stars: 5, overall: 95 });
    const other = JSON.stringify({ songs: { 'new-song': { sessions: [{ stars: 2 }], troubleMap: {}, totalRuns: 1 } } });
    importHistory(other);
    expect(getSongHistory('old-song').sessions).toHaveLength(0);
    expect(getSongHistory('new-song').sessions).toHaveLength(1);
  });

  it('counts what a restore would bring back, for the confirmation', () => {
    recordSession('a', summary, [], { stars: 4 });
    recordSession('a', summary, [], { stars: 5 });
    recordSession('b', summary, [], { stars: 3 });
    const parsed = parseBackup(exportHistory());
    expect(parsed.summary).toMatchObject({ songs: 2, sessions: 3 });
  });

  it('carries the ghosts across too', () => {
    const withGhost = JSON.stringify({ songs: {}, ghosts: { 'x::full': { overall: 80, deltas: { 0: 12 } } } });
    expect(parseBackup(withGhost).data.ghosts['x::full'].overall).toBe(80);
  });
});

describe('a failed write', () => {
  beforeEach(() => localStorage.clear());

  it('tells somebody rather than only the console', () => {
    // Silently dropping writes is the worst handling for this: the streak
    // resets, the Path forgets a passed exercise, and nothing says why.
    const heard = [];
    const off = onStorageFailure((e) => heard.push(e));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    });

    recordSession('x', summary, [], { stars: 3 });
    expect(heard).toHaveLength(1);
    expect(heard[0].quota).toBe(true);

    setItem.mockRestore();
    warn.mockRestore();
    off();
  });

  it('reports an import that could not be saved as a failure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('nope');
    });
    const result = importHistory(JSON.stringify({ songs: {} }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not be saved/);
    setItem.mockRestore();
    warn.mockRestore();
  });
});
