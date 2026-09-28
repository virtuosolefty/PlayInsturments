/**
 * @vitest-environment jsdom
 *
 * Star badges, and the tempo they were earned at.
 *
 * `path.js` has always gated passing and mastery on `atTempo`, but the badges
 * beside a piece in the library took a plain maximum over every recorded run —
 * so a clean, slow attempt put five gold stars next to Moonlight Sonata and
 * the app disagreed with itself about the one thing it exists to be honest
 * about. The rule these tests pin down is that the rating still stands (this
 * app teaches you to slow a piece down until it is clean, and scoring that
 * zero would punish taking its advice) but it never travels without the speed
 * it was earned at.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllHistory,
  getAllBestStars,
  getBestCombo,
  getBestStars,
  recordCombo,
  recordSession,
} from './storage.js';

const summary = {
  score: 0.9,
  noteAccuracy: 0.9,
  timingAccuracy: 0.8,
  dynamicsAccuracy: 0.7,
  hit: 9,
  missed: 1,
  wrongNotes: 0,
  total: 10,
  meanAbsDeviationMs: 30,
  meanSignedDeviationMs: -10,
  wrongNoteKinds: {},
};

/** One finished run of `songId`. `stars: null` is an abandoned attempt. */
const run = (songId, { stars, rate = 1, variant = 'full' }) =>
  recordSession(songId, summary, [], { stars, rate, variant, mode: 'timed' });

describe('best stars', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllHistory();
  });

  it('is nothing at all before you have played the piece', () => {
    expect(getBestStars('x', 'full')).toEqual({ stars: 0, rate: 1 });
  });

  it('reports the best rating and the speed it was played at', () => {
    run('x', { stars: 3, rate: 1 });
    run('x', { stars: 5, rate: 0.6 });
    expect(getBestStars('x', 'full')).toEqual({ stars: 5, rate: 0.6 });
  });

  it('breaks a tie towards the faster run', () => {
    // Both runs are four stars. The one played at speed is the more
    // impressive true statement about them, so that is the one reported.
    run('x', { stars: 4, rate: 0.5 });
    run('x', { stars: 4, rate: 1.15 });
    run('x', { stars: 4, rate: 0.75 });
    expect(getBestStars('x', 'full')).toEqual({ stars: 4, rate: 1.15 });
  });

  it('never lets an abandoned run set a record', () => {
    run('x', { stars: null, rate: 1.5 });
    run('x', { stars: 2, rate: 0.8 });
    expect(getBestStars('x', 'full')).toEqual({ stars: 2, rate: 0.8 });
  });

  it('assumes full speed for a run recorded without a rate', () => {
    recordSession('x', summary, [], { stars: 3, variant: 'full', mode: 'timed' });
    expect(getBestStars('x', 'full')).toEqual({ stars: 3, rate: 1 });
  });

  it('keeps arrangements apart, so a folded run never rates the full one', () => {
    run('x', { stars: 5, rate: 1, variant: 'fold:25:both' });
    expect(getBestStars('x', 'full')).toEqual({ stars: 0, rate: 1 });
    expect(getBestStars('x', 'fold:25:both')).toEqual({ stars: 5, rate: 1 });
  });
});

describe('best stars for the whole library', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllHistory();
  });

  it('returns the ratings and their tempos as two maps', () => {
    run('a', { stars: 5, rate: 0.6 });
    run('b', { stars: 3, rate: 1 });
    const { stars, rates } = getAllBestStars('full');
    expect(stars).toEqual({ a: 5, b: 3 });
    expect(rates).toEqual({ a: 0.6, b: 1 });
  });

  it('omits pieces with no rating rather than listing them as zero', () => {
    // The suggestion engine reads `stars` as "how far have I got with this",
    // and a zero it has to tell apart from a missing key is a bug waiting.
    run('a', { stars: null, rate: 1 });
    run('b', { stars: 4, rate: 1 });
    const { stars, rates } = getAllBestStars('full');
    expect(stars).toEqual({ b: 4 });
    expect(rates).toEqual({ b: 1 });
  });

  it('agrees with the single-piece lookup', () => {
    run('a', { stars: 4, rate: 0.5 });
    run('a', { stars: 4, rate: 0.9 });
    const { stars, rates } = getAllBestStars('full');
    expect({ stars: stars.a, rate: rates.a }).toEqual(getBestStars('a', 'full'));
  });
});

/**
 * The longest clean streak, kept so the roll can tell you the moment you pass
 * it. The engine has always counted this per run; nothing ever stored it, so
 * the number was thrown away at the end of every session.
 */
describe('best streak', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllHistory();
  });

  it('is nothing before you have played', () => {
    expect(getBestCombo('x', 'full')).toBe(0);
  });

  it('remembers a streak', () => {
    recordCombo({ songId: 'x', variant: 'full' }, 14);
    expect(getBestCombo('x', 'full')).toBe(14);
  });

  it('keeps the best one and ignores a worse run', () => {
    recordCombo({ songId: 'x', variant: 'full' }, 20);
    recordCombo({ songId: 'x', variant: 'full' }, 6);
    expect(getBestCombo('x', 'full')).toBe(20);
  });

  it('replaces the record when you actually beat it', () => {
    recordCombo({ songId: 'x', variant: 'full' }, 9);
    expect(recordCombo({ songId: 'x', variant: 'full' }, 11)).toBe(11);
    expect(getBestCombo('x', 'full')).toBe(11);
  });

  it('ignores a run with no streak at all', () => {
    recordCombo({ songId: 'x', variant: 'full' }, 7);
    recordCombo({ songId: 'x', variant: 'full' }, 0);
    expect(getBestCombo('x', 'full')).toBe(7);
  });

  it('keeps arrangements apart, so a folded streak is not the full one', () => {
    recordCombo({ songId: 'x', variant: 'fold:25:both' }, 30);
    expect(getBestCombo('x', 'full')).toBe(0);
    expect(getBestCombo('x', 'fold:25:both')).toBe(30);
  });
});
