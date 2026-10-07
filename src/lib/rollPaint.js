/**
 * rollPaint.js — the palette and the drawing primitives the roll is made of.
 *
 * Separated from PianoRoll so the keyboard strip and the roll surface can be
 * two files without either owning the colours, and so a second renderer has
 * one place to read the palette from rather than a second copy of it drifting
 * out of step.
 *
 * rollGeometry.js decides where things belong; this decides what they look
 * like once they are there.
 */

import { STAGE_COLORS } from './stageColors.js';

export const COLORS = Object.freeze({
  // The interface colours come from tokens.css through stageColors.js; the
  // rest are the stage's own furniture.
  bg: STAGE_COLORS.stage,
  // Lanes. Every VST piano roll shades the black-key rows darker than the
  // white ones, and it is most of why you can read pitch off one without
  // counting keys up from the nearest C. laneBlack is --screen exactly, so the
  // darkest lanes still meet the bezel that frames them and the roll goes on
  // reading as a hole cut in the panel rather than a rectangle drawn on it.
  laneWhite: '#0a0d13',
  laneBlack: '#06080c',
  // Three weights, each about half the one above it. They were tuned against a
  // flat #06080c background; the lanes lifted the base the grid sits on, so all
  // three came up to keep the same separation.
  gridBar: 'rgba(255,255,255,0.085)',
  gridBeat: 'rgba(255,255,255,0.040)',
  gridSub: 'rgba(255,255,255,0.018)',
  octave: 'rgba(255,255,255,0.10)',
  right: STAGE_COLORS.noteRight,
  left: STAGE_COLORS.noteLeft,
  hit: STAGE_COLORS.hit,
  missed: STAGE_COLORS.miss,
  late: STAGE_COLORS.late,
  hitLine: STAGE_COLORS.hitLine,
  // Beating your own longest streak. Warm rather than teal, because it is not
  // the app talking about itself — it is about what you just did.
  record: '#ffd479',
  trouble: 'rgba(255,93,108,0.10)',
  keySeam: 'rgba(0,0,0,0.20)',
  keyLabel: '#9aa3ad',
  blackKey: '#1b212a',
  // The dark edge the key strip is set into. This was a red felt strip under a
  // fallboard, back when the keyboard was drawn as an acoustic piano.
  shelf: '#04060a',
  keyPress: STAGE_COLORS.hit,
  keyWrong: STAGE_COLORS.miss,
  keyTarget: STAGE_COLORS.noteRight,
  // Your best previous run. Deliberately faint and colourless — it is a
  // reference line, not a thing to chase into the ground.
  ghost: 'rgba(255,255,255,0.5)',
});

export const BLACK_H_RATIO = 0.62;
export const SHELF_H = 4; // the dark lip the key strip sits in

/** Canvas text can't read CSS variables, so the type scale is mirrored here. */
export const ROLL_FONT = {
  note: '11px ui-monospace, monospace',
  finger: 'bold 13px ui-monospace, monospace',
  bar: '12px ui-monospace, monospace',
};

/** Multiply a #rrggbb colour's brightness — for key highlights and shadows. */
export function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  const r = clamp((n >> 16) & 0xff);
  const g = clamp((n >> 8) & 0xff);
  const b = clamp(n & 0xff);
  return `rgb(${r} ${g} ${b})`;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/**
 * The numbers worth turning by eye rather than by rebuild.
 *
 * Mutable on purpose: the dev tuning panel writes into `.value` and the very
 * next frame picks it up. In a production build nothing ever writes to these,
 * so they behave exactly as the constants they replaced — the panel that edits
 * them is dropped at compile time.
 *
 * These are not the source of truth. When a value looks right in the browser
 * it gets copied back into the constant it came from, and this stays a dial
 * rather than a config file.
 */
export const TUNING = {
  hitFxMs: { value: 460, min: 120, max: 1200, step: 20 },
  approachSec: { value: 0.9, min: 0.2, max: 3, step: 0.05 },
  comboThreshold: { value: 4, min: 2, max: 24, step: 1 },
  keyThrow: { value: 0.075, min: 0, max: 0.3, step: 0.005 },
  keyAttack: { value: 0.045, min: 0.01, max: 0.4, step: 0.005 },
  nowZone: { value: 0.17, min: 0, max: 0.6, step: 0.01 },
};
