/**
 * guitarStageView.js — what the 3D guitar stage shows, decided without Three.js.
 *
 * The stage turns these answers into meshes and DOM labels; keeping the
 * decisions here keeps them testable and identical for any guitar model.
 */

import { GUITAR_TUNING } from './guitar.js';
import { chordPositionLabel, chordTone } from './guitarPresentation.js';
import { DRAWN_NECK, fretSpace, OPEN_SPACE, STRING_COUNT } from './guitarNeck.js';
import { noteName } from './theory.js';

const VERDICT_COLORS = new Map([['wrong', '#c95d74'], ['timing', '#c69548']]);
const PLAYED = '#63dbb6', POINTED = '#7160c6', GUESSED = '#cfb980', ROOT = '#e3ad77', TONE = '#f1ebdf';
const OUTLINED = new Set(['target', 'hover', 'possible']);
const looks = new Map();

/**
 * How a position marker looks for a feedback state from `guitarFeedback`.
 *
 * The same inputs return the same frozen object, so the stage can tell that a
 * marker has not changed by comparing with the look it drew last frame.
 *
 * @param {'idle'|'held'|'target'|'hover'|'possible'|'chord'} state
 * @param {{ verdict?: string, root?: boolean }} [detail] the grader's verdict on a held note; whether a chord tone is the root
 */
export function dotLook(state, { verdict, root = false } = {}) {
  const color = state === 'held' ? (VERDICT_COLORS.get(verdict) ?? PLAYED)
    : state === 'target' || state === 'hover' ? POINTED
    : state === 'possible' ? GUESSED
    : root ? ROOT : TONE;
  const key = `${state}|${color}`;
  if (!looks.has(key)) looks.set(key, Object.freeze({ visible: state !== 'idle', color, opacity: state === 'possible' ? 0.38 : 1, ring: OUTLINED.has(state), scale: state === 'held' ? 1.7 : 1.5 }));
  return looks.get(key);
}

/** String names stay this far from the stage edge, whatever the camera does. */
export const STRING_LABEL_INSET = 28;
/** String names are drawn no larger than this, whatever the chosen text size. */
export const STRING_FONT_MAX = 13;
/** Fret numbers worth keeping when they cannot all fit: the first, the octave and the inlay frets, in that order. */
const FRET_PRIORITY = [1, 12, 5, 7, 3, 9];
const EPSILON = 1e-9;

/** About how wide a short monospace label is, with a little room either side. */
const labelWidth = (text, fontSize) => text.length * 0.62 * fontSize + 4;

/**
 * A column of label positions moved apart until neighbours are at least
 * `minGap` apart, in the same order. Each crowded run is laid out evenly
 * around where its labels were on average, and runs that grow into each other
 * are merged, so labels that already had room stay exactly where they were.
 *
 * @param {number[]} positions in ascending order
 * @param {number} minGap
 * @returns {number[]} new positions, one for each given
 */
export function spreadApart(positions, minGap) {
  const first = run => run.sum / run.count - ((run.count - 1) * minGap) / 2;
  const runs = [];
  for (const position of positions) {
    runs.push({ sum: position, count: 1 });
    while (runs.length > 1) {
      const [before, last] = runs.slice(-2);
      if (first(last) - (first(before) + (before.count - 1) * minGap) >= minGap - EPSILON) break;
      runs.splice(-2, 2, { sum: before.sum + last.sum, count: before.count + last.count });
    }
  }
  return runs.flatMap(run => Array.from({ length: run.count }, (_, i) => (run.count === 1 ? run.sum : first(run) + i * minGap)));
}

/**
 * A column of label centres moved, as a block, to sit inside `band`, each label
 * reaching `half` above and below its centre. A column taller than the band is
 * squeezed to fill it evenly; a band too small for even one label is ignored.
 *
 * @param {number[]} positions in ascending order
 * @param {{ top: number, bottom: number }} band
 * @param {number} half
 * @returns {number[]}
 */
export function fitColumn(positions, { top, bottom }, half) {
  const low = top + half, high = bottom - half;
  if (!positions.length || !(high > low)) return [...positions];
  const first = positions[0], last = positions[positions.length - 1];
  if (last - first > high - low) {
    if (positions.length === 1) return [(low + high) / 2];
    const step = (high - low) / (positions.length - 1);
    return positions.map((_, i) => low + i * step);
  }
  const shift = first < low ? low - first : last > high ? high - last : 0;
  return positions.map(position => position + shift);
}

/** The fret numbers that fit side by side, most useful first; the rest are left out rather than drawn over each other. */
function fittingFrets(frets, fontSize) {
  const rank = label => { const i = FRET_PRIORITY.indexOf(Number(label.text)); return i < 0 ? FRET_PRIORITY.length + Number(label.text) : i; };
  const clear = (a, b) => Math.abs(a.x - b.x) >= (labelWidth(a.text, fontSize) + labelWidth(b.text, fontSize)) / 2 - EPSILON;
  const kept = new Set();
  for (const label of [...frets].sort((a, b) => rank(a) - rank(b))) {
    if ([...kept].every(other => clear(label, other))) kept.add(label);
  }
  return frets.filter(label => kept.has(label));
}

/**
 * The string names, spread apart where the strings are too close together at
 * the nut for their names to fit, and kept inside `band` (stage pixels clear of
 * the chord name above and the legend below) when one is given.
 */
function spreadStrings(strings, fontSize, band) {
  const order = strings.map((label, i) => i).sort((a, b) => strings[a].y - strings[b].y);
  const gap = Math.min(fontSize, STRING_FONT_MAX) + 2;
  const spread = spreadApart(order.map(i => strings[i].y), gap);
  const ys = band ? fitColumn(spread, band, gap / 2) : spread;
  const moved = [...strings];
  order.forEach((i, k) => { moved[i] = { ...strings[i], y: ys[k] }; });
  return moved;
}

/**
 * Every text label the stage overlays on the neck.
 *
 * @param {object} view
 * @param {(x: number, y: number, z: number) => { x: number, y: number }} view.project stage units to stage pixels
 * @param {number} view.width stage width in pixels
 * @param {number} view.maxFret
 * @param {object|null} [view.chord] the chord shape shown in Free play
 * @param {'fingers'|'notes'|'intervals'} [view.labelMode]
 * @param {boolean} [view.leftHanded]
 * @param {number} [view.fontSize] the text size labels are drawn at, used to keep them from overlapping on a small stage
 * @param {{ top: number, bottom: number }|null} [view.stringBand] stage pixels the string names must stay between
 * @param {object} [view.neck] where the guitar shown puts its strings and labels (guitarNeck.js)
 * @param {boolean} [view.stringNames] false where the nut is too far off for names pinned to the stage's edge to line up with it
 * @returns {{ text: string, x: number, y: number, kind: 'string'|'fret'|'finger'|'muted', root: boolean }[]}
 */
export function stageLabels({ project, width, maxFret, chord = null, labelMode = 'fingers', leftHanded = false, fontSize = 14, stringBand = null, neck = DRAWN_NECK, stringNames = true }) {
  // A stored text size that is not a number would turn every gap into NaN; use the standard size instead.
  const size = Number.isFinite(fontSize) ? fontSize : 14;
  const label = (text, x, at, kind, root = false) => ({ text, ...project(x, at.y, at.z), kind, root });
  const strings = !stringNames ? [] : spreadStrings(GUITAR_TUNING.map((pitch, s) => ({
    ...label(noteName(pitch), neck.nutX, neck.labelAt('string', s, neck.nutX), 'string'),
    x: leftHanded ? width - STRING_LABEL_INSET : STRING_LABEL_INSET,
  })), size, stringBand);
  const frets = fittingFrets(Array.from({ length: maxFret }, (_, i) => label(String(i + 1), fretSpace(i + 1).x, neck.fretLabelAt(fretSpace(i + 1).x), 'fret')), size);
  const fingers = !chord ? [] : Array.from({ length: STRING_COUNT }, (_, s) => s).flatMap(s => {
    const fret = chord.frets[s];
    if (fret > maxFret) return [];
    const x = fret == null || fret === 0 ? OPEN_SPACE.x : fretSpace(fret).x;
    return [label(chordPositionLabel(chord, s, labelMode), x, neck.labelAt('chord', s, x), fret == null ? 'muted' : 'finger', !!chordTone(chord, s)?.root)];
  });
  return [...strings, ...frets, ...fingers];
}

/** The hint under the stage for the place under the pointer; strings are numbered as tablature does. */
export function hoverText(place) {
  if (!place) return '';
  return `String ${STRING_COUNT - place.string} · ${place.fret ? `fret ${place.fret}` : 'open'} · ${noteName(place.midi)}`;
}
