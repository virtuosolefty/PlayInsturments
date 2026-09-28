/**
 * latency.js — how far behind the beat your system puts you.
 *
 * You play in time with what you *hear*, and what you hear left the speakers a
 * buffer ago. Add the controller's own USB latency and the browser's audio
 * lookahead on top, and someone playing perfectly in time measures as
 * consistently late — tens of milliseconds of it, which is the difference
 * between "on time" and "late" in the scoring windows.
 *
 * The fix is to measure the constant and subtract it. Tap along to a click,
 * take the middle of the distribution, and that is your system's offset.
 *
 * Pure functions only, so the maths is testable without audio hardware.
 */

/** Taps further than this from any click are treated as fumbles, not data. */
const OUTLIER_MS = 250;

/** Below this many usable taps the estimate is not worth trusting. */
const MIN_TAPS = 5;

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Signed distance from a tap to whichever click it was aiming at. */
export function offsetToNearestBeat(tapMs, beatTimesMs) {
  let best = Infinity;
  for (const beat of beatTimesMs) {
    const delta = tapMs - beat;
    if (Math.abs(delta) < Math.abs(best)) best = delta;
  }
  return best === Infinity ? 0 : best;
}

/**
 * Estimate the systematic offset between clicks and taps.
 *
 * The median rather than the mean: one tap missed entirely would drag an
 * average far enough to make the correction worse than no correction at all,
 * and a calibration step that makes timing *less* accurate is the one outcome
 * worth engineering against.
 *
 * @param {number[]} tapTimesMs performance-clock times of each key press
 * @param {number[]} beatTimesMs performance-clock times the clicks sounded
 * @returns {{offsetMs: number, spreadMs: number, taps: number, usable: boolean, reason: string|null}}
 *   offsetMs is positive when you are behind the click.
 */
export function measureOffset(tapTimesMs, beatTimesMs) {
  if (!beatTimesMs?.length) {
    return { offsetMs: 0, spreadMs: 0, taps: 0, usable: false, reason: 'no clicks to compare against' };
  }

  const offsets = (tapTimesMs ?? [])
    .map((tap) => offsetToNearestBeat(tap, beatTimesMs))
    .filter((delta) => Math.abs(delta) <= OUTLIER_MS);

  if (offsets.length < MIN_TAPS) {
    return {
      offsetMs: 0,
      spreadMs: 0,
      taps: offsets.length,
      usable: false,
      reason: `only ${offsets.length} clean tap${offsets.length === 1 ? '' : 's'} — play along with at least ${MIN_TAPS}`,
    };
  }

  const centre = median(offsets);
  // Spread as median absolute deviation, for the same robustness reason.
  const spread = median(offsets.map((d) => Math.abs(d - centre)));

  return {
    offsetMs: Math.round(centre),
    spreadMs: Math.round(spread),
    taps: offsets.length,
    // A wildly inconsistent tap says more about the playing than the hardware.
    usable: spread <= 60,
    reason: spread > 60 ? 'your taps were too uneven to read a system offset from' : null,
  };
}

/** Sanity bound for a stored calibration, hand-typed or measured. */
export const clampLatency = (ms) => Math.max(-200, Math.min(400, Math.round(ms || 0)));
