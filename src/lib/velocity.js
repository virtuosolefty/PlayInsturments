/**
 * velocity.js — how hard you actually hit the key.
 *
 * The app grades your touch: dynamics is 15% of the star score, and every note
 * is judged by comparing the velocity your controller reported against the one
 * written in the score. That comparison assumes the two are in the same units,
 * and on a MIDI controller they are not.
 *
 * Every controller has its own velocity curve, and cheap ones have brutal
 * curves. A 25-key mini controller with short unweighted keys typically cannot
 * reach the bottom of the range at all — play as softly as you physically can
 * and it still reports 40 or 50 — and it saturates near the top long before
 * you are actually playing loudly. Judged raw, that reads as a player who
 * thumps everything and cannot shade a phrase, which is a fact about the
 * hardware and not about them.
 *
 * `grading.js` has always known this. Its comment on WEIGHTS says so directly,
 * and its answer was to care less about touch — dynamics weighted down to 15%
 * so the hardware could not do too much damage. That is a workaround for a
 * missing measurement, and it is the same workaround for someone on a weighted
 * 88-key stage piano, whose touch is worth listening to.
 *
 * Every serious piano plug-in solves this properly with a velocity curve, and
 * puts a Calibration button under it. This is that: play softly, normally and
 * hard, and the app measures the range your hands and your hardware actually
 * produce together, then maps it onto the range the score is written in.
 *
 * Pure functions only, so the maths is testable without a keyboard.
 */

/** Fewer notes than this in a pass and the median is not worth trusting. */
export const MIN_NOTES_PER_PASS = 4;

/**
 * The three passes have to come out in order and far enough apart to describe
 * a range. Someone who hammers all three has not calibrated anything, and
 * storing that curve would make the grading worse than leaving it alone — the
 * one outcome worth engineering against.
 */
const MIN_SPREAD = 0.12;

/**
 * Where each pass should land once corrected.
 *
 * Roughly piano, mezzo-forte and fortissimo. Not 0 and 1 at the ends: your
 * softest possible note is not silence and your hardest is not the loudest
 * sound a piano can make, so pinning them there would stretch the middle —
 * where nearly all playing happens — into a nearly flat line.
 */
export const TARGETS = { soft: 0.25, normal: 0.55, hard: 0.85 };

/** No correction: what everyone starts with, and what Reset returns to. */
export const IDENTITY_CURVE = [
  [0, 0],
  [1, 1],
];

import { median } from './latency.js';
export { median };

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Build a correction curve from three measured passes.
 *
 * Medians rather than means, for the reason latency.js takes medians: one
 * fumbled note in a pass of eight would drag an average far enough to make the
 * correction worse than none.
 *
 * @param {number[]} soft velocities (0..1) played as softly as possible
 * @param {number[]} normal velocities played at a comfortable level
 * @param {number[]} hard velocities played as loudly as is comfortable
 * @returns {{curve: Array<[number, number]>, points: object, usable: boolean, reason: string|null}}
 */
export function fitCurve(soft = [], normal = [], hard = []) {
  const counts = { soft: soft.length, normal: normal.length, hard: hard.length };
  const short = Object.entries(counts).find(([, n]) => n < MIN_NOTES_PER_PASS);
  if (short) {
    return {
      curve: IDENTITY_CURVE,
      points: null,
      usable: false,
      reason: `not enough notes in the ${short[0]} pass — play at least ${MIN_NOTES_PER_PASS}`,
    };
  }

  const measured = {
    soft: clamp01(median(soft)),
    normal: clamp01(median(normal)),
    hard: clamp01(median(hard)),
  };

  if (!(measured.soft < measured.normal && measured.normal < measured.hard)) {
    return {
      curve: IDENTITY_CURVE,
      points: measured,
      usable: false,
      reason: 'those three passes did not get louder — play the soft one softly and the loud one loudly',
    };
  }

  if (measured.hard - measured.soft < MIN_SPREAD) {
    return {
      curve: IDENTITY_CURVE,
      points: measured,
      usable: false,
      reason: 'your softest and loudest came out almost the same — there is no range here to map',
    };
  }

  // Anchored at both ends so the curve covers the whole 0..1 input range: a
  // note softer than anything measured still has somewhere to go.
  const curve = [
    [0, 0],
    [measured.soft, TARGETS.soft],
    [measured.normal, TARGETS.normal],
    [measured.hard, TARGETS.hard],
    [1, 1],
  ];

  return { curve, points: measured, usable: true, reason: null };
}

/**
 * Correct one velocity through the curve.
 *
 * Piecewise linear between the fitted points. A smooth spline would look
 * better on the plot and buy nothing audible — four segments across a range
 * the ear reads in broad terms is already finer than the distinction being
 * measured.
 */
export function applyCurve(raw, curve = IDENTITY_CURVE) {
  const v = clamp01(raw);
  if (!Array.isArray(curve) || curve.length < 2) return v;

  for (let i = 1; i < curve.length; i += 1) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    if (v <= x1) {
      const span = x1 - x0;
      // Two points at the same input: nothing to interpolate across, and
      // dividing by the gap would hand back NaN for every note.
      if (span <= 0) return clamp01(y1);
      return clamp01(y0 + ((v - x0) / span) * (y1 - y0));
    }
  }
  return clamp01(curve[curve.length - 1][1]);
}

/** Is this curve doing anything at all? */
export const isIdentity = (curve) =>
  !Array.isArray(curve) ||
  curve.length === IDENTITY_CURVE.length &&
    curve.every(([x, y], i) => x === IDENTITY_CURVE[i][0] && y === IDENTITY_CURVE[i][1]);
