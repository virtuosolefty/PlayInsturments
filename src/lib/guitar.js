import { noteName } from './theory.js';

// Low E to high E. String numbers follow standard tablature (high E = 1).
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64];
export const GUITAR_FRETS = 12;
export const GUITAR_COLORS = ['#e9b870', '#eb9c9b', '#c2a6f4', '#76b8f3', '#64d8c6', '#d0db8a'];

export function guitarMidi(string, fret) {
  if (!Number.isInteger(string) || string < 0 || string > 5 ||
      !Number.isInteger(fret) || fret < 0 || fret > GUITAR_FRETS) return null;
  return GUITAR_TUNING[string] + fret;
}

export function guitarPositions(midi) {
  return GUITAR_TUNING.flatMap((open, string) => {
    const fret = midi - open;
    return Number.isInteger(fret) && fret >= 0 && fret <= GUITAR_FRETS ? [{ string, fret }] : [];
  });
}

function study(id, title, description, positions, bpm = 72, tonic = 0, mode = 'major') {
  const beat = 60 / bpm;
  const notes = positions.map(([string, fret], i) => ({
    id: i, midi: guitarMidi(string, fret), name: noteName(guitarMidi(string, fret)),
    string, fret, finger: fret === 0 ? 0 : Math.min(4, fret), time: i * beat, duration: beat * 0.8, velocity: 0.72,
    hand: 'right', track: 0,
  }));
  return {
    id: `guitar-${id}`, title, description, composer: 'Guitar essentials',
    source: 'authored-guitar-study', instrument: 'guitar', variant: 'guitar:standard:12',
    bpm, timeSignature: [4, 4], key: { tonic, mode, name: `${noteName(60 + tonic).replace(/\d/g, '')} ${mode}`, confidence: 1 },
    notes, noteCount: notes.length, duration: notes.at(-1).time + notes.at(-1).duration,
    range: [Math.min(...notes.map(n => n.midi)), Math.max(...notes.map(n => n.midi))],
  };
}

// Authored positions: never label an automatically chosen fret as a fingering lesson.
export const GUITAR_STUDIES = [
  study('open-strings', 'Meet the six strings', 'Pick each open string, from low E to high E and back. A 0 means play the string without fretting it.',
    [...[0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 5], ...[0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 5]].map(s => [s, 0]), 64, 4, 'minor'),
  study('c-major', 'C major · first position', 'A one-octave C major scale using open strings and frets 1–3. Keep your fretting hand relaxed.',
    [[1,3],[2,0],[2,2],[2,3],[3,0],[3,2],[4,0],[4,1],[4,0],[3,2],[3,0],[2,3],[2,2],[2,0],[1,3],[1,3]]),
  study('e-minor-pentatonic', 'E minor · first steps', 'A first-position pentatonic pattern. Use your index finger at fret 2 and ring finger at fret 3.',
    [[0,0],[0,3],[1,0],[1,2],[2,0],[2,2],[3,0],[3,2],[4,0],[4,3],[5,0],[5,3],[5,0],[4,3],[4,0],[3,2]], 68, 4, 'minor'),
  study('chromatic', 'Four fingers · steady steps', 'Place fingers 1–4 on frets 1–4. Pick evenly and lift only the finger you need.',
    [0,1,2,3,4,5].flatMap(s => [1,2,3,4].map(f => [s,f])), 60, 0),
  study('d-major', 'D major · melody builder', 'Build a D major melody on the top three strings. Keep the open notes ringing clearly.',
    [[2,0],[2,2],[2,4],[3,0],[3,2],[4,0],[4,2],[4,3],[5,0],[5,2],[5,0],[4,3],[4,2],[4,0],[3,2],[2,0]], 72, 2),
  study('a-minor', 'A minor · picking flow', 'An A minor arpeggio, one string at a time. Listen once, then try it slowly.',
    Array.from({length:4}, () => [[1,0],[2,2],[3,2],[4,1],[5,0],[4,1],[3,2],[2,2]]).flat(), 80, 9, 'minor'),
];

export const GUITAR_CHORDS = [
  { name: 'Em', frets: [0, 2, 2, 0, 0, 0], fingers: [0,2,3,0,0,0] },
  { name: 'Am', frets: [null, 0, 2, 2, 1, 0], fingers: [null,0,2,3,1,0] },
  { name: 'C', frets: [null, 3, 2, 0, 1, 0], fingers: [null,3,2,0,1,0] },
  { name: 'G', frets: [3, 2, 0, 0, 0, 3], fingers: [2,1,0,0,0,3] },
  { name: 'D', frets: [null, null, 0, 2, 3, 2], fingers: [null,null,0,1,3,2] },
];

export function chordPitches(chord) {
  return chord.frets.flatMap((fret, string) => fret === null ? [] : [guitarMidi(string, fret)]);
}

// Short, authored lessons for the beginner path. Chords share a beat so the
// existing matcher judges a strum as a chord, rather than six separate beats.
function chordStudy(id, title, names) {
  const bpm = 60, spacing = 4;
  const notes = names.flatMap((name, beat) => {
    const chord = GUITAR_CHORDS.find(c => c.name === name);
    return chord.frets.flatMap((fret, string) => fret === null ? [] : [{
      midi: guitarMidi(string, fret), name: noteName(guitarMidi(string, fret)),
      string, fret, finger: chord.fingers[string], chord: name,
      time: beat * spacing, duration: 2.5, velocity: .72, hand: 'right', track: 0,
    }]);
  }).map((note, id) => ({ ...note, id }));
  return { ...study(id, title, 'Strum once, then let the chord ring for four beats.', [[0, 0]], bpm, 4, 'minor'),
    notes, noteCount: notes.length, duration: notes.at(-1).time + notes.at(-1).duration,
    range: [Math.min(...notes.map(n => n.midi)), Math.max(...notes.map(n => n.midi))],
  };
}

GUITAR_STUDIES.push(
  study('first-frets', 'Your first fretted notes', 'Play the high E string open, then fret 1 with your index finger and fret 3 with your ring finger.',
    [[5,0],[5,1],[5,3],[5,1],[5,0],[5,1],[5,3],[5,0]], 60, 0),
  chordStudy('first-em', 'Your first chord · Em', ['Em', 'Em', 'Em', 'Em']),
  chordStudy('first-am', 'Your next chord · Am', ['Am', 'Am', 'Am', 'Am']),
  chordStudy('chord-changes', 'Two chords · Em to Am', ['Em', 'Am', 'Em', 'Am']),
  study('first-song', 'Morning steps · your first tune', 'An original eight-note melody using open strings and frets 1–3. Let each note ring before moving on.',
    [[4,1],[4,3],[5,0],[5,3],[5,1],[5,0],[4,3],[4,1]], 64, 0),
);

export const GUITAR_PATH_STAGES = [
  { id: 'strings', name: 'Meet your strings', goal: 'Find all six open strings, from low E to high E.', exercises: ['guitar-open-strings'] },
  { id: 'frets', name: 'Find your first notes', goal: 'Use open strings and frets 1–3 with a relaxed hand.', exercises: ['guitar-first-frets', 'guitar-c-major'] },
  { id: 'chords', name: 'Build two chords', goal: 'Learn Em and Am, then change between them at a steady pace.', exercises: ['guitar-first-em', 'guitar-first-am', 'guitar-chord-changes'] },
  { id: 'first-tune', name: 'Play your first tune', goal: 'Bring your notes and rhythm together in a short melody.', exercises: ['guitar-first-song'] },
];
