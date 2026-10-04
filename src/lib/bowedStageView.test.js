import { describe, expect, it } from 'vitest';
import { bowedNeck } from './bowedNeck.js';
import { bowedLabels, markerText, placeText } from './bowedStageView.js';
import { stringKit } from './instruments.js';
import { STRING_LABEL_INSET } from './guitarStageView.js';

const FIT = {
  nutX: -6.05, scaleLength: 24.1,
  strings: [0, 1, 2, 3].map(s => ({ nut: [-6.05, 0, 0.55 - s * 0.36], bridge: [18.05, 3, 1.3 - s * 0.86], radius: 0.03 })),
  bounds: { min: [-12.2, -3.7, -7.3], max: [29.6, 3.3, 7.4] },
};
const neck = bowedNeck(FIT);
// A stand-in camera: every coordinate moves the result, so a label at the wrong place lands elsewhere.
// As on stage, strings nearer the viewer (+z) are lower down and higher ones (+y) further up.
const project = (x, y, z) => ({ x: 600 + x * 40 + z, y: 150 + z * 60 + x * 2 - y * 10 });
const violin = stringKit('violin'), cello = stringKit('cello');
const labels = (options = {}) => bowedLabels({ project, width: 1200, kit: violin, neck, maxFret: 7, ...options });
const of = (list, kind) => list.filter(l => l.kind.split(' ')[0] === kind);

describe('the hint for the place under the pointer', () => {
  it('names the string, the finger and the pitch, as the 2D fingerboard does', () => {
    expect(placeText(violin, { string: 2, fret: 2 })).toBe('A string · finger 1 · B4');
    expect(placeText(violin, { string: 0, fret: 0 })).toBe('G string · open string · G3');
    expect(placeText(cello, { string: 3, fret: 9 })).toBe('A string · 9 semitones up · F#4');
  });
});

describe('what a marker on a bowed instrument says', () => {
  it('names the finger in first position, the note beyond it, and the note when asked', () => {
    expect(markerText(violin, { string: 2, fret: 0 }, 'fingers')).toBe('0');
    expect(markerText(violin, { string: 2, fret: 2 }, 'fingers')).toBe('1');
    expect(markerText(violin, { string: 2, fret: 7 }, 'fingers')).toBe('4');
    expect(markerText(violin, { string: 2, fret: 10 }, 'fingers')).toBe('G');
    expect(markerText(violin, { string: 2, fret: 2 }, 'notes')).toBe('B');
    expect(markerText(cello, { string: 2, fret: 3 }, 'fingers')).toBe('2');
  });
});

describe('labels on the bowed stage', () => {
  it('names and numbers the strings at the nut, lowest at the bottom, pinned to the near edge', () => {
    const strings = of(labels({ fontSize: 6 }), 'string');
    expect(strings.map(l => l.text)).toEqual(['G3', 'D4', 'A4', 'E5']);
    expect(strings.map(l => l.number)).toEqual([4, 3, 2, 1]);
    strings.forEach((l, s) => {
      expect(l.x).toBe(STRING_LABEL_INSET);
      const at = neck.stringAt(s, FIT.nutX);
      expect(l.y).toBeCloseTo(project(FIT.nutX, at.y + 0.1, at.z).y, 6);
      // With room for every name beside its string, none needs a leader.
      expect(l.leader).toBeNull();
    });
    expect(of(bowedLabels({ project, width: 1200, kit: cello, neck, maxFret: 5, fontSize: 6 }), 'string').map(l => l.text)).toEqual(['C2', 'G2', 'D3', 'A3']);
    // Lowest string nearest the viewer, so lowest on screen.
    expect(strings[0].y).toBeGreaterThan(strings[3].y);
  });

  it('keeps crowded string names apart, each tied back to its string at the nut', () => {
    const tiny = (x, y, z) => ({ x: 300 + x * 9, y: 90 + z * 5 - y });
    const strings = of(bowedLabels({ project: tiny, width: 400, kit: violin, neck, maxFret: 7, fontSize: 14 }), 'string');
    const ys = strings.map(l => l.y).sort((a, b) => a - b);
    ys.slice(1).forEach((y, i) => expect(y - ys[i]).toBeGreaterThanOrEqual(15 - 1e-9));
    strings.forEach((l, s) => {
      const at = neck.stringAt(s, FIT.nutX);
      expect(l.leader.to).toEqual(tiny(FIT.nutX, at.y, at.z));
      expect(l.leader.from).toEqual({ x: expect.any(Number), y: l.y });
      expect(l.leader.from.x).toBeGreaterThan(l.x);
    });
  });

  it('numbers each visible tape with its finger, beyond the highest string', () => {
    const tapes = of(labels(), 'tape');
    expect(tapes.map(l => l.text)).toEqual(['1', '2', '3', '4']);
    const x = neck.placeX(2), at = neck.tapeLabelAt(x);
    expect(tapes[0]).toMatchObject(project(x, at.y, at.z));
    // Cello tapes, and only those the visible places reach.
    expect(of(bowedLabels({ project, width: 1200, kit: cello, neck, maxFret: 3 }), 'tape').map(l => l.text)).toEqual(['1', '2']);
  });

  it('labels each showing marker where it is drawn, light on the outlined ones, none on a guess', () => {
    const markers = [
      { string: 2, fret: 2, state: 'held', at: { x: -3.4, y: 0.5, z: -0.2 } },
      { string: 1, fret: 4, state: 'target', at: { x: -1.5, y: 0.6, z: 0.2 } },
      { string: 0, fret: 5, state: 'possible', at: { x: -1, y: 0.6, z: 0.5 } },
    ];
    const fingers = of(labels({ markers }), 'finger');
    expect(fingers.map(l => [l.text, l.kind])).toEqual([['1', 'finger'], ['2', 'finger inverse']]);
    expect(fingers[0]).toMatchObject(project(-3.4, 0.5, -0.2));
  });

  it('falls back to the standard text size when the stored one is not a number', () => {
    expect(of(labels({ fontSize: 'large' }), 'string').every(l => Number.isFinite(l.y))).toBe(true);
  });
});
