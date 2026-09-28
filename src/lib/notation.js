/**
 * notation.js — notes in seconds, engraved as rhythm.
 *
 * The roll answers "when"; a staff answers "what", and reviewers of every app
 * in this space make the same point — falling blocks build reflexes, not
 * reading. The gap between the two is this file, and it is almost entirely
 * quantisation: a Score holds onsets and lengths in seconds, and notation needs
 * bars, note values, rests for the silence, and ties where a note runs over a
 * barline.
 *
 * Deliberately pure. Rendering lives in StaffView; everything decided here —
 * which bar a note lands in, whether it is a dotted quarter or a quarter tied
 * to an eighth — is testable without a canvas.
 */

import { FLAT_NAMES, PITCH_CLASS_NAMES } from './theory.js';

/** Sixteenth notes. Finer than this and human timing turns into confetti. */
export const DEFAULT_QUANTUM = 0.25;

/** Note values in beats, longest first, for greedy decomposition. */
const VALUES = [
  [4, 'w', 0],
  [3, 'h', 1],
  [2, 'h', 0],
  [1.5, 'q', 1],
  [1, 'q', 0],
  [0.75, '8', 1],
  [0.5, '8', 0],
  [0.25, '16', 0],
];

/** Keys written with flats. Everything else takes sharps. */
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'D', 'G', 'C', 'F']);
const FLAT_MINORS = new Set(['D', 'G', 'C', 'F', 'Bb', 'Eb']);

/** VexFlow spells a key as its tonic plus `m` for minor. */
export function keySignatureOf(key) {
  if (!key) return 'C';
  const name = PITCH_CLASS_NAMES[key.tonic] ?? 'C';
  return key.mode === 'minor' ? `${name}m` : name;
}

const usesFlats = (key) => {
  if (!key) return false;
  const name = PITCH_CLASS_NAMES[key.tonic];
  return key.mode === 'minor' ? FLAT_MINORS.has(name) : FLAT_KEYS.has(name) && name !== 'C';
};

/** midi 61 → `c#/4`, or `db/4` in a flat key. */
export function vexKey(midi, flats = false) {
  const pc = ((midi % 12) + 12) % 12;
  const name = (flats ? FLAT_NAMES : PITCH_CLASS_NAMES)[pc];
  return `${name.toLowerCase()}/${Math.floor(midi / 12) - 1}`;
}

/**
 * Express a span of beats as note values, longest first.
 *
 * Greedy, so 2.5 beats comes back as a half plus an eighth — which is exactly
 * what an engraver writes, tied together. A length the grid cannot express at
 * all yields nothing rather than something wrong.
 */
export function splitDuration(beats) {
  const out = [];
  let left = Math.round(beats * 4) / 4;
  let guard = 0;
  while (left >= 0.25 && guard < 16) {
    const match = VALUES.find(([len]) => len <= left + 1e-9);
    if (!match) break;
    out.push({ duration: match[1], dots: match[2] });
    left = Math.round((left - match[0]) * 4) / 4;
    guard += 1;
  }
  return out;
}

const quantise = (beats, quantum) => Math.round(beats / quantum) * quantum;

/**
 * Group a hand's notes into chords by quantised onset.
 * @returns {Map<number, {beat: number, length: number, midis: number[]}>}
 */
function chordsByBeat(notes, secPerBeat, quantum) {
  const byBeat = new Map();
  for (const note of notes) {
    const beat = quantise(note.time / secPerBeat, quantum);
    const length = Math.max(quantum, quantise(note.duration / secPerBeat, quantum));
    const existing = byBeat.get(beat);
    if (existing) {
      existing.midis.push(note.midi);
      // A chord is as long as its longest voice; anything shorter is an
      // articulation detail that notation does not carry here.
      existing.length = Math.max(existing.length, length);
    } else {
      byBeat.set(beat, { beat, length, midis: [note.midi] });
    }
  }
  return byBeat;
}

/** Lay one hand out bar by bar, filling silence with rests. */
function voiceFor(notes, { secPerBeat, beatsPerBar, bars, quantum, flats }) {
  const chords = chordsByBeat(notes, secPerBeat, quantum);
  const starts = [...chords.keys()].sort((a, b) => a - b);
  const measures = [];
  /** A chord that ran past the barline, waiting to be tied into the next bar. */
  let carried = null;

  for (let bar = 0; bar < bars; bar += 1) {
    const barStart = bar * beatsPerBar;
    const barEnd = barStart + beatsPerBar;
    const events = [];
    let cursor = barStart;

    if (carried) {
      const length = Math.min(carried.length, beatsPerBar);
      for (const value of splitDuration(length)) {
        events.push({ ...value, keys: carried.keys, tie: 'stop', beat: cursor });
      }
      cursor += length;
      carried = carried.length > length ? { ...carried, length: carried.length - length } : null;
    }

    while (cursor < barEnd - 1e-9) {
      const next = starts.find((b) => b >= cursor - 1e-9 && b < barEnd - 1e-9);
      if (next === undefined) {
        for (const value of splitDuration(barEnd - cursor)) {
          events.push({ ...value, keys: ['b/4'], isRest: true, beat: cursor });
        }
        cursor = barEnd;
        break;
      }
      if (next > cursor + 1e-9) {
        for (const value of splitDuration(next - cursor)) {
          events.push({ ...value, keys: ['b/4'], isRest: true, beat: cursor });
        }
        cursor = next;
      }

      const chord = chords.get(next);
      const keys = [...new Set(chord.midis)].sort((a, b) => a - b).map((m) => vexKey(m, flats));
      const inThisBar = Math.min(chord.length, barEnd - cursor);
      const overruns = chord.length > inThisBar + 1e-9;
      for (const value of splitDuration(inThisBar)) {
        events.push({ ...value, keys, beat: cursor, tie: overruns ? 'start' : null });
      }
      if (overruns) carried = { keys, length: chord.length - inThisBar };
      cursor += inThisBar;
    }

    measures.push(events);
  }
  return measures;
}

/**
 * @param {object} score normalised Score
 * @param {object} [options]
 * @returns {{measures: Array, keySignature: string, timeSignature: string, beatsPerBar: number, secPerBar: number}}
 *   `measures[i]` is `{ index, startTime, endTime, treble, bass }`
 */
export function toMeasures(score, { quantum = DEFAULT_QUANTUM } = {}) {
  if (!score?.notes?.length) {
    return { measures: [], keySignature: 'C', timeSignature: '4/4', beatsPerBar: 4, secPerBar: 0 };
  }

  const secPerBeat = 60 / (score.bpm || 100);
  const beatsPerBar = score.timeSignature?.[0] ?? 4;
  const secPerBar = secPerBeat * beatsPerBar;
  const bars = Math.max(1, Math.ceil(score.duration / secPerBar - 1e-6));
  const flats = usesFlats(score.key);

  // Hands split the staves. Where a file has no hand information at all, middle
  // C does the job it has always done.
  const right = score.notes.filter((n) => (n.hand ? n.hand === 'right' : n.midi >= 60));
  const left = score.notes.filter((n) => (n.hand ? n.hand === 'left' : n.midi < 60));

  const opts = { secPerBeat, beatsPerBar, bars, quantum, flats };
  const treble = voiceFor(right, opts);
  const bass = voiceFor(left, opts);

  return {
    measures: Array.from({ length: bars }, (_, i) => ({
      index: i,
      startTime: i * secPerBar,
      endTime: (i + 1) * secPerBar,
      treble: treble[i] ?? [],
      bass: bass[i] ?? [],
    })),
    keySignature: keySignatureOf(score.key),
    timeSignature: `${beatsPerBar}/${score.timeSignature?.[1] ?? 4}`,
    beatsPerBar,
    secPerBar,
  };
}
