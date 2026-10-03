import { describe, expect, it } from 'vitest';
import { frameSpan } from './framing.js';
import { stageView, STAGE_VIEWS } from './views.js';

const neck = { left: -9.6, right: 8.6 };

describe('the camera views the stage offers', () => {
  it('teaches through a long lens that cannot be turned', () => {
    const lesson = stageView('lesson');
    expect(lesson.fovDeg).toBe(22);
    expect(lesson.turn).toBeNull();
  });

  it('lets the player turn the instrument a little in free play', () => {
    const free = stageView('freePlay');
    expect(free.fovDeg).toBe(32);
    expect(free.turn.yaw[0]).toBeLessThan(0);
    expect(free.turn.yaw[1]).toBeGreaterThan(0);
    expect(Math.abs(free.turn.yaw[1])).toBeLessThanOrEqual((25 * Math.PI) / 180 + 1e-9);
  });

  it('falls back to the lesson view for a name it does not know', () => {
    expect(stageView('sideways')).toBe(STAGE_VIEWS.lesson);
    expect(stageView(undefined)).toBe(STAGE_VIEWS.lesson);
  });

  it('frames the lesson from further back than free play, which is what flattens the perspective', () => {
    const lesson = frameSpan({ ...neck, aspect: 2.6, fovDeg: stageView('lesson').fovDeg });
    const free = frameSpan({ ...neck, aspect: 2.6, fovDeg: stageView('freePlay').fovDeg });
    expect(lesson.distance / free.distance).toBeGreaterThan(1.4);
  });

  it('cannot be changed by the stage that reads it', () => {
    expect(Object.isFrozen(STAGE_VIEWS)).toBe(true);
    expect(Object.isFrozen(STAGE_VIEWS.freePlay)).toBe(true);
    expect(Object.isFrozen(STAGE_VIEWS.freePlay.turn)).toBe(true);
  });
});
