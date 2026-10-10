/**
 * The rules of the Path. Finishing a lesson opens the next one, however it was
 * played; an abandoned run opens nothing. Stars are kept apart from that: they
 * say how well a lesson is known, and only a timed run at the written speed
 * earns the ones that pass its check.
 */

import { describe, expect, it } from 'vitest';
import {
  BADGES,
  BENCHMARK_ID,
  DAILY_RUN_GOAL,
  MASTER_STARS,
  PASS_STARS,
  PATH_EXERCISES,
  RUNGS,
  STAGES,
  atTempo,
  badgeState,
  blockerHelp,
  benchmarkRuns,
  benchmarkTrend,
  dailyProgress,
  dailySet,
  exerciseState,
  pathState,
  qualifyingRuns,
  rungAt,
  troubleDecay,
} from './path.js';
import { daysBetween } from './streaks.js';

/** A recorded run, in the shape storage.js writes. */
const run = (over = {}) => ({
  at: '2026-01-01T10:00:00.000Z',
  stars: 4,
  overall: 88,
  rate: 1,
  mode: 'timed',
  variant: 'full',
  coverage: 1,
  meanAbsDeviationMs: 60,
  velocitySpread: 0.1,
  ...over,
});

/** History keyed by song, as a lookup the path walker can take. */
const historyOf = (map) => (id) => map[id] ?? [];

/** Every exercise up to and including `upTo`, mastered. */
const masteredThrough = (upTo) => {
  const map = {};
  for (const id of PATH_EXERCISES.slice(0, PATH_EXERCISES.indexOf(upTo) + 1)) {
    map[id] = [run({ stars: 5 })];
  }
  return map;
};

describe('the curriculum', () => {
  it('is fifteen exercises across five stages', () => {
    expect(STAGES).toHaveLength(5);
    expect(PATH_EXERCISES).toHaveLength(15);
    expect(new Set(PATH_EXERCISES).size).toBe(15);
  });

  it('gives every stage a recital piece to unlock', () => {
    for (const stage of STAGES) {
      expect(stage.recital).toBeTruthy();
      expect(stage.exercises.length).toBeGreaterThan(0);
    }
    // A recital reused across two stages would make the second one feel empty.
    const recitals = STAGES.map((s) => s.recital);
    expect(new Set(recitals).size).toBe(recitals.length);
  });

});

describe('what counts as a run', () => {
  it('ignores wait mode, which never measures timing', () => {
    // Wait mode stops the clock for you, so its grade is easier for the same
    // playing. Fine for learning a passage, wrong for being assessed on one.
    expect(qualifyingRuns([run({ mode: 'wait' })])).toHaveLength(0);
    expect(qualifyingRuns([run({ mode: 'timed' })])).toHaveLength(1);
  });

  it('ignores runs that earned no stars', () => {
    expect(qualifyingRuns([run({ stars: 0 })])).toHaveLength(0);
    expect(qualifyingRuns([run({ stars: null })])).toHaveLength(0);
  });

  it('survives junk in the ledger', () => {
    expect(qualifyingRuns([null, undefined, {}, run({ rate: undefined })])).toHaveLength(0);
  });
});

describe('what counts as playing it at speed', () => {
  // Exported rather than private since the star badges started asking the same
  // question. Two definitions of "at tempo" in one app is how the library came
  // to award five stars for a run at 60%.
  it('accepts the written speed and anything above it', () => {
    expect(atTempo(1)).toBe(true);
    expect(atTempo(1.5)).toBe(true);
  });

  it('rejects a run taken slower', () => {
    expect(atTempo(0.6)).toBe(false);
    expect(atTempo(0.95)).toBe(false);
  });

  it('allows the slack that stored, rounded rates need', () => {
    expect(atTempo(0.99)).toBe(true);
  });

  it('treats a missing rate as full speed, matching how runs were recorded before it was stored', () => {
    expect(atTempo(undefined)).toBe(true);
  });
});

describe('the tempo ladder', () => {
  it('places a run on the highest rung it reached', () => {
    expect(rungAt(1)).toBe(0);
    expect(rungAt(1.15)).toBe(1);
    expect(rungAt(1.3)).toBe(2);
    expect(rungAt(1.5)).toBe(3);
    expect(rungAt(0.7)).toBe(-1);
  });

  it('every rung is reachable on the speed slider, which steps by 0.05', () => {
    for (const rung of RUNGS) {
      expect(Math.round(rung.rate * 100) % 5).toBe(0);
      expect(rung.rate).toBeLessThanOrEqual(1.5);
    }
  });

  it('does not credit a rung faster than you actually played', () => {
    const state = exerciseState([run({ stars: 5, rate: 1.15 })]);
    expect(state.rungsCleared).toBe(2); // Tempo and Quick
    expect(state.nextRung.label).toBe('Brisk');
  });

  it('needs mastery, not a pass, to clear a rung', () => {
    expect(exerciseState([run({ stars: PASS_STARS, rate: 1 })]).rungsCleared).toBe(0);
    expect(exerciseState([run({ stars: MASTER_STARS, rate: 1 })]).rungsCleared).toBe(1);
  });
});

describe('finishing an exercise', () => {
  it('takes one complete run, in any mode and at any speed', () => {
    expect(exerciseState([run({ mode: 'wait', stars: 2 })]).finished).toBe(true);
    expect(exerciseState([run({ stars: 1, rate: 0.4 })]).finished).toBe(true);
    expect(exerciseState([run({ stars: 5 })]).finished).toBe(true);
  });

  it('is not earned by a run that was abandoned, or by junk in the ledger', () => {
    // An incomplete run is stored without stars.
    expect(exerciseState([run({ stars: 0 }), run({ stars: null }), run({ mode: 'wait', stars: null })]).finished).toBe(false);
    expect(exerciseState([null, undefined, {}]).finished).toBe(false);
    expect(exerciseState([]).finished).toBe(false);
  });

  it('says nothing about how well it was played', () => {
    const state = exerciseState([run({ mode: 'wait', stars: 5 })]);
    expect(state).toMatchObject({ finished: true, passed: false, mastered: false, bestStars: 0 });
  });
});

describe('passing an exercise', () => {
  it('takes three stars at tempo', () => {
    expect(exerciseState([run({ stars: 2 })]).passed).toBe(false);
    expect(exerciseState([run({ stars: 3 })]).passed).toBe(true);
  });

  it('does not accept three stars earned below tempo', () => {
    // Slowing down is how you learn it; it is not how you prove you know it.
    expect(exerciseState([run({ stars: 5, rate: 0.6 })]).passed).toBe(false);
  });

  it('keeps your best, not your latest', () => {
    const state = exerciseState([run({ stars: 5, overall: 96 }), run({ stars: 1, overall: 20 })]);
    expect(state.bestStars).toBe(5);
    expect(state.bestOverall).toBe(96);
    expect(state.passed).toBe(true);
  });

  it('reports nothing at all for an exercise never attempted', () => {
    const state = exerciseState([]);
    expect(state).toMatchObject({ attempts: 0, bestStars: 0, passed: false, mastered: false });
    expect(state.bestOverall).toBeNull();
  });
});

/**
 * Why a check has not been passed.
 *
 * Reported from a real one: fourteen complete runs of the first exercise at 95%
 * of the notes, the daily goal declared done, and the Path still reading 0/15
 * with no stars and no explanation anywhere. Every run had been in Wait for me,
 * which earns no stars on purpose. Those runs now open the next lesson, and the
 * app still says why they carry no stars.
 */
describe('why an exercise has not passed its check', () => {
  const waited = (n) => Array.from({ length: n }, () => run({ mode: 'wait', stars: 4 }));

  it('separates never played from played and never graded', () => {
    expect(exerciseState([]).blocker).toBe('none');
    expect(exerciseState([]).unassessed).toBe(0);

    const state = exerciseState(waited(14));
    expect(state.blocker).toBe('wait');
    expect(state.unassessed).toBe(14);
    // And the thing that made it invisible: nothing else in the state moves.
    expect(state.attempts).toBe(0);
    expect(state.bestStars).toBe(0);
  });

  it('says so when the playing was clean but slow', () => {
    expect(exerciseState([run({ stars: 5, rate: 0.7 })]).blocker).toBe('slow');
  });

  it('says so when it was at tempo but short of the stars', () => {
    expect(exerciseState([run({ stars: PASS_STARS - 1 })]).blocker).toBe('stars');
  });

  it('has nothing to explain once it passes', () => {
    const state = exerciseState([run({ stars: PASS_STARS })]);
    expect(state.passed).toBe(true);
    expect(state.blocker).toBeNull();
    expect(blockerHelp(state)).toBeNull();
  });

  it('counts the guided runs back to the player, and says what earns the stars', () => {
    const help = blockerHelp(exerciseState(waited(14)));
    expect(help).toMatch(/14 runs/);
    expect(help).toMatch(/Wait for me/);
    expect(help).toMatch(/Practice/);
  });

  it('never tells a player the next lesson is shut, because it is not', () => {
    const states = [exerciseState(waited(3)), exerciseState([run({ stars: 5, rate: 0.7 })]), exerciseState([run({ stars: 2 })])];
    for (const state of states) for (const short of [true, false]) {
      expect(blockerHelp(state, { short })).not.toMatch(/unlock|opens the next/i);
    }
  });

  it('has a shorter form, because both places that need it share a screen', () => {
    const entry = exerciseState(waited(14));
    const short = blockerHelp(entry, { short: true });
    expect(short).toMatch(/Wait for me/);
    expect(short.length).toBeLessThan(blockerHelp(entry).length);
    // Still the same situation being described, not a different claim.
    expect(short).toMatch(/14 runs/);
  });

  it('offers no advice where a padlock already says everything true', () => {
    expect(blockerHelp(exerciseState([]))).toBeNull();
    expect(blockerHelp(undefined)).toBeNull();
  });

  it('moves the work card on to the next lesson after guided runs, with nothing to explain', () => {
    // The daily set is the screen this was reported from. The fourteen runs finished the lesson.
    const state = pathState(historyOf({ [PATH_EXERCISES[0]]: waited(14) }));
    const work = dailySet(state, { dayKey: '2026-01-01', library: [] }).find((i) => i.kind === 'work');
    expect(work.songId).toBe(PATH_EXERCISES[1]);
    expect(work.note).toBeNull();
    expect(work.why).toMatch(/next one opens/);
  });

  it('puts the reason on the work card once the player comes back for the stars', () => {
    const everything = Object.fromEntries(PATH_EXERCISES.map((id) => [id, waited(2)]));
    const work = dailySet(pathState(historyOf(everything)), { dayKey: '2026-01-01', library: [] }).find((i) => i.kind === 'work');
    expect(work.songId).toBe(PATH_EXERCISES[0]);
    expect(work.note).toMatch(/Wait for me/);
    expect(work.why).toMatch(/passes its check/);
  });

  it('leaves the card unadorned when there is nothing to say', () => {
    const set = dailySet(pathState(historyOf({})), { dayKey: '2026-01-01', library: [] });
    expect(set.find((i) => i.kind === 'work').note).toBeNull();
  });
});

describe('unlocking', () => {
  const waited = (stars = 4) => [run({ mode: 'wait', stars })];

  it('opens only the first exercise to a new player', () => {
    const state = pathState(historyOf({}));
    expect(state.exercises[PATH_EXERCISES[0]].unlocked).toBe(true);
    expect(state.exercises[PATH_EXERCISES[1]].unlocked).toBe(false);
    expect(state.currentId).toBe(PATH_EXERCISES[0]);
  });

  it('opens the next exercise when the one before it is finished, however it was played', () => {
    for (const first of [waited(), [run({ stars: 1, rate: 0.5 })], [run({ stars: 3 })]]) {
      const state = pathState(historyOf({ [PATH_EXERCISES[0]]: first }));
      expect(state.exercises[PATH_EXERCISES[1]].unlocked).toBe(true);
      expect(state.exercises[PATH_EXERCISES[2]].unlocked).toBe(false);
      expect(state.currentId).toBe(PATH_EXERCISES[1]);
    }
  });

  it('opens the next stage once every lesson in this one is finished', () => {
    const finished = {};
    for (const id of STAGES[0].exercises.slice(0, 2)) finished[id] = waited();
    const before = pathState(historyOf(finished));
    expect(before.stages[0].finished).toBe(false);
    expect(before.stages[1].unlocked).toBe(false);

    finished[STAGES[0].exercises[2]] = waited();
    const after = pathState(historyOf(finished));
    expect(after.stages[0].finished).toBe(true);
    expect(after.stages[1].unlocked).toBe(true);
    expect(after.exercises[STAGES[1].exercises[0]].unlocked).toBe(true);
    expect(after.currentId).toBe(STAGES[1].exercises[0]);
  });

  it('keeps mastery of a stage apart from finishing it', () => {
    const passes = {};
    for (const id of STAGES[0].exercises) passes[id] = [run({ stars: PASS_STARS })];
    expect(pathState(historyOf(passes)).stages[0]).toMatchObject({ finished: true, cleared: false });

    const masteries = {};
    for (const id of STAGES[0].exercises) masteries[id] = [run({ stars: MASTER_STARS })];
    expect(pathState(historyOf(masteries)).stages[0]).toMatchObject({ finished: true, cleared: true });
  });

  it('hands over the recital piece when the stage is finished', () => {
    expect(pathState(historyOf({})).unlockedRecitals).toEqual([]);
    const finished = {};
    for (const id of STAGES[0].exercises) finished[id] = waited();
    expect(pathState(historyOf(finished)).unlockedRecitals).toEqual([STAGES[0].recital]);
  });

  it('cannot be advanced by starting runs and leaving them', () => {
    // A hundred incomplete runs of everything open precisely nothing.
    const grinding = {};
    for (const id of PATH_EXERCISES) grinding[id] = Array.from({ length: 100 }, () => run({ stars: 0 }));
    const state = pathState(historyOf(grinding));
    expect(state.finishedCount).toBe(0);
    expect(state.passedCount).toBe(0);
    expect(state.currentId).toBe(PATH_EXERCISES[0]);
    expect(state.exercises[PATH_EXERCISES[1]].unlocked).toBe(false);
  });

  it('counts lessons finished and checks passed separately', () => {
    const history = { [PATH_EXERCISES[0]]: [run({ stars: 4 })], [PATH_EXERCISES[1]]: waited() };
    expect(pathState(historyOf(history))).toMatchObject({ finishedCount: 2, passedCount: 1 });
  });

  it('sends a player who has finished everything back to the first check not yet passed', () => {
    const all = {};
    for (const id of PATH_EXERCISES) all[id] = waited();
    all[PATH_EXERCISES[0]] = [run({ stars: 4 })];
    const state = pathState(historyOf(all));
    expect(state.finishedCount).toBe(PATH_EXERCISES.length);
    expect(state.complete).toBe(false);
    expect(state.currentId).toBe(PATH_EXERCISES[1]);
  });

  it('reports completion once every exercise has passed', () => {
    const all = {};
    for (const id of PATH_EXERCISES) all[id] = [run({ stars: 5 })];
    const state = pathState(historyOf(all));
    expect(state.complete).toBe(true);
    expect(state.currentId).toBeNull();
    expect(state.unlockedRecitals).toHaveLength(5);
  });
});

describe('the daily set', () => {
  const library = PATH_EXERCISES.map((id) => ({ id, title: id.toUpperCase() }));

  it('opens with work when there is nothing mastered to warm up on', () => {
    const set = dailySet(pathState(historyOf({})), { dayKey: '2026-01-01', library });
    expect(set[0].kind).toBe('work');
    expect(set.map((x) => x.kind)).not.toContain('warmup');
  });

  it('leads with a warm-up once something has been mastered', () => {
    const state = pathState(historyOf(masteredThrough(PATH_EXERCISES[1])));
    const set = dailySet(state, { dayKey: '2026-01-01', library });
    expect(set[0].kind).toBe('warmup');
    expect(set.map((x) => x.kind)).toEqual(['warmup', 'work', 'preview']);
  });

  it('picks the same warm-up all day and a different one tomorrow', () => {
    const state = pathState(historyOf(masteredThrough(PATH_EXERCISES[5])));
    const monday = dailySet(state, { dayKey: '2026-01-05', library })[0].songId;
    expect(dailySet(state, { dayKey: '2026-01-05', library })[0].songId).toBe(monday);
    const week = new Set(
      ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'].map(
        (d) => dailySet(state, { dayKey: d, library })[0].songId,
      ),
    );
    expect(week.size).toBeGreaterThan(1);
  });

  it('ends on the earned recital', () => {
    const state = pathState(historyOf(masteredThrough(STAGES[0].exercises[2])));
    const set = dailySet(state, { dayKey: '2026-01-01', library });
    expect(set[set.length - 1]).toMatchObject({ kind: 'recital', songId: STAGES[0].recital });
  });

  it('counts graded runs rather than minutes', () => {
    // Minutes reward leaving the app open; runs reward playing.
    expect(dailyProgress({ '2026-01-01': { completedRuns: 2 } }, '2026-01-01')).toMatchObject({
      done: 2, goal: DAILY_RUN_GOAL, met: false,
    });
    expect(dailyProgress({ '2026-01-01': { completedRuns: 3 } }, '2026-01-01').met).toBe(true);
    expect(dailyProgress({}, '2026-01-01').done).toBe(0);
  });
});

describe('the benchmark', () => {
  const at = (day) => `${day}T10:00:00.000Z`;

  it('is a fixed exercise at a fixed tempo', () => {
    expect(PATH_EXERCISES).toContain(BENCHMARK_ID);
  });

  it('excludes runs at any other tempo, which would not be comparable', () => {
    const runs = benchmarkRuns([run({ rate: 1 }), run({ rate: 1.3 }), run({ rate: 0.7 })]);
    expect(runs).toHaveLength(1);
  });

  it('excludes runs of a different arrangement', () => {
    expect(benchmarkRuns([run({ variant: 'fold' })])).toHaveLength(0);
  });

  it('reports improvement in milliseconds, which cannot be inflated', () => {
    const trend = benchmarkTrend([
      run({ at: at('2026-01-01'), overall: 62, meanAbsDeviationMs: 137 }),
      run({ at: at('2026-03-01'), overall: 88, meanAbsDeviationMs: 44 }),
    ]);
    expect(trend.overallDelta).toBe(26);
    expect(trend.driftDelta).toBe(-93); // negative is closer to the beat
    expect(trend.driftMs).toBe(44);
    expect(trend.points).toHaveLength(2);
  });

  it('says nothing at all from a single run', () => {
    expect(benchmarkTrend([run()])).toBeNull();
    expect(benchmarkTrend([])).toBeNull();
  });

  it('orders by date, not by the order runs happened to be stored', () => {
    const trend = benchmarkTrend([
      run({ at: at('2026-03-01'), overall: 88 }),
      run({ at: at('2026-01-01'), overall: 62 }),
    ]);
    expect(trend.first.overall).toBe(62);
    expect(trend.latest.overall).toBe(88);
  });

});

describe('trouble decay', () => {
  it('calls a spot clean once three runs have passed without it', () => {
    const map = {
      '1.00': { lastRun: 2 },
      '2.00': { lastRun: 9 },
      '3.00': { lastRun: 7 },
    };
    expect(troubleDecay(map, 10)).toMatchObject({ total: 3, healed: 2, open: 1 });
  });

  it('does not credit spots recorded before healing was tracked', () => {
    // No `lastRun` means we cannot tell, and guessing in the player's favour
    // would turn the most persuasive indicator into the least trustworthy one.
    expect(troubleDecay({ '1.00': { missed: 3 } }, 50).healed).toBe(0);
  });

  it('is empty rather than undefined for a piece with no trouble', () => {
    expect(troubleDecay({}, 0)).toMatchObject({ total: 0, healed: 0, fraction: 0 });
  });
});

describe('badges', () => {
  const runsOf = (map) => (id) => map[id] ?? [];

  it('reports the unearned ones too, since those are the goals', () => {
    const badges = badgeState({ state: pathState(historyOf({})), runsOf: () => [] });
    expect(badges).toHaveLength(BADGES.length);
    expect(badges.every((b) => !b.earned)).toBe(true);
  });

  it('gives Even Hand for an even touch, not for a good score', () => {
    const loose = badgeState({
      state: pathState(historyOf({})),
      runsOf: runsOf({ [BENCHMARK_ID]: [run({ stars: 5, velocitySpread: 0.2 })] }),
    });
    expect(loose.find((b) => b.id === 'even-hand').earned).toBe(false);

    const even = badgeState({
      state: pathState(historyOf({})),
      runsOf: runsOf({ [BENCHMARK_ID]: [run({ stars: 4, velocitySpread: 0.05 })] }),
    });
    expect(even.find((b) => b.id === 'even-hand').earned).toBe(true);
  });

  it('gives Metronome for milliseconds, not for repetitions', () => {
    const many = Array.from({ length: 50 }, () => run({ meanAbsDeviationMs: 120 }));
    const grind = badgeState({ state: pathState(historyOf({})), runsOf: runsOf({ [BENCHMARK_ID]: many }) });
    expect(grind.find((b) => b.id === 'metronome').earned).toBe(false);

    const tight = badgeState({
      state: pathState(historyOf({})),
      runsOf: runsOf({ [BENCHMARK_ID]: [run({ meanAbsDeviationMs: 38 })] }),
    });
    expect(tight.find((b) => b.id === 'metronome').earned).toBe(true);
  });

  it('gives Unshakeable to a long streak and Graduate to a finished path', () => {
    const all = {};
    for (const id of PATH_EXERCISES) all[id] = [run({ stars: 5 })];
    const badges = badgeState({
      state: pathState(historyOf(all)),
      runsOf: runsOf(all),
      streak: { longest: 30, current: 30 },
    });
    expect(badges.find((b) => b.id === 'unshakeable').earned).toBe(true);
    expect(badges.find((b) => b.id === 'graduate').earned).toBe(true);
  });

  it('survives a badge whose data is not there yet', () => {
    expect(() => badgeState({ state: pathState(historyOf({})) })).not.toThrow();
  });
});
