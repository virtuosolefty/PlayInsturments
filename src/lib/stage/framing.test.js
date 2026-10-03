import { describe, expect, it } from 'vitest';
import { frameBox, frameSpan, screenPoint, visibleHalfWidth } from './framing.js';

const neck = { left: -9.6, right: 8.6 };
// About the downloaded guitar's size: the neck along x, the top facing up, the body's depth below.
const guitar = { min: [-12.6, -4, -7.3], max: [25.4, 0.2, 7.3] };
const corners = ({ min, max }) => [min[0], max[0]].flatMap(x => [min[1], max[1]].flatMap(y => [min[2], max[2]].map(z => [x, y, z])));
const radians = degrees => (degrees * Math.PI) / 180;

describe('framing a span of the instrument', () => {
  it('shows the whole span at any stage shape', () => {
    for (const aspect of [1.2, 2.4, 4, 5.3, 7]) {
      const { distance } = frameSpan({ ...neck, aspect });
      expect(visibleHalfWidth({ distance, aspect })).toBeGreaterThan((neck.right - neck.left) / 2);
    }
  });

  it('leaves the default 6% of breathing room around a span that sets the distance', () => {
    // At these shapes the span, not the minimum distance, decides where the camera stands.
    for (const aspect of [1.2, 2.4, 4]) {
      const { distance } = frameSpan({ ...neck, aspect });
      expect(distance).toBeGreaterThan(6.1);
      expect(visibleHalfWidth({ distance, aspect })).toBeCloseTo(((neck.right - neck.left) / 2) * 1.06);
    }
    const snug = frameSpan({ ...neck, aspect: 2.4, margin: 1 });
    expect(visibleHalfWidth({ distance: snug.distance, aspect: 2.4 })).toBeCloseTo((neck.right - neck.left) / 2);
  });

  it('centres the camera on the span and aims at its middle', () => {
    const frame = frameSpan({ ...neck, aspect: 4 });
    expect(frame.center).toBeCloseTo(-0.5);
    expect(frame.position[0]).toBeCloseTo(-0.5);
    expect(frame.target).toEqual([frame.center, 0, 0]);
  });

  it('sits above and in front of the instrument', () => {
    const { position, distance } = frameSpan({ ...neck, aspect: 4 });
    expect(position[1]).toBeCloseTo(distance * 0.89);
    expect(position[2]).toBeCloseTo(distance * 0.46);
    expect(position[1]).toBeGreaterThan(position[2]);
  });

  it('backs away as the stage narrows', () => {
    const wide = frameSpan({ ...neck, aspect: 5 }), narrow = frameSpan({ ...neck, aspect: 2 });
    expect(narrow.distance).toBeGreaterThan(wide.distance);
  });

  it('never comes closer than its minimum, however short the span', () => {
    expect(frameSpan({ left: -1, right: 1, aspect: 6 }).distance).toBe(6.1);
    expect(frameSpan({ left: -1, right: 1, aspect: 6, minDistance: 3 }).distance).toBe(3);
  });

  it('mirrors for the left-handed view without changing the distance', () => {
    const right = frameSpan({ ...neck, aspect: 4 }), left = frameSpan({ ...neck, aspect: 4, flip: -1 });
    expect(left.position[0]).toBeCloseTo(-right.position[0]);
    expect(left.target[0]).toBeCloseTo(-right.target[0]);
    expect(left.distance).toBe(right.distance);
  });

  it('matches the framing the guitar stage has always used', () => {
    // 12 frets at a 1224 × 231 stage: the numbers GuitarStage computed inline before this module existed.
    const aspect = 1224 / 231, left = -9.6, right = 6 + 2.6;
    const expected = Math.max(6.1, (right - left) / 2 / (Math.tan(16 * Math.PI / 180) * aspect) * 1.06);
    expect(frameSpan({ left, right, aspect }).distance).toBeCloseTo(expected, 10);
  });

  it('rejects a span or stage it cannot frame', () => {
    expect(() => frameSpan({ left: 2, right: 2, aspect: 4 })).toThrow(/span/i);
    expect(() => frameSpan({ left: 0, right: 4, aspect: 0 })).toThrow(/aspect/i);
    expect(() => frameSpan({ left: 0, right: 4, aspect: NaN })).toThrow(/aspect/i);
  });
});

describe('framing a whole instrument from three-quarters', () => {
  const lens = { aspect: 1.6, fovDeg: 32 };
  const shot = (options = {}) => frameBox({ ...guitar, ...lens, azimuthDeg: 140, elevationDeg: 35, ...options });
  const onScreen = (pose, box = guitar, view = lens) => corners(box).map(point => screenPoint(point, pose, view));

  it('looks from the asked direction: around from the front, and up from the floor', () => {
    const { position, target, distance } = shot();
    const offset = position.map((v, i) => (v - target[i]) / distance);
    expect(offset[0]).toBeCloseTo(Math.sin(radians(140)) * Math.cos(radians(35)), 10);
    expect(offset[1]).toBeCloseTo(Math.sin(radians(35)), 10);
    expect(offset[2]).toBeCloseTo(Math.cos(radians(140)) * Math.cos(radians(35)), 10);
  });

  it('shows every corner, filling the stage but for the margin', () => {
    for (const aspect of [0.7, 1.2, 1.6, 2.4, 4]) {
      const pose = shot({ aspect }), points = onScreen(pose, guitar, { ...lens, aspect });
      points.forEach(p => {
        expect(p.depth).toBeGreaterThan(0);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / 1.06 + 1e-6);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / 1.06 + 1e-6);
      });
      // Snug: the box reaches the margin across or up and down, whichever is tighter.
      const reach = Math.max(...points.flatMap(p => [Math.abs(p.x), Math.abs(p.y)]));
      expect(reach).toBeCloseTo(1 / 1.06, 3);
    }
  });

  it('centres what it shows, not the middle of the box, since nearer corners look larger', () => {
    const points = onScreen(shot());
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 3);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(0, 3);
  });

  it('fits between the stage bars when given the band they leave', () => {
    const bounds = { x: 1, top: 0.7, bottom: -0.8 };
    const points = onScreen(shot({ bounds }));
    const ys = points.map(p => p.y);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.7 + 1e-6);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.8 - 1e-6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(-0.05, 3);
  });

  it('backs away as the stage narrows', () => {
    expect(shot({ aspect: 0.8 }).distance).toBeGreaterThan(shot({ aspect: 2 }).distance);
  });

  it('falls back to the whole screen when the bars leave no band around its middle, rather than backing away for ever', () => {
    // A top bar reaching past the middle, an inverted band, and a band of no width.
    for (const bounds of [{ x: 1, top: 0, bottom: -0.9 }, { x: 1, top: -0.2, bottom: -0.76 }, { x: 1, top: -0.5, bottom: 0.5 }, { x: 0, top: 1, bottom: -1 }]) {
      const pose = shot({ aspect: 3, bounds });
      [...pose.position, ...pose.target, pose.distance].forEach(v => expect(Number.isFinite(v)).toBe(true));
      expect(pose.distance).toBeCloseTo(shot({ aspect: 3 }).distance, 6);
    }
  });

  it('comes closer when told the shape inside the box, fitting only the parts', () => {
    // The body is wide but the neck and headstock are narrow, so most of the box's far corners are empty air.
    const parts = [{ min: [7.3, -4, -7.3], max: [25.4, 0.2, 7.3] }, { min: [-12.6, -0.4, -1.5], max: [7.3, 0.2, 1.5] }];
    const keep = parts.flatMap(corners);
    const fitted = shot({ keep });
    expect(fitted.distance).toBeLessThan(shot().distance);
    const points = keep.map(point => screenPoint(point, fitted, lens));
    points.forEach(p => expect(Math.max(Math.abs(p.x), Math.abs(p.y))).toBeLessThanOrEqual(1 / 1.06 + 1e-6));
  });

  it('mirrors the whole shot for the left-handed view', () => {
    const right = shot(), left = shot({ flip: -1 });
    expect(left.position[0]).toBeCloseTo(-right.position[0], 6);
    expect(left.position[1]).toBeCloseTo(right.position[1], 6);
    expect(left.position[2]).toBeCloseTo(right.position[2], 6);
    expect(left.target[0]).toBeCloseTo(-right.target[0], 6);
    expect(left.distance).toBeCloseTo(right.distance, 6);
  });

  it('rejects a box or stage it cannot frame', () => {
    expect(() => frameBox({ min: [0, 0, 0], max: [-1, 1, 1], ...lens })).toThrow(/box/i);
    expect(() => frameBox({ min: [0, 0, 0], max: [0, 0, 0], ...lens })).toThrow(/box/i);
    expect(() => frameBox({ min: [0, NaN, 0], max: [1, 1, 1], ...lens })).toThrow(/box/i);
    expect(() => frameBox({ ...guitar, aspect: 0 })).toThrow(/aspect/i);
  });
});

describe('where a point lands on screen', () => {
  const aspect = 2.4, fovDeg = 22;
  // Ten units from the origin, looking down at it from 37° above the floor.
  const pose = { position: [0, 6, 8], target: [0, 0, 0] };

  it('puts what the camera looks at in the middle', () => {
    const middle = screenPoint(pose.target, pose, { fovDeg, aspect });
    expect(middle.x).toBeCloseTo(0, 10);
    expect(middle.y).toBeCloseTo(0, 10);
    expect(middle.depth).toBeCloseTo(10, 10);
  });

  it('puts a point at the edge of the visible width on the edge of the screen', () => {
    const edge = visibleHalfWidth({ distance: 10, aspect, fovDeg });
    expect(screenPoint([edge, 0, 0], pose, { fovDeg, aspect }).x).toBeCloseTo(1, 10);
    expect(screenPoint([-edge / 2, 0, 0], pose, { fovDeg, aspect }).x).toBeCloseTo(-0.5, 10);
  });

  it('puts a point at the edge of the visible height on the top edge', () => {
    // Straight up the screen from the target is along the camera's own up direction.
    const up = [0, 0.8, -0.6], reach = 10 * Math.tan((fovDeg / 2) * Math.PI / 180);
    expect(screenPoint(up.map(c => c * reach), pose, { fovDeg, aspect }).y).toBeCloseTo(1, 10);
  });

  it('puts higher points higher, and nearer points lower, on a camera looking down', () => {
    const above = screenPoint([0, 1, 0], pose, { fovDeg, aspect });
    const nearer = screenPoint([0, 0, 1], pose, { fovDeg, aspect });
    expect(above.y).toBeGreaterThan(0);
    expect(nearer.y).toBeLessThan(0);
  });

  it('reports points behind the camera as having no depth in front of it', () => {
    const behind = pose.position.map((p, i) => p + (p - pose.target[i]));
    expect(screenPoint(behind, pose, { fovDeg, aspect }).depth).toBeLessThan(0);
  });
});
