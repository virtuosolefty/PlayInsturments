/**
 * Correcting for what your controller can actually do.
 *
 * The rule that matters most is the refusal. A calibration step that quietly
 * accepts nonsense and stores a broken curve makes the grading *worse* than
 * having no calibration at all — and the person it hurts is the one who tried
 * to follow the instructions and mistimed a pass. Bad input has to come back
 * as a readable sentence and an unchanged curve, never as a stored guess.
 */

import { describe, expect, it } from 'vitest';
import {
  applyCurve,
  fitCurve,
  IDENTITY_CURVE,
  isIdentity,
  median,
  MIN_NOTES_PER_PASS,
  TARGETS,
} from './velocity.js';

/** `n` notes all around `v`, with the small wobble real playing has. */
const pass = (v, n = 8) =>
  Array.from({ length: n }, (_, i) => v + ((i % 3) - 1) * 0.01);

describe('median', () => {
  it('takes the middle of an odd list', () => {
    expect(median([0.2, 0.9, 0.5])).toBe(0.5);
  });

  it('averages the two middles of an even list', () => {
    expect(median([0.2, 0.4, 0.6, 0.8])).toBeCloseTo(0.5, 6);
  });

  it('is zero for nothing', () => {
    expect(median([])).toBe(0);
  });

  it('shrugs off a single fumbled note', () => {
    // The reason this is a median and not a mean: one note played twice as
    // hard as intended would drag an average far enough to make the correction
    // worse than no correction.
    expect(median([0.30, 0.31, 0.29, 0.30, 1.0])).toBeCloseTo(0.30, 6);
  });
});

describe('fitting a curve to three passes', () => {
  it('maps a mini controller onto the range the score is written in', () => {
    // The case this exists for: a 25-key controller that cannot play softer
    // than 0.42 and saturates at 0.88. Raw, that reads as someone who thumps.
    const { curve, usable, points } = fitCurve(pass(0.42), pass(0.62), pass(0.88));
    expect(usable).toBe(true);
    expect(points.soft).toBeCloseTo(0.42, 2);
    expect(applyCurve(0.42, curve)).toBeCloseTo(TARGETS.soft, 2);
    expect(applyCurve(0.62, curve)).toBeCloseTo(TARGETS.normal, 2);
    expect(applyCurve(0.88, curve)).toBeCloseTo(TARGETS.hard, 2);
  });

  it('opens up a range the hardware had squashed', () => {
    // 0.46 of raw range becomes 0.60 of judged range — the whole point.
    const { curve } = fitCurve(pass(0.42), pass(0.62), pass(0.88));
    const spread = applyCurve(0.88, curve) - applyCurve(0.42, curve);
    expect(spread).toBeGreaterThan(0.88 - 0.42);
  });

  it('still covers velocities outside anything measured', () => {
    const { curve } = fitCurve(pass(0.42), pass(0.62), pass(0.88));
    expect(applyCurve(0, curve)).toBe(0);
    expect(applyCurve(1, curve)).toBe(1);
    expect(applyCurve(0.2, curve)).toBeGreaterThan(0);
    expect(applyCurve(0.2, curve)).toBeLessThan(TARGETS.soft);
  });

  it('never goes backwards', () => {
    // A curve where playing harder scores softer would be worse than useless.
    const { curve } = fitCurve(pass(0.30), pass(0.55), pass(0.80));
    let previous = -1;
    for (let raw = 0; raw <= 1.0001; raw += 0.02) {
      const out = applyCurve(raw, curve);
      expect(out).toBeGreaterThanOrEqual(previous);
      previous = out;
    }
  });
});

describe('refusing a calibration that would make things worse', () => {
  it('turns down a pass with too few notes', () => {
    const short = Array.from({ length: MIN_NOTES_PER_PASS - 1 }, () => 0.3);
    const result = fitCurve(short, pass(0.6), pass(0.85));
    expect(result.usable).toBe(false);
    expect(result.curve).toEqual(IDENTITY_CURVE);
    expect(result.reason).toContain('soft');
  });

  it('turns down passes that did not get louder', () => {
    // Played in the wrong order, or misread the instruction.
    const result = fitCurve(pass(0.8), pass(0.5), pass(0.3));
    expect(result.usable).toBe(false);
    expect(result.curve).toEqual(IDENTITY_CURVE);
    expect(result.reason).toContain('louder');
  });

  it('turns down someone who hammered all three', () => {
    const result = fitCurve(pass(0.80), pass(0.84), pass(0.88));
    expect(result.usable).toBe(false);
    expect(result.curve).toEqual(IDENTITY_CURVE);
    expect(result.reason).toContain('range');
  });

  it('hands back what it measured even when it refuses, so the dialog can say', () => {
    const result = fitCurve(pass(0.80), pass(0.84), pass(0.88));
    expect(result.points.soft).toBeCloseTo(0.8, 2);
    expect(result.points.hard).toBeCloseTo(0.88, 2);
  });
});

describe('applying a curve', () => {
  it('changes nothing without one', () => {
    expect(applyCurve(0.37)).toBeCloseTo(0.37, 6);
    expect(applyCurve(0.37, IDENTITY_CURVE)).toBeCloseTo(0.37, 6);
  });

  it('clamps anything outside 0..1', () => {
    expect(applyCurve(-0.5, IDENTITY_CURVE)).toBe(0);
    expect(applyCurve(9, IDENTITY_CURVE)).toBe(1);
  });

  it('survives a malformed curve rather than silencing every note', () => {
    expect(applyCurve(0.5, null)).toBeCloseTo(0.5, 6);
    expect(applyCurve(0.5, [])).toBeCloseTo(0.5, 6);
    expect(applyCurve(0.5, [[0, 0]])).toBeCloseTo(0.5, 6);
  });

  it('does not produce NaN when two points share an input', () => {
    // A vertical segment means dividing by a zero-width gap, and 0/0 is NaN.
    // A NaN velocity reaches Tone as an invalid gain and the note simply never
    // sounds — silence with nothing logged, which is the failure mode this
    // codebase has already been bitten by once.
    //
    // The degenerate segment has to be the *first* one to be reachable at all.
    // The loop returns on the first segment whose upper bound is at or past
    // the input, so a duplicate x further along is stepped over before it can
    // divide by anything — an earlier version of this test used such a curve
    // and passed with the guard deleted.
    expect(Number.isFinite(applyCurve(0.5, [[0.5, 0.2], [0.5, 0.8]]))).toBe(true);
    expect(Number.isFinite(applyCurve(0.3, [[0.5, 0.2], [0.5, 0.8]]))).toBe(true);
  });
});

describe('knowing whether a curve is doing anything', () => {
  it('recognises the identity', () => {
    expect(isIdentity(IDENTITY_CURVE)).toBe(true);
    expect(isIdentity(null)).toBe(true);
  });

  it('recognises a fitted one', () => {
    expect(isIdentity(fitCurve(pass(0.42), pass(0.62), pass(0.88)).curve)).toBe(false);
  });
});
