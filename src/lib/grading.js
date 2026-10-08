/**
 * grading.js — turning a run into a verdict.
 *
 * The rating has to be worth chasing, which means it has to be capable of
 * being bad. Two things protect that:
 *
 *   - Wrong notes are weighted hardest. Playing the wrong pitch makes
 *     everything else moot, so no amount of good timing rescues it.
 *   - A run that stops a quarter of the way in is not graded at all. Without
 *     that guard, quitting the moment things go wrong would be the reliable
 *     way to a high score, which is the exact opposite of practising.
 *
 * Pure functions — no React, no storage — so every band and edge is testable.
 */

/**
 * Notes dominate; dynamics counts least on purpose. Mini controllers have
 * coarse velocity curves, so treating touch as equal to pitch would grade the
 * hardware rather than the player.
 */
export const WEIGHTS = { notes: 55, timing: 30, dynamics: 15 };

/** Below this share of the piece a run is reported but not rated. */
export const MIN_COVERAGE = 0.6;

/**
 * Timing and dynamics are ratios over the notes you actually hit, so they say
 * nothing useful when there are barely any. Two lucky notes struck at the
 * written velocity would otherwise read as "100% dynamics" and pull a run that
 * fell apart up towards a passing score. Below this many hits both are
 * reported as unmeasured and their weight moves onto the notes themselves.
 */
export const minHitsForDetail = (total) => Math.min(8, Math.max(1, Math.ceil((total ?? 0) * 0.5)));

/** Velocity spread at or above this reads as a completely uneven touch. */
const SPREAD_CEILING = 0.35;

const STAR_BANDS = [
  { min: 95, stars: 5, headline: 'Mastered' },
  { min: 85, stars: 4, headline: 'Strong run' },
  { min: 70, stars: 3, headline: 'Solid' },
  { min: 50, stars: 2, headline: 'Getting there' },
  { min: 0, stars: 1, headline: 'Keep at it' },
];

/** Truly silent: no target found and no key pressed at all. */
export const notPlayed = (summary) =>
  (summary?.hit ?? 0) === 0 && (summary?.wrongNotes ?? 0) === 0;

const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
const asPercent = (v) => Math.round(clamp01(v) * 100);

/**
 * How well the touch matched the score, blended with how even it was. A run at
 * a consistent weight scores respectably even if it sat below the written
 * level — evenness is the thing a learner can actually control.
 */
function dynamicsBand(summary) {
  if (!summary.hit) return 0;
  const matched = clamp01(summary.dynamicsAccuracy);
  const evenness = clamp01(1 - (summary.velocitySpread ?? 0) / SPREAD_CEILING);
  return asPercent(matched * 0.6 + evenness * 0.4);
}

/**
 * @param {object} summary from PracticeSession.summary
 * @param {object} [options]
 * @param {number} [options.coverage] 0..1 — how far into the piece the run got
 * @returns {{
 *   complete: boolean, coverage: number, stars: number, overall: number,
 *   bands: {notes: number, timing: number, dynamics: number},
 *   headline: string, blurb: string, weakest: string|null
 * }}
 */
export function gradeRun(summary, { coverage = 1, minCoverage = MIN_COVERAGE } = {}) {
  const s = summary ?? {};
  const measurable = (s.hit ?? 0) >= minHitsForDetail(s.total);
  const bands = {
    // `score` is note accuracy already penalised for extra notes, which is the
    // honest figure — hitting every target while spraying twice as many wrong
    // ones is not a clean run.
    notes: asPercent(s.score ?? s.noteAccuracy),
    // Unmeasured either way: too few notes to read, or a mode that never
    // timed them. Its weight falls back onto the notes.
    timing: measurable && s.timingAccuracy !== null ? asPercent(s.timingAccuracy) : null,
    dynamics: measurable ? dynamicsBand(s) : null,
  };

  // Unmeasured bands drop out of the average rather than counting as zero;
  // their weight falls back onto the notes.
  const scored = Object.entries(bands).filter(([, value]) => value !== null);
  const totalWeight = scored.reduce((sum, [key]) => sum + WEIGHTS[key], 0);
  const overall = Math.round(
    scored.reduce((sum, [key, value]) => sum + value * WEIGHTS[key], 0) / totalWeight,
  );

  const played = clamp01(coverage);
  const complete = played >= minCoverage && (s.hit ?? 0) > 0;

  if (!complete) {
    return {
      complete: false,
      coverage: played,
      stars: 0,
      overall,
      bands,
      headline: 'Incomplete run',
      // "Nothing was played" is only true if nothing was played. Told to
      // somebody who pressed six keys and got six of them wrong, it reads as
      // the app not having noticed them — which is the worst thing feedback
      // can do to a beginner who is already unsure they are being heard.
      blurb: notPlayed(s)
        ? 'Nothing was played, so there is nothing to score yet.'
        : (s.hit ?? 0) === 0
          ? `${s.wrongNotes} note${s.wrongNotes === 1 ? '' : 's'} played, none of them the written ones. Slow it right down and find the first few by ear.`
          : `You covered ${Math.round(played * 100)}% of the piece. Play it through to the end to earn a rating.`,
      weakest: weakestBand(bands),
    };
  }

  const band = STAR_BANDS.find((b) => overall >= b.min);
  return {
    complete: true,
    coverage: played,
    stars: band.stars,
    overall,
    bands,
    headline: band.headline,
    blurb: blurbFor(bands, overall),
    weakest: weakestBand(bands),
  };
}

/** Which measured band let the run down most — drives the advice. */
export function weakestBand(bands) {
  const entries = Object.entries(bands).filter(([, value]) => value !== null);
  if (!entries.length) return null;
  return entries.reduce((worst, entry) => (entry[1] < worst[1] ? entry : worst))[0];
}

const BAND_ADVICE = {
  notes: 'the notes themselves are what to fix — slow it right down until every pitch is right.',
  timing: 'the notes are there; it is the timing that needs work. Try it against the metronome.',
  dynamics: 'notes and timing are solid. Evening out your touch is what is left.',
};

function blurbFor(bands, overall) {
  if (overall >= 95) return 'Clean, in time and evenly played. Take it faster or move on.';
  // With too few hits to read timing or touch from, there is only one honest
  // thing to say — and saying "the notes are there" to someone who hit two of
  // forty-seven would be worse than saying nothing.
  const weakest = bands.timing === null ? 'notes' : weakestBand(bands);
  return `Overall ${overall}/100 — ${BAND_ADVICE[weakest]}`;
}

/**
 * Compare against the best previous run of the same arrangement.
 * @returns {{delta: number, isBest: boolean, previousBest: number|null}}
 */
export function compareToBest(overall, previousSessions = []) {
  const scored = previousSessions.map((s) => s.overall).filter((n) => Number.isFinite(n));
  if (!scored.length) return { delta: 0, isBest: true, previousBest: null };
  const best = Math.max(...scored);
  return { delta: overall - best, isBest: overall > best, previousBest: best };
}
