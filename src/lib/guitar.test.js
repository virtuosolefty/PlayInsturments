import { describe, expect, it } from 'vitest';
import { GUITAR_CHORDS, GUITAR_STUDIES, GUITAR_TUNING, chordPitches, guitarMidi, guitarPositions } from './guitar.js';
import { PracticeSession } from './matcher.js';

describe('standard guitar tuning and authored exercises', () => {
  it('maps the six open strings to concert MIDI pitches', () => {
    expect(GUITAR_TUNING).toEqual([40, 45, 50, 55, 59, 64]);
    expect(GUITAR_TUNING.map((_, s) => guitarMidi(s, 12))).toEqual([52, 57, 62, 67, 71, 76]);
  });
  it('rejects non-existent strings and frets', () => {
    for (const [s,f] of [[-1,0],[6,0],[0,-1],[0,13],[1,2.5]]) expect(guitarMidi(s,f)).toBeNull();
  });
  it('finds every playable position without changing the pitch', () => {
    for (let midi = 0; midi <= 127; midi++) {
      const positions = guitarPositions(midi);
      positions.forEach(p => expect(guitarMidi(p.string, p.fret)).toBe(midi));
      expect(positions.length > 0).toBe(midi >= 40 && midi <= 76);
    }
  });
  it('omits muted strings from chords rather than treating them as open', () => {
    expect(chordPitches(GUITAR_CHORDS.find(c => c.name === 'C'))).toEqual([48,52,55,60,64]);
    expect(chordPitches(GUITAR_CHORDS.find(c => c.name === 'D'))).toEqual([50,57,62,66]);
  });
  for (const score of GUITAR_STUDIES) {
    it(`${score.title}: positions, timing and records are consistent`, () => {
      expect(score.id).toMatch(/^guitar-/);
      expect(score.variant).toBe('guitar:standard:12');
      score.notes.forEach((n, i) => {
        expect(guitarMidi(n.string,n.fret)).toBe(n.midi);
        const previousOnString = score.notes.slice(0,i).filter(prior => prior.string === n.string).at(-1);
        if (previousOnString) expect(n.time).toBeGreaterThanOrEqual(previousOnString.time + previousOnString.duration);
        if (i) expect(n.time).toBeGreaterThanOrEqual(score.notes[i-1].time);
      });
      expect(score.duration).toBeCloseTo(score.notes.at(-1).time + score.notes.at(-1).duration);
    });
  }
  it('uses the existing matcher for exact pitches, without a separate guitar grader', () => {
    const score = GUITAR_STUDIES[0];
    const session = new PracticeSession(score);
    for (const n of score.notes) session.noteOn(n.midi, n.time, n.velocity);
    expect(session.targets.every(n => n.status === 'hit')).toBe(true);
  });
  it('matches all notes of authored chords in timed and wait modes', () => {
    for (const mode of ['timed','wait']) {
      const score = GUITAR_STUDIES.find(s => s.id === 'guitar-chord-changes');
      const session = new PracticeSession(score, {mode});
      for (const n of score.notes) session.noteOn(n.midi, n.time, n.velocity);
      expect(session.summary.hit).toBe(score.noteCount);
      expect(session.summary.wrongNotes).toBe(0);
    }
  });
});
