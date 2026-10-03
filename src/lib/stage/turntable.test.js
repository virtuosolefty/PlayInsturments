// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { frameSpan, screenPoint } from './framing.js';
import { attachTurntable, blendPoses, canTurn, dragTurn, easeTurn, fitLimits, isTurned, NO_TURN, orbit } from './turntable.js';

const degrees = r => (r * 180) / Math.PI;
const radians = d => (d * Math.PI) / 180;
const LIMITS = { yaw: [radians(-25), radians(25)], pitch: [radians(-12), radians(12)] };
const pose = { position: [1, 8.9, 4.6], target: [1, 0, 0] };
const distance = ({ position, target }) => Math.hypot(...position.map((p, i) => p - target[i]));
const elevation = ({ position, target }) => degrees(Math.atan2(position[1] - target[1], Math.hypot(position[0] - target[0], position[2] - target[2])));

describe('orbiting the camera around what it looks at', () => {
  it('leaves an unturned camera where it was', () => {
    const turned = orbit(pose, NO_TURN);
    turned.position.forEach((value, i) => expect(value).toBeCloseTo(pose.position[i], 10));
    expect(turned.target).toEqual(pose.target);
  });

  it('keeps its distance whichever way it turns', () => {
    for (const turn of [{ yaw: 0.4, pitch: 0 }, { yaw: -0.4, pitch: 0.2 }, { yaw: 0.1, pitch: -0.2 }]) {
      expect(distance(orbit(pose, turn))).toBeCloseTo(distance(pose), 10);
    }
  });

  it('swings sideways around a vertical axis through the target for yaw', () => {
    const turned = orbit(pose, { yaw: radians(20), pitch: 0 });
    expect(turned.position[0]).toBeGreaterThan(pose.position[0]);
    expect(turned.position[1]).toBeCloseTo(pose.position[1], 10);
    expect(elevation(turned)).toBeCloseTo(elevation(pose), 10);
  });

  it('raises and lowers for pitch, but never goes overhead or under the floor', () => {
    const start = elevation(pose);
    expect(elevation(orbit(pose, { yaw: 0, pitch: radians(10) }))).toBeCloseTo(start + 10, 8);
    expect(elevation(orbit(pose, { yaw: 0, pitch: radians(80) }))).toBeCloseTo(85, 8);
    expect(elevation(orbit(pose, { yaw: 0, pitch: radians(-80) }))).toBeCloseTo(5, 8);
  });

  it('does not change the pose it was given', () => {
    const before = JSON.stringify(pose);
    orbit(pose, { yaw: 0.3, pitch: 0.1 });
    expect(JSON.stringify(pose)).toBe(before);
  });
});

describe('moving the camera from one view to another', () => {
  // A whole-guitar showcase from beyond the body on the treble side, and a close view of the neck from the front.
  const showcase = { position: [40, 30, -30], target: [6, -1.9, 0] };
  const neck = { position: [-0.5, 16, 8], target: [-0.5, 0, 0] };
  const polar = ({ position, target }) => {
    const [x, y, z] = position.map((v, i) => v - target[i]), r = Math.hypot(x, y, z);
    return { r, azimuth: Math.atan2(x, z), elevation: Math.asin(y / r) };
  };

  it('starts at the first view and ends at the second', () => {
    const start = blendPoses(showcase, neck, 0), end = blendPoses(showcase, neck, 1);
    start.position.forEach((v, i) => expect(v).toBeCloseTo(showcase.position[i], 10));
    end.position.forEach((v, i) => expect(v).toBeCloseTo(neck.position[i], 10));
    end.target.forEach((v, i) => expect(v).toBeCloseTo(neck.target[i], 10));
  });

  it('swings around what it looks at rather than cutting through the instrument', () => {
    const middle = polar(blendPoses(showcase, neck, 0.5)), a = polar(showcase), b = polar(neck);
    expect(middle.r).toBeCloseTo(Math.sqrt(a.r * b.r), 10);
    expect(middle.elevation).toBeCloseTo((a.elevation + b.elevation) / 2, 10);
    expect(middle.azimuth).toBeCloseTo((a.azimuth + b.azimuth) / 2, 10);
  });

  it('goes round the shorter way', () => {
    const left = { position: [-10, 5, -1], target: [0, 0, 0] }, right = { position: [10, 5, -1], target: [0, 0, 0] };
    // Both stand slightly behind; the short way round passes behind (z < 0), not in front.
    expect(blendPoses(left, right, 0.5).position[2]).toBeLessThan(0);
  });

  it('holds still outside 0 to 1, and leaves the poses it was given alone', () => {
    const before = JSON.stringify([showcase, neck]);
    expect(blendPoses(showcase, neck, -1).position).toEqual(blendPoses(showcase, neck, 0).position);
    expect(blendPoses(showcase, neck, 2).position).toEqual(blendPoses(showcase, neck, 1).position);
    expect(JSON.stringify([showcase, neck])).toBe(before);
  });
});

describe('turning by dragging', () => {
  it('turns the instrument the way the pointer moves', () => {
    // Dragging right swings the camera to the left, so the near side of the instrument follows the pointer.
    expect(dragTurn(NO_TURN, { dx: 40, dy: 0 }, LIMITS).yaw).toBeLessThan(0);
    // Dragging down raises the camera, tipping the playing surface toward the player.
    expect(dragTurn(NO_TURN, { dx: 0, dy: 40 }, LIMITS).pitch).toBeGreaterThan(0);
  });

  it('stops at the limits however far the pointer goes', () => {
    const far = dragTurn(NO_TURN, { dx: -5000, dy: 5000 }, LIMITS);
    expect(far.yaw).toBeCloseTo(LIMITS.yaw[1]);
    expect(far.pitch).toBeCloseTo(LIMITS.pitch[1]);
    const back = dragTurn(far, { dx: 10000, dy: -10000 }, LIMITS);
    expect(back.yaw).toBeCloseTo(LIMITS.yaw[0]);
    expect(back.pitch).toBeCloseTo(LIMITS.pitch[0]);
  });

  it('returns a new turn and leaves the old one alone', () => {
    const start = { yaw: 0.1, pitch: 0.05 };
    const next = dragTurn(start, { dx: 10, dy: 10 }, LIMITS);
    expect(start).toEqual({ yaw: 0.1, pitch: 0.05 });
    expect(next).not.toBe(start);
    expect(Object.isFrozen(next)).toBe(true);
  });
});

describe('telling whether the view is turned', () => {
  it('goes by the angles, not by which object holds them', () => {
    expect(isTurned(NO_TURN)).toBe(false);
    // Dragged out and back to exactly where it began.
    expect(isTurned(dragTurn(dragTurn(NO_TURN, { dx: 40, dy: 0 }, LIMITS), { dx: -40, dy: 0 }, LIMITS))).toBe(false);
    expect(isTurned({ yaw: 0.1, pitch: 0 })).toBe(true);
    expect(isTurned({ yaw: 0, pitch: -0.1 })).toBe(true);
  });
});

describe('telling whether limits leave any room to turn', () => {
  it('needs some range on at least one axis', () => {
    expect(canTurn(LIMITS)).toBe(true);
    expect(canTurn({ yaw: [0, 0], pitch: [-0.1, 0.1] })).toBe(true);
    expect(canTurn({ yaw: [0, 0], pitch: [0, 0] })).toBe(false);
    expect(canTurn(null)).toBe(false);
  });
});

describe('fitting the limits to what must stay in view', () => {
  const aspect = 2, fovDeg = 32;
  const bounds = { x: 1, top: 0.84, bottom: -0.8 };
  const corners = (left, right, across) => [left, right].flatMap(x => [0, 0.3].flatMap(y => [-across, across].map(z => [x, y, z])));
  const lens = span => ({ pose: frameSpan({ ...span, aspect, fovDeg }), fovDeg, aspect });
  const onScreen = (view, keep, limits) => {
    for (const yaw of [limits.yaw[0], 0, limits.yaw[1]]) for (const pitch of [limits.pitch[0], 0, limits.pitch[1]]) {
      for (const point of keep) {
        const p = screenPoint(point, orbit(view.pose, { yaw, pitch }), view);
        if (!(p.depth > 0 && Math.abs(p.x) <= bounds.x + 1e-9 && p.y <= bounds.top + 1e-9 && p.y >= bounds.bottom - 1e-9)) return false;
      }
    }
    return true;
  };

  it('keeps the full limits when the kept part stays in view at every extreme', () => {
    const view = lens({ left: -9.6, right: 8.6 });
    const keep = corners(-2, 2, 0.5);
    expect(fitLimits(view, keep, LIMITS, bounds)).toBe(LIMITS);
  });

  it('shrinks the limits evenly until the kept part stays in view at every extreme', () => {
    // A first-position neck is framed from close by, so turning swings its ends far across the screen.
    const view = lens({ left: -9.6, right: 0.4 });
    const keep = corners(-6.7, 0, 1.22);
    expect(onScreen(view, keep, { yaw: [0, 0], pitch: [0, 0] })).toBe(true);
    expect(onScreen(view, keep, LIMITS)).toBe(false);
    const fitted = fitLimits(view, keep, LIMITS, bounds);
    expect(fitted.yaw[1]).toBeLessThan(LIMITS.yaw[1]);
    expect(fitted.yaw[1]).toBeGreaterThan(0);
    expect(fitted.yaw[1] / LIMITS.yaw[1]).toBeCloseTo(fitted.pitch[0] / LIMITS.pitch[0], 10);
    expect(onScreen(view, keep, fitted)).toBe(true);
    // And not needlessly small: a little more turn would push something out.
    const more = { yaw: fitted.yaw.map(v => v * 1.05), pitch: fitted.pitch.map(v => v * 1.05) };
    expect(onScreen(view, keep, more)).toBe(false);
  });

  it('allows no turning when even the unturned view cannot show the kept part', () => {
    const view = lens({ left: -9.6, right: 8.6 });
    const fitted = fitLimits(view, corners(-30, 30, 1), LIMITS, bounds);
    expect([...fitted.yaw, ...fitted.pitch].every(v => v === 0)).toBe(true);
  });
});

describe('easing back to the starting view', () => {
  const from = { yaw: 0.4, pitch: -0.2 };
  it('starts where the turn was and ends unturned', () => {
    expect(easeTurn(from, 0)).toEqual(from);
    expect(easeTurn(from, 1)).toEqual(NO_TURN);
    expect(easeTurn(from, 7)).toEqual(NO_TURN);
  });

  it('moves steadily toward the start, fastest at first', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map(p => easeTurn(from, p).yaw);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
    expect(steps[0] - steps[1]).toBeGreaterThan(steps[3] - steps[4]);
  });
});

/** A pointer event with the fields the turntable reads; jsdom has no PointerEvent constructor. */
function pointer(type, { x = 0, y = 0, button = 0, id = 1 } = {}) {
  return Object.assign(new Event(type, { bubbles: true }), { clientX: x, clientY: y, button, pointerId: id });
}

function setUp({ grab = () => true, reducedMotion = () => true } = {}) {
  const el = document.createElement('div');
  const onTurn = vi.fn();
  const table = attachTurntable(el, { limits: LIMITS, canGrab: grab, onTurn, reducedMotion });
  return { el, onTurn, table };
}

describe('the turntable on a stage element', () => {
  it('turns while a drag that started on the background moves', () => {
    const { el, onTurn, table } = setUp();
    el.dispatchEvent(pointer('pointerdown', { x: 100, y: 50 }));
    expect(table.dragging).toBe(true);
    el.dispatchEvent(pointer('pointermove', { x: 140, y: 50 }));
    el.dispatchEvent(pointer('pointermove', { x: 180, y: 70 }));
    el.dispatchEvent(pointer('pointerup', { x: 180, y: 70 }));
    expect(table.dragging).toBe(false);
    expect(onTurn).toHaveBeenCalledTimes(2);
    expect(table.turn).toEqual(dragTurn(NO_TURN, { dx: 80, dy: 20 }, LIMITS));
    el.dispatchEvent(pointer('pointermove', { x: 400, y: 70 }));
    expect(onTurn).toHaveBeenCalledTimes(2);
  });

  it('captures the pointer, so a drag carries on outside the stage', () => {
    const { el } = setUp();
    el.setPointerCapture = vi.fn();
    el.dispatchEvent(pointer('pointerdown', { x: 0, id: 9 }));
    expect(el.setPointerCapture).toHaveBeenCalledWith(9);
  });

  it('still turns when the browser refuses to capture the pointer', () => {
    const { el, table } = setUp();
    el.setPointerCapture = () => { throw new DOMException('No active pointer with the given id is found.', 'NotFoundError'); };
    expect(() => el.dispatchEvent(pointer('pointerdown', { x: 0 }))).not.toThrow();
    el.dispatchEvent(pointer('pointermove', { x: 60 }));
    expect(table.turn).toEqual(dragTurn(NO_TURN, { dx: 60, dy: 0 }, LIMITS));
  });

  it('treats a press that barely moves as a click, not a turn', () => {
    const { el, onTurn, table } = setUp();
    el.dispatchEvent(pointer('pointerdown', { x: 50, y: 50 }));
    el.dispatchEvent(pointer('pointermove', { x: 52, y: 51 }));
    el.dispatchEvent(pointer('pointerup', { x: 52, y: 51 }));
    expect(onTurn).not.toHaveBeenCalled();
    expect(isTurned(table.turn)).toBe(false);
  });

  it('keeps following the first pointer when a second one lands', () => {
    const { el, table } = setUp();
    el.dispatchEvent(pointer('pointerdown', { x: 0, id: 1 }));
    el.dispatchEvent(pointer('pointerdown', { x: 300, id: 2 }));
    el.dispatchEvent(pointer('pointermove', { x: 900, id: 2 }));
    expect(isTurned(table.turn)).toBe(false);
    el.dispatchEvent(pointer('pointermove', { x: 40, id: 1 }));
    expect(table.turn).toEqual(dragTurn(NO_TURN, { dx: 40, dy: 0 }, LIMITS));
  });

  it('ends the drag when the browser cancels the pointer', () => {
    const { el, onTurn, table } = setUp();
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('pointercancel', { x: 0 }));
    expect(table.dragging).toBe(false);
    el.dispatchEvent(pointer('pointermove', { x: 80 }));
    expect(onTurn).not.toHaveBeenCalled();
  });

  it('ignores a double-click on something playable', () => {
    let grab = true;
    const { el, table } = setUp({ grab: () => grab });
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('pointermove', { x: 60 }));
    el.dispatchEvent(pointer('pointerup', { x: 60 }));
    const turned = table.turn;
    grab = false;
    el.dispatchEvent(pointer('dblclick', { x: 60 }));
    expect(table.turn).toBe(turned);
  });

  it('brings the turn back inside limits that have shrunk', () => {
    let limits = LIMITS;
    const el = document.createElement('div'), onTurn = vi.fn();
    const table = attachTurntable(el, { limits: () => limits, canGrab: () => true, onTurn, reducedMotion: () => true });
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('pointermove', { x: -400, y: 400 }));
    el.dispatchEvent(pointer('pointerup', { x: -400, y: 400 }));
    const calls = onTurn.mock.calls.length;
    table.refit();
    expect(onTurn).toHaveBeenCalledTimes(calls);
    limits = { yaw: [radians(-5), radians(5)], pitch: [radians(-2), radians(2)] };
    table.refit();
    expect(table.turn.yaw).toBeCloseTo(radians(5));
    expect(table.turn.pitch).toBeCloseTo(radians(2));
    limits = null;
    table.refit();
    expect(table.turn).toEqual(NO_TURN);
  });

  it('ends the drag if the browser takes the pointer capture away', () => {
    const { el, onTurn, table } = setUp();
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('lostpointercapture', { x: 0 }));
    expect(table.dragging).toBe(false);
    el.dispatchEvent(pointer('pointermove', { x: 80 }));
    expect(onTurn).not.toHaveBeenCalled();
  });

  it('leaves presses on something playable, and other buttons, alone', () => {
    const { el, onTurn, table } = setUp({ grab: () => false });
    el.dispatchEvent(pointer('pointerdown', { x: 10 }));
    el.dispatchEvent(pointer('pointermove', { x: 90 }));
    expect(table.dragging).toBe(false);
    const right = setUp();
    right.el.dispatchEvent(pointer('pointerdown', { x: 10, button: 2 }));
    right.el.dispatchEvent(pointer('pointermove', { x: 90 }));
    expect(onTurn).not.toHaveBeenCalled();
    expect(right.onTurn).not.toHaveBeenCalled();
  });

  it('springs back on a double-click, at once when motion is reduced', () => {
    const { el, onTurn, table } = setUp();
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('pointermove', { x: 60 }));
    el.dispatchEvent(pointer('pointerup', { x: 60 }));
    el.dispatchEvent(pointer('dblclick', { x: 60 }));
    expect(table.turn).toEqual(NO_TURN);
    expect(onTurn).toHaveBeenLastCalledWith(NO_TURN);
  });

  it('eases back over several frames otherwise', () => {
    const frames = [];
    const el = document.createElement('div'), onTurn = vi.fn();
    let clock = 0;
    const table = attachTurntable(el, { limits: LIMITS, canGrab: () => true, onTurn, reducedMotion: () => false, schedule: f => frames.push(f), now: () => clock });
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('pointermove', { x: 60 }));
    el.dispatchEvent(pointer('pointerup', { x: 60 }));
    const turned = table.turn;
    table.reset();
    for (clock = 100; frames.length && clock <= 1000; clock += 100) frames.shift()();
    const yaws = onTurn.mock.calls.slice(1).map(([turn]) => turn.yaw);
    expect(yaws.length).toBeGreaterThan(2);
    expect(Math.abs(yaws[0])).toBeLessThan(Math.abs(turned.yaw));
    expect(table.turn).toEqual(NO_TURN);
  });

  it('reads limits that can change, and does not turn while there are none', () => {
    let limits = null;
    const el = document.createElement('div'), onTurn = vi.fn();
    const table = attachTurntable(el, { limits: () => limits, canGrab: () => true, onTurn, reducedMotion: () => true });
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('pointermove', { x: 60 }));
    expect(onTurn).not.toHaveBeenCalled();
    el.dispatchEvent(pointer('pointerup', { x: 60 }));
    limits = LIMITS;
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('pointermove', { x: 60 }));
    expect(table.turn).toEqual(dragTurn(NO_TURN, { dx: 60, dy: 0 }, LIMITS));
  });

  it('can be put straight back, cancelling a drag or an ease in progress', () => {
    const frames = [];
    const el = document.createElement('div'), onTurn = vi.fn();
    const table = attachTurntable(el, { limits: LIMITS, canGrab: () => true, onTurn, reducedMotion: () => false, schedule: f => frames.push(f), now: () => 0 });
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('pointermove', { x: 60 }));
    table.reset();
    table.clear();
    expect(table.turn).toEqual(NO_TURN);
    expect(table.dragging).toBe(false);
    const calls = onTurn.mock.calls.length;
    frames.forEach(step => step());
    el.dispatchEvent(pointer('pointermove', { x: 120 }));
    expect(onTurn).toHaveBeenCalledTimes(calls);
    table.clear();
    expect(onTurn).toHaveBeenCalledTimes(calls);
  });

  it('stops listening when detached', () => {
    const { el, onTurn, table } = setUp();
    table.stop();
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('pointermove', { x: 60 }));
    expect(onTurn).not.toHaveBeenCalled();
  });

  it('abandons an ease in progress when detached', () => {
    const frames = [];
    const el = document.createElement('div'), onTurn = vi.fn();
    const table = attachTurntable(el, { limits: LIMITS, canGrab: () => true, onTurn, reducedMotion: () => false, schedule: f => frames.push(f), now: () => 0 });
    el.dispatchEvent(pointer('pointerdown', { x: 0 }));
    el.dispatchEvent(pointer('pointermove', { x: 60 }));
    table.reset();
    table.stop();
    const calls = onTurn.mock.calls.length;
    frames.forEach(step => step());
    expect(onTurn).toHaveBeenCalledTimes(calls);
  });
});
