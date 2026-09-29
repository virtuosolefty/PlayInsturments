import { describe, expect, it } from 'vitest';
import {
  BOWED, BOWED_MAX_POSITION, CELLO_TUNING, VIOLIN_TUNING,
  bowedFinger, bowedMidi, bowedPositions, bowedReach, bowedStringName,
} from './bowed.js';
import { PracticeSession } from './matcher.js';

describe('violin and cello tuning', () => {
  it('tunes both instruments in fifths at concert pitch', () => {
    expect(VIOLIN_TUNING).toEqual([55, 62, 69, 76]);
    expect(CELLO_TUNING).toEqual([36, 43, 50, 57]);
    for (const tuning of [VIOLIN_TUNING, CELLO_TUNING]) {
      tuning.slice(1).forEach((pitch, i) => expect(pitch - tuning[i]).toBe(7));
    }
  });
  it('maps string and position to pitch, rejecting impossible places', () => {
    expect(bowedMidi('violin', 2, 0)).toBe(69);
    expect(bowedMidi('violin', 2, 2)).toBe(71);
    expect(bowedMidi('cello', 0, 5)).toBe(41);
    for (const [s, p] of [[-1, 0], [4, 0], [0, -1], [0, BOWED_MAX_POSITION + 1], [1, 2.5]]) {
      expect(bowedMidi('violin', s, p)).toBeNull();
    }
    expect(bowedMidi('viola', 0, 0)).toBeNull();
  });
  it('finds every playable place for a pitch without changing it', () => {
    for (const instrument of ['violin', 'cello']) {
      for (let midi = 0; midi <= 127; midi++) {
        bowedPositions(instrument, midi).forEach(p => expect(bowedMidi(instrument, p.string, p.fret)).toBe(midi));
      }
    }
    expect(bowedPositions('violin', 69)).toEqual([{ string: 1, fret: 7 }, { string: 2, fret: 0 }]);
  });
  it('names strings the way players do: the highest string is string 1', () => {
    expect(bowedStringName('violin', 3)).toEqual({ note: 'E', number: 1 });
    expect(bowedStringName('cello', 0)).toEqual({ note: 'C', number: 4 });
  });
});

describe('first-position fingers', () => {
  it('uses violin finger patterns for tones and semitones', () => {
    expect([0, 2, 3, 4, 5, 7].map(p => bowedFinger('violin', p))).toEqual([0, 1, 2, 2, 3, 4]);
  });
  it('uses the cello one-finger-per-semitone frame', () => {
    expect([0, 1, 2, 3, 4, 5].map(p => bowedFinger('cello', p))).toEqual([0, 1, 1, 2, 3, 4]);
  });
  it('does not invent a finger for a place that needs a shift', () => {
    expect(bowedFinger('violin', 10)).toBeNull();
    expect(bowedFinger('cello', 7)).toBeNull();
    expect(bowedReach('violin')).toBe(7);
    expect(bowedReach('cello')).toBe(5);
  });
});

for (const instrument of ['violin', 'cello']) {
  const kit = BOWED[instrument];
  describe(`${instrument} lessons`, () => {
    it('keeps every study inside first position with an authored finger', () => {
      expect(kit.studies.length).toBeGreaterThanOrEqual(6);
      for (const score of kit.studies) {
        expect(score.id.startsWith(`${instrument}-`)).toBe(true);
        expect(score.instrument).toBe(instrument);
        score.notes.forEach((n, i) => {
          expect(bowedMidi(instrument, n.string, n.fret)).toBe(n.midi);
          expect(n.fret).toBeLessThanOrEqual(bowedReach(instrument));
          expect(n.finger).toBe(bowedFinger(instrument, n.fret));
          if (i) expect(n.time).toBeGreaterThan(score.notes[i - 1].time);
          if (i) expect(n.time).toBeGreaterThanOrEqual(score.notes[i - 1].time + score.notes[i - 1].duration);
        });
        expect(score.duration).toBeCloseTo(score.notes.at(-1).time + score.notes.at(-1).duration);
        expect(score.range).toEqual([Math.min(...score.notes.map(n => n.midi)), Math.max(...score.notes.map(n => n.midi))]);
      }
    });
    it('builds a path that only names studies it ships', () => {
      const ids = new Set(kit.studies.map(s => s.id));
      kit.pathStages.flatMap(s => s.exercises).forEach(id => expect(ids.has(id)).toBe(true));
      expect(ids.has(kit.firstLesson)).toBe(true);
    });
    it('scores a study with the shared matcher', () => {
      const score = kit.studies[0];
      const session = new PracticeSession(score);
      for (const n of score.notes) session.noteOn(n.midi, n.time, n.velocity);
      expect(session.targets.every(n => n.status === 'hit')).toBe(true);
    });
    it('offers one-octave scales that rise and stay in reach', () => {
      for (const scale of kit.scales) {
        const pitches = scale.positions.map(p => bowedMidi(instrument, p.string, p.fret));
        pitches.slice(1).forEach((pitch, i) => expect(pitch).toBeGreaterThan(pitches[i]));
        expect(pitches.at(-1) - pitches[0]).toBe(12);
        scale.positions.forEach(p => expect(p.fret).toBeLessThanOrEqual(bowedReach(instrument)));
      }
    });
  });
}
