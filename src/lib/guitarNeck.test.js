import { describe, expect, it } from 'vitest';
import { GUITAR_TUNING } from './guitar.js';
import { DRAWN_NECK, fretboardCorners, fretSpace, fretX, modelNeck, neckSpan, NUT_X, OPEN_SPACE, SCALE_LENGTH, STRING_COUNT, stringGauge, stringZ, WIRE_Y } from './guitarNeck.js';

// Measurements shaped like public/models/guitar.json: strings fan from 0.29 apart at the nut to 0.45 at the saddle.
const FIT = {
  nutX: -6.05,
  strings: [0, 1, 2, 3, 4, 5].map(s => ({ nut: [-6.05, 0, 0.72 - s * 0.2885], bridge: [18.4, 0.22, 1.12 - s * 0.45] })),
  bounds: { min: [-12.64, -3.97, -7.3], max: [25.42, 0.21, 7.28] },
};

describe('guitar neck geometry', () => {
  it('keeps the dimensions the stage was drawn to', () => {
    expect(NUT_X).toBe(-6.05);
    expect(SCALE_LENGTH).toBe(24.1);
    expect(OPEN_SPACE).toEqual({ x: -6.45, width: 0.5 });
    expect(fretX(1)).toBeCloseTo(-4.69737, 5);
    expect(fretX(12)).toBeCloseTo(6);
    expect(fretSpace(4).x).toBeCloseTo(-1.64689, 5);
    expect(stringZ(0)).toBeCloseTo(1.4);
    expect(stringZ(5)).toBeCloseTo(-1.4);
    expect(stringGauge(0)).toBeCloseTo(0.034);
    expect(stringGauge(5)).toBeCloseTo(0.014);
    expect(neckSpan(12).left).toBe(-9.6);
  });

  it('starts at the nut and halves the string at the twelfth fret', () => {
    expect(fretX(0)).toBe(NUT_X);
    expect(fretX(12) - NUT_X).toBeCloseTo(SCALE_LENGTH / 2);
    expect(fretX(24) - NUT_X).toBeCloseTo(SCALE_LENGTH * 0.75);
  });

  it('spaces frets by equal temperament, each space narrower than the last', () => {
    const widths = Array.from({ length: 12 }, (_, i) => fretX(i + 1) - fretX(i));
    widths.slice(1).forEach((w, i) => {
      expect(w).toBeLessThan(widths[i]);
      expect(w / widths[i]).toBeCloseTo(2 ** (-1 / 12));
    });
  });

  it('gives every fretted place a space that runs wire to wire', () => {
    for (let f = 1; f <= 12; f++) {
      const { x, width } = fretSpace(f);
      expect(x - width / 2).toBeCloseTo(fretX(f - 1));
      expect(x + width / 2).toBeCloseTo(fretX(f));
    }
  });

  it('puts the open-string place behind the nut', () => {
    expect(fretSpace(0)).toEqual(OPEN_SPACE);
    expect(OPEN_SPACE.x + OPEN_SPACE.width / 2).toBeLessThan(NUT_X);
  });

  it('lays six strings out evenly, low E nearest the viewer', () => {
    expect(STRING_COUNT).toBe(GUITAR_TUNING.length);
    const zs = Array.from({ length: STRING_COUNT }, (_, s) => stringZ(s));
    zs.slice(1).forEach((z, i) => expect(zs[i] - z).toBeCloseTo(0.56));
    expect(zs[0]).toBeGreaterThan(0);
    expect(zs[0]).toBeCloseTo(-zs.at(-1));
  });

  it('marks out the playable surface, from the open-string places to the last fret and past the outer strings', () => {
    for (const maxFret of [5, 12]) {
      const corners = fretboardCorners(maxFret);
      expect(corners).toHaveLength(8);
      const along = axis => corners.map(c => c[axis]);
      expect(Math.min(...along(0))).toBeCloseTo(OPEN_SPACE.x - OPEN_SPACE.width / 2);
      expect(Math.max(...along(0))).toBeCloseTo(fretX(maxFret));
      expect(Math.max(...along(2))).toBeGreaterThan(stringZ(0));
      expect(Math.min(...along(2))).toBeLessThan(stringZ(STRING_COUNT - 1));
      expect(Math.min(...along(1))).toBe(0);
    }
  });

  it('describes the drawn neck exactly as its constants do', () => {
    expect(DRAWN_NECK.nutX).toBe(NUT_X);
    for (let s = 0; s < STRING_COUNT; s++) {
      expect(DRAWN_NECK.stringAt(s, 3)).toEqual({ y: WIRE_Y, z: stringZ(s) });
      expect(DRAWN_NECK.labelAt('string', s, NUT_X)).toEqual({ y: 0.3, z: stringZ(s) });
      expect(DRAWN_NECK.labelAt('chord', s, 3)).toEqual({ y: 0.35, z: stringZ(s) });
    }
    expect(DRAWN_NECK.fretLabelAt(2)).toEqual({ y: 0.14, z: -2.13 });
    expect(DRAWN_NECK.span(12)).toEqual(neckSpan(12));
    expect(DRAWN_NECK.corners(5)).toEqual(fretboardCorners(5));
  });

  it('makes lower strings thicker', () => {
    const gauges = Array.from({ length: STRING_COUNT }, (_, s) => stringGauge(s));
    gauges.slice(1).forEach((g, i) => expect(g).toBeLessThan(gauges[i]));
    expect(gauges.at(-1)).toBeGreaterThan(0);
  });

  it('frames the headstock through the last visible fret, and the body shoulder at twelve', () => {
    expect(neckSpan(5).left).toBe(neckSpan(12).left);
    expect(neckSpan(5).left).toBeLessThan(NUT_X);
    expect(neckSpan(5).right).toBeCloseTo(fretX(5) + 0.4);
    expect(neckSpan(12).right).toBeCloseTo(fretX(12) + 2.6);
  });
});

describe('a downloaded guitar\'s neck, from its measurements', () => {
  const neck = modelNeck(FIT);

  it('runs each string from its measured nut point to its measured saddle point', () => {
    for (let s = 0; s < 6; s++) {
      const { nut, bridge } = FIT.strings[s];
      expect(neck.stringAt(s, nut[0])).toEqual({ y: nut[1], z: nut[2] });
      const mid = neck.stringAt(s, (nut[0] + bridge[0]) / 2);
      expect(mid.y).toBeCloseTo((nut[1] + bridge[1]) / 2, 10);
      expect(mid.z).toBeCloseTo((nut[2] + bridge[2]) / 2, 10);
    }
  });

  it('keeps the low E nearest the player and the strings in order at every fret', () => {
    for (const fret of [0, 1, 5, 12]) {
      const x = fret ? fretSpace(fret).x : NUT_X;
      const zs = [0, 1, 2, 3, 4, 5].map(s => neck.stringAt(s, x).z);
      zs.slice(1).forEach((z, i) => expect(z).toBeLessThan(zs[i]));
    }
  });

  it('floats string names and chord labels just above their own string', () => {
    for (const s of [0, 5]) {
      const x = fretSpace(3).x, wire = neck.stringAt(s, x);
      for (const kind of ['string', 'chord']) {
        const at = neck.labelAt(kind, s, x);
        expect(at.z).toBe(wire.z);
        expect(at.y - wire.y).toBeGreaterThan(0.05);
        expect(at.y - wire.y).toBeLessThan(0.2);
      }
    }
  });

  it('puts fret numbers just beyond the treble edge, clear of the high E', () => {
    for (const fret of [1, 12]) {
      const x = fretSpace(fret).x, high = neck.stringAt(5, x).z;
      expect(neck.fretLabelAt(x).z).toBeLessThan(high - 0.2);
    }
  });

  it('frames the neck from a little of the headstock to the last fret, and keeps the playable surface for turning', () => {
    const span = neck.span(12);
    expect(span.left).toBeLessThan(FIT.nutX);
    expect(span.left).toBeGreaterThan(FIT.bounds.min[0]);
    expect(span.right).toBeGreaterThan(fretX(12));
    const corners = neck.corners(12);
    expect(corners).toHaveLength(8);
    expect(Math.max(...corners.map(c => c[2]))).toBeGreaterThan(neck.stringAt(0, fretX(12)).z);
    expect(Math.min(...corners.map(c => c[2]))).toBeLessThan(neck.stringAt(5, fretX(12)).z);
  });

  it('refuses measurements without strings', () => {
    expect(() => modelNeck({ ...FIT, strings: [] })).toThrow(/strings/i);
  });
});
