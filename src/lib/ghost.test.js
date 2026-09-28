/**
 * @vitest-environment jsdom
 *
 * The ghost — where your best run struck each note, kept so the roll can race
 * you against yourself. The rule that matters is that it only ever holds your
 * *best*: a ghost that drifted to the latest run would make a bad day erase
 * the thing you were trying to beat.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllHistory, getGhost, recordGhost } from './storage.js';

const targets = (deltas) => deltas.map((deltaMs, id) => ({ id, deltaMs }));

describe('the ghost', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllHistory();
  });

  it('records where each note was struck', () => {
    recordGhost({ songId: 'x', variant: 'full', overall: 80 }, targets([-40, 12, 130]));
    expect(getGhost('x', 'full')).toMatchObject({
      overall: 80,
      deltas: { 0: -40, 1: 12, 2: 130 },
    });
  });

  it('keeps the better run and ignores the worse one', () => {
    recordGhost({ songId: 'x', variant: 'full', overall: 90 }, targets([10, 10]));
    recordGhost({ songId: 'x', variant: 'full', overall: 40 }, targets([200, 200]));
    expect(getGhost('x', 'full').overall).toBe(90);
    expect(getGhost('x', 'full').deltas[0]).toBe(10);
  });

  it('replaces the ghost when you actually beat it', () => {
    recordGhost({ songId: 'x', variant: 'full', overall: 70 }, targets([80]));
    recordGhost({ songId: 'x', variant: 'full', overall: 95 }, targets([5]));
    expect(getGhost('x', 'full')).toMatchObject({ overall: 95, deltas: { 0: 5 } });
  });

  it('keeps arrangements apart, so a folded run never ghosts the full one', () => {
    // Folding moves notes between hands and octaves. Racing one against the
    // other would be racing two different pieces.
    recordGhost({ songId: 'x', variant: 'full', overall: 90 }, targets([10]));
    recordGhost({ songId: 'x', variant: 'fold', overall: 60 }, targets([90]));
    expect(getGhost('x', 'full').overall).toBe(90);
    expect(getGhost('x', 'fold').overall).toBe(60);
  });

  it('stores nothing from a run with no measured timing', () => {
    // Wait mode leaves every deltaMs null — there is no timing to race.
    expect(recordGhost({ songId: 'w', variant: 'full', overall: 88 }, targets([null, null]))).toBeNull();
    expect(getGhost('w', 'full')).toBeNull();
  });

  it('skips the notes that were never played rather than inventing a zero', () => {
    const mixed = [{ id: 0, deltaMs: 30 }, { id: 1, deltaMs: null }, { id: 2, deltaMs: -20 }];
    recordGhost({ songId: 'x', variant: 'full', overall: 80 }, mixed);
    const ghost = getGhost('x', 'full');
    expect(Object.keys(ghost.deltas)).toEqual(['0', '2']);
  });

  it('ignores an ungraded run', () => {
    expect(recordGhost({ songId: 'x', variant: 'full', overall: null }, targets([10]))).toBeNull();
    expect(getGhost('x', 'full')).toBeNull();
  });

  it('has nothing to say about a piece never played', () => {
    expect(getGhost('never', 'full')).toBeNull();
  });
});
