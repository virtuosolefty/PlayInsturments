import { describe, expect, it } from 'vitest';
import { EASY_TUNES, arrangeTune, easyStudies, fitTonic, parseTune, pianoTune, placeInFirstPosition } from './easySongs.js';

const tune = (text, extra = {}) => ({ id: 'test', title: 'Test', composer: 'Traditional', description: 'A test.', bpm: 60, meter: 4, text, ...extra });

/** A guitar in standard tuning, first position, as guitar.js describes it. */
const GUITAR = {
  instrument: 'guitar', label: 'Guitar', tuning: [40, 45, 50, 55, 59, 64], reach: 4,
  tonics: [60, 55], finger: fret => Math.min(4, fret), variant: 'guitar:standard:12',
};
/** A violin kept to its tapes where it can be. */
const VIOLIN = {
  instrument: 'violin', label: 'Violin', bowed: true, tuning: [55, 62, 69, 76], reach: 7, tapes: [0, 2, 4, 5, 7],
  tonics: [62, 67], finger: fret => [0, 1, 1, 2, 2, 3, 3, 4][fret] ?? null, variant: 'violin:first-position',
};

describe('reading a tune written in sol-fa', () => {
  it('turns each syllable into its step above do, a beat long unless it says otherwise', () => {
    const { notes } = parseTune(tune('d r m f | s l t d\''));
    expect(notes.map(note => note.step)).toEqual([0, 2, 4, 5, 7, 9, 11, 12]);
    expect(notes.every(note => note.beats === 1)).toBe(true);
    expect(notes.map(note => note.start)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('reads notes below do, long notes, dotted notes and half beats', () => {
    const { notes } = parseTune(tune('s, l,2 t, | d. r/ m2'));
    expect(notes.map(note => [note.step, note.beats])).toEqual([[-5, 1], [-3, 2], [-1, 1], [0, 1.5], [2, 0.5], [4, 2]]);
  });

  it('keeps a rest as time passing, not as a note', () => {
    const { notes, length } = parseTune(tune('- - d d | d4'));
    expect(notes.map(note => note.start)).toEqual([2, 3, 4]);
    expect(length).toBe(8);
  });

  it('says how far the tune reaches below and above do', () => {
    expect(parseTune(tune('s, d m s')).range).toEqual([-5, 7]);
  });

  it('refuses a bar that does not add up, naming the tune and the bar', () => {
    expect(() => parseTune(tune('d d d d | d d d'))).toThrow(/Test.*bar 2/);
    expect(() => parseTune(tune('d d d', { meter: 3 }))).not.toThrow();
  });

  it('refuses a mark it does not know', () => {
    expect(() => parseTune(tune('d x d d'))).toThrow(/"x"/);
  });
});

describe('the ten tunes', () => {
  it('are ten, each with its own id, a title, who wrote it and a line about it', () => {
    expect(EASY_TUNES).toHaveLength(10);
    expect(new Set(EASY_TUNES.map(each => each.id)).size).toBe(10);
    for (const each of EASY_TUNES) {
      expect(each.title, each.id).toBeTruthy();
      expect(each.composer, each.id).toBeTruthy();
      expect(each.description.length, each.id).toBeGreaterThan(20);
    }
  });

  it('all read, with every bar full', () => {
    for (const each of EASY_TUNES) expect(() => parseTune(each), each.id).not.toThrow();
  });

  it('stay within an octave and a bit, so each fits one hand position', () => {
    for (const each of EASY_TUNES) {
      const [low, high] = parseTune(each).range;
      expect(high - low, each.id).toBeLessThanOrEqual(12);
    }
  });

  it('open the way everybody sings them', () => {
    const opening = id => parseTune(EASY_TUNES.find(each => each.id === id)).notes.slice(0, 7).map(note => note.step);
    expect(opening('hot-cross-buns')).toEqual([4, 2, 0, 4, 2, 0, 0]);
    expect(opening('mary-had-a-little-lamb')).toEqual([4, 2, 0, 2, 4, 4, 4]);
    expect(opening('jingle-bells')).toEqual([4, 4, 4, 4, 4, 4, 4]);
    expect(opening('london-bridge')).toEqual([7, 9, 7, 5, 4, 5, 7]);
    expect(opening('yankee-doodle')).toEqual([0, 0, 2, 4, 0, 4, 2]);
    expect(opening('happy-birthday')).toEqual([-5, -5, -3, -5, 0, -1, -5]);
  });

  it('put Happy Birthday in three time, starting on the third beat', () => {
    const happy = EASY_TUNES.find(each => each.id === 'happy-birthday');
    expect(happy.meter).toBe(3);
    expect(parseTune(happy).notes[0].start).toBe(2);
  });
});

describe('finding a note in first position', () => {
  it('uses the open string where there is one, and otherwise the string just below the note', () => {
    expect(placeInFirstPosition(GUITAR, 64)).toEqual({ string: 5, fret: 0 });
    expect(placeInFirstPosition(GUITAR, 60)).toEqual({ string: 4, fret: 1 });
    expect(placeInFirstPosition(GUITAR, 58)).toEqual({ string: 3, fret: 3 });
  });

  it('has no place for a note below the lowest string or past the hand\'s reach', () => {
    expect(placeInFirstPosition(GUITAR, 39)).toBeNull();
    expect(placeInFirstPosition(GUITAR, 69)).toBeNull();
  });

  it('keeps to the tapes when asked', () => {
    // C5 on the violin is a low second finger, which has no tape.
    expect(placeInFirstPosition(VIOLIN, 72)).toEqual({ string: 2, fret: 3 });
    expect(placeInFirstPosition(VIOLIN, 72, { strict: true })).toBeNull();
  });
});

describe('choosing a key for an instrument', () => {
  it('takes the first key on its list that the hand can reach', () => {
    expect(fitTonic(parseTune(tune('d r m f | s4')), GUITAR)).toEqual({ tonic: 60, strict: true });
    // Up to la in C is the fifth fret; in G it is an open string.
    expect(fitTonic(parseTune(tune('d m s l | s4')), GUITAR)).toEqual({ tonic: 55, strict: true });
  });

  it('prefers a key that stays on the tapes, and leaves them only when no key does', () => {
    expect(fitTonic(parseTune(tune('d r m f | s4')), VIOLIN)).toEqual({ tonic: 62, strict: true });
    // With ti below do and fa above it, no key on the list stays on the tapes.
    expect(fitTonic(parseTune(tune('t, d m f | s4')), VIOLIN)).toMatchObject({ strict: false });
  });

  it('has nothing to offer when no key fits', () => {
    expect(fitTonic(parseTune(tune('s, d s d\' | s\'4')), { ...GUITAR, tonics: [60] })).toBeNull();
  });
});

describe('arranging a tune for an instrument', () => {
  const mary = EASY_TUNES.find(each => each.id === 'mary-had-a-little-lamb');

  it('makes a study the studio can play: placed notes, times in seconds, its key and metre', () => {
    const study = arrangeTune(mary, GUITAR);
    expect(study).toMatchObject({ id: 'guitar-mary-had-a-little-lamb', title: mary.title, instrument: 'guitar', variant: 'guitar:standard:12', composer: mary.composer, bpm: mary.bpm, timeSignature: [4, 4], difficulty: 1, easy: true });
    expect(study.key).toMatchObject({ tonic: 0, mode: 'major', name: 'C major' });
    expect(study.noteCount).toBe(study.notes.length);
    expect(study.notes[0]).toMatchObject({ id: 0, midi: 64, name: 'E4', string: 5, fret: 0, finger: 0, time: 0, hand: 'right', track: 0 });
    const beat = 60 / mary.bpm;
    expect(study.notes[1].time).toBeCloseTo(beat);
    // Like a lesson, it ends where its last note stops sounding.
    expect(study.duration).toBeCloseTo(study.notes.at(-1).time + study.notes.at(-1).duration);
    expect(study.duration).toBeLessThanOrEqual(parseTune(mary).length * beat);
    expect(study.range).toEqual([60, 67]);
  });

  it('gives every note a string, a fret within reach and a finger', () => {
    for (const each of EASY_TUNES) for (const spec of [GUITAR, VIOLIN]) {
      for (const note of arrangeTune(each, spec).notes) {
        expect(note.fret, `${spec.instrument} ${each.id}`).toBeLessThanOrEqual(spec.reach);
        expect(note.finger, `${spec.instrument} ${each.id}`).not.toBeNull();
        expect(note.midi).toBe(spec.tuning[note.string] + note.fret);
      }
    }
  });

  it('lets a bowed note sound a little longer than a plucked one', () => {
    const plucked = arrangeTune(mary, GUITAR).notes[0].duration, bowed = arrangeTune(mary, VIOLIN).notes[0].duration;
    expect(bowed).toBeGreaterThan(plucked);
  });

  it('says so when an instrument has no key for a tune', () => {
    expect(() => arrangeTune(tune('s, d s d\' | s\'4'), { ...GUITAR, tonics: [60] })).toThrow(/Test.*guitar/i);
  });

  it('arranges all ten for an instrument at once', () => {
    const studies = easyStudies(VIOLIN);
    expect(studies.map(study => study.id)).toEqual(EASY_TUNES.map(each => `violin-${each.id}`));
  });
});

describe('a tune for the piano', () => {
  it('is the melody from middle C, as note, beat and length', () => {
    const { notes, key } = pianoTune(EASY_TUNES.find(each => each.id === 'hot-cross-buns'));
    expect(notes.slice(0, 3)).toEqual([{ midi: 64, start: 0, beats: 1, finger: 3 }, { midi: 62, start: 1, beats: 1, finger: 2 }, { midi: 60, start: 2, beats: 2, finger: 1 }]);
    expect(key).toEqual(['C', 'major']);
  });

  it('gives fingers only to a tune that sits under one hand', () => {
    // London Bridge reaches la, a note past the little finger.
    expect(pianoTune(EASY_TUNES.find(each => each.id === 'london-bridge')).notes.every(note => note.finger === 0)).toBe(true);
    expect(pianoTune(EASY_TUNES.find(each => each.id === 'lightly-row')).notes.every(note => note.finger >= 1 && note.finger <= 5)).toBe(true);
  });
});
