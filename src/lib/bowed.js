import { easyStudies } from './easySongs.js';
import { noteName } from './theory.js';

/**
 * Violin and cello: four strings tuned in fifths, no frets.
 *
 * Positions reuse the guitar's `{ string, fret }` shape so the tab, feedback
 * and matcher stay shared. On a bowed instrument `fret` means "semitones above
 * the open string"; the UI calls it a finger place, never a fret.
 */

/** Low string to high string. String numbers follow convention: highest = 1. */
export const VIOLIN_TUNING = [55, 62, 69, 76]; // G3 D4 A4 E5
export const CELLO_TUNING = [36, 43, 50, 57]; // C2 G2 D3 A3
export const BOWED_MAX_POSITION = 12;

const TUNINGS = { violin: VIOLIN_TUNING, cello: CELLO_TUNING };
const LABELS = { violin: 'Violin', cello: 'Cello' };

// Semitones above the open string → first-position finger. A place beyond the
// hand frame needs a shift, so it gets no finger rather than a guessed one.
const FINGERS = {
  violin: [0, 1, 1, 2, 2, 3, 3, 4, 4],
  cello: [0, 1, 1, 2, 3, 4, 4],
};
const REACH = { violin: 7, cello: 5 };

/** Where beginner tapes go: the first-position finger places. */
export const BOWED_TAPES = {
  violin: [{ fret: 2, finger: 1 }, { fret: 4, finger: 2 }, { fret: 5, finger: 3 }, { fret: 7, finger: 4 }],
  cello: [{ fret: 2, finger: 1 }, { fret: 3, finger: 2 }, { fret: 4, finger: 3 }, { fret: 5, finger: 4 }],
};

export function bowedMidi(instrument, string, fret) {
  const tuning = TUNINGS[instrument];
  if (!tuning || !Number.isInteger(string) || string < 0 || string >= tuning.length ||
      !Number.isInteger(fret) || fret < 0 || fret > BOWED_MAX_POSITION) return null;
  return tuning[string] + fret;
}

export function bowedFinger(instrument, fret) {
  return FINGERS[instrument]?.[fret] ?? null;
}

/** The furthest place first position reaches without shifting. */
export function bowedReach(instrument) {
  return REACH[instrument] ?? 0;
}

export function bowedStringName(instrument, string) {
  const tuning = TUNINGS[instrument];
  return { note: noteName(tuning[string]).replace(/\d/g, ''), number: tuning.length - string };
}

// Each place is [string, fret] or [string, fret, beats].
function study(instrument, id, title, description, places, { bpm = 66, tonic = 0, mode = 'major' } = {}) {
  const beat = 60 / bpm;
  let time = 0;
  const notes = places.map(([string, fret, beats = 1], i) => {
    const midi = bowedMidi(instrument, string, fret);
    const note = {
      id: i, midi, name: noteName(midi), string, fret, finger: bowedFinger(instrument, fret),
      time, duration: beat * beats * 0.88, velocity: 0.7, hand: 'right', track: 0,
    };
    time += beat * beats;
    return note;
  });
  return {
    id: `${instrument}-${id}`, title, description, composer: `${LABELS[instrument]} essentials`,
    source: `authored-${instrument}-study`, instrument, variant: `${instrument}:first-position`,
    bpm, timeSignature: [4, 4], key: { tonic, mode, name: `${noteName(60 + tonic).replace(/\d/g, '')} ${mode}`, confidence: 1 },
    notes, noteCount: notes.length, duration: notes.at(-1).time + notes.at(-1).duration,
    range: [Math.min(...notes.map(n => n.midi)), Math.max(...notes.map(n => n.midi))],
  };
}

const run = (string, frets) => frets.map(fret => [string, fret]);
const upAndBack = places => [...places, ...places.slice(0, -1).reverse()];
const long = places => places.map(([s, f]) => [s, f, 2]);

// Twinkle, Twinkle is a traditional melody; the arrangements are authored here.
const VIOLIN_STUDIES = [
  study('violin', 'open-strings', 'Meet the four strings',
    'Draw a long, even bow on each open string, from low G to high E and back. A 0 means no finger.',
    long([...run(0, [0]), ...run(1, [0]), ...run(2, [0]), ...run(3, [0]), ...run(3, [0]), ...run(2, [0]), ...run(1, [0]), ...run(0, [0])]), { bpm: 72, tonic: 7 }),
  study('violin', 'a-string-fingers', 'First fingers on the A string',
    'Place fingers 1, 2 and 3 on the A string. Keep fingers 2 and 3 close together, like the tapes.',
    upAndBack(run(2, [0, 2, 4, 5])), { bpm: 60, tonic: 9 }),
  study('violin', 'e-string', 'Up to the E string',
    'The same finger pattern on the E string, reaching your fourth finger to B.',
    upAndBack(run(3, [0, 2, 4, 5, 7])), { bpm: 60, tonic: 9 }),
  study('violin', 'd-major', 'D major · one octave',
    'Your first scale: the same pattern on the D string, then the A string.',
    upAndBack([...run(1, [0, 2, 4, 5]), ...run(2, [0, 2, 4, 5])]), { bpm: 66, tonic: 2 }),
  study('violin', 'g-major', 'G major · the low strings',
    'Bring the pattern down to the G and D strings. Let the open strings ring.',
    upAndBack([...run(0, [0, 2, 4, 5]), ...run(1, [0, 2, 4, 5])]), { bpm: 66, tonic: 7 }),
  study('violin', 'twinkle', 'Twinkle, Twinkle · your first tune',
    'A traditional first tune on the A and E strings. Give each long note a full bow.',
    [[2, 0], [2, 0], [3, 0], [3, 0], [3, 2], [3, 2], [3, 0, 2], [2, 5], [2, 5], [2, 4], [2, 4], [2, 2], [2, 2], [2, 0, 2]], { bpm: 80, tonic: 9 }),
];

const CELLO_STUDIES = [
  study('cello', 'open-strings', 'Meet the four strings',
    'Draw a long, even bow on each open string, from low C to A and back. A 0 means no finger.',
    long([...run(0, [0]), ...run(1, [0]), ...run(2, [0]), ...run(3, [0]), ...run(3, [0]), ...run(2, [0]), ...run(1, [0]), ...run(0, [0])]), { bpm: 72 }),
  study('cello', 'd-string-fingers', 'First fingers on the D string',
    'Use fingers 1, 3 and 4 on the D string. Each finger covers one semitone.',
    upAndBack(run(2, [0, 2, 4, 5])), { bpm: 60, tonic: 2 }),
  study('cello', 'g-string', 'Walking on the G string',
    'The same frame on the G string, then cross to the open D.',
    upAndBack([...run(1, [0, 2, 4, 5]), ...run(2, [0])]), { bpm: 60, tonic: 7 }),
  study('cello', 'c-major', 'C major · one octave',
    'Start on the lowest string. Cross to the G string for the top of the scale.',
    upAndBack([...run(0, [0, 2, 4, 5]), ...run(1, [0, 2, 4, 5])]), { bpm: 66 }),
  study('cello', 'd-major', 'D major · one octave',
    'The same pattern on the D and A strings. Listen for the bright F sharp.',
    upAndBack([...run(2, [0, 2, 4, 5]), ...run(3, [0, 2, 4, 5])]), { bpm: 66, tonic: 2 }),
  study('cello', 'twinkle', 'Twinkle, Twinkle · your first tune',
    'A traditional first tune on the D and A strings. Give each long note a full bow.',
    [[2, 0], [2, 0], [3, 0], [3, 0], [3, 2], [3, 2], [3, 0, 2], [2, 5], [2, 5], [2, 4], [2, 4], [2, 2], [2, 2], [2, 0, 2]], { bpm: 80, tonic: 2 }),
];

const STAGE_LESSONS = {
  violin: { fingers: ['violin-a-string-fingers', 'violin-e-string'], scales: ['violin-d-major', 'violin-g-major'] },
  cello: { fingers: ['cello-d-string-fingers', 'cello-g-string'], scales: ['cello-c-major', 'cello-d-major'] },
};

const stages = instrument => [
  { id: 'strings', name: 'Meet your strings', goal: 'Bow all four open strings with a steady sound.', exercises: [`${instrument}-open-strings`] },
  { id: 'fingers', name: 'Place your first fingers', goal: 'Find the finger places marked by the tapes.', exercises: STAGE_LESSONS[instrument].fingers },
  { id: 'scales', name: 'Your first scales', goal: 'Join two strings into a one-octave scale.', exercises: STAGE_LESSONS[instrument].scales },
  { id: 'first-tune', name: 'Play your first tune', goal: 'Bring your fingers and bow together in a melody.', exercises: [`${instrument}-twinkle`] },
];

const scale = (name, places) => ({ name, positions: places.map(([string, fret]) => ({ string, fret })) });

/**
 * A bowed instrument as the easy songs are arranged for it (easySongs.js):
 * first position, on the open strings and the tapes wherever a key allows,
 * in the keys its first scales are in, friendliest first.
 */
const songSpec = (instrument, label, tonics) => Object.freeze({
  instrument, label, bowed: true, tuning: TUNINGS[instrument], reach: REACH[instrument], variant: `${instrument}:first-position`,
  tapes: [0, ...BOWED_TAPES[instrument].map(tape => tape.fret)], tonics, finger: fret => bowedFinger(instrument, fret),
});

/** Ten tunes everybody knows, open from the start. They are not part of the path. */
const VIOLIN_SONGS = easyStudies(songSpec('violin', 'Violin', [62, 69, 55, 67, 74]));
const CELLO_SONGS = easyStudies(songSpec('cello', 'Cello', [50, 43, 36, 55, 48, 45]));

export const BOWED = {
  violin: {
    tuning: VIOLIN_TUNING, lessons: VIOLIN_STUDIES, songs: VIOLIN_SONGS, studies: [...VIOLIN_STUDIES, ...VIOLIN_SONGS], pathStages: stages('violin'), firstLesson: 'violin-open-strings',
    scales: [
      scale('D major', [...run(1, [0, 2, 4, 5]), ...run(2, [0, 2, 4, 5])]),
      scale('A major', [...run(2, [0, 2, 4, 5]), ...run(3, [0, 2, 4, 5])]),
      scale('G major', [...run(0, [0, 2, 4, 5]), ...run(1, [0, 2, 4, 5])]),
      scale('C major', [...run(0, [5]), ...run(1, [0, 2, 3, 5]), ...run(2, [0, 2, 3])]),
    ],
  },
  cello: {
    tuning: CELLO_TUNING, lessons: CELLO_STUDIES, songs: CELLO_SONGS, studies: [...CELLO_STUDIES, ...CELLO_SONGS], pathStages: stages('cello'), firstLesson: 'cello-open-strings',
    scales: [
      scale('C major', [...run(0, [0, 2, 4, 5]), ...run(1, [0, 2, 4, 5])]),
      scale('G major', [...run(1, [0, 2, 4, 5]), ...run(2, [0, 2, 4, 5])]),
      scale('D major', [...run(2, [0, 2, 4, 5]), ...run(3, [0, 2, 4, 5])]),
      scale('F major', [...run(0, [5]), ...run(1, [0, 2, 3, 5]), ...run(2, [0, 2, 3])]),
    ],
  },
};
