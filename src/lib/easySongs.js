import { noteName } from './theory.js';

/**
 * easySongs.js — ten tunes everybody knows, written once and arranged for
 * every instrument.
 *
 * A lesson teaches a skill; these are the reason to want one. Each is short,
 * stays within an octave or so, and is open from the first visit. All ten are
 * traditional or long out of copyright.
 *
 * A tune is written in sol-fa, so it has no key of its own: `d r m f s l t`
 * are the steps of the major scale, `,` puts a note in the octave below and
 * `'` in the octave above. A note is a beat long unless a mark follows it:
 * `2`, `3` or `4` for that many beats, `.` for a beat and a half, `/` for half
 * a beat. `-` is a rest and takes the same marks. `|` ends a bar, and every
 * bar has to add up to the metre, so a tune that starts before the bar line
 * (Happy Birthday) is written with rests in front of it.
 *
 * Each string instrument then gets the tune in a key that sits in its first
 * position (`arrangeTune`), and the piano gets it from middle C (`pianoTune`,
 * which scripts/build-songs.mjs writes out as MIDI).
 */

export const EASY_TUNES = Object.freeze([
  { id: 'hot-cross-buns', title: 'Hot Cross Buns', composer: 'Traditional', bpm: 84, meter: 4,
    description: 'Three notes, stepping down. The best first tune there is.',
    text: 'm r d2 | m r d2 | d/ d/ d/ d/ r/ r/ r/ r/ | m r d2' },
  { id: 'mary-had-a-little-lamb', title: 'Mary Had a Little Lamb', composer: 'Traditional', bpm: 96, meter: 4,
    description: 'Four notes that mostly move by step, with one small jump up.',
    text: 'm r d r | m m m2 | r r r2 | m s s2 | m r d r | m m m m | r r m r | d4' },
  { id: 'au-clair-de-la-lune', title: 'Au Clair de la Lune', composer: 'Traditional', bpm: 92, meter: 4,
    description: 'A French lullaby on three notes, with long notes to rest on.',
    text: 'd d d r | m2 r2 | d m r r | d4 | d d d r | m2 r2 | d m r r | d4' },
  { id: 'lightly-row', title: 'Lightly Row', composer: 'Traditional', bpm: 96, meter: 4,
    description: 'Five notes under one hand, falling in small skips and climbing back by step.',
    text: 's m m2 | f r r2 | d r m f | s s s2 | s m m m | f r r r | d m s s | d4' },
  { id: 'go-tell-aunt-rhody', title: 'Go Tell Aunt Rhody', composer: 'Traditional', bpm: 88, meter: 4,
    description: 'Long and short notes side by side. Count the long ones all the way through.',
    text: 'm2 m r | d2 d2 | r2 r f | m r d2 | s2 s f | m2 m2 | r d r m | d4' },
  { id: 'jingle-bells', title: 'Jingle Bells', composer: 'James Pierpont', bpm: 104, meter: 4,
    description: 'The chorus. Mostly one note, so the rhythm is what you are learning.',
    text: 'm m m2 | m m m2 | m s d. r/ | m4 | f f f. f/ | f m m m/ m/ | m r r m | r2 s2 | m m m2 | m m m2 | m s d. r/ | m4 | f f f. f/ | f m m m/ m/ | s s f r | d4' },
  { id: 'london-bridge', title: 'London Bridge', composer: 'Traditional', bpm: 100, meter: 4,
    description: 'One note higher than the others reach, and a long-short lilt at the start of each line.',
    text: 's. l/ s f | m f s2 | r m f2 | m f s2 | s. l/ s f | m f s2 | r2 s2 | m d3' },
  { id: 'old-macdonald', title: 'Old MacDonald Had a Farm', composer: 'Traditional', bpm: 100, meter: 4,
    description: 'Dips below the home note and comes back up. Listen for where home is.',
    text: 'd d d s, | l, l, s,2 | m m r r | d3 s, | d d d s, | l, l, s,2 | m m r r | d4' },
  { id: 'yankee-doodle', title: 'Yankee Doodle', composer: 'Traditional', bpm: 108, meter: 4,
    description: 'Quick and even, with notes on both sides of home. Keep every beat the same length.',
    text: 'd d r m | d m r s, | d d r m | d2 t,2 | d d r m | f m r d | t, s, l, t, | d2 d2' },
  { id: 'happy-birthday', title: 'Happy Birthday to You', composer: 'Patty and Mildred Hill', bpm: 92, meter: 3,
    description: 'Three beats to the bar, and it starts before the first full one. The tune you will be asked for most.',
    text: '- - s,/ s,/ | l, s, d | t,2 s,/ s,/ | l, s, r | d2 s,/ s,/ | s m d | t, l, f/ f/ | m d r | d3' },
].map(Object.freeze));

const STEPS = Object.freeze({ d: 0, r: 2, m: 4, f: 5, s: 7, l: 9, t: 11 });
const LENGTHS = Object.freeze({ '': 1, '/': 0.5, '.': 1.5, 2: 2, 3: 3, 4: 4 });
const MARK = /^([drmfslt-])([,']?)([/.234]?)$/;

/**
 * A tune as steps above do and beats.
 *
 * @param {{ title: string, meter: number, text: string }} tune
 * @returns {{ notes: { step: number, start: number, beats: number }[], length: number, range: [number, number] }}
 *   `start` and `length` are in beats; a rest moves time on and is not a note
 */
export function parseTune(tune) {
  const notes = [];
  let time = 0;
  tune.text.split('|').forEach((bar, index) => {
    let filled = 0;
    for (const mark of bar.trim().split(/\s+/)) {
      const read = MARK.exec(mark);
      if (!read) throw new Error(`${tune.title}: bar ${index + 1} has a mark that cannot be read, "${mark}"`);
      const [, syllable, octave, length] = read;
      const beats = LENGTHS[length];
      if (syllable !== '-') notes.push({ step: STEPS[syllable] + (octave === ',' ? -12 : octave === '\'' ? 12 : 0), start: time + filled, beats });
      filled += beats;
    }
    if (filled !== tune.meter) throw new Error(`${tune.title}: bar ${index + 1} is ${filled} beats long, not ${tune.meter}`);
    time += filled;
  });
  const steps = notes.map(note => note.step);
  return { notes, length: time, range: [Math.min(...steps), Math.max(...steps)] };
}

/**
 * Where a note is played in first position: on the string just below it,
 * open where it can be. This is the chart every method book prints, not a
 * guess at a fingering, and it gives each note one place.
 *
 * @param {{ tuning: number[], reach: number, tapes?: number[] }} spec
 *   `reach` is the highest fret (or finger place) the hand gets to without moving; `tapes` the
 *   places a beginner has marked
 * @param {number} midi
 * @param {{ strict?: boolean }} [options] strict keeps to the tapes
 * @returns {{ string: number, fret: number } | null}
 */
export function placeInFirstPosition(spec, midi, { strict = false } = {}) {
  const below = spec.tuning.map((_, index) => index).filter(string => spec.tuning[string] <= midi);
  if (!below.length) return null;
  const string = below.reduce((best, each) => (spec.tuning[each] > spec.tuning[best] ? each : best));
  const fret = midi - spec.tuning[string];
  if (fret > spec.reach) return null;
  if (strict && spec.tapes && !spec.tapes.includes(fret)) return null;
  return { string, fret };
}

/**
 * The key an instrument plays a tune in: the first on its list in which every
 * note has a place on the tapes, or failing that, a place within reach.
 *
 * @param {{ notes: { step: number }[] }} parsed from `parseTune`
 * @param {{ tonics: number[] }} spec `tonics` are the notes do may be, friendliest key first
 * @returns {{ tonic: number, strict: boolean } | null}
 */
export function fitTonic(parsed, spec) {
  for (const strict of [true, false]) {
    const tonic = spec.tonics.find(each => parsed.notes.every(note => placeInFirstPosition(spec, each + note.step, { strict })));
    if (tonic !== undefined) return { tonic, strict };
  }
  return null;
}

/** How much of its written length a note sounds for: a bow joins notes more closely than a pick. */
const SOUNDING = Object.freeze({ bowed: 0.88, plucked: 0.8 });

/**
 * A tune as a study for one string instrument, in the shape of its lessons.
 *
 * @param {object} tune one of EASY_TUNES
 * @param {object} spec the instrument: `instrument`, `label`, `tuning`, `reach`, `tonics`, `finger(fret)`,
 *   `variant`, and optionally `bowed` and `tapes`
 */
export function arrangeTune(tune, spec) {
  const parsed = parseTune(tune);
  const fit = fitTonic(parsed, spec);
  if (!fit) throw new Error(`${tune.title} has no key that sits in first position on the ${spec.label.toLowerCase()}`);
  const beat = 60 / tune.bpm;
  const notes = parsed.notes.map((note, id) => {
    const midi = fit.tonic + note.step;
    const { string, fret } = placeInFirstPosition(spec, midi);
    return {
      id, midi, name: noteName(midi), string, fret, finger: spec.finger(fret),
      time: note.start * beat, duration: note.beats * beat * (spec.bowed ? SOUNDING.bowed : SOUNDING.plucked),
      velocity: spec.bowed ? 0.7 : 0.72, hand: 'right', track: 0,
    };
  });
  const midis = notes.map(note => note.midi);
  const tonic = ((fit.tonic % 12) + 12) % 12;
  return {
    id: `${spec.instrument}-${tune.id}`, title: tune.title, description: tune.description, composer: tune.composer,
    source: 'easy-song', instrument: spec.instrument, variant: spec.variant, difficulty: 1, easy: true,
    bpm: tune.bpm, timeSignature: [tune.meter, 4],
    key: { tonic, mode: 'major', name: `${noteName(60 + tonic).replace(/\d/g, '')} major`, confidence: 1 },
    notes, noteCount: notes.length, duration: notes.at(-1).time + notes.at(-1).duration,
    range: [Math.min(...midis), Math.max(...midis)],
  };
}

/** All ten tunes for one string instrument. */
export const easyStudies = spec => EASY_TUNES.map(tune => arrangeTune(tune, spec));

const MIDDLE_C = 60;
/** The finger for each step when the thumb sits on do and nothing moves. */
const FIVE_FINGERS = Object.freeze({ 0: 1, 2: 2, 4: 3, 5: 4, 7: 5 });

/**
 * A tune for the piano's right hand, from middle C.
 *
 * @returns {{ notes: { midi: number, start: number, beats: number, finger: number }[], key: [string, string] }}
 *   `finger` is 1 to 5 where the whole tune sits under one hand position, and 0 where it does not
 */
export function pianoTune(tune) {
  const parsed = parseTune(tune);
  const underOneHand = parsed.notes.every(note => note.step in FIVE_FINGERS);
  return {
    notes: parsed.notes.map(note => ({ midi: MIDDLE_C + note.step, start: note.start, beats: note.beats, finger: underOneHand ? FIVE_FINGERS[note.step] : 0 })),
    key: ['C', 'major'],
  };
}
