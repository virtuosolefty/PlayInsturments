/**
 * theory.js — music-theory primitives used to classify *why* a played note is wrong.
 *
 * Everything here is pure and dependency-free so it can be unit tested in node.
 * Pitches are MIDI note numbers (60 = C4 = middle C).
 */

export const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const pitchClass = (midi) => ((midi % 12) + 12) % 12;
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;

export function noteName(midi, { flats = false } = {}) {
  const names = flats ? FLAT_NAMES : PITCH_CLASS_NAMES;
  return `${names[pitchClass(midi)]}${octaveOf(midi)}`;
}

export function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(pitchClass(midi));
}

/* ------------------------------------------------------------------ scales */

export const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
};

/** Pitch classes belonging to a scale. */
export function scalePitchClasses(tonic, mode = 'major') {
  const intervals = SCALE_INTERVALS[mode] ?? SCALE_INTERVALS.major;
  return intervals.map((i) => pitchClass(tonic + i));
}

/**
 * The set of pitch classes considered "acceptable" in a key. For minor keys we
 * union natural/harmonic/melodic because real repertoire freely mixes them
 * (raised 7th in cadences, raised 6th in ascending lines). Flagging a raised
 * 7th in A minor as "out of key" would be a false positive.
 */
export function keyPitchClassSet(tonic, mode = 'major') {
  if (mode === 'major') return new Set(scalePitchClasses(tonic, 'major'));
  return new Set([
    ...scalePitchClasses(tonic, 'naturalMinor'),
    ...scalePitchClasses(tonic, 'harmonicMinor'),
    ...scalePitchClasses(tonic, 'melodicMinor'),
  ]);
}

/* --------------------------------------------------------- key estimation */

// Krumhansl–Schmuckler style key profiles, correlated against a duration-weighted
// pitch-class histogram. Robust enough for scores, and cheap.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a, b) {
  const n = a.length;
  const mA = a.reduce((s, v) => s + v, 0) / n;
  const mB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dA = 0;
  let dB = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] - mA;
    const y = b[i] - mB;
    num += x * y;
    dA += x * x;
    dB += y * y;
  }
  const den = Math.sqrt(dA * dB);
  return den === 0 ? 0 : num / den;
}

/**
 * Estimate the key of a set of notes.
 * @param {Array<{midi:number, duration?:number}>} notes
 * @returns {{tonic:number, mode:'major'|'minor', name:string, confidence:number}}
 */
export function estimateKey(notes) {
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[pitchClass(n.midi)] += Math.max(n.duration ?? 0.25, 0.05);

  let best = { tonic: 0, mode: 'major', score: -Infinity };
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const rotated = hist.slice(tonic).concat(hist.slice(0, tonic));
    const major = correlate(rotated, MAJOR_PROFILE);
    const minor = correlate(rotated, MINOR_PROFILE);
    if (major > best.score) best = { tonic, mode: 'major', score: major };
    if (minor > best.score) best = { tonic, mode: 'minor', score: minor };
  }
  return {
    tonic: best.tonic,
    mode: best.mode,
    name: `${PITCH_CLASS_NAMES[best.tonic]} ${best.mode}`,
    confidence: Number(Math.max(0, best.score).toFixed(3)),
  };
}

/* --------------------------------------------------------------- chords */

const CHORD_SHAPES = [
  { name: 'maj', intervals: [0, 4, 7], quality: 'major' },
  { name: 'm', intervals: [0, 3, 7], quality: 'minor' },
  { name: 'dim', intervals: [0, 3, 6], quality: 'diminished' },
  { name: 'aug', intervals: [0, 4, 8], quality: 'augmented' },
  { name: 'sus4', intervals: [0, 5, 7], quality: 'suspended' },
  { name: 'sus2', intervals: [0, 2, 7], quality: 'suspended' },
  { name: '7', intervals: [0, 4, 7, 10], quality: 'dominant' },
  { name: 'maj7', intervals: [0, 4, 7, 11], quality: 'major' },
  { name: 'm7', intervals: [0, 3, 7, 10], quality: 'minor' },
  { name: 'm7b5', intervals: [0, 3, 6, 10], quality: 'half-diminished' },
  { name: 'dim7', intervals: [0, 3, 6, 9], quality: 'diminished' },
  { name: '6', intervals: [0, 4, 7, 9], quality: 'major' },
  { name: 'm6', intervals: [0, 3, 7, 9], quality: 'minor' },
];

/**
 * Identify the chord formed by a group of simultaneously sounding pitches.
 * Scores every root/shape pair by coverage of the played set, which handles
 * inversions, doublings and incomplete voicings (e.g. root + 3rd only).
 * @param {number[]} midiNotes
 * @returns {null|{root:number, name:string, symbol:string, quality:string, pitchClasses:number[], fit:number}}
 */
export function identifyChord(midiNotes) {
  const present = [...new Set(midiNotes.map(pitchClass))];
  // A single pitch is not a chord. Naming one produces nonsense feedback like
  // "non-chord tone over D#" when all that was sounding was one D#.
  if (present.length < 2) return null;

  const bass = pitchClass(Math.min(...midiNotes));
  let best = null;

  for (let root = 0; root < 12; root += 1) {
    for (const shape of CHORD_SHAPES) {
      const shapePcs = shape.intervals.map((i) => pitchClass(root + i));
      const matched = present.filter((pc) => shapePcs.includes(pc)).length;
      const extra = present.length - matched;
      const missing = shapePcs.length - matched;
      // Reward matches, penalise notes the shape can't explain more than
      // shape notes the player merely omitted.
      let fit = matched * 1.0 - extra * 1.2 - missing * 0.35;
      if (bass === root) fit += 0.4; // root position bonus
      if (present.includes(root)) fit += 0.2;
      if (best === null || fit > best.fit) {
        best = { root, name: shape.name, quality: shape.quality, pitchClasses: shapePcs, fit };
      }
    }
  }
  if (!best || best.fit <= 0) return null;
  return {
    ...best,
    fit: Number(best.fit.toFixed(2)),
    symbol: `${PITCH_CLASS_NAMES[best.root]}${best.name === 'maj' ? '' : best.name}`,
  };
}

/* ------------------------------------------------- wrong-note classification */

export const ERROR_KINDS = {
  NEIGHBOUR: 'neighbour',
  OCTAVE: 'octave',
  CHORD_TONE: 'chordTone',
  IN_KEY: 'inKey',
  OUT_OF_KEY: 'outOfKey',
  DISSONANT: 'dissonant',
};

/** Human-readable severity 0..1 — drives colour and the error audio cue. */
export const ERROR_SEVERITY = {
  [ERROR_KINDS.OCTAVE]: 0.2,
  [ERROR_KINDS.CHORD_TONE]: 0.35,
  [ERROR_KINDS.NEIGHBOUR]: 0.6,
  [ERROR_KINDS.IN_KEY]: 0.5,
  [ERROR_KINDS.OUT_OF_KEY]: 0.85,
  [ERROR_KINDS.DISSONANT]: 1,
};

/**
 * Explain a wrong note.
 *
 * @param {number} playedMidi        what the player actually pressed
 * @param {number[]} expectedMidi    notes that should be sounding right now
 * @param {{tonic:number, mode:string}} key  estimated key of the piece
 * @returns {{kind:string, severity:number, label:string, detail:string, chord:object|null}}
 */
export function classifyWrongNote(playedMidi, expectedMidi, key) {
  const chord = identifyChord(expectedMidi);
  const pc = pitchClass(playedMidi);
  const keySet = keyPitchClassSet(key.tonic, key.mode);
  const inKey = keySet.has(pc);
  const isChordTone = chord ? chord.pitchClasses.includes(pc) : false;

  // Same pitch class as an expected note, but wrong register.
  const octaveSlip = expectedMidi.some((m) => pitchClass(m) === pc && m !== playedMidi);
  if (octaveSlip) {
    return {
      kind: ERROR_KINDS.OCTAVE,
      severity: ERROR_SEVERITY[ERROR_KINDS.OCTAVE],
      label: 'Right note, wrong octave',
      detail: `${noteName(playedMidi)} is the correct pitch class but the score wants ${expectedMidi
        .filter((m) => pitchClass(m) === pc)
        .map((m) => noteName(m))
        .join(' / ')}.`,
      chord,
    };
  }

  // One semitone off an expected note — the classic finger slip onto the
  // neighbouring key. Worth calling out separately because the fix is physical,
  // not musical.
  const neighbour = expectedMidi.find((m) => Math.abs(m - playedMidi) === 1);
  if (neighbour !== undefined) {
    return {
      kind: ERROR_KINDS.NEIGHBOUR,
      severity: ERROR_SEVERITY[ERROR_KINDS.NEIGHBOUR],
      label: 'Adjacent key slip',
      detail: `${noteName(playedMidi)} is a semitone ${playedMidi > neighbour ? 'above' : 'below'} ${noteName(
        neighbour,
      )} — check your hand position.`,
      chord,
    };
  }

  if (isChordTone) {
    return {
      kind: ERROR_KINDS.CHORD_TONE,
      severity: ERROR_SEVERITY[ERROR_KINDS.CHORD_TONE],
      label: 'Harmonically fine, not in the score',
      detail: `${noteName(playedMidi)} belongs to ${chord.symbol} so it doesn't clash, but the score asks for ${
        expectedMidi.map((m) => noteName(m)).join(' / ') || 'nothing here'
      }.`,
      chord,
    };
  }

  if (inKey) {
    return {
      kind: ERROR_KINDS.IN_KEY,
      severity: ERROR_SEVERITY[ERROR_KINDS.IN_KEY],
      label: 'Wrong note, still in key',
      detail: `${noteName(playedMidi)} is diatonic to ${PITCH_CLASS_NAMES[key.tonic]} ${key.mode}${
        chord ? ` but is a non-chord tone over ${chord.symbol}` : ''
      }.`,
      chord,
    };
  }

  // Outside the key. Check for a hard clash (semitone or tritone against a
  // sounding note) to distinguish "spicy" from "painful".
  const clashing = expectedMidi.some((m) => {
    const iv = Math.abs(pitchClass(m - playedMidi));
    return iv === 1 || iv === 11 || iv === 6;
  });
  if (clashing) {
    return {
      kind: ERROR_KINDS.DISSONANT,
      severity: ERROR_SEVERITY[ERROR_KINDS.DISSONANT],
      label: 'Dissonant clash',
      detail: `${noteName(playedMidi)} is outside ${PITCH_CLASS_NAMES[key.tonic]} ${key.mode} and clashes with the sounding harmony.`,
      chord,
    };
  }

  return {
    kind: ERROR_KINDS.OUT_OF_KEY,
    severity: ERROR_SEVERITY[ERROR_KINDS.OUT_OF_KEY],
    label: 'Out of key',
    detail: `${noteName(playedMidi)} is not part of ${PITCH_CLASS_NAMES[key.tonic]} ${key.mode}.`,
    chord,
  };
}

/** Notes from the score that are sounding at time t (seconds). */
export function notesSoundingAt(notes, t, pad = 0.02) {
  return notes.filter((n) => n.time - pad <= t && n.time + n.duration + pad >= t);
}
