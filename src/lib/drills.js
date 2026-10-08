/**
 * drills.js — an exercise built out of your own mistakes.
 *
 * The practice report already says which bars fall apart, and the trouble map
 * in storage.js has been accumulating that across every run of a piece. Until
 * now it only lit up bands on the roll and offered a four-bar loop. This turns
 * it into an actual study: the passages you keep fumbling, cut out of the
 * piece, each approached from the bar before so you arrive in context, played
 * twice, and separated by a bar of silence so one does not run into the next.
 *
 * Every competitor lets you loop a section you pick yourself. None of them
 * assembles one from what you have actually been getting wrong, which is odd,
 * because it is the obvious use of the data.
 *
 * Pure — takes a score and a trouble list, returns a score.
 */

import { renotate, sliceScore } from './score.js';
import { barAt, secondsPerBar } from './passages.js';

const DRILL_DEFAULTS = {
  /** How many separate problem spots to include. */
  segments: 3,
  /** Times through each passage before moving to the next. */
  reps: 2,
  /** Bars of run-up before the problem bar, so you arrive in context. */
  approachBars: 1,
  /** Bars of silence between one passage and the next. */
  gapBars: 1,
};

/** A drill's id is derived, so its runs never mix with the parent's record. */
export const drillIdFor = (songId) => `drill:${songId}`;

/**
 * @param {object} score the piece the trouble was recorded against
 * @param {Array} troubleSpots from getTroubleSpots — weighted, worst first
 * @param {object} [options] see DRILL_DEFAULTS
 * @returns {object|null} a playable score, or null when there is nothing worth
 *   drilling
 */
export function drillFrom(score, troubleSpots = [], options = {}) {
  if (!score?.notes?.length || !troubleSpots.length) return null;
  const { segments, reps, approachBars, gapBars } = { ...DRILL_DEFAULTS, ...options };

  const barSec = secondsPerBar(score);
  const lastBar = barAt(Math.max(0, score.duration - 1e-4), score);

  // Worst first, collapsed onto bars — several spots inside one bar are one
  // problem, not three.
  const byBar = new Map();
  for (const spot of troubleSpots) {
    const bar = barAt(Math.max(0, spot.time), score);
    byBar.set(bar, (byBar.get(bar) ?? 0) + (spot.weight ?? 1));
  }

  const chosen = [...byBar.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, segments)
    .map(([bar]) => bar)
    .sort((a, b) => a - b);

  // Adjacent bars are one longer passage rather than two abrupt ones.
  const ranges = [];
  for (const bar of chosen) {
    const from = Math.max(1, bar - approachBars);
    const to = Math.min(lastBar, bar);
    const previous = ranges[ranges.length - 1];
    if (previous && from <= previous.to + 1) previous.to = Math.max(previous.to, to);
    else ranges.push({ from, to });
  }

  const notes = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = (range.from - 1) * barSec;
    const end = range.to * barSec;
    const slice = sliceScore(score, start, end).notes;
    if (!slice.length) continue;

    const span = Math.max(end - start, barSec);
    for (let rep = 0; rep < Math.max(1, reps); rep += 1) {
      for (const note of slice) notes.push({ ...note, time: note.time + cursor });
      cursor += span;
    }
    cursor += gapBars * barSec;
  }

  if (!notes.length) return null;

  const label = ranges
    .map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`))
    .join(', ');

  return {
    ...renotate(score, notes),
    id: drillIdFor(score.id),
    title: `Trouble spots — ${score.title}`,
    composer: `bar${ranges.length === 1 && ranges[0].from === ranges[0].to ? '' : 's'} ${label}, ${reps}× each`,
    /** Lets the UI offer a way back to the piece this came from. */
    drillOf: { id: score.id, title: score.title },
  };
}

