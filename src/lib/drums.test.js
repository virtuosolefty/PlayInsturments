import { describe, expect, it } from 'vitest';
import { DRUM_KEYS, DRUM_PATH_STAGES, DRUM_PIECES, DRUM_STUDIES, canonicalDrumMidi, drumForMidi, drumInstruction, drumLanes, drumPiece } from './drums.js';

describe('the kit', () => {
  it('gives every piece its own note, its own key and a name', () => {
    expect(DRUM_PIECES.map(p => p.id)).toEqual(['crash', 'ride', 'hihat-open', 'hihat', 'tom-high', 'tom-mid', 'snare', 'tom-floor', 'kick']);
    expect(new Set(DRUM_PIECES.map(p => p.midi)).size).toBe(DRUM_PIECES.length);
    expect(new Set(DRUM_PIECES.map(p => p.key)).size).toBe(DRUM_PIECES.length);
    for (const piece of DRUM_PIECES) {
      expect(piece.label).toBeTruthy();
      expect(piece.key).toMatch(/^[a-z]$/);
      expect(Object.isFrozen(piece)).toBe(true);
    }
  });

  it('uses the General MIDI notes a drum pad or electronic kit sends', () => {
    expect(drumPiece('kick').midi).toBe(36);
    expect(drumPiece('snare').midi).toBe(38);
    expect(drumPiece('hihat').midi).toBe(42);
    expect(drumPiece('hihat-open').midi).toBe(46);
    expect(drumPiece('crash').midi).toBe(49);
    expect(drumPiece('ride').midi).toBe(51);
    expect(drumPiece('cowbell')).toBeNull();
  });

  it('plays only the kick with a foot', () => {
    expect(DRUM_PIECES.filter(p => p.limb === 'foot').map(p => p.id)).toEqual(['kick']);
  });

  it('maps each key to its piece', () => {
    expect(DRUM_KEYS).toEqual({ c: 49, r: 51, o: 46, h: 42, t: 50, m: 47, s: 38, f: 43, k: 36 });
  });
});

describe('notes from a controller', () => {
  it('finds a piece by its own note', () => {
    for (const piece of DRUM_PIECES) expect(drumForMidi(piece.midi)).toBe(piece);
  });

  it('accepts the other General MIDI notes for the same drum', () => {
    expect(drumForMidi(35).id).toBe('kick');
    expect(drumForMidi(40).id).toBe('snare');
    expect(drumForMidi(37).id).toBe('snare');
    expect(drumForMidi(44).id).toBe('hihat');
    expect(drumForMidi(41).id).toBe('tom-floor');
    expect(drumForMidi(45).id).toBe('tom-mid');
    expect(drumForMidi(48).id).toBe('tom-high');
    expect(drumForMidi(57).id).toBe('crash');
    expect(drumForMidi(59).id).toBe('ride');
  });

  it('has no piece for a note outside the kit', () => {
    for (const midi of [60, 21, 39, -1, 3.5, NaN, undefined, null, '38']) expect(drumForMidi(midi)).toBeNull();
  });

  it('turns any accepted note into the one the lessons are written in', () => {
    expect(canonicalDrumMidi(40)).toBe(38);
    expect(canonicalDrumMidi(36)).toBe(36);
    expect(canonicalDrumMidi(60)).toBeNull();
  });
});

describe('the lessons', () => {
  it('are six studies, each a playable score', () => {
    expect(DRUM_STUDIES).toHaveLength(6);
    expect(new Set(DRUM_STUDIES.map(s => s.id)).size).toBe(6);
    for (const study of DRUM_STUDIES) {
      expect(study.id).toMatch(/^drums-/);
      expect(study.instrument).toBe('drums');
      expect(study.title).toBeTruthy();
      expect(study.description).toBeTruthy();
      expect(study.timeSignature).toEqual([4, 4]);
      expect(study.noteCount).toBe(study.notes.length);
      expect(study.notes.length).toBeGreaterThan(3);
      expect(study.notes.map(n => n.id)).toEqual(study.notes.map((_, i) => i));
      for (const [i, note] of study.notes.entries()) {
        expect(drumPiece(note.piece)?.midi).toBe(note.midi);
        expect(note.name).toBe(drumPiece(note.piece).short);
        expect(note.duration).toBeGreaterThan(0);
        expect(note.time).toBeGreaterThanOrEqual(i ? study.notes[i - 1].time : 0);
        expect(note.time + note.duration).toBeLessThanOrEqual(study.duration + 1e-9);
      }
      expect(study.range).toEqual([Math.min(...study.notes.map(n => n.midi)), Math.max(...study.notes.map(n => n.midi))]);
    }
  });

  it('last a whole number of bars, so a loop comes round on the beat', () => {
    for (const study of DRUM_STUDIES) {
      const bar = (60 / study.bpm) * 4;
      expect(study.duration / bar).toBeCloseTo(Math.round(study.duration / bar), 9);
    }
  });

  it('name the drum, not a pitch, for every note they use', () => {
    for (const study of DRUM_STUDIES) {
      for (const note of study.notes) expect(study.noteNames[note.midi]).toBe(note.name);
    }
    expect(DRUM_STUDIES[0].noteNames[36]).toBe('Kick');
  });

  it('start with one hit on each drum and end with a beat and a fill', () => {
    const first = DRUM_STUDIES[0];
    expect(first.id).toBe('drums-meet-the-kit');
    expect(new Set(first.notes.map(n => n.piece)).size).toBe(first.notes.length);
    // No two drums at once until the hands and the foot have each had a lesson alone.
    for (const study of DRUM_STUDIES.slice(0, 4)) {
      expect(new Set(study.notes.map(n => n.time)).size).toBe(study.notes.length);
    }
    const beat = DRUM_STUDIES.find(s => s.id === 'drums-first-beat');
    const together = beat.notes.filter(n => n.time === 0).map(n => n.piece).sort();
    expect(together).toEqual(['hihat', 'kick']);
    expect(DRUM_STUDIES.at(-1).notes.some(n => n.piece === 'crash')).toBe(true);
  });

  it('put the foot on the left-hand colour and the hands on the right', () => {
    for (const note of DRUM_STUDIES.flatMap(s => s.notes)) expect(note.hand).toBe(note.piece === 'kick' ? 'left' : 'right');
  });

  it('are all reached from the learning path, in order', () => {
    expect(DRUM_PATH_STAGES.flatMap(stage => stage.exercises)).toEqual(DRUM_STUDIES.map(s => s.id));
    for (const stage of DRUM_PATH_STAGES) {
      expect(stage.name).toBeTruthy();
      expect(stage.goal).toBeTruthy();
    }
  });
});

describe('lanes and instructions', () => {
  it('gives a score the lanes of the drums it uses, top of the kit first', () => {
    const beat = DRUM_STUDIES.find(s => s.id === 'drums-first-beat');
    expect(drumLanes(beat).map(p => p.id)).toEqual(['hihat', 'snare', 'kick']);
    expect(drumLanes(DRUM_STUDIES[0])).toHaveLength(8);
  });

  it('shows every drum when there is no score', () => {
    expect(drumLanes(null)).toEqual(DRUM_PIECES);
    expect(drumLanes({ notes: [] })).toEqual(DRUM_PIECES);
  });

  it('says which drum to hit and the key that plays it', () => {
    expect(drumInstruction({ midi: 38 })).toBe('Snare · press S');
    expect(drumInstruction({ midi: 36 })).toBe('Kick · press K');
    expect(drumInstruction({ midi: 40 })).toBe('Snare · press S');
    expect(drumInstruction(null)).toBe('Preparing your first note…');
    expect(drumInstruction({ midi: 60 })).toBe('Preparing your first note…');
  });
});
