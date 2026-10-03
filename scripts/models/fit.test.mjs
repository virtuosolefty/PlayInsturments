import { describe, expect, it } from 'vitest';
import { crossSectionRadius, fitLine, fitScale, playingSpan, ringCentres } from './fit.mjs';

describe('fitting a straight line through points', () => {
  it('recovers a line from points spread along it', () => {
    const points = [0, 1, 2, 3, 4].map(t => [1 + 0.5 * t, 2 - 0.25 * t, t]);
    const line = fitLine(points, 2);
    expect(line.at(10)[0]).toBeCloseTo(6, 10);
    expect(line.at(10)[1]).toBeCloseTo(-0.5, 10);
    expect(line.at(10)[2]).toBe(10);
  });

  it('averages out points scattered evenly around the line, as a cylinder\'s vertices are', () => {
    const points = [];
    for (const t of [0, 5, 10]) for (let a = 0; a < 8; a++) points.push([t * 0.1 + 0.02 * Math.cos(a * Math.PI / 4), 0.3 + 0.02 * Math.sin(a * Math.PI / 4), t]);
    const line = fitLine(points, 2);
    expect(line.at(5)[0]).toBeCloseTo(0.5, 10);
    expect(line.at(5)[1]).toBeCloseTo(0.3, 10);
  });

  it('refuses points that do not spread along the axis', () => {
    expect(() => fitLine([[0, 0, 1], [1, 1, 1]], 2)).toThrow(/spread/i);
  });
});

describe('fitting the nut and scale length to fret positions', () => {
  it('finds the nut and the scale length that place every fret', () => {
    const nut = -1.647, length = 3.158;
    const frets = Array.from({ length: 20 }, (_, i) => nut + length * (1 - 2 ** (-(i + 1) / 12)));
    const fit = fitScale(frets);
    expect(fit.nut).toBeCloseTo(nut, 10);
    expect(fit.length).toBeCloseTo(length, 10);
    expect(fit.worst).toBeLessThan(1e-9);
  });

  it('reports how far the worst fret is from where the fit puts it', () => {
    const frets = Array.from({ length: 12 }, (_, i) => 10 * (1 - 2 ** (-(i + 1) / 12)));
    frets[4] += 0.05;
    expect(fitScale(frets).worst).toBeGreaterThan(0.03);
  });

  it('works when the frets run toward smaller numbers', () => {
    const frets = Array.from({ length: 12 }, (_, i) => 5 - 8 * (1 - 2 ** (-(i + 1) / 12)));
    const fit = fitScale(frets);
    expect(fit.nut).toBeCloseTo(5, 10);
    expect(fit.length).toBeCloseTo(-8, 10);
  });

  it('needs at least two frets', () => {
    expect(() => fitScale([1])).toThrow(/two frets/i);
  });
});

/** A string modelled as rings of five vertices around a bent centreline: up into a pegbox, along the neck, down to a tailpiece. */
function bentString() {
  const centre = [];
  for (let z = 0; z <= 0.03; z += 0.006) centre.push([0, 0.5 * z, z]); // pegbox, rising steeply
  for (let z = 0.04; z <= 0.30; z += 0.02) centre.push([0.001 * z, 0.015 + 0.1 * (z - 0.03), z]); // nut to bridge
  for (let z = 0.31; z <= 0.36; z += 0.01) centre.push([0.0003, 0.042 - 0.3 * (z - 0.30), z]); // down to the tailpiece
  return centre.flatMap(c => Array.from({ length: 5 }, (_, a) => [c[0] + 0.001 * Math.cos(a), c[1] + 0.001 * Math.sin(a), c[2]]));
}

describe('finding where a string runs straight', () => {
  it('groups a cylinder\'s vertices into rings along it', () => {
    const rings = ringCentres(bentString(), 2, 0.0008);
    expect(rings.length).toBeGreaterThan(20);
    rings.forEach((ring, i) => { if (i) expect(ring[2]).toBeGreaterThan(rings[i - 1][2]); });
  });

  it('picks the longest straight run, from bend to bend', () => {
    // The run starts at the last pegbox ring, where the string turns onto the neck, and ends where it turns down to the tailpiece.
    const span = playingSpan(ringCentres(bentString(), 2, 0.0008), 2);
    expect(span.from[2]).toBeCloseTo(0.03, 3);
    expect(span.to[2]).toBeCloseTo(0.30, 3);
  });

  it('takes a single long segment as the stretch, as a guitar string from saddle to nut is modelled', () => {
    const centres = [[0, 0, 0], [0, 0.01, 0.005], [0.02, 0.03, 3.2], [0.02, 0.01, 3.21]];
    const span = playingSpan(centres, 2);
    expect(span.from[2]).toBeCloseTo(0.005, 10);
    expect(span.to[2]).toBeCloseTo(3.2, 10);
  });

  it('needs at least two rings', () => {
    expect(() => playingSpan([[0, 0, 0]], 2)).toThrow(/two rings/i);
  });
});

describe('measuring how thick a string is', () => {
  it('gives the radius of a cylinder around its axis', () => {
    const points = [];
    for (const t of [0, 1, 2, 3]) for (let a = 0; a < 12; a++) points.push([0.004 * Math.cos(a * Math.PI / 6), 1 + 0.004 * Math.sin(a * Math.PI / 6), t]);
    expect(crossSectionRadius(points, fitLine(points, 2))).toBeCloseTo(0.004, 10);
  });
});
