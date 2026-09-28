/**
 * arrange.js — bend a score onto the keyboard you actually own.
 *
 * A 25-key controller reaches two octaves. Almost nothing in the classical
 * repertoire does, so a piece has to be adapted before it can be practised at
 * all. Three strategies, in increasing order of how much they change the music:
 *
 *   off    play it as written — notes outside your keys are unreachable
 *   shift  move the whole piece by whole octaves so it sits where your hands
 *          are; every interval survives exactly, but a piece wider than your
 *          keyboard still spills out at one end
 *   fold   shift, then drop any remaining stray note by octaves until it is
 *          inside the window. Pitch classes and rhythm survive, the melodic
 *          contour bends. This is what makes a 48-semitone Canon in D playable
 *          on 25 keys.
 *
 * A hand filter sits alongside: on a mini keyboard, the right hand alone is
 * very often narrow enough that no folding is needed at all.
 *
 * Everything here is pure — no browser APIs — so it is unit tested in node.
 */

import { FULL_VARIANT, renotate } from './score.js';

export const FIT_MODES = {
  OFF: 'off',
  SHIFT: 'shift',
  FOLD: 'fold',
};

export const HAND_FILTERS = {
  BOTH: 'both',
  RIGHT: 'right',
  LEFT: 'left',
};

/** How far apart the lowest and highest note of a range sit, in semitones. */
export const spanOf = ([lo, hi]) => hi - lo;

export { FULL_VARIANT } from './score.js';

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Move a stated key by the same interval the notes moved. */
export function transposeKey(key, semitones) {
  const tonic = (((key.tonic + semitones) % 12) + 12) % 12;
  return { ...key, tonic, name: `${KEY_NAMES[tonic]} ${key.mode}` };
}

/**
 * A short signature for how a score was adapted.
 *
 * Practising the right hand of a folded 25-key arrangement is not the same
 * work as playing the whole piece on 88 keys, so their scores must not share a
 * personal best. This string is what keeps those records apart.
 */
export function variantOf({ fit, hands, window: keyWindow } = {}) {
  if (!keyWindow || fit === FIT_MODES.OFF) {
    return hands && hands !== HAND_FILTERS.BOTH ? `${FULL_VARIANT}:${hands}` : FULL_VARIANT;
  }
  return `${fit}:${spanOf(keyWindow) + 1}:${hands ?? HAND_FILTERS.BOTH}`;
}

/**
 * The octave shift that puts as many notes as possible inside `window`.
 * Ties are broken towards the smaller shift so a piece already in position is
 * left alone.
 * @param {{midi: number}[]} notes
 * @param {[number, number]} window
 * @returns {number} semitones, always a multiple of 12
 */
export function bestOctaveShift(notes, [lo, hi]) {
  if (!notes.length) return 0;

  let bestShift = 0;
  let bestInside = -1;
  let bestCost = Infinity;

  for (let shift = -48; shift <= 48; shift += 12) {
    let inside = 0;
    let strayBy = 0;
    for (const note of notes) {
      const midi = note.midi + shift;
      if (midi >= lo && midi <= hi) inside += 1;
      else strayBy += midi < lo ? lo - midi : midi - hi;
    }
    // Distance-outside is the tie-breaker, nudged by how far we moved so a
    // do-nothing shift wins an exact tie.
    const cost = strayBy + Math.abs(shift) / 1000;
    if (inside > bestInside || (inside === bestInside && cost < bestCost)) {
      bestShift = shift;
      bestInside = inside;
      bestCost = cost;
    }
  }
  return bestShift;
}

/**
 * Move `midi` by whole octaves until it lands inside the window, preserving
 * its pitch class. A window narrower than an octave cannot represent every
 * pitch class, so it clamps instead.
 */
export function foldIntoRange(midi, [lo, hi]) {
  if (hi - lo < 11) return Math.min(hi, Math.max(lo, midi));
  let folded = midi;
  while (folded < lo) folded += 12;
  while (folded > hi) folded -= 12;
  return folded < lo ? folded + 12 : folded;
}

/**
 * Folding can collapse an octave doubling into two copies of the same key at
 * the same moment, which would ask you to press one key twice. Merge notes
 * that end up on the same pitch while overlapping in time.
 */
function mergeOverlaps(notes) {
  const sorted = [...notes].sort((a, b) => a.time - b.time || a.midi - b.midi);
  const kept = [];
  const liveIndex = new Map(); // midi -> index in `kept` of the note still sounding

  for (const note of sorted) {
    const index = liveIndex.get(note.midi);
    const live = index === undefined ? null : kept[index];
    if (live && note.time < live.time + live.duration - 1e-4) {
      const end = Math.max(live.time + live.duration, note.time + note.duration);
      kept[index] = { ...live, duration: end - live.time };
      continue;
    }
    liveIndex.set(note.midi, kept.length);
    kept.push({ ...note });
  }
  return kept;
}

/**
 * Adapt a score to a keyboard.
 *
 * @param {object|null} score normalised Score (see score.js)
 * @param {object} options
 * @param {[number, number]|null} options.window playable midi range, or null for no limit
 * @param {string} options.fit one of FIT_MODES
 * @param {string} options.hands one of HAND_FILTERS
 * @param {number} options.transpose manual semitone offset applied before fitting
 * @returns {object|null} a new score, or the original when nothing had to change
 */
export function arrangeScore(score, options = {}) {
  if (!score) return null;
  const {
    window = null,
    fit = FIT_MODES.FOLD,
    hands = HAND_FILTERS.BOTH,
    transpose = 0,
  } = options;

  // The hand you are not practising is kept and played for you, not deleted.
  // Practising a right hand in silence is a memory test; practising it against
  // the left is music, and hearing the part you are fitting into is most of
  // what makes single-hand practice worth doing.
  const marked = markAccompaniment(score.notes, hands);
  const playable = marked.filter((n) => !n.accompaniment);

  const constrained = window && fit !== FIT_MODES.OFF;
  // Fitted to the notes *you* play. The accompaniment comes out of the
  // speakers, so squeezing it into your two octaves would mangle the bass for
  // no reason.
  const auto = constrained
    ? bestOctaveShift(playable.map((n) => ({ midi: n.midi + transpose })), window)
    : 0;
  const shift = transpose + auto;

  const shifted = shift === 0 ? marked : marked.map((n) => ({ ...n, midi: n.midi + shift }));
  const placed =
    constrained && fit === FIT_MODES.FOLD
      ? mergeOverlaps(
          shifted.map((n) =>
            n.accompaniment ? n : { ...n, midi: foldIntoRange(n.midi, window) },
          ),
        )
      : shifted;

  // Hand back the original object when nothing moved: the practice session is
  // rebuilt on score identity, so a needless copy would reset a run in progress
  // every time the keyboard window is recalculated. Identical notes also mean
  // identical practice, so the run belongs under the unarranged variant that
  // `finalise` already stamped on the score.
  const unchanged =
    placed === score.notes ||
    (placed.length === score.notes.length &&
      placed.every((n, i) => n.midi === score.notes[i].midi && !n.accompaniment));
  if (unchanged) return score;
  const rebuilt = { ...renotate(score, placed), variant: variantOf({ fit, hands, window }) };
  // A stated key survives being moved; it just moves with the music. Letting
  // `renotate` re-estimate would throw away the one piece of information the
  // file was explicit about, which matters most for the pieces estimation is
  // worst at — the ones that never sound their own tonic.
  if (score.key?.declared && shift) rebuilt.key = transposeKey(score.key, shift);
  else if (score.key?.declared) rebuilt.key = score.key;
  return rebuilt;
}

/**
 * Flag the notes belonging to the hand you are not practising.
 *
 * Returns the original array untouched when there is nothing to mark, so a
 * two-handed run keeps score identity and never rebuilds the session.
 */
function markAccompaniment(notes, hands) {
  if (hands === HAND_FILTERS.BOTH) return notes;
  const practised = notes.filter((n) => n.hand === hands);
  // A filter that would empty the piece is a filter on a score with no hand
  // information — play the whole thing rather than show an empty roll.
  if (!practised.length || practised.length === notes.length) return notes;
  return notes.map((n) => (n.hand === hands ? n : { ...n, accompaniment: true }));
}

/**
 * What a piece demands of a keyboard, for the library badges.
 *
 * @param {[number, number]} songRange the piece's own low/high midi
 * @param {[number, number]|null} window the keyboard
 * @returns {{verdict: string, octaves: number, span: number, width: number, overflow: number}}
 *   verdict is 'unknown' | 'fits' | 'shift' | 'fold'
 */
export function assessFit(songRange, window) {
  if (!songRange || !window) {
    return { verdict: 'unknown', octaves: 0, span: 0, width: 0, overflow: 0 };
  }
  const span = spanOf(songRange);
  const width = spanOf(window);
  const shift = bestOctaveShift([{ midi: songRange[0] }, { midi: songRange[1] }], window);
  const covered = songRange[0] + shift >= window[0] && songRange[1] + shift <= window[1];

  return {
    verdict: covered ? (shift === 0 ? 'fits' : 'shift') : 'fold',
    octaves: shift / 12,
    span,
    width,
    overflow: Math.max(0, span - width),
  };
}

/** One-line explanation of an assessment, for tooltips and the sidebar. */
export function describeFit(assessment) {
  switch (assessment.verdict) {
    case 'fits':
      return 'Fits your keyboard as written.';
    case 'shift': {
      const n = Math.abs(assessment.octaves);
      return `Fits after shifting ${n} octave${n === 1 ? '' : 's'} ${assessment.octaves > 0 ? 'up' : 'down'}.`;
    }
    case 'fold':
      return `Spans ${assessment.span} semitones — ${assessment.overflow} more than your keyboard reaches. Stray notes get folded into range.`;
    default:
      return 'Connect a controller to see how this piece fits.';
  }
}
