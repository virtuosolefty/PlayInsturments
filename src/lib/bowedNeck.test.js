import { describe, expect, it } from 'vitest';
import { bowedNeck, placeX } from './bowedNeck.js';

// Measurements shaped like public/models/violin.json: G nearest the viewer (+z), E furthest, fanning toward the bridge.
const VIOLIN = {
  nutX: -6.05, scaleLength: 24.1,
  strings: [
    { nut: [-6.08, -0.05, 0.558], bridge: [18.05, 2.954, 1.313], radius: 0.042 },
    { nut: [-6.04, 0.031, 0.197], bridge: [18.05, 3.213, 0.479], radius: 0.033 },
    { nut: [-6.04, 0.032, -0.224], bridge: [18.05, 3.214, -0.433], radius: 0.025 },
    { nut: [-6.04, -0.013, -0.530], bridge: [18.05, 2.949, -1.271], radius: 0.015 },
  ],
  bounds: { min: [-12.2, -3.74, -7.33], max: [29.58, 3.27, 7.38] },
};

describe('finger places on a downloaded bowed instrument', () => {
  const neck = bowedNeck(VIOLIN);

  it('puts place n where 2^(-n/12) of the string is left, an octave halfway', () => {
    expect(placeX(VIOLIN, 0)).toBe(-6.05);
    expect(placeX(VIOLIN, 12)).toBeCloseTo(-6.05 + 12.05, 10);
    expect(placeX(VIOLIN, 7) - placeX(VIOLIN, 0)).toBeCloseTo(24.1 * (1 - 2 ** (-7 / 12)), 10);
  });

  it('marks the open string just past the nut, and each finger place exactly at its point', () => {
    expect(neck.markX(0)).toBeGreaterThan(VIOLIN.nutX);
    expect(neck.markX(0)).toBeLessThan((placeX(VIOLIN, 0) + placeX(VIOLIN, 1)) / 2);
    for (const fret of [1, 4, 7]) expect(neck.markX(fret)).toBeCloseTo(placeX(VIOLIN, fret), 10);
  });

  it('gives each place the stretch of string nearer it than its neighbours, the open string from the nut', () => {
    const [from0, to0] = neck.reach(0, 7);
    expect(from0).toBe(VIOLIN.nutX);
    for (let fret = 1; fret <= 7; fret++) {
      const [from, to] = neck.reach(fret, 7);
      expect(from).toBeCloseTo(neck.reach(fret - 1, 7)[1], 10);
      expect(from).toBeLessThan(placeX(VIOLIN, fret));
      expect(to).toBeGreaterThan(placeX(VIOLIN, fret));
    }
    expect(to0).toBeCloseTo((placeX(VIOLIN, 0) + placeX(VIOLIN, 1)) / 2, 10);
  });

  it('runs each string straight from nut to bridge, lowest string nearest the viewer', () => {
    expect(neck.count).toBe(4);
    expect(neck.stringAt(0, VIOLIN.strings[0].nut[0])).toEqual({ y: -0.05, z: 0.558 });
    const x = placeX(VIOLIN, 5), zs = [0, 1, 2, 3].map(s => neck.stringAt(s, x).z);
    zs.slice(1).forEach((z, i) => expect(z).toBeLessThan(zs[i]));
  });

  it('measures the gap to the nearer neighbour, wider toward the bridge', () => {
    for (let s = 0; s < 4; s++) {
      expect(neck.gapAt(s, placeX(VIOLIN, 7))).toBeGreaterThan(neck.gapAt(s, VIOLIN.nutX));
      expect(neck.gapAt(s, VIOLIN.nutX)).toBeGreaterThan(0.25);
    }
  });

  it('frames the lesson map from the scroll to just past the last place', () => {
    const first = neck.span(7), octave = neck.span(12);
    expect(first.left).toBeLessThanOrEqual(VIOLIN.bounds.min[0]);
    expect(first.left).toBeGreaterThan(VIOLIN.bounds.min[0] - 1);
    expect(first.right).toBeGreaterThan(placeX(VIOLIN, 7));
    expect(octave.right).toBeGreaterThan(first.right);
    expect(first.right).toBeLessThan(placeX(VIOLIN, 7) + 4);
  });

  it('keeps the playable surface in view when turning: open string to last place, past the outer strings', () => {
    const corners = neck.corners(7);
    expect(corners).toHaveLength(8);
    const along = k => corners.map(c => c[k]);
    expect(Math.min(...along(0))).toBe(VIOLIN.nutX);
    expect(Math.max(...along(0))).toBeCloseTo(placeX(VIOLIN, 7), 10);
    expect(Math.max(...along(2))).toBeGreaterThan(neck.stringAt(0, placeX(VIOLIN, 7)).z);
    expect(Math.min(...along(2))).toBeLessThan(neck.stringAt(3, placeX(VIOLIN, 7)).z);
  });

  it('numbers the tapes just beyond the highest string', () => {
    const x = placeX(VIOLIN, 2), at = neck.tapeLabelAt(x);
    expect(at.z).toBeLessThan(neck.stringAt(3, x).z - 0.2);
  });

  it('bows near the bridge, past the end of the fingerboard', () => {
    const contact = neck.contactX();
    expect(contact).toBeGreaterThan(placeX(VIOLIN, 19));
    expect(contact).toBeLessThan(VIOLIN.strings[0].bridge[0] - 1);
  });

  it('refuses measurements without strings', () => {
    expect(() => bowedNeck({ ...VIOLIN, strings: [] })).toThrow(/strings/i);
  });
});
