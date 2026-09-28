/**
 * Fitting a score onto a small controller. The MPK Mini case is the one that
 * matters: 25 keys against repertoire that routinely spans four octaves.
 */

import { describe, expect, it } from 'vitest';
import {
  arrangeScore,
  assessFit,
  bestOctaveShift,
  FIT_MODES,
  HAND_FILTERS,
  foldIntoRange,
} from './arrange.js';
import { followRange, profileForDeviceName, windowFor } from './devices.js';

const MPK = windowFor(profileForDeviceName('MPK mini IV Plugin Port')); // [48, 72]
const KEYSTATION = windowFor(profileForDeviceName('Keystation 61 MK3')); // [36, 96]

const note = (midi, time, hand = 'right') => ({
  midi,
  time,
  duration: 0.5,
  velocity: 0.8,
  track: 0,
  hand,
});

const scoreOf = (notes) => ({
  id: 'test',
  title: 'Test',
  source: 'midi',
  notes,
  bpm: 100,
  timeSignature: [4, 4],
  range: [Math.min(...notes.map((n) => n.midi)), Math.max(...notes.map((n) => n.midi))],
});

describe('device profiles', () => {
  it('recognises the MPK Mini as a 25-key controller', () => {
    const profile = profileForDeviceName('MPK mini IV Plugin Port');
    expect(profile.keyCount).toBe(25);
    expect(windowFor(profile)).toEqual([48, 72]);
  });

  it('recognises the Keystation 61 and prefers the numbered match', () => {
    expect(profileForDeviceName('M-Audio Keystation 61 MK3').keyCount).toBe(61);
    expect(profileForDeviceName('Keystation 49 MK3').keyCount).toBe(49);
    expect(profileForDeviceName('Keystation Mini').keyCount).toBe(61); // family fallback
  });

  it('assumes a full piano for an unknown controller rather than constraining it', () => {
    expect(profileForDeviceName('Some Unknown Synth').keyCount).toBe(88);
    expect(profileForDeviceName(null).keyCount).toBe(88);
  });

  it('follows the hardware octave buttons in whole octaves', () => {
    expect(followRange([48, 72], 60)).toEqual([48, 72]); // already inside
    expect(followRange([48, 72], 74)).toEqual([60, 84]); // one octave up
    expect(followRange([48, 72], 40)).toEqual([36, 60]); // one octave down
    expect(followRange([48, 72], 90)).toEqual([72, 96]); // two octaves up
  });

  it('never lets a window run off the ends of MIDI', () => {
    expect(followRange([0, 24], -5)).toEqual([0, 24]);
    expect(followRange([100, 124], 127)).toEqual([103, 127]);
  });
});

describe('bestOctaveShift', () => {
  it('leaves a piece that already sits in the window alone', () => {
    expect(bestOctaveShift([{ midi: 60 }, { midi: 64 }], MPK)).toBe(0);
  });

  it('lifts a piece that sits below the window', () => {
    expect(bestOctaveShift([{ midi: 36 }, { midi: 40 }], MPK)).toBe(12);
  });

  it('picks the octave that leaves the fewest notes stranded', () => {
    // Bunched around C3 with one outlier: the shift that captures the bulk wins.
    const notes = [{ midi: 36 }, { midi: 38 }, { midi: 40 }, { midi: 84 }];
    expect(bestOctaveShift(notes, MPK)).toBe(12);
  });
});

describe('foldIntoRange', () => {
  it('keeps the pitch class and lands inside the window', () => {
    expect(foldIntoRange(24, MPK)).toBe(48);
    expect(foldIntoRange(96, MPK)).toBe(72);
    expect(foldIntoRange(85, MPK)).toBe(61);
  });

  it('leaves notes already in range untouched', () => {
    expect(foldIntoRange(60, MPK)).toBe(60);
  });

  it('clamps instead of folding when the window is narrower than an octave', () => {
    expect(foldIntoRange(90, [60, 66])).toBe(66);
    expect(foldIntoRange(10, [60, 66])).toBe(60);
  });
});

describe('arrangeScore', () => {
  it('returns the original object when nothing has to change', () => {
    const score = scoreOf([note(60, 0), note(64, 1)]);
    expect(arrangeScore(score, { window: MPK, fit: FIT_MODES.FOLD })).toBe(score);
  });

  it('shifts a low piece up into reach without changing intervals', () => {
    const score = scoreOf([note(36, 0), note(43, 1)]);
    const fitted = arrangeScore(score, { window: MPK, fit: FIT_MODES.SHIFT });
    expect(fitted.notes.map((n) => n.midi)).toEqual([48, 55]);
    expect(fitted.range).toEqual([48, 55]);
  });

  it('leaves stray notes out of reach in shift mode', () => {
    const score = scoreOf([note(36, 0), note(84, 1)]);
    const fitted = arrangeScore(score, { window: MPK, fit: FIT_MODES.SHIFT });
    expect(fitted.notes.some((n) => n.midi < MPK[0] || n.midi > MPK[1])).toBe(true);
  });

  it('folds a four-octave piece so every note is playable on 25 keys', () => {
    const score = scoreOf([note(32, 0), note(48, 1), note(69, 2), note(86, 3)]);
    const fitted = arrangeScore(score, { window: MPK, fit: FIT_MODES.FOLD });
    for (const n of fitted.notes) {
      expect(n.midi).toBeGreaterThanOrEqual(MPK[0]);
      expect(n.midi).toBeLessThanOrEqual(MPK[1]);
    }
    // Pitch classes survive the fold.
    expect(fitted.notes.map((n) => n.midi % 12).sort()).toEqual([0, 2, 8, 9]);
  });

  it('merges an octave doubling that folds onto a key already sounding', () => {
    // C3 + C5 + C7 struck together. C7 folds down onto the C5 beside it, and
    // asking someone to press one key twice at once is not a playable score.
    const score = scoreOf([note(48, 0), note(72, 0), note(96, 0)]);
    const fitted = arrangeScore(score, { window: MPK, fit: FIT_MODES.FOLD });
    expect(fitted.notes.map((n) => n.midi)).toEqual([48, 72]);
  });

  it('keeps an octave doubling when both octaves are reachable', () => {
    const score = scoreOf([note(48, 0), note(84, 0)]); // 84 folds to 72, not 48
    const fitted = arrangeScore(score, { window: MPK, fit: FIT_MODES.FOLD });
    expect(fitted.notes.map((n) => n.midi)).toEqual([48, 72]);
  });

  it('keeps simultaneous distinct pitches after folding', () => {
    const score = scoreOf([note(48, 0), note(88, 0)]);
    const fitted = arrangeScore(score, { window: MPK, fit: FIT_MODES.FOLD });
    expect(fitted.notes).toHaveLength(2);
  });

  it('does not touch the score at all in off mode', () => {
    const score = scoreOf([note(32, 0), note(86, 1)]);
    expect(arrangeScore(score, { window: MPK, fit: FIT_MODES.OFF })).toBe(score);
  });

  it('keeps the other hand as accompaniment rather than deleting it', () => {
    const score = scoreOf([note(60, 0, 'right'), note(48, 0, 'left')]);
    const right = arrangeScore(score, { window: KEYSTATION, fit: FIT_MODES.OFF, hands: HAND_FILTERS.RIGHT });
    expect(right.notes).toHaveLength(2);
    expect(right.notes.find((n) => n.midi === 60).accompaniment).toBeFalsy();
    expect(right.notes.find((n) => n.midi === 48).accompaniment).toBe(true);
  });

  it('fits to the hand you play, leaving the accompaniment in its own register', () => {
    // Right hand two octaves below the window, left hand lower still. The shift
    // is chosen for the right hand; the left rides along without being folded.
    const score = scoreOf([note(36, 0, 'right'), note(43, 1, 'right'), note(24, 0, 'left')]);
    const fitted = arrangeScore(score, { window: MPK, fit: FIT_MODES.FOLD, hands: HAND_FILTERS.RIGHT });
    const played = fitted.notes.filter((n) => !n.accompaniment);
    const backing = fitted.notes.filter((n) => n.accompaniment);

    for (const n of played) {
      expect(n.midi).toBeGreaterThanOrEqual(MPK[0]);
      expect(n.midi).toBeLessThanOrEqual(MPK[1]);
    }
    // Shifted with the piece so it stays in tune, but not folded into the window.
    expect(backing[0].midi).toBe(24 + 12);
  });

  it('falls back to the whole piece when a hand filter would empty it', () => {
    const score = scoreOf([note(60, 0, 'right'), note(64, 1, 'right')]);
    const left = arrangeScore(score, { window: KEYSTATION, fit: FIT_MODES.OFF, hands: HAND_FILTERS.LEFT });
    expect(left.notes).toHaveLength(2);
    expect(left.notes.every((n) => !n.accompaniment)).toBe(true);
  });

  it('leaves a two-handed score untouched, identity included', () => {
    const score = scoreOf([note(60, 0, 'right'), note(48, 0, 'left')]);
    expect(arrangeScore(score, { window: KEYSTATION, fit: FIT_MODES.OFF })).toBe(score);
  });

  it('recomputes duration and note ids after rearranging', () => {
    const score = scoreOf([note(36, 0), note(38, 2)]);
    const fitted = arrangeScore(score, { window: MPK, fit: FIT_MODES.FOLD });
    expect(fitted.duration).toBeCloseTo(2.5, 5);
    expect(fitted.notes.map((n) => n.id)).toEqual([0, 1]);
    expect(fitted.noteCount).toBe(2);
  });
});

describe('assessFit', () => {
  it('calls a piece already in position a fit', () => {
    expect(assessFit([60, 67], MPK).verdict).toBe('fits');
  });

  it('calls a narrow piece in the wrong octave a shift', () => {
    const a = assessFit([36, 43], MPK);
    expect(a.verdict).toBe('shift');
    expect(a.octaves).toBe(1);
  });

  it('calls a piece wider than the keyboard a fold, with the overflow', () => {
    const a = assessFit([38, 86], MPK); // Canon in D against 25 keys
    expect(a.verdict).toBe('fold');
    expect(a.span).toBe(48);
    expect(a.overflow).toBe(24);
  });

  it('says the same piece fits a Keystation 61', () => {
    expect(assessFit([38, 86], KEYSTATION).verdict).toBe('fits');
  });

  it('reports unknown without a keyboard', () => {
    expect(assessFit([38, 86], null).verdict).toBe('unknown');
  });
});
