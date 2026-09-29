import { describe, expect, it } from 'vitest';
import { bowedLayout, VIEW } from './bowedGeometry.js';

for (const [instrument, strings, reach] of [['violin', 4, 7], ['cello', 4, 5]]) {
  describe(`${instrument} fingerboard layout`, () => {
    const layout = bowedLayout({ strings, maxFret: reach });
    it('places finger stops in pitch order, closer together as they rise', () => {
      const xs = Array.from({ length: reach + 1 }, (_, n) => layout.posX(n));
      xs.slice(1).forEach((x, i) => expect(x).toBeGreaterThan(xs[i]));
      const gaps = xs.slice(1).map((x, i) => x - xs[i]);
      gaps.slice(1).forEach((gap, i) => expect(gap).toBeLessThan(gaps[i]));
      expect(xs[0]).toBe(layout.nutX);
    });
    it('keeps the playable neck, bowing area and bridge inside the drawing', () => {
      expect(layout.posX(reach)).toBeLessThan(layout.fingerboardEnd);
      expect(layout.fingerboardEnd).toBeLessThan(layout.bow.x0);
      expect(layout.bow.x1).toBeLessThan(layout.bridgeX);
      expect(layout.bridgeX).toBeLessThan(VIEW.width);
    });
    it('draws the highest string at the top, like the tab', () => {
      const ys = Array.from({ length: strings }, (_, s) => layout.stringY(s, layout.nutX));
      ys.slice(1).forEach((y, i) => expect(y).toBeLessThan(ys[i]));
      expect(layout.stringY(0, layout.bridgeX) - layout.stringY(strings - 1, layout.bridgeX))
        .toBeGreaterThan(ys[0] - ys.at(-1));
    });
    it('covers every place with exactly one touch zone per string', () => {
      for (let s = 0; s < strings; s++) {
        const zones = layout.zones.filter(z => z.string === s && !z.bow).sort((a, b) => a.x0 - b.x0);
        expect(zones.map(z => z.fret)).toEqual(Array.from({ length: reach + 1 }, (_, n) => n));
        zones.slice(1).forEach((z, i) => expect(z.x0).toBeCloseTo(zones[i].x1));
        zones.forEach(z => expect(z.x1).toBeGreaterThan(z.x0));
        expect(layout.zones.filter(z => z.string === s && z.bow).map(z => z.fret)).toEqual([0]);
      }
    });
  });
}

it('uses more of the neck when more places are shown', () => {
  const first = bowedLayout({ strings: 4, maxFret: 7 });
  const octave = bowedLayout({ strings: 4, maxFret: 12 });
  expect(octave.posX(7)).toBeLessThan(first.posX(7));
  expect(octave.posX(12)).toBeLessThan(octave.fingerboardEnd);
});
