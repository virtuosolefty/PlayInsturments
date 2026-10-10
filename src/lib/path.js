/**
 * path.js — the curriculum, and the rules that let you through it.
 *
 * Two things are kept apart here. **Finishing a lesson opens the next one**:
 * one complete run, guided or timed, at any speed. **Stars say how well it is
 * known**: three at the written tempo pass its check, four master it, and
 * neither is ever given for a guided or a slowed run.
 *
 * Until October 2026 the next lesson waited on those stars, so that turning up
 * could never stand in for skill. It kept that promise and lost beginners at
 * the first gate: someone who had played a lesson through, with the notes
 * waiting for them, was told to come back when they could play it in time.
 * Opening the door on a finished run costs the stars nothing, because the
 * stars still have to be earned the old way.
 *
 * The second decision is that the reward for finishing a stage is a real piece
 * from the library rather than a trophy. Nineteen pieces given away at once is
 * a list; the same nineteen earned one at a time is a repertoire.
 *
 * Pure — takes session arrays and returns verdicts. No storage, no clock of its
 * own, so every threshold and edge is testable.
 */

/** Stars, at the written tempo, needed to pass an exercise's check. */
export const PASS_STARS = 3;
/** Stars needed to master it — clears a tempo rung and counts toward mastering the stage. */
export const MASTER_STARS = 4;

/**
 * The tempo ladder. Rung 0 is the piece as written; the rest are the ladder you
 * climb once it is clean. All four land on the speed slider's 0.05 step.
 */
export const RUNGS = [
  { rate: 1, label: 'Tempo' },
  { rate: 1.15, label: 'Quick' },
  { rate: 1.3, label: 'Brisk' },
  { rate: 1.5, label: 'Fast' },
];

/** Rates are stored rounded, so comparisons need a little slack. */
const RATE_SLACK = 0.02;

/**
 * Was this run played at the piece's written speed or above?
 *
 * The one question that decides whether a result counts as playing the piece or
 * as working towards it. It lived here as a filter inside `exerciseState`, and
 * the star badges in the library answered it differently by not asking it at
 * all — so it is a named export now, and there is one definition of "at tempo"
 * in the app.
 */
export const atTempo = (rate) => (rate ?? 1) >= 1 - RATE_SLACK;

/**
 * Five stages. `recital` is the library piece unlocked by clearing the stage —
 * the reason any of the exercises are worth doing.
 */
export const STAGES = [
  {
    id: 'hand',
    name: 'The Hand',
    goal: 'The hand knows where it is without being looked at.',
    exercises: ['path-01-home-five-right', 'path-02-home-five-left', 'path-03-mirror-hands'],
    recital: 'ode-to-joy-mini',
  },
  {
    id: 'pulse',
    name: 'The Pulse',
    goal: 'The beat comes from inside, not from chasing the falling note.',
    exercises: ['path-04-finger-ladders', 'path-05-long-and-short', 'path-06-the-anchor'],
    recital: 'twinkle-mini',
  },
  {
    id: 'thumb',
    name: 'The Thumb',
    goal: 'Scales, which means solving the thumb.',
    exercises: ['path-07-thumb-crossing', 'path-08-scale-right', 'path-09-scale-together'],
    recital: 'fur-elise-mini',
  },
  {
    id: 'chord',
    name: 'The Chord',
    goal: 'Harmony, and a touch you control.',
    exercises: ['path-10-broken-triads', 'path-11-block-chords', 'path-12-loud-and-soft'],
    recital: 'amazing-grace',
  },
  {
    id: 'page',
    name: 'The Page',
    goal: 'Reading, which is the skill that outlives the app.',
    exercises: ['path-13-steps-and-skips', 'path-14-landmarks', 'path-15-melody-and-hold'],
    recital: 'greensleeves',
  },
];

/** Every exercise id in curriculum order. */
export const PATH_EXERCISES = STAGES.flatMap((s) => s.exercises);

/* ------------------------------------------------------------- one exercise */

/**
 * Runs that are assessed: the ones stars, checks and tempo rungs are read from.
 *
 * Wait mode is excluded on purpose: it stops the clock for you, so timing is
 * never measured and its weight falls onto the notes — an easier grade for the
 * same playing. It is the right way to learn a passage and the wrong way to be
 * assessed on one. Incomplete runs carry no stars and are excluded with it.
 */
export function qualifyingRuns(sessions = []) {
  return sessions.filter(
    (s) => s && s.mode !== 'wait' && Number.isFinite(s.stars) && s.stars > 0 && Number.isFinite(s.rate),
  );
}

/**
 * Complete runs the rule above throws away.
 *
 * Kept rather than merely excluded, because "you have not played this" and "you
 * have played this fourteen times in Wait for me" are entirely different
 * situations and the app used to say the same nothing to both — while the daily
 * counter cheerfully counted all fourteen and the end-of-run report handed out
 * four stars for them. They finish the lesson, which opens the next one; they
 * earn no stars, and `blockerHelp` says why.
 */
function unassessedRuns(sessions = []) {
  return (sessions ?? []).filter(
    (s) => s && s.mode === 'wait' && Number.isFinite(s.stars) && s.stars > 0,
  );
}

/** @returns {'none'|'wait'|'slow'|'stars'|null} null once the exercise passes. */
function blockerOf(passed, runs, fullSpeed, unassessed) {
  if (passed) return null;
  if (!runs.length) return unassessed.length ? 'wait' : 'none';
  if (!fullSpeed.length) return 'slow';
  return 'stars';
}

/**
 * What is actually standing between this exercise and its check being passed.
 * It never stands between the player and the next lesson: finishing a run
 * opens that, and nothing here may say otherwise.
 *
 * One function so the Path list, the daily work card and the end-of-run report
 * cannot describe the same situation three different ways. Returns null when
 * there is nothing to explain — including for an exercise nobody has attempted,
 * where a title already says everything true.
 *
 * Two lengths, because both places that need this are on screen together and
 * the same paragraph printed twice reads as a rendering fault. The card carries
 * the fact, the row beside the padlock carries the fix.
 *
 * @param {object} entry from `exerciseState`
 * @param {{short?: boolean}} [opts]
 * @returns {string|null}
 */
export function blockerHelp(entry, { short = false } = {}) {
  const runs = (n) => `${n} run${n === 1 ? '' : 's'}`;
  switch (entry?.blocker) {
    case 'wait':
      return short
        ? `${runs(entry.unassessed)} saved in Wait for me. Guided practice finishes the lesson; it earns no stars.`
        : `${runs(entry.unassessed)} saved in Wait for me. You received feedback on notes and touch; timing was not assessed, so there are no stars yet. Earn ${PASS_STARS} in Practice at 100% speed to pass the check.`;
    case 'slow':
      return short
        ? `Best so far is ${entry.bestStars} of 5, but below the written tempo.`
        : `Best so far is ${entry.bestStars} of 5, but below the written tempo. ${PASS_STARS} stars at 100% speed passes the check.`;
    case 'stars':
      return short
        ? `Best so far is ${entry.bestStars} of 5 at tempo, and ${PASS_STARS} passes the check.`
        : `Best so far is ${entry.bestStars} of 5 at tempo, and ${PASS_STARS} passes the check. The rating is notes, timing and touch together, so clean notes on their own may not reach it.`;
    default:
      return null;
  }
}

/** Highest rung whose tempo this run met or beat. -1 if it was below tempo. */
export function rungAt(rate) {
  let index = -1;
  RUNGS.forEach((rung, i) => {
    if (rate >= rung.rate - RATE_SLACK) index = i;
  });
  return index;
}

/**
 * @param {Array} sessions every recorded run of this exercise
 * @returns {{
 *   attempts: number, unassessed: number, finished: boolean, bestStars: number,
 *   bestOverall: number|null, passed: boolean, mastered: boolean,
 *   rungsCleared: number, nextRung: object|null,
 *   blocker: 'none'|'wait'|'slow'|'stars'|null
 * }} `finished` is one complete run of any kind, which is what opens the next exercise
 */
export function exerciseState(sessions = []) {
  const runs = qualifyingRuns(sessions);
  const unassessed = unassessedRuns(sessions);
  const fullSpeed = runs.filter((s) => atTempo(s.rate));

  const bestStars = runs.reduce((best, s) => Math.max(best, s.stars), 0);
  const overalls = runs.map((s) => s.overall).filter(Number.isFinite);

  // A rung is cleared by a mastered run at that tempo or faster. Counted from
  // the bottom up: clearing "Fast" implies you could clear "Tempo", but the
  // ladder should never show a gap it cannot explain.
  let rungsCleared = 0;
  for (let i = 0; i < RUNGS.length; i += 1) {
    const cleared = runs.some((s) => s.stars >= MASTER_STARS && rungAt(s.rate) >= i);
    if (!cleared) break;
    rungsCleared = i + 1;
  }

  const passed = fullSpeed.some((s) => s.stars >= PASS_STARS);

  return {
    attempts: runs.length,
    unassessed: unassessed.length,
    // Only a complete run is stored with stars, so either list holding one means the lesson was played through.
    finished: runs.length + unassessed.length > 0,
    bestStars,
    bestOverall: overalls.length ? Math.max(...overalls) : null,
    passed,
    mastered: fullSpeed.some((s) => s.stars >= MASTER_STARS),
    rungsCleared,
    nextRung: RUNGS[rungsCleared] ?? null,
    blocker: blockerOf(passed, runs, fullSpeed, unassessed),
  };
}

/* ------------------------------------------------------------- the whole path */

/**
 * Walk the curriculum against recorded history.
 *
 * @param {(songId: string) => Array} sessionsFor returns every run of a song
 * @returns {{
 *   stages: Array, exercises: object, currentId: string|null,
 *   unlockedRecitals: string[], finishedCount: number, passedCount: number, total: number, complete: boolean
 * }} `currentId` is the lesson to work on: the first one open and unfinished, or, once every lesson is finished,
 *   the first whose check has not been passed. A stage is `finished` when every lesson in it is, and `cleared`
 *   when every one is mastered.
 */
export function pathState(sessionsFor, curriculum = STAGES) {
  const exercises = {};
  const stages = [];
  const unlockedRecitals = [];

  let stageUnlocked = true;

  for (const stage of curriculum) {
    // The first exercise of an unlocked stage is open; after that each one waits
    // on the one before it being finished.
    let previousFinished = true;
    const entries = stage.exercises.map((id) => {
      const state = exerciseState(sessionsFor(id) ?? []);
      const unlocked = stageUnlocked && previousFinished;
      previousFinished = state.finished;
      const entry = { id, ...state, unlocked, stageId: stage.id };
      exercises[id] = entry;
      return entry;
    });

    const finished = entries.every((e) => e.finished);
    if (finished && stage.recital) unlockedRecitals.push(stage.recital);

    stages.push({
      ...stage,
      unlocked: stageUnlocked,
      finished,
      cleared: entries.every((e) => e.mastered),
      entries,
      passedCount: entries.filter((e) => e.passed).length,
    });

    // The next stage opens when every lesson in this one has been played through.
    stageUnlocked = stageUnlocked && finished;
  }

  const all = Object.values(exercises);
  const passedCount = all.filter((e) => e.passed).length;
  const open = all.filter((e) => e.unlocked);
  const currentId = (open.find((e) => !e.finished) ?? open.find((e) => !e.passed))?.id ?? null;
  return {
    stages,
    exercises,
    currentId,
    unlockedRecitals,
    finishedCount: all.filter((e) => e.finished).length,
    passedCount,
    total: curriculum.flatMap(s => s.exercises).length,
    complete: passedCount === curriculum.flatMap(s => s.exercises).length,
  };
}

/* ------------------------------------------------------------- the daily set */

/** Graded runs a day needs before its goal is met. */
export const DAILY_RUN_GOAL = 3;

/**
 * A stable pick from a list for a given day. Deterministic so the warm-up does
 * not reshuffle every time React re-renders — the set is a plan for the day,
 * not a slot machine.
 */
function pickForDay(items, dayKey) {
  if (!items.length) return null;
  let hash = 0;
  for (const ch of String(dayKey)) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  return items[hash % items.length];
}

/**
 * Four items, fifteen to twenty-five minutes: something you can already do,
 * the thing you are working on, a look at what is next, and a piece of music.
 *
 * @returns {Array<{kind: string, songId: string, label: string, why: string}>}
 */
export function dailySet(state, { dayKey = '', library = [] } = {}) {
  const set = [];
  const titleOf = (id) => library.find((s) => s.id === id)?.title ?? id;

  const exerciseIds = Object.keys(state.exercises);
  const mastered = exerciseIds.filter((id) => state.exercises[id]?.mastered);
  const warmUp = pickForDay(mastered, dayKey);
  if (warmUp) {
    set.push({
      kind: 'warmup',
      songId: warmUp,
      label: titleOf(warmUp),
      why: 'Warm up on something you have already mastered.',
    });
  }

  if (state.currentId) {
    set.push({
      kind: 'work',
      songId: state.currentId,
      label: titleOf(state.currentId),
      why: state.exercises[state.currentId]?.finished
        ? `You have played this one through — ${PASS_STARS} stars at tempo passes its check.`
        : 'Your current lesson — play it through and the next one opens.',
      // Only once there is something specific to say. "Play it well" under a
      // card that already says "3 stars at tempo" is noise; "all fourteen of
      // your runs were in a mode that is never graded" is the whole answer.
      note: blockerHelp(state.exercises[state.currentId], { short: true }),
    });

    // The exercise after the current one, previewed before it is assessed.
    const index = exerciseIds.indexOf(state.currentId);
    const next = exerciseIds[index + 1];
    if (next) {
      set.push({
        kind: 'preview',
        songId: next,
        label: titleOf(next),
        why: 'A look at what comes next. Nothing is riding on this one.',
      });
    }
  }

  const recital = state.unlockedRecitals[state.unlockedRecitals.length - 1];
  if (recital) {
    set.push({
      kind: 'recital',
      songId: recital,
      label: titleOf(recital),
      why: 'You earned this. Play it for the sake of playing it.',
    });
  }

  return set;
}

/** Graded runs done today against the daily goal. */
export function dailyProgress(days = {}, dayKey, goal = DAILY_RUN_GOAL) {
  const done = days[dayKey]?.completedRuns ?? 0;
  return { done, goal, met: done >= goal, fraction: Math.max(0, Math.min(1, done / goal)) };
}

/* --------------------------------------------------------------- benchmark */

/** The fixed exercise, at the fixed tempo, that proves the whole thing works. */
export const BENCHMARK_ID = 'path-08-scale-right';

/**
 * Benchmark runs only. Same piece, same tempo, same arrangement — anything else
 * would make the chart a comparison between different things, which is exactly
 * the trick this is meant to avoid.
 */
export function benchmarkRuns(sessions = []) {
  return qualifyingRuns(sessions)
    .filter((s) => Math.abs(s.rate - 1) <= RATE_SLACK && (s.variant ?? 'full') === 'full')
    .slice()
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/**
 * Improvement across the benchmark, in units nobody can argue with.
 *
 * `driftMs` is the headline: milliseconds are a physical quantity, not a point
 * score, so "±137 ms then, ±44 ms now" cannot be inflated by playing more.
 *
 * @returns {null|{runs: number, first: object, latest: object,
 *   overallDelta: number, driftDelta: number, driftMs: number}}
 */
export function benchmarkTrend(sessions = []) {
  const runs = benchmarkRuns(sessions);
  if (runs.length < 2) return null;
  const first = runs[0];
  const latest = runs[runs.length - 1];
  return {
    runs: runs.length,
    first,
    latest,
    overallDelta: (latest.overall ?? 0) - (first.overall ?? 0),
    // Negative is improvement: you are closer to the beat than you were.
    driftDelta: (latest.meanAbsDeviationMs ?? 0) - (first.meanAbsDeviationMs ?? 0),
    driftMs: latest.meanAbsDeviationMs ?? 0,
    points: runs.map((r) => ({ at: r.at, overall: r.overall ?? 0, driftMs: r.meanAbsDeviationMs ?? 0 })),
  };
}

/* ------------------------------------------------------------ trouble decay */

/** A spot is called clean once this many runs have passed without it recurring. */
const DECAY_RUNS = 3;

/**
 * How many of your recorded trouble spots have gone quiet.
 *
 * The most persuasive of the four progress indicators, because it is specific
 * to this player's own hands rather than to a curriculum: "you used to fumble
 * these twenty-three places, sixteen of them are now clean".
 *
 * @param {object} troubleMap from storage — entries carry `lastRun`
 * @param {number} totalRuns runs recorded against the piece so far
 */
export function troubleDecay(troubleMap = {}, totalRuns = 0) {
  const spots = Object.values(troubleMap);
  // Entries recorded before `lastRun` existed cannot be judged either way, so
  // they are counted as still open rather than silently credited as healed.
  const healed = spots.filter(
    (s) => Number.isFinite(s.lastRun) && totalRuns - s.lastRun >= DECAY_RUNS,
  );
  return {
    total: spots.length,
    healed: healed.length,
    open: spots.length - healed.length,
    fraction: spots.length ? healed.length / spots.length : 0,
  };
}

/* ----------------------------------------------------------------- badges */

/**
 * Tied to measured thresholds, never to volume. A badge you get for showing up
 * is a participation medal; these all require something to have gone right.
 */
export const BADGES = [
  {
    id: 'first-rung',
    name: 'First Rung',
    how: 'Pass your first exercise',
    test: ({ state }) => state.passedCount >= 1,
  },
  {
    id: 'even-hand',
    name: 'Even Hand',
    how: 'Velocity spread under 0.06 across a scale',
    test: ({ runsOf }) =>
      runsOf('path-08-scale-right').some((s) => (s.velocitySpread ?? 1) <= 0.06 && s.stars >= PASS_STARS),
  },
  {
    id: 'metronome',
    name: 'Metronome',
    how: 'Average within 40 ms of the beat across a full run',
    test: ({ allRuns }) =>
      allRuns.some((s) => Number.isFinite(s.meanAbsDeviationMs) && s.meanAbsDeviationMs <= 40 && s.stars >= PASS_STARS),
  },
  {
    id: 'thumb-under',
    name: 'Thumb Under',
    how: 'Master Thumb Crossing at the Brisk rung',
    test: ({ state }) => (state.exercises['path-07-thumb-crossing']?.rungsCleared ?? 0) >= 3,
  },
  {
    id: 'both-hands',
    name: 'Both Hands',
    how: 'Master the hands-together scale',
    test: ({ state }) => Boolean(state.exercises['path-09-scale-together']?.mastered),
  },
  {
    id: 'sight-reader',
    name: 'Sight Reader',
    how: 'Pass Landmark Notes',
    test: ({ state }) => Boolean(state.exercises['path-14-landmarks']?.passed),
  },
  {
    id: 'unshakeable',
    name: 'Unshakeable',
    how: 'A 30-day streak',
    test: ({ streak }) => (streak?.longest ?? 0) >= 30,
  },
  {
    id: 'graduate',
    name: 'Graduate',
    how: 'Clear all five stages',
    test: ({ state }) => state.stages.every((s) => s.cleared),
  },
];

/**
 * @param {object} context {state, runsOf, streak}
 * @returns {Array} every badge, each marked earned or not — the unearned ones
 *   are the point, since a badge you cannot see is not a goal.
 */
export function badgeState({ state, runsOf = () => [], streak = null }) {
  const allRuns = PATH_EXERCISES.flatMap((id) => qualifyingRuns(runsOf(id)));
  const context = { state, runsOf: (id) => qualifyingRuns(runsOf(id)), allRuns, streak };
  return BADGES.map((badge) => {
    let earned = false;
    try {
      earned = Boolean(badge.test(context));
    } catch {
      earned = false;
    }
    return { ...badge, earned };
  });
}
