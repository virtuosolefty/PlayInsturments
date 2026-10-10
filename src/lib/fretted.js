import { easyStudies } from './easySongs.js';
import { noteName } from './theory.js';

/**
 * fretted.js — the bass guitar: four strings, with frets.
 *
 * It shares the guitar's studio (GuitarWorkspace.jsx), its tablature and its
 * `{ string, fret }` places; what differs is here: the tuning and the lessons.
 * The guitar itself stays in guitar.js.
 *
 * Strings are listed from the fourth to the first, as tablature numbers them
 * from the bottom line up, which on the bass is also low to high.
 */

export const BASS_TUNING = Object.freeze([28, 33, 38, 43]); // E1 A1 D2 G2
const FRETS = 12;

const TUNINGS = Object.freeze({ bass: BASS_TUNING });
const LABELS = Object.freeze({ bass: 'Bass' });
/** A string of the same name keeps the colour the guitar gives it. */
const COLORS = Object.freeze({
  bass: Object.freeze(['#e9b870', '#eb9c9b', '#c2a6f4', '#76b8f3']),
});

export function frettedMidi(instrument, string, fret) {
  const tuning = TUNINGS[instrument];
  if (!tuning || !Number.isInteger(string) || string < 0 || string >= tuning.length ||
      !Number.isInteger(fret) || fret < 0 || fret > FRETS) return null;
  return tuning[string] + fret;
}

/** One finger to a fret in first position; an open string needs none. */
const finger = fret => (fret === 0 ? 0 : Math.min(4, fret));

const keyOf = (tonic, mode) => ({ tonic, mode, name: `${noteName(60 + tonic).replace(/\d/g, '')} ${mode}`, confidence: 1 });
const rangeOf = notes => [Math.min(...notes.map(note => note.midi)), Math.max(...notes.map(note => note.midi))];

// Each place is [string, fret] or [string, fret, beats].
function study(instrument, id, title, description, places, { bpm = 72, tonic = 0, mode = 'major' } = {}) {
  const beat = 60 / bpm;
  let time = 0;
  const notes = places.map(([string, fret, beats = 1], index) => {
    const midi = frettedMidi(instrument, string, fret);
    const note = {
      id: index, midi, name: noteName(midi), string, fret, finger: finger(fret),
      time, duration: beat * beats * 0.8, velocity: 0.72, hand: 'right', track: 0,
    };
    time += beat * beats;
    return note;
  });
  return {
    id: `${instrument}-${id}`, title, description, composer: `${LABELS[instrument]} essentials`,
    source: `authored-${instrument}-study`, instrument, variant: `${instrument}:standard:${FRETS}`,
    bpm, timeSignature: [4, 4], key: keyOf(tonic, mode),
    notes, noteCount: notes.length, duration: notes.at(-1).time + notes.at(-1).duration, range: rangeOf(notes),
  };
}

const upAndBack = places => [...places, ...places.slice(0, -1).reverse()];
const twice = places => [...places, ...places];

const BASS_LESSONS = [
  study('bass', 'open-strings', 'Meet the four strings',
    'Pluck each open string, from low E up to G and back. Rest your thumb on the body and pluck with your first two fingers.',
    twice([0, 1, 2, 3, 2, 1, 0, 3].map(string => [string, 0])), { bpm: 66, tonic: 4, mode: 'minor' }),
  study('bass', 'first-frets', 'Your first fretted notes',
    'Play the low E string open, then fret 1 with your index finger and fret 3 with your ring finger: E, F and G.',
    [[0, 0], [0, 1], [0, 3], [0, 1], [0, 0], [0, 1], [0, 3], [0, 0]], { bpm: 60, tonic: 4, mode: 'minor' }),
  study('bass', 'g-major', 'G major · one octave',
    'From G on the lowest string up to the open G string, and back. Open strings give your hand a moment to move.',
    upAndBack([[0, 3], [1, 0], [1, 2], [1, 3], [2, 0], [2, 2], [2, 4], [3, 0]]), { bpm: 72, tonic: 7 }),
  study('bass', 'root-notes', 'Roots on the beat',
    'A bass player’s first job: the name-note of each chord, once a beat. Four of G, four of C, four of D, and home to G.',
    [...Array(4).fill([0, 3]), ...Array(4).fill([1, 3]), ...Array(4).fill([2, 0]), [0, 3], [0, 3], [0, 3, 2]], { bpm: 80, tonic: 7 }),
  study('bass', 'root-and-fifth', 'Root and fifth',
    'Rock between each chord’s root and the note five steps above it. It is the sound of half the bass lines ever played.',
    [[0, 3], [2, 0], [0, 3], [2, 0], [1, 3], [3, 0], [1, 3], [3, 0], [2, 0], [3, 2], [2, 0], [3, 2], [0, 3, 2], [0, 3, 2]], { bpm: 80, tonic: 7 }),
  study('bass', 'walking-line', 'Walking up · your first bass line',
    'An original line that climbs through the chord and walks back down. Keep every note the same length.',
    [...twice([[0, 3], [1, 2], [2, 0], [2, 2], [3, 0], [2, 2], [2, 0], [1, 2]]), [0, 3, 2], [0, 3, 2]], { bpm: 84, tonic: 7 }),
];

/** How the easy songs (easySongs.js) are arranged: first position, a finger to a fret, friendliest keys first. */
const SONG_SPECS = Object.freeze({
  bass: Object.freeze({ instrument: 'bass', label: 'Bass', tuning: BASS_TUNING, reach: 4, variant: `bass:standard:${FRETS}`, tonics: [36, 31, 38, 33, 28, 29], finger }),
});

const stages = {
  bass: [
    { id: 'strings', name: 'Meet your strings', goal: 'Find all four open strings, from low E to G.', exercises: ['bass-open-strings'] },
    { id: 'frets', name: 'Find your first notes', goal: 'Use open strings and frets 1–4 with a relaxed hand.', exercises: ['bass-first-frets', 'bass-g-major'] },
    { id: 'groove', name: 'Hold down the chords', goal: 'Play each chord’s root on the beat, then add its fifth.', exercises: ['bass-root-notes', 'bass-root-and-fifth'] },
    { id: 'first-tune', name: 'Play your first bass line', goal: 'Walk through a chord and back, evenly.', exercises: ['bass-walking-line'] },
  ],
};

const kit = (instrument, lessons) => {
  const songs = easyStudies(SONG_SPECS[instrument]);
  return Object.freeze({
    tuning: TUNINGS[instrument], frets: FRETS, colors: COLORS[instrument], chords: [], lessons, songs, studies: [...lessons, ...songs],
    pathStages: stages[instrument], firstLesson: `${instrument}-open-strings`, finger,
  });
};

export const FRETTED = Object.freeze({
  bass: kit('bass', BASS_LESSONS),
});
