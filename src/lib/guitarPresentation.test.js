import { describe, expect, it } from 'vitest';
import { GUITAR_CHORDS } from './guitar.js';
import { chordFullName, chordPositionLabel, chordTone } from './guitarPresentation.js';

describe('guitar chord presentation', () => {
  it.each([
    ['Em', ['R','5','R','♭3','5','R']],
    ['Am', [null,'R','5','R','♭3','5']],
    ['C', [null,'R','3','5','R','3']],
    ['G', ['R','3','5','R','3','R']],
    ['D', [null,null,'R','5','R','3']],
  ])('describes every string of %s relative to its root', (name, expected) => {
    const chord = GUITAR_CHORDS.find(c => c.name === name);
    expect(chord.frets.map((_,s) => chordTone(chord,s)?.interval ?? null)).toEqual(expected);
  });
  it('keeps open, muted, note and finger meanings distinct', () => {
    const c = GUITAR_CHORDS.find(c => c.name === 'C');
    expect(chordPositionLabel(c,0,'notes')).toBe('×');
    expect(chordPositionLabel(c,3,'fingers')).toBe('○');
    expect(chordPositionLabel(c,1,'fingers')).toBe('3');
    expect(chordPositionLabel(c,1,'notes')).toBe('C');
    expect(chordPositionLabel(c,1,'intervals')).toBe('R');
    expect(chordTone(c,1).midi).toBe(48);
    expect(chordTone(null,0)).toBeNull();
  });
  it('describes a chord on another instrument by that instrument’s own tuning', () => {
    // Four strings tuned G C E A: not the guitar's.
    const TUNING = [67, 60, 64, 69], midi = (string, fret) => TUNING[string] + fret;
    const c = { name: 'C', frets: [0, 0, 0, 3], fingers: [0, 0, 0, 3] }, am = { name: 'Am', frets: [2, 0, 0, 0], fingers: [2, 0, 0, 0] };
    expect(c.frets.map((_, s) => chordTone(c, s, midi).interval)).toEqual(['5', 'R', '3', 'R']);
    expect(am.frets.map((_, s) => chordTone(am, s, midi).note)).toEqual(['A', 'C', 'E', 'A']);
    expect(chordPositionLabel(c, 3, 'fingers', midi)).toBe('3');
    expect(chordPositionLabel(c, 0, 'notes', midi)).toBe('G');
    expect([c, am].map(chordFullName)).toEqual(['C major', 'A minor']);
  });
  it('names chord quality without modifying the authored shapes', () => {
    const before = JSON.stringify(GUITAR_CHORDS);
    expect(GUITAR_CHORDS.map(chordFullName)).toEqual(['E minor','A minor','C major','G major','D major']);
    GUITAR_CHORDS.forEach(c => c.frets.forEach((_,s) => chordPositionLabel(c,s,'intervals')));
    expect(JSON.stringify(GUITAR_CHORDS)).toBe(before);
  });
});
