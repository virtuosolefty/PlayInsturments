/**
 * The streak has to be hard to fake, or it stops being evidence of practice
 * and becomes a number that only goes up. These tests are mostly about the
 * ways it could be cheated or could break at a date boundary.
 */

import { describe, expect, it } from 'vitest';
import {
  addDays,
  DAY_SECONDS_THRESHOLD,
  dayCounts,
  dayKey,
  daysBetween,
  recordDay,
  streakFrom,
  todayProgress,
} from './streaks.js';

const TODAY = '2026-08-10';
const day = (over = {}) => ({ seconds: 600, runs: 1, completedRuns: 1, bestStars: 3, ...over });

const ledger = (entries) =>
  Object.fromEntries(entries.map((key) => [key, day()]));

describe('date arithmetic', () => {
  it('keys by local day, not UTC', () => {
    // 11pm local must still be today, whatever UTC thinks.
    const late = new Date(2026, 7, 10, 23, 30);
    expect(dayKey(late)).toBe('2026-08-10');
  });

  it('steps across a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days between keys', () => {
    expect(daysBetween('2026-08-09', '2026-08-10')).toBe(1);
    expect(daysBetween('2026-08-10', '2026-08-10')).toBe(0);
    expect(daysBetween('2026-07-31', '2026-08-01')).toBe(1);
  });

  it('is not confused by a daylight-saving change', () => {
    // Late March in most of Europe; a naive 24h subtraction would give 0 or 2.
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1);
    expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1);
  });
});

describe('what makes a day count', () => {
  it('accepts a completed run however short', () => {
    expect(dayCounts({ seconds: 20, completedRuns: 1 })).toBe(true);
  });

  it('accepts enough playing without a completed run', () => {
    expect(dayCounts({ seconds: DAY_SECONDS_THRESHOLD, completedRuns: 0 })).toBe(true);
  });

  it('rejects a day where you barely touched it', () => {
    expect(dayCounts({ seconds: 30, completedRuns: 0 })).toBe(false);
  });

  it('rejects opening the app and doing nothing', () => {
    expect(dayCounts({ seconds: 0, runs: 3, completedRuns: 0 })).toBe(false);
    expect(dayCounts(undefined)).toBe(false);
  });
});

describe('streakFrom', () => {
  it('is zero with no history', () => {
    expect(streakFrom({}, TODAY)).toMatchObject({
      current: 0, longest: 0, practisedToday: false, lastDay: null, freezes: 0, live: false,
    });
  });

  it('counts consecutive days up to today', () => {
    const s = streakFrom(ledger(['2026-08-08', '2026-08-09', '2026-08-10']), TODAY);
    expect(s.current).toBe(3);
    expect(s.practisedToday).toBe(true);
  });

  it('keeps yesterday\'s streak alive before you have played today', () => {
    // A streak must not read as broken at breakfast.
    const s = streakFrom(ledger(['2026-08-08', '2026-08-09']), TODAY);
    expect(s.current).toBe(2);
    expect(s.practisedToday).toBe(false);
  });

  it('breaks after a missed day', () => {
    const s = streakFrom(ledger(['2026-08-05', '2026-08-06']), TODAY);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(2);
  });

  it('remembers the longest run even once it is over', () => {
    const s = streakFrom(
      ledger(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-08-10']),
      TODAY,
    );
    expect(s.longest).toBe(4);
    expect(s.current).toBe(1);
  });

  it('ignores days that fail the practice threshold', () => {
    const days = {
      '2026-08-08': day(),
      '2026-08-09': { seconds: 10, runs: 4, completedRuns: 0, bestStars: 0 },
      '2026-08-10': day(),
    };
    // The middle day does not count, so this is not a three-day streak.
    expect(streakFrom(days, TODAY).current).toBe(1);
  });

  it('counts a day once however many runs it held', () => {
    const days = { '2026-08-09': day({ runs: 9, completedRuns: 9 }), '2026-08-10': day() };
    expect(streakFrom(days, TODAY).current).toBe(2);
  });
});

describe('todayProgress', () => {
  it('reports minutes against the goal', () => {
    const p = todayProgress({ [TODAY]: day({ seconds: 300 }) }, 10, TODAY);
    expect(p.minutes).toBe(5);
    expect(p.fraction).toBeCloseTo(0.5, 5);
    expect(p.met).toBe(false);
  });

  it('caps the ring once the goal is passed', () => {
    const p = todayProgress({ [TODAY]: day({ seconds: 3000 }) }, 10, TODAY);
    expect(p.fraction).toBe(1);
    expect(p.met).toBe(true);
  });

  it('handles a day with nothing on it', () => {
    expect(todayProgress({}, 10, TODAY).minutes).toBe(0);
  });
});

describe('recordDay', () => {
  it('accumulates without mutating the ledger it was given', () => {
    const before = { [TODAY]: day({ seconds: 60, runs: 1, completedRuns: 1 }) };
    const after = recordDay(before, { seconds: 30, complete: true, stars: 4 }, TODAY);
    expect(before[TODAY].seconds).toBe(60);
    expect(after[TODAY].seconds).toBe(90);
    expect(after[TODAY].runs).toBe(2);
    expect(after[TODAY].completedRuns).toBe(2);
    expect(after[TODAY].bestStars).toBe(4);
  });

  it('records an abandoned run as time but not as a completed run', () => {
    const after = recordDay({}, { seconds: 40, complete: false, stars: 0 }, TODAY);
    expect(after[TODAY].runs).toBe(1);
    expect(after[TODAY].completedRuns).toBe(0);
    expect(dayCounts(after[TODAY])).toBe(false);
  });

  it('keeps the best stars of the day, not the latest', () => {
    let days = recordDay({}, { seconds: 60, complete: true, stars: 5 }, TODAY);
    days = recordDay(days, { seconds: 60, complete: true, stars: 2 }, TODAY);
    expect(days[TODAY].bestStars).toBe(5);
  });
});

describe('rest days', () => {
  /** A run of consecutive days ending on `last`, `length` long. */
  const runEnding = (last, length) =>
    ledger(Array.from({ length }, (_, i) => addDays(last, -(length - 1 - i))));

  it('earns one freeze per full week, and no more than two', () => {
    expect(streakFrom(runEnding(TODAY, 6), TODAY).freezes).toBe(0);
    expect(streakFrom(runEnding(TODAY, 7), TODAY).freezes).toBe(1);
    expect(streakFrom(runEnding(TODAY, 14), TODAY).freezes).toBe(2);
    // Banked, not accumulated for ever — three weeks still holds two.
    expect(streakFrom(runEnding(TODAY, 21), TODAY).freezes).toBe(2);
  });

  it('spends a freeze to bridge one missed day', () => {
    // Seven days, then a gap, then today. The week earned the rest day.
    const days = { ...runEnding(addDays(TODAY, -2), 7), [TODAY]: day() };
    const streak = streakFrom(days, TODAY);
    expect(streak.current).toBe(8);
    expect(streak.frozenDays).toBe(1);
    expect(streak.freezes).toBe(0);
  });

  it('breaks when the missed day has not been earned', () => {
    // Three days is not a week, so there is nothing banked to spend.
    const days = { ...runEnding(addDays(TODAY, -2), 3), [TODAY]: day() };
    expect(streakFrom(days, TODAY).current).toBe(1);
  });

  it('breaks on two missed days however long the run was', () => {
    // A freeze covers a day off, not a fortnight away. Two consecutive misses
    // end it, or the streak stops meaning anything.
    const days = { ...runEnding(addDays(TODAY, -3), 21), [TODAY]: day() };
    expect(streakFrom(days, TODAY).current).toBe(1);
  });

  it('holds a streak live through yesterday, and through a covered gap', () => {
    expect(streakFrom(runEnding(addDays(TODAY, -1), 3), TODAY).live).toBe(true);
    // Two days ago with a freeze banked: still live, and the freeze is spent.
    const banked = streakFrom(runEnding(addDays(TODAY, -2), 7), TODAY);
    expect(banked.live).toBe(true);
    expect(banked.freezes).toBe(0);
    expect(banked.frozenDays).toBe(1);
    // Two days ago with nothing banked: over.
    expect(streakFrom(runEnding(addDays(TODAY, -2), 3), TODAY).live).toBe(false);
  });

  it('counts practised days only — a freeze preserves a streak, it does not pad it', () => {
    const days = { ...runEnding(addDays(TODAY, -2), 7), [TODAY]: day() };
    // Eight days practised across nine calendar days.
    expect(streakFrom(days, TODAY).current).toBe(8);
  });

  it('remembers the longest run even after it has been broken', () => {
    const old = runEnding('2026-07-01', 10);
    const recent = runEnding(TODAY, 2);
    const streak = streakFrom({ ...old, ...recent }, TODAY);
    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(10);
  });
});
