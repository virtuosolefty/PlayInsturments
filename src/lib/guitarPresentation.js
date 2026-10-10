import { guitarMidi } from './guitar.js';
import { noteName, PITCH_CLASS_NAMES } from './theory.js';

const INTERVALS = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];

/**
 * Presentation only: authored frets and the shared input path stay intact.
 *
 * @param {(string: number, fret: number) => number} [midiAt] the instrument's pitch at a place; the guitar's unless given
 */
export function chordTone(chord, string, midiAt = guitarMidi) {
  const fret = chord?.frets[string];
  if (fret == null) return null;
  const midi = midiAt(string, fret);
  const root = PITCH_CLASS_NAMES.indexOf(chord.name.replace(/m$/, ''));
  const distance = (midi % 12 - root + 12) % 12;
  return { midi, note: noteName(midi).replace(/\d/g, ''), interval: INTERVALS[distance], root: distance === 0 };
}

export function chordPositionLabel(chord, string, mode = 'fingers', midiAt = guitarMidi) {
  const tone = chordTone(chord, string, midiAt);
  if (!tone) return '×';
  if (mode === 'notes') return tone.note;
  if (mode === 'intervals') return tone.interval;
  return chord.fingers[string] ? String(chord.fingers[string]) : '○';
}

export function chordFullName(chord) {
  return `${chord.name.replace(/m$/, '')} ${chord.name.endsWith('m') ? 'minor' : 'major'}`;
}
