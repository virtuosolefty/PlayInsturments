/**
 * streaks.js — a reason to come back tomorrow.
 *
 * The evidence for this is real: daily practice is the single biggest
 * determinant of how quickly anyone improves at an instrument, which is why
 * every serious practice app tracks it. So the streak here is meant as
 * evidence, not decoration — and that only works if it is hard to fake.
 *
 * A day therefore counts only when you actually practised: one complete run, or
 * a few minutes at the keys. Opening the app earns nothing. It is the same
 * principle as the coverage guard on stars — a number that cannot go down is
 * not worth looking at.
 *
 * Pure date arithmetic, no storage and no clock of its own, so every edge
 * (midnight, gaps, a day with three sessions) is testable.
 */

/** Seconds of playing that make a day count on their own. */
export const DAY_SECONDS_THRESHOLD = 180;

/** Local calendar day, not UTC — practising at 11pm should count as today. */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return dayKey(date);
}

/** Whole days between two keys, positive when `later` is after `earlier`. */
export function daysBetween(earlier, later) {
  const [y1, m1, d1] = earlier.split('-').map(Number);
  const [y2, m2, d2] = later.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

/** Did enough happen on this day for it to count? */
export function dayCounts(entry) {
  if (!entry) return false;
  return (entry.completedRuns ?? 0) > 0 || (entry.seconds ?? 0) >= DAY_SECONDS_THRESHOLD;
}

/**
 * Rest days.
 *
 * A streak that dies on one missed Tuesday is a streak people abandon and never
 * restart, which is the opposite of what it is for. So a long run earns the
 * right to miss a day — but the right has to be *earned by the streak itself*,
 * or it is just a weaker streak with extra steps. One freeze per full week,
 * two held at most, and they are spent automatically on the gap they cover.
 */
const FREEZE_EVERY = 7;
const MAX_FREEZES = 2;

/**
 * Break the practised days into unbroken runs, bridging single-day gaps with a
 * banked freeze where one is available.
 */
function runsOf(counted) {
  const runs = [];
  let current = null;
  const start = (day) => ({ length: 1, banked: 0, frozen: 0, start: day, end: day });

  for (let i = 0; i < counted.length; i += 1) {
    const day = counted[i];
    if (!current) {
      current = start(day);
    } else {
      const gap = daysBetween(counted[i - 1], day);
      if (gap === 1) {
        current.length += 1;
        current.end = day;
      } else if (gap === 2 && current.banked > 0) {
        // One day missed, one freeze spent. The frozen day is not counted as
        // practice — the number stays a count of days you actually played.
        current.banked -= 1;
        current.frozen += 1;
        current.length += 1;
        current.end = day;
      } else {
        runs.push(current);
        current = start(day);
        continue;
      }
    }
    if (current.length % FREEZE_EVERY === 0) {
      current.banked = Math.min(MAX_FREEZES, current.banked + 1);
    }
  }

  if (current) runs.push(current);
  return runs;
}

/**
 * @param {object} days ledger keyed by day, `{ seconds, runs, completedRuns }`
 * @param {string} [today]
 * @returns {{current: number, longest: number, practisedToday: boolean,
 *   lastDay: string|null, freezes: number, frozenDays: number, live: boolean}}
 *   `current` still counts yesterday's streak as live during today — a streak
 *   should not appear broken at breakfast just because you have not played yet.
 */
export function streakFrom(days = {}, today = dayKey()) {
  const counted = Object.keys(days)
    .filter((key) => dayCounts(days[key]))
    .sort();
  if (!counted.length) {
    return {
      current: 0, longest: 0, practisedToday: false, lastDay: null,
      freezes: 0, frozenDays: 0, live: false,
    };
  }

  const runs = runsOf(counted);
  const longest = runs.reduce((best, run) => Math.max(best, run.length), 0);
  const latest = runs[runs.length - 1];
  const lastDay = counted[counted.length - 1];
  const sinceLast = daysBetween(lastDay, today);

  // Yesterday keeps it live for free. Two days ago keeps it live only if there
  // is a freeze banked to cover the day that was missed.
  const live = sinceLast <= 1 || (sinceLast === 2 && latest.banked > 0);

  return {
    current: live ? latest.length : 0,
    longest,
    practisedToday: sinceLast === 0,
    lastDay,
    /** Rest days in hand, after any spent bridging the gap to today. */
    freezes: live ? Math.max(0, latest.banked - (sinceLast === 2 ? 1 : 0)) : 0,
    /** Days this run survived on a freeze rather than on practice. */
    frozenDays: live ? latest.frozen + (sinceLast === 2 ? 1 : 0) : 0,
    live,
  };
}

/**
 * Minutes done today against the goal.
 * @returns {{minutes: number, goal: number, fraction: number, met: boolean}}
 */
export function todayProgress(days = {}, goalMinutes = 10, today = dayKey()) {
  const seconds = days[today]?.seconds ?? 0;
  const minutes = Math.floor(seconds / 60);
  const goal = Math.max(1, goalMinutes);
  return {
    minutes,
    goal,
    fraction: Math.max(0, Math.min(1, seconds / (goal * 60))),
    met: seconds >= goal * 60,
  };
}

/** Immutably fold one finished run into the ledger. */
export function recordDay(days = {}, { seconds = 0, complete = false, stars = 0 }, today = dayKey()) {
  const entry = days[today] ?? { seconds: 0, runs: 0, completedRuns: 0, bestStars: 0 };
  return {
    ...days,
    [today]: {
      seconds: Math.round(entry.seconds + Math.max(0, seconds)),
      runs: entry.runs + 1,
      completedRuns: entry.completedRuns + (complete ? 1 : 0),
      bestStars: Math.max(entry.bestStars ?? 0, stars ?? 0),
    },
  };
}
