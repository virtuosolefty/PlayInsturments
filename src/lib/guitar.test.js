import { describe, expect, it } from 'vitest';
import { GUITAR_SONGS, GUITAR_STUDIES, GUITAR_TUNING, guitarMidi } from './guitar.js';
import { PracticeSession } from './matcher.js';

describe('standard guitar tuning and authored exercises', () => {
  it('maps the six open strings to concert MIDI pitches', () => {
    expect(GUITAR_TUNING).toEqual([40, 45, 50, 55, 59, 64]);
    expect(GUITAR_TUNING.map((_, s) => guitarMidi(s, 12))).toEqual([52, 57, 62, 67, 71, 76]);
  });
  it('rejects non-existent strings and frets', () => {
    for (const [s,f] of [[-1,0],[6,0],[0,-1],[0,13],[1,2.5]]) expect(guitarMidi(s,f)).toBeNull();
  });
  for (const score of [...GUITAR_STUDIES, ...GUITAR_SONGS]) {
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
  it('plays its ten easy songs in first position, a finger to a fret', () => {
    expect(GUITAR_SONGS).toHaveLength(10);
    for (const song of GUITAR_SONGS) for (const note of song.notes) {
      expect(note.fret, song.id).toBeLessThanOrEqual(4);
      expect(note.finger, song.id).toBe(note.fret);
    }
    // The friendliest key that fits: C where the tune stays under la, G where it climbs to it.
    expect(GUITAR_SONGS.find(song => song.id === 'guitar-hot-cross-buns').key.name).toBe('C major');
    expect(GUITAR_SONGS.find(song => song.id === 'guitar-london-bridge').key.name).toBe('G major');
  });
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
