/**
 * pacing.js — giving up resolution to keep the frame rate.
 *
 * The stage's cost is almost entirely per pixel, and a high-density display
 * has four times the pixels of a standard one. An integrated GPU that draws
 * the stage comfortably at 1× can start missing frames at 2×. Rather than
 * guess from the GPU's name, the stage times its own frames: while too many
 * arrive late it lowers the pixel ratio a step at a time, and it stops as soon
 * as they don't.
 *
 * "Late" is judged two ways, because a display hides slowness in two ways. A
 * GPU that is a little too slow still delivers most frames on time and misses
 * one in every few, so the typical frame looks fine and only the share of late
 * ones gives it away. A GPU that is far too slow settles into a steady half
 * rate, where no frame is late relative to its neighbours and only the
 * absolute gap gives it away.
 *
 * Lowering the ratio only helps when pixels are the bottleneck. On a 30 Hz
 * display, or a page that is slow for another reason, a step down changes
 * nothing; the pacer notices, puts the resolution back and waits a good while
 * before it is willing to try again.
 *
 * No timers and no rendering here: the stage reports the gap between each
 * pair of consecutive frames and is told when to change.
 */

/** A frame this many times longer than a quick one missed at least one refresh. */
const LATE_FACTOR = 1.5;

/** What a window of frame gaps says: the typical gap, the share that were late, and a hitch-proof average. */
function summarise(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = share => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
  const quick = at(0.1);
  const steady = sorted.slice(0, sorted.length - Math.floor(sorted.length * 0.05));
  return {
    typical: at(0.5),
    late: samples.filter(gap => gap > quick * LATE_FACTOR).length / samples.length,
    pace: steady.reduce((sum, gap) => sum + gap, 0) / steady.length,
  };
}

/**
 * @param {object} options
 * @param {number} options.ratio the pixel ratio the stage starts at
 * @param {number} [options.floor] never go below this
 * @param {number} [options.step] how much to give up at a time
 * @param {number} [options.slowMs] a typical gap longer than this is too slow whatever the display (default: under 45 fps)
 * @param {number} [options.lateShare] more than this share of late frames is too many
 * @param {number} [options.window] frames judged per decision
 * @param {number} [options.settle] frames ignored at the start, after a change and after a pause
 * @param {number} [options.gain] a step down must shorten the average gap to this fraction, or it did not help
 * @param {number} [options.cooldown] frames to sit out after a step that did not help
 */
export function createPacer({ ratio, floor = 1, step = 0.25, slowMs = 1000 / 45, lateShare = 0.1, window = 30, settle = 8, gain = 0.95, cooldown = 600 }) {
  let current = ratio, skip = settle, rest = 0, samples = [];
  let before = null; // { ratio, pace } from just before the last step down, while its effect is still unjudged
  const change = next => { current = next; skip = settle; return next; };

  return {
    /** The pixel ratio the stage should be drawing at. */
    get ratio() { return current; },

    /** Forget the frames in hand: the next gap would include time the stage spent not drawing. */
    pause() { samples = []; skip = settle; },

    /**
     * @param {number} gapMs time between this drawn frame and the one before it
     * @returns {number|null} a new pixel ratio to switch to, or null to carry on
     */
    sample(gapMs) {
      if (current <= floor && !before) return null;
      if (rest > 0) { rest--; return null; }
      if (skip > 0) { skip--; return null; }
      samples.push(gapMs);
      if (samples.length < window) return null;
      const { typical, late, pace } = summarise(samples);
      samples = [];
      if (before) {
        const tried = before;
        before = null;
        if (pace > tried.pace * gain) { rest = cooldown; return change(tried.ratio); }
      }
      if (typical <= slowMs && late <= lateShare) return null;
      if (current <= floor) return null;
      before = { ratio: current, pace };
      return change(Math.max(floor, current - step));
    },
  };
}
