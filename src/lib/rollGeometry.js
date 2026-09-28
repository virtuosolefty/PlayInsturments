/**
 * rollGeometry.js — where everything on the practice view belongs, in numbers.
 *
 * This is the pedagogy of the roll, separated from the act of drawing it.
 * Which pixel a note occupies, how urgent it has become, where the bar lines
 * fall, which column belongs to which pitch: all of it is arithmetic, and none
 * of it should have to be reimplemented by a second renderer that happens to
 * use a GPU.
 *
 * The rule the whole file exists to protect:
 *
 *   **Screen distance to the hit line is linear in time.**
 *
 * `yFor` is an affine function of song time and nothing else. That is the
 * entire reason this app can be learned from — "when does this arrive" is read
 * off the screen as a distance, and any transform that makes the same time
 * interval cover different distances at different depths turns the player's one
 * job into a non-uniform judgement. The canvas Trainer view preserves that
 * property all the way to the screen. The WebGL Stage view intentionally gives
 * it up in projection for a more physical presentation, while still sharing
 * this source of truth for note timing, key lanes and click/seek math.
 *
 * Pure functions only, so the layout can be tested without a canvas, a GPU or
 * a browser — which matters more than usual here, because the renderers that
 * consume it cannot be.
 */

import { isC } from './keyboard.js';

/** Height of the on-screen keyboard strip, in CSS pixels. */
export const KEYBOARD_H = 164;
/** Share of the roll below the hit line, showing what you already played. */
export const PAST_RATIO = 0.2;
/** Seconds out from the hit line over which a note builds to full presence. */
export const APPROACH_SEC = 0.9;
/** Consecutive correct notes before the hit line starts to glow. */
export const COMBO_THRESHOLD = 4;
/** How long a hit flourish lives, in milliseconds. */
export const HIT_FX_MS = 460;

/**
 * Where the fixed parts of the view sit for a given canvas size.
 *
 * `hitLine` is rounded because it is a line: a half-pixel one renders as two
 * grey rows instead of one bright one, and it is the single most looked-at
 * thing on the screen.
 */
export function rollLayout(w, h, { keyboardHeight = KEYBOARD_H, pastRatio = PAST_RATIO } = {}) {
  const keyboardTop = Math.max(0, h - keyboardHeight);
  const rollH = keyboardTop;
  return {
    w,
    h,
    keyboardTop,
    rollH,
    /**
     * `pastRatio: 0` puts the hit line exactly on the keyboard, so a note
     * arrives at the key it belongs to with nothing in between.
     *
     * The 2D roll keeps the strip: it draws what you actually played there,
     * beside what was written, which is worth the space. The 3D view cannot —
     * once the scene has depth, an empty band between the notes and the keys
     * reads as a hole in the middle of the instrument rather than as a place
     * where information sometimes appears.
     */
    hitLine: Math.round(rollH * (1 - pastRatio)),
  };
}

/**
 * Song time to screen position, and the window currently visible.
 *
 * @param {object} layout from rollLayout
 * @param {number} now song seconds under the playhead
 * @param {number} pps pixels per second — the zoom
 * @returns {{yFor: Function, tTop: number, tBottom: number}} tTop is the song
 *   time at the top edge, tBottom the time at the keyboard.
 */
export function timeWindow(layout, now, pps) {
  const { hitLine, rollH } = layout;
  return {
    yFor: (time) => hitLine - (time - now) * pps,
    tTop: now + hitLine / pps,
    tBottom: now - (rollH - hitLine) / pps,
  };
}

/**
 * How present a note should be, 0 to 1.
 *
 * A note four seconds out is information; a note about to be played is an
 * instruction. Renderers spend brightness, bloom and scale on this number, so
 * it lives here rather than being re-derived slightly differently in each.
 */
export function approachOf(noteTime, now, past = false) {
  if (past) return 0;
  return 1 - Math.max(0, Math.min(1, (noteTime - now) / APPROACH_SEC));
}

/**
 * The time grid to draw between two song times.
 *
 * Three weights: bar, beat, and — once there is room for it — the eighth in
 * between. A grid is legible because the division you are counting in is
 * always a step above the one you are not; below the zoom where the sub-beat
 * would be a few pixels from its neighbours it is dropped rather than drawn as
 * hatching.
 *
 * @returns {Array<{time: number, weight: 'bar'|'beat'|'sub', bar: number|null}>}
 */
export function gridLines(score, tBottom, tTop, pps) {
  if (!score) return [];
  const spb = 60 / (score.bpm || 100);
  const beatsPerBar = score.timeSignature?.[0] ?? 4;
  const subs = spb * pps > 64 ? 2 : 1;
  const step = spb / subs;
  const first = Math.max(0, Math.floor(tBottom / step));
  const last = Math.ceil(tTop / step);

  const lines = [];
  for (let i = first; i <= last; i += 1) {
    const onBeat = i % subs === 0;
    const beat = i / subs;
    const isBar = onBeat && beat % beatsPerBar === 0;
    lines.push({
      time: i * step,
      weight: isBar ? 'bar' : onBeat ? 'beat' : 'sub',
      bar: isBar ? Math.floor(beat / beatsPerBar) + 1 : null,
    });
  }
  return lines;
}

/**
 * The lane columns and octave boundaries, from the keyboard geometry.
 *
 * Every black-key pitch gets a darker column exactly as wide as its key, which
 * is what lets a falling note sit in its own lane all the way down and land on
 * the key it was drawn over. Derived once when the geometry changes rather than
 * walked per frame.
 */
export function lanesFrom(geometry) {
  const black = [];
  const octaves = [];
  if (!geometry?.keys) return { black, octaves };
  for (const key of geometry.keys.values()) {
    if (key.black) black.push({ x: key.x, w: key.w });
    else if (isC(key.midi)) octaves.push(key.x);
  }
  return { black, octaves };
}

/**
 * Is this note anywhere near the screen?
 *
 * The margin exists because a note is a box, not a point: one whose onset has
 * already passed the bottom edge may still be sounding, and one just above the
 * top edge is about to matter.
 */
export function noteVisible(note, tBottom, tTop, margin = 0.2) {
  const end = note.time + note.duration;
  return end >= tBottom - margin && note.time <= tTop + margin;
}
