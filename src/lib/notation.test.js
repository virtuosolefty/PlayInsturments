/**
 * Turning seconds into rhythm. Everything decided here is arithmetic, so it is
 * all testable without a canvas — which matters, because a stave that engraves
 * the wrong rhythm is worse than no stave, and the renderer cannot tell.
 */

import { describe, expect, it } from 'vitest';
import { keySignatureOf, splitDuration, toMeasures, vexKey } from './notation.js';

const score = (notes, over = {}) => ({
  id: 't',
  title: 'T',
  bpm: 60, // one beat per second, so times read as beats
  timeSignature: [4, 4],
  key: { tonic: 0, mode: 'major', name: 'C major' },
  duration: Math.max(...notes.map((n) => n.time + n.duration), 4),
  notes: notes.map((n, i) => ({ velocity: 0.8, hand: 'right', id: i, ...n })),
  ...over,
});

const note = (midi, time, duration, hand = 'right') => ({ midi, time, duration, hand });
const shapes = (events) => events.map((e) => `${e.isRest ? 'r' : 'n'}${e.duration}${'.'.repeat(e.dots)}`);

describe('splitDuration', () => {
  it('names the plain values', () => {
    expect(splitDuration(4)).toEqual([{ duration: 'w', dots: 0 }]);
    expect(splitDuration(2)).toEqual([{ duration: 'h', dots: 0 }]);
    expect(splitDuration(1)).toEqual([{ duration: 'q', dots: 0 }]);
    expect(splitDuration(0.5)).toEqual([{ duration: '8', dots: 0 }]);
    expect(splitDuration(0.25)).toEqual([{ duration: '16', dots: 0 }]);
  });

  it('uses a dot rather than two notes where one exists', () => {
    expect(splitDuration(3)).toEqual([{ duration: 'h', dots: 1 }]);
    expect(splitDuration(1.5)).toEqual([{ duration: 'q', dots: 1 }]);
    expect(splitDuration(0.75)).toEqual([{ duration: '8', dots: 1 }]);
  });

  it('breaks a length no single value covers into the pair an engraver writes', () => {
    expect(splitDuration(2.5)).toEqual([
      { duration: 'h', dots: 0 },
      { duration: '8', dots: 0 },
    ]);
  });

  it('yields nothing for a length below the grid rather than guessing', () => {
    expect(splitDuration(0.1)).toEqual([]);
    expect(splitDuration(0)).toEqual([]);
  });
});

describe('vexKey', () => {
  it('spells naturals and sharps', () => {
    expect(vexKey(60)).toBe('c/4');
    expect(vexKey(61)).toBe('c#/4');
    expect(vexKey(21)).toBe('a/0');
  });

  it('spells flats in a flat key', () => {
    expect(vexKey(61, true)).toBe('db/4');
    expect(vexKey(63, true)).toBe('eb/4');
  });
});

describe('keySignatureOf', () => {
  it('writes minor keys the way VexFlow expects', () => {
    expect(keySignatureOf({ tonic: 0, mode: 'major' })).toBe('C');
    expect(keySignatureOf({ tonic: 9, mode: 'minor' })).toBe('Am');
    expect(keySignatureOf(null)).toBe('C');
  });
});

describe('toMeasures', () => {
  it('splits into bars of the right length', () => {
    const { measures, secPerBar, timeSignature } = toMeasures(
      score([note(60, 0, 1), note(62, 4, 1), note(64, 8, 1)]),
    );
    expect(measures).toHaveLength(3);
    expect(secPerBar).toBe(4);
    expect(timeSignature).toBe('4/4');
    expect(measures[1].startTime).toBe(4);
  });

  it('fills the silence with rests', () => {
    const { measures } = toMeasures(score([note(60, 0, 1)]));
    // One quarter note then three beats of nothing.
    expect(shapes(measures[0].treble)[0]).toBe('nq');
    expect(shapes(measures[0].treble).slice(1).every((s) => s.startsWith('r'))).toBe(true);
  });

  it('makes a whole bar of rest where a hand is silent', () => {
    const { measures } = toMeasures(score([note(60, 0, 4)]));
    expect(shapes(measures[0].bass)).toEqual(['rw']);
  });

  it('stacks simultaneous notes into one chord', () => {
    const { measures } = toMeasures(score([note(60, 0, 1), note(64, 0, 1), note(67, 0, 1)]));
    expect(measures[0].treble[0].keys).toEqual(['c/4', 'e/4', 'g/4']);
    expect(measures[0].treble.filter((e) => !e.isRest)).toHaveLength(1);
  });

  it('separates the hands onto their own staves', () => {
    const { measures } = toMeasures(score([note(72, 0, 4, 'right'), note(48, 0, 4, 'left')]));
    expect(measures[0].treble[0].keys).toEqual(['c/5']);
    expect(measures[0].bass[0].keys).toEqual(['c/3']);
  });

  it('falls back to middle C when a file carries no hand information', () => {
    const bare = score([{ midi: 72, time: 0, duration: 4 }, { midi: 48, time: 0, duration: 4 }]);
    bare.notes = bare.notes.map(({ hand, ...rest }) => rest);
    const { measures } = toMeasures(bare);
    expect(measures[0].treble[0].keys).toEqual(['c/5']);
    expect(measures[0].bass[0].keys).toEqual(['c/3']);
  });

  it('ties a note that runs over the barline instead of dropping it', () => {
    // Three beats into bar one, lasting two beats: one beat here, one over there.
    const { measures } = toMeasures(score([note(60, 3, 2)]));
    const last = measures[0].treble.filter((e) => !e.isRest).pop();
    const first = measures[1].treble.filter((e) => !e.isRest)[0];
    expect(last.tie).toBe('start');
    expect(first.tie).toBe('stop');
    expect(first.keys).toEqual(['c/4']);
  });

  it('quantises human timing onto the grid', () => {
    // A note 40ms late is still on the beat as far as notation is concerned.
    const { measures } = toMeasures(score([note(60, 0.04, 0.98)]));
    expect(measures[0].treble[0].beat).toBe(0);
    expect(measures[0].treble[0].duration).toBe('q');
  });

  it('handles three-four', () => {
    const waltz = toMeasures(score([note(60, 0, 3)], { timeSignature: [3, 4], duration: 6 }));
    expect(waltz.beatsPerBar).toBe(3);
    expect(waltz.secPerBar).toBe(3);
    expect(shapes(waltz.measures[0].treble)).toEqual(['nh.']);
  });

  it('reads the key signature off the score', () => {
    const minor = toMeasures(score([note(60, 0, 1)], { key: { tonic: 9, mode: 'minor' } }));
    expect(minor.keySignature).toBe('Am');
  });

  it('survives an empty score', () => {
    expect(toMeasures({ notes: [] }).measures).toEqual([]);
  });

  it('gives every bar a full complement of beats', () => {
    // The property that matters most: a bar that does not add up will not
    // engrave, and VexFlow reports it as a formatting failure rather than
    // drawing something wrong.
    const { measures, beatsPerBar } = toMeasures(
      score([note(60, 0, 0.5), note(62, 1.25, 0.75), note(64, 5, 2), note(67, 9.5, 1)]),
    );
    const beats = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25 };
    for (const measure of measures) {
      for (const staff of ['treble', 'bass']) {
        const total = measure[staff].reduce(
          (sum, e) => sum + beats[e.duration] * (e.dots ? 1.5 : 1),
          0,
        );
        expect(total).toBeCloseTo(beatsPerBar, 5);
      }
    }
  });
});
