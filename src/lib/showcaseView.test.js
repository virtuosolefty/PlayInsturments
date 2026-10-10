import { describe, expect, it } from 'vitest';
import { VIEWER_TURN, showcaseShot } from './showcaseView.js';
import { NO_TURN, canTurn, dragTurn } from './stage/turntable.js';

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

describe('how far it turns on the stage\'s turntable', () => {
  it('can be turned', () => {
    expect(canTurn(VIEWER_TURN)).toBe(true);
  });

  it('goes all the way round, but never under the floor or over the top', () => {
    expect(Math.abs(dragTurn(NO_TURN, { dx: 5000, dy: 0 }, VIEWER_TURN).yaw)).toBeGreaterThan(Math.PI * 2);
    expect(dragTurn(NO_TURN, { dx: 0, dy: 5000 }, VIEWER_TURN).pitch).toBe(VIEWER_TURN.pitch[1]);
    expect(dragTurn(NO_TURN, { dx: 0, dy: -5000 }, VIEWER_TURN).pitch).toBe(VIEWER_TURN.pitch[0]);
    expect(VIEWER_TURN.pitch[0]).toBeLessThan(0);
    expect(VIEWER_TURN.pitch[1]).toBeLessThan(Math.PI / 2);
  });
});
