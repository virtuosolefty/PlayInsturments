import { describe, expect, it } from 'vitest';
import { NO_TURN, PITCH_LIMITS, isTurned, showcaseShot, turnBy } from './showcaseView.js';

const BOUNDS = { min: [-12, 0, -4], max: [12, 9, 4] };

describe('the first look at a model that is only shown', () => {
  it('frames the model\'s box from the angle its file asks for', () => {
    expect(showcaseShot({ bounds: BOUNDS, view: { azimuthDeg: 25, elevationDeg: 22 } })).toEqual({ box: BOUNDS, azimuthDeg: 25, elevationDeg: 22 });
  });

  it('has an angle of its own for a file that asks for none, or asks for nonsense', () => {
    const usual = showcaseShot({ bounds: BOUNDS });
    expect(Number.isFinite(usual.azimuthDeg) && Number.isFinite(usual.elevationDeg)).toBe(true);
    expect(showcaseShot({ bounds: BOUNDS, view: { azimuthDeg: 'round', elevationDeg: null } })).toEqual(usual);
    expect(showcaseShot({ bounds: BOUNDS, view: { azimuthDeg: 40 } })).toEqual({ ...usual, azimuthDeg: 40 });
  });
});

describe('turning it', () => {
  it('starts unturned', () => {
    expect(NO_TURN).toEqual({ yaw: 0, pitch: 0 });
    expect(isTurned(NO_TURN)).toBe(false);
  });

  it('follows the pointer: across turns it round, up and down tips it', () => {
    const turned = turnBy(NO_TURN, 100, 0);
    expect(turned.yaw).toBeLessThan(0);
    expect(turned.pitch).toBe(0);
    expect(turnBy(NO_TURN, -100, 0).yaw).toBeCloseTo(-turned.yaw);
    expect(turnBy(NO_TURN, 0, 20).pitch).toBeGreaterThan(0);
    expect(isTurned(turned)).toBe(true);
  });

  it('goes all the way round, but never under the floor or over the top', () => {
    expect(Math.abs(turnBy(NO_TURN, 5000, 0).yaw)).toBeGreaterThan(Math.PI * 2);
    expect(turnBy(NO_TURN, 0, 5000).pitch).toBe(PITCH_LIMITS[1]);
    expect(turnBy(NO_TURN, 0, -5000).pitch).toBe(PITCH_LIMITS[0]);
  });

  it('returns a new turn and leaves the one it was given alone', () => {
    const start = Object.freeze({ yaw: 0.2, pitch: 0.1 });
    const next = turnBy(start, 10, 10);
    expect(next).not.toBe(start);
    expect(start).toEqual({ yaw: 0.2, pitch: 0.1 });
  });
});
