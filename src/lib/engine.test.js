/**
 * Engine unit tests — `npm test`.
 *
 * These cover the parts that must be right for the feedback to be trustworthy:
 * key estimation, chord identification, wrong-note classification, and the
 * hit/miss/timing bookkeeping in PracticeSession.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyWrongNote,
  ERROR_KINDS,
  estimateKey,
  identifyChord,
  keyPitchClassSet,
  noteName,
  notesSoundingAt,
  scalePitchClasses,
} from './theory.js';
import { NOTE_STATUS, PracticeSession } from './matcher.js';
import { groupIntoChords, sliceScore } from './score.js';
import { buildKeyboardGeometry, displayRangeFor, keyAt } from './keyboard.js';

/* ------------------------------------------------------------------- theory */

describe('note naming', () => {
  it('names middle C and its neighbours', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(21)).toBe('A0');
    expect(noteName(108)).toBe('C8');
  });
});

describe('scales and keys', () => {
  it('builds a C major scale', () => {
    expect(scalePitchClasses(0, 'major')).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('accepts the raised 7th in a minor key', () => {
    const aMinor = keyPitchClassSet(9, 'minor');
    expect(aMinor.has(8)).toBe(true); // G# — harmonic minor
    expect(aMinor.has(7)).toBe(true); // G  — natural minor
    expect(aMinor.has(1)).toBe(false); // C# is foreign
  });

  it('estimates C major from a C major triad melody', () => {
    const notes = [60, 62, 64, 65, 67, 69, 71, 72, 67, 64, 60].map((midi) => ({ midi, duration: 0.5 }));
    const key = estimateKey(notes);
    expect(key.tonic).toBe(0);
    expect(key.mode).toBe('major');
  });

  it('estimates A minor from an A minor passage', () => {
    const notes = [57, 60, 64, 57, 59, 60, 62, 64, 65, 64, 57, 45, 52].map((midi) => ({ midi, duration: 0.5 }));
    const key = estimateKey(notes);
    expect(key.name).toBe('A minor');
  });
});

describe('chord identification', () => {
  it('names a root position C major triad', () => {
    const chord = identifyChord([60, 64, 67]);
    expect(chord.symbol).toBe('C');
    expect(chord.quality).toBe('major');
  });

  it('names a first inversion C major triad', () => {
    const chord = identifyChord([64, 67, 72]);
    expect(chord.root).toBe(0);
  });

  it('names a G dominant seventh', () => {
    const chord = identifyChord([55, 59, 62, 65]);
    expect(chord.symbol).toBe('G7');
  });

  it('names a minor seventh', () => {
    expect(identifyChord([57, 60, 64, 67]).symbol).toBe('Am7');
  });

  it('returns null for nothing', () => {
    expect(identifyChord([])).toBeNull();
  });

  it('refuses to call a single pitch a chord', () => {
    expect(identifyChord([63])).toBeNull();
    expect(identifyChord([60, 72])).toBeNull(); // octave doubling is still one pitch class
  });

  it('does not invent a chord when only one note is sounding', () => {
    const v = classifyWrongNote(71, [63], { tonic: 9, mode: 'minor' });
    expect(v.chord).toBeNull();
    expect(v.detail).not.toMatch(/non-chord tone over/);
  });
});

describe('wrong-note classification', () => {
  const cMajor = { tonic: 0, mode: 'major' };

  it('spots a wrong octave', () => {
    const v = classifyWrongNote(72, [60, 64, 67], cMajor);
    expect(v.kind).toBe(ERROR_KINDS.OCTAVE);
  });

  it('spots an adjacent-key slip', () => {
    const v = classifyWrongNote(65, [64, 67, 72], cMajor);
    expect(v.kind).toBe(ERROR_KINDS.NEIGHBOUR);
    expect(v.detail).toContain('semitone');
  });

  it('accepts a chord tone that is simply not in the score', () => {
    // E is a chord tone of C major, two semitones from any expected note.
    const v = classifyWrongNote(52, [60, 67, 72], cMajor);
    expect(v.kind).toBe(ERROR_KINDS.CHORD_TONE);
    expect(v.severity).toBeLessThan(0.5);
  });

  it('flags a diatonic non-chord tone as in-key', () => {
    const v = classifyWrongNote(74, [60, 64, 67], cMajor); // D over C major
    expect(v.kind).toBe(ERROR_KINDS.IN_KEY);
  });

  it('flags a foreign note as out of key or dissonant', () => {
    const v = classifyWrongNote(73, [60, 64, 67], cMajor); // C#5 over C major
    expect([ERROR_KINDS.OUT_OF_KEY, ERROR_KINDS.DISSONANT]).toContain(v.kind);
    expect(v.severity).toBeGreaterThan(0.8);
  });

  it('orders severity sensibly', () => {
    const octave = classifyWrongNote(72, [60, 64, 67], cMajor);
    const foreign = classifyWrongNote(78, [60, 64, 67], cMajor);
    expect(octave.severity).toBeLessThan(foreign.severity);
  });
});

describe('notesSoundingAt', () => {
  const notes = [
    { midi: 60, time: 0, duration: 1 },
    { midi: 64, time: 0.5, duration: 1 },
    { midi: 67, time: 2, duration: 1 },
  ];
  it('returns overlapping notes only', () => {
    expect(notesSoundingAt(notes, 0.75).map((n) => n.midi)).toEqual([60, 64]);
    expect(notesSoundingAt(notes, 2.5).map((n) => n.midi)).toEqual([67]);
  });
});

/* -------------------------------------------------------------------- score */

describe('chord grouping', () => {
  it('groups near-simultaneous notes', () => {
    const groups = groupIntoChords([
      { midi: 60, time: 0 },
      { midi: 64, time: 0.01 },
      { midi: 67, time: 0.02 },
      { midi: 72, time: 1 },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].notes).toHaveLength(3);
  });
});

describe('sliceScore', () => {
  const score = {
    id: 'x',
    notes: [
      { midi: 60, time: 0, duration: 1 },
      { midi: 62, time: 2, duration: 1 },
      { midi: 64, time: 4, duration: 1 },
    ],
    duration: 5,
  };
  it('rebases a section to zero', () => {
    const sliced = sliceScore(score, 2, 5);
    expect(sliced.notes.map((n) => n.time)).toEqual([0, 2]);
  });
});

/* ----------------------------------------------------------------- keyboard */

describe('keyboard geometry', () => {
  // One octave, C4..B4: 7 white keys, 5 black keys, and no black key between
  // E–F or B–C. Getting this wrong would misalign every falling note.
  const geom = buildKeyboardGeometry(60, 71, 700);

  it('lays out exactly seven white keys per octave', () => {
    expect(geom.whiteCount).toBe(7);
    expect(geom.whiteWidth).toBeCloseTo(100, 5);
  });

  it('puts a black key only where a piano has one', () => {
    const black = [...geom.keys.values()].filter((k) => k.black).map((k) => k.midi);
    expect(black).toEqual([61, 63, 66, 68, 70]); // C# D# F# G# A#
  });

  it('centres each black key on the boundary between its neighbours', () => {
    const cSharp = geom.keys.get(61);
    const c = geom.keys.get(60);
    expect(cSharp.center).toBeCloseTo(c.x + c.w, 5);
    expect(cSharp.w).toBeCloseTo(geom.whiteWidth * 0.62, 5);
  });

  it('tiles the white keys edge to edge across the full width', () => {
    const whites = [...geom.keys.values()].filter((k) => !k.black).sort((a, b) => a.x - b.x);
    expect(whites[0].x).toBe(0);
    expect(whites[whites.length - 1].x + whites[whites.length - 1].w).toBeCloseTo(700, 5);
    for (let i = 1; i < whites.length; i += 1) {
      expect(whites[i].x).toBeCloseTo(whites[i - 1].x + whites[i - 1].w, 5);
    }
  });

  it('snaps the range out to white keys so the ends look right', () => {
    const g = buildKeyboardGeometry(61, 70, 700); // C#..A#
    expect(g.low).toBe(60); // down to C
    expect(g.high).toBe(71); // up to B
  });

  it('hit-tests black keys above white keys', () => {
    const cSharp = geom.keys.get(61);
    // inside the black key's vertical zone -> the black key wins
    expect(keyAt(geom, cSharp.center, 10, 0, 60)).toBe(61);
    // below it -> the white key underneath
    expect(keyAt(geom, cSharp.center, 80, 0, 60)).toBe(60);
  });

  it('never shows fewer than two octaves', () => {
    const [low, high] = displayRangeFor({ range: [60, 64] });
    expect(high - low).toBeGreaterThanOrEqual(25);
  });

  it('stays inside a real 88-key piano', () => {
    const [low, high] = displayRangeFor({ range: [21, 108] });
    expect(low).toBeGreaterThanOrEqual(21);
    expect(high).toBeLessThanOrEqual(108);
  });
});

/* ------------------------------------------------------------------ matcher */

const makeScore = (notes, extra = {}) => ({
  id: 'test',
  title: 'Test',
  bpm: 60,
  timeSignature: [4, 4],
  key: { tonic: 0, mode: 'major', name: 'C major' },
  duration: Math.max(...notes.map((n) => n.time + n.duration)),
  notes: notes.map((n, i) => ({ velocity: 0.8, hand: 'right', ...n, id: i, name: noteName(n.midi) })),
  ...extra,
});

const cScale = makeScore([
  { midi: 60, time: 0, duration: 0.5 },
  { midi: 62, time: 1, duration: 0.5 },
  { midi: 64, time: 2, duration: 0.5 },
  { midi: 65, time: 3, duration: 0.5 },
]);

describe('PracticeSession — timed mode', () => {
  it('counts an exactly-on-time note as correct', () => {
    const s = new PracticeSession(cScale);
    const e = s.noteOn(60, 0);
    expect(e.type).toBe('correct');
    expect(e.deltaMs).toBe(0);
    expect(s.summary.hit).toBe(1);
  });

  /**
   * Nothing hit is not "nothing on time".
   *
   * This was 0, which every panel downstream then had to remember to guard
   * separately — and one did not: the timing needle announced ON TIME in green
   * over a run where no note was played, because a mean deviation across an
   * empty set is zero. null says "unmeasured" once, here, and `gradeRun`
   * already knew what to do with it.
   */
  it('reports timing as unmeasured when nothing was hit', () => {
    const s = new PracticeSession(cScale);
    s.advanceTo(9);
    expect(s.summary.hit).toBe(0);
    expect(s.summary.timingAccuracy).toBeNull();
  });

  it('accepts a slightly late note but labels the timing', () => {
    const s = new PracticeSession(cScale);
    const e = s.noteOn(60, 0.2);
    expect(e.type).toBe('timing');
    expect(e.timing).toBe('late');
    expect(e.deltaMs).toBe(200);
    expect(s.summary.hit).toBe(1);
    expect(s.summary.timingAccuracy).toBe(0);
  });

  it('rejects a note outside the match window as wrong', () => {
    const s = new PracticeSession(cScale);
    const e = s.noteOn(60, 1.5);
    expect(e.type).toBe('wrong');
    expect(s.summary.hit).toBe(0);
  });

  it('classifies a wrong pitch with theory context', () => {
    const s = new PracticeSession(cScale);
    const e = s.noteOn(61, 0); // C#4 where C4 was expected
    expect(e.type).toBe('wrong');
    expect(e.kind).toBe(ERROR_KINDS.NEIGHBOUR);
    expect(e.expectedNames).toContain('C4');
  });

  it('marks unplayed notes missed once the playhead passes them', () => {
    const s = new PracticeSession(cScale);
    s.noteOn(60, 0);
    // D4 (t=1) is long gone; E4 (t=2) is past its 0.4s miss window too.
    expect(s.advanceTo(2.5).map((m) => m.name)).toEqual(['D4', 'E4']);
    expect(s.summary.missed).toBe(2);
    // F4 (t=3) is still in play and must not be pre-emptively failed.
    expect(s.targets.find((t) => t.name === 'F4').status).toBe(NOTE_STATUS.PENDING);
  });

  it('leaves a note alone while it is still inside the miss window', () => {
    const s = new PracticeSession(cScale);
    s.noteOn(60, 0);
    expect(s.advanceTo(1.3)).toEqual([]); // D4 at t=1 is only 300 ms late
    expect(s.noteOn(62, 1.3).type).toBe('timing');
  });

  it('does not double-count one target for two presses', () => {
    const s = new PracticeSession(cScale);
    expect(s.noteOn(60, 0).type).toBe('correct');
    expect(s.noteOn(60, 0.02).type).toBe('wrong');
    expect(s.summary.hit).toBe(1);
  });

  it('produces a perfect score for a perfect run', () => {
    const s = new PracticeSession(cScale);
    for (const n of cScale.notes) s.noteOn(n.midi, n.time);
    s.advanceTo(cScale.duration + 1);
    const sum = s.summary;
    expect(sum.noteAccuracy).toBe(1);
    expect(sum.timingAccuracy).toBe(1);
    expect(sum.missed).toBe(0);
    expect(sum.wrongNotes).toBe(0);
    expect(sum.score).toBe(1);
  });

  it('reports rushing as a negative mean deviation', () => {
    const s = new PracticeSession(cScale);
    for (const n of cScale.notes) s.noteOn(n.midi, n.time - 0.15);
    expect(s.summary.meanSignedDeviationMs).toBe(-150);
  });

  it('handles chords: all three notes match one block', () => {
    const chordScore = makeScore([
      { midi: 60, time: 0, duration: 1 },
      { midi: 64, time: 0, duration: 1 },
      { midi: 67, time: 0, duration: 1 },
    ]);
    const s = new PracticeSession(chordScore);
    s.noteOn(60, 0.01);
    s.noteOn(64, 0.03);
    s.noteOn(67, 0.05);
    expect(s.summary.noteAccuracy).toBe(1);
  });

  it('collects trouble spots for missed and wrong notes', () => {
    const s = new PracticeSession(cScale);
    s.noteOn(60, 0);
    s.noteOn(61, 1); // wrong
    s.advanceTo(4.5);
    const spots = s.troubleSpots;
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.some((x) => x.missed > 0)).toBe(true);
    expect(spots.some((x) => x.wrong > 0)).toBe(true);
  });
});

describe('PracticeSession — wait mode', () => {
  const chordScore = makeScore([
    { midi: 60, time: 0, duration: 1 },
    { midi: 64, time: 0, duration: 1 },
    { midi: 67, time: 2, duration: 1 },
  ]);

  it('gates on the first chord regardless of clock time', () => {
    const s = new PracticeSession(chordScore, { mode: 'wait' });
    expect(s.currentGate.notes.map((n) => n.midi)).toEqual([60, 64]);
    expect(s.noteOn(60, 99).type).toBe('correct'); // time is irrelevant
    expect(s.currentGate.notes.map((n) => n.midi)).toEqual([60, 64]);
    s.noteOn(64, 99);
    expect(s.currentGate.notes.map((n) => n.midi)).toEqual([67]);
  });

  it('never reports misses while waiting', () => {
    const s = new PracticeSession(chordScore, { mode: 'wait' });
    expect(s.advanceTo(500)).toEqual([]);
    expect(s.summary.missed).toBe(0);
  });

  it('still flags a wrong note at the gate', () => {
    const s = new PracticeSession(chordScore, { mode: 'wait' });
    const e = s.noteOn(70, 0);
    expect(e.type).toBe('wrong');
    expect(s.currentGate.notes.every((n) => n.status === NOTE_STATUS.PENDING)).toBe(true);
  });

  it('completes when every gate is satisfied', () => {
    const s = new PracticeSession(chordScore, { mode: 'wait' });
    for (const n of chordScore.notes) s.noteOn(n.midi, 0);
    expect(s.isGateSatisfied()).toBe(true);
    expect(s.summary.noteAccuracy).toBe(1);
  });
});

describe('PracticeSession — reset', () => {
  it('clears all state', () => {
    const s = new PracticeSession(cScale);
    s.noteOn(60, 0);
    s.advanceTo(3);
    s.reset();
    expect(s.events).toEqual([]);
    expect(s.summary.hit).toBe(0);
    expect(s.targets.every((t) => t.status === NOTE_STATUS.PENDING)).toBe(true);
  });
});
