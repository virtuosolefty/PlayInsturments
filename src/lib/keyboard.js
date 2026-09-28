/**
 * keyboard.js — geometry for the on-screen keyboard and the piano-roll lanes.
 *
 * Both the roll and the keyboard share one x-axis mapping so a falling note
 * lands exactly on the key you have to press.
 */

import { isBlackKey, pitchClass } from './theory.js';

const snapDownToWhite = (m) => {
  let x = m;
  while (isBlackKey(x)) x -= 1;
  return x;
};

const snapUpToWhite = (m) => {
  let x = m;
  while (isBlackKey(x)) x += 1;
  return x;
};

/**
 * @param {number} low lowest midi note to show
 * @param {number} high highest midi note to show
 * @param {number} width px
 */
export function buildKeyboardGeometry(low, high, width) {
  const lo = Math.max(21, snapDownToWhite(low));
  const hi = Math.min(108, snapUpToWhite(high));

  const whites = [];
  for (let m = lo; m <= hi; m += 1) if (!isBlackKey(m)) whites.push(m);

  const whiteWidth = width / Math.max(1, whites.length);
  const blackWidth = whiteWidth * 0.62;

  const keys = new Map();
  let wi = 0;
  for (let m = lo; m <= hi; m += 1) {
    if (isBlackKey(m)) {
      const x = wi * whiteWidth - blackWidth / 2;
      keys.set(m, { midi: m, x, w: blackWidth, black: true, center: x + blackWidth / 2 });
    } else {
      const x = wi * whiteWidth;
      keys.set(m, { midi: m, x, w: whiteWidth, black: false, center: x + whiteWidth / 2 });
      wi += 1;
    }
  }

  return { keys, low: lo, high: hi, whiteWidth, blackWidth, whiteCount: whites.length };
}

/** Which key is at this x position (black keys win, they're on top). */
export function keyAt(geometry, x, y, keyboardTop, blackHeight) {
  const inBlackZone = y - keyboardTop <= blackHeight;
  if (inBlackZone) {
    for (const key of geometry.keys.values()) {
      if (key.black && x >= key.x && x <= key.x + key.w) return key.midi;
    }
  }
  for (const key of geometry.keys.values()) {
    if (!key.black && x >= key.x && x <= key.x + key.w) return key.midi;
  }
  return null;
}

/**
 * Pick a display range: the score's own range, padded out, clamped to 88 keys,
 * and never narrower than two octaves so short exercises don't look absurd.
 */
export function displayRangeFor(score, minSpan = 25) {
  const [lo, hi] = score?.range ?? [60, 72];
  let low = lo - 2;
  let high = hi + 2;
  while (high - low < minSpan) {
    low -= 1;
    high += 1;
  }
  return [Math.max(21, low), Math.min(108, high)];
}

export const isC = (midi) => pitchClass(midi) === 0;
