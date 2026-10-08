import { describe, expect, it } from 'vitest';
import { DRUM_STUDIES } from './drums.js';
import { PracticeSession } from './matcher.js';
import { playedMidi } from '../hooks/usePracticeEngine.js';

const study = id => DRUM_STUDIES.find(s => s.id === id);

describe('scoring a drum lesson', () => {
  it('names the drum that was hit, not a pitch', () => {
    const session = new PracticeSession(study('drums-steady-kick'));
    const event = session.noteOn(36, 0, 0.8);
    expect(event.type).not.toBe('wrong');
    expect(event.name).toBe('Kick');
    expect(event.detail ?? event.message ?? '').not.toMatch(/C2/);
  });

  it('calls a hit on the wrong drum a wrong drum, and says which was wanted', () => {
    const session = new PracticeSession(study('drums-steady-kick'));
    const event = session.noteOn(38, 0, 0.8);
    expect(event.type).toBe('wrong');
    expect(event.name).toBe('Snare');
    expect(event.label).toBe('Wrong drum');
    expect(event.detail).toBe('Snare here, but the beat wants Kick.');
    expect(event.expectedNames).toEqual(['Kick']);
    expect(event.chord).toBeNull();
  });

  it('judges the three drums of a beat that land together', () => {
    const beat = study('drums-first-beat');
    const session = new PracticeSession(beat);
    const first = [session.noteOn(42, 0, 0.8), session.noteOn(36, 0.01, 0.8)];
    expect(first.every(event => event.type !== 'wrong')).toBe(true);
    expect(first.map(event => event.name).sort()).toEqual(['Hi-hat', 'Kick']);
  });

  it('still reads a pitched score harmonically', () => {
    const piano = { id: 'p', instrument: 'piano', key: { tonic: 0, mode: 'major', name: 'C major' }, notes: [{ id: 0, midi: 60, name: 'C4', time: 0, duration: 0.5, hand: 'right', track: 0 }], duration: 1 };
    const event = new PracticeSession(piano).noteOn(61, 0, 0.8);
    expect(event.type).toBe('wrong');
    expect(event.label).not.toBe('Wrong drum');
    expect(event.name).toBe('C#4');
  });
});

describe('the note a controller means', () => {
  it('counts a neighbouring drum note as the drum on the drums', () => {
    expect(playedMidi({ practiceInstrument: 'drums' }, 40)).toBe(38);
    expect(playedMidi({ practiceInstrument: 'drums' }, 36)).toBe(36);
  });

  it('passes a note outside the kit through unchanged, so it is heard as a miss', () => {
    expect(playedMidi({ practiceInstrument: 'drums' }, 60)).toBe(60);
  });

  it('ignores the input transpose on the drums, and applies it elsewhere', () => {
    expect(playedMidi({ practiceInstrument: 'drums', inputTranspose: 12 }, 36)).toBe(36);
    expect(playedMidi({ practiceInstrument: 'piano', inputTranspose: 12 }, 60)).toBe(72);
    expect(playedMidi({}, 60)).toBe(60);
  });
});
