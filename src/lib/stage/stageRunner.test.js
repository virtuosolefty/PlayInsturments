// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import { runStage } from './stageRunner.js';

let clock, frames, observed, reduced;

/** Runs `count` animation frames, `step` milliseconds apart. */
const pump = (count, step = 16) => {
  for (let i = 0; i < count; i++) {
    clock += step;
    frames.splice(0).forEach(callback => callback(clock));
  }
};

/** A studio that draws nothing and remembers what it was asked to do. */
function fakeStudio() {
  let pose = null;
  const studio = {
    renderer: { domElement: document.createElement('canvas') },
    scene: { add: vi.fn(), remove: vi.fn() },
    pixelRatio: 1,
    setPixelRatio: vi.fn(),
    renders: 0,
    shots: [],
    grounds: [],
    limitsAsked: 0,
    frame: shot => studio.aim(shot),
    aim: shot => { studio.shots.push(shot); pose = { position: [studio.shots.length, 5, 9], target: [0, 0, 0] }; return true; },
    currentPose: () => pose,
    render: () => { studio.renders++; },
    turnLimits: () => { studio.limitsAsked++; return { yaw: [-0.4, 0.4], pitch: [-0.2, 0.2] }; },
    projector: () => () => ({ x: 0, y: 0 }),
    pick: () => null,
    fitGround: box => { studio.grounds.push(box); },
    refreshShadow: vi.fn(),
    dispose: vi.fn(),
  };
  return studio;
}

const owned = () => ({ geometries: new Set([{ dispose: vi.fn() }]), materials: new Set(), textures: new Set() });
const SHOWCASE = { box: { min: [-12, -4, -7], max: [25, 0.2, 7] }, azimuthDeg: 140, elevationDeg: 34 };
function rig({ showcase = null, model = null } = {}) {
  return {
    instrument: new Group(), targets: [], dots: [], strings: [], owned: owned(), model,
    neck: { span: () => ({ left: -9, right: 8 }), corners: () => [[0, 0, 0], [1, 0, 0]] },
    ...(showcase && { showcase, ground: showcase.box }),
  };
}

function stageElement() {
  const el = document.createElement('div');
  const top = document.createElement('div'), bottom = document.createElement('div');
  top.className = 'guitar-stage-top'; bottom.className = 'guitar-stage-bottom';
  el.append(top, bottom);
  Object.defineProperty(el, 'clientWidth', { value: 1200 });
  Object.defineProperty(el, 'clientHeight', { value: 400 });
  return el;
}

function open({ first = rig(), hold = 0, current = {} } = {}) {
  const el = stageElement(), studio = fakeStudio();
  const latest = { current: { view: 'lesson', closeUp: false, flip: 1, ...current } };
  const hooks = { paint: () => ({ changed: false, relabel: false }), labels: () => [] };
  const run = runStage(el, studio, { latest, maxFret: 12, hooks, setLabels: vi.fn(), setTurned: vi.fn(), setTurnable: vi.fn(), setShowcase: vi.fn(), controls: { current: null }, rig: first, hold });
  return { el, studio, latest, run };
}

beforeEach(() => {
  clock = 1000;
  frames = [];
  observed = [];
  reduced = false;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', callback => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class { observe(target) { observed.push(target); } disconnect() {} });
  window.matchMedia = () => ({ matches: reduced });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('holding the stage for a model on its way', () => {
  it('keeps the first instrument off screen until the hold runs out', () => {
    const { studio, run } = open({ hold: 1500 });
    pump(10);
    expect(studio.renders).toBe(0);
    pump(100);
    expect(studio.renders).toBeGreaterThan(0);
    run.stop();
  });

  it('shows the instrument that was waited for as soon as it arrives', () => {
    const { studio, run } = open({ hold: 1500 });
    pump(5);
    run.swap(rig({ model: 'guitar' }));
    pump(1);
    expect(studio.renders).toBe(1);
    run.stop();
  });

  it('with nothing to show yet, holds until something is put on stage', () => {
    const { studio, run, el } = open({ first: null });
    pump(200);
    expect(studio.renders).toBe(0);
    run.swap(rig({ model: 'violin' }));
    pump(1);
    expect(studio.renders).toBe(1);
    expect(el.dataset.stageModel).toBe('violin');
    run.stop();
  });

  it('draws at once when nothing is waited for', () => {
    const { studio, run } = open();
    pump(1);
    expect(studio.renders).toBe(1);
    run.stop();
  });
});

describe('the floor under a left-handed instrument', () => {
  it('mirrors the floor and its shadow with the instrument, and lays them again when the hand changes', () => {
    const { studio, latest, run } = open({ first: rig({ showcase: SHOWCASE }), current: { flip: -1 } });
    expect(studio.grounds.at(-1)).toEqual({ min: [-25, -4, -7], max: [12, 0.2, 7] });
    latest.current.flip = 1;
    pump(1);
    expect(studio.grounds.at(-1)).toEqual(SHOWCASE.box);
    run.stop();
  });
});

describe('closing in on the neck', () => {
  it('swings from where the camera is now, turn and all, to the close-up', () => {
    const { studio, latest, run } = open({ first: rig({ showcase: SHOWCASE }), current: { view: 'freePlay' } });
    pump(2);
    const here = studio.currentPose();
    latest.current.closeUp = true;
    pump(1);
    const swing = studio.shots.at(-1);
    expect(swing.blend.from).toEqual({ pose: here });
    expect(swing.blend.to).toEqual({ left: -9, right: 8 });
    pump(60);
    expect(studio.shots.at(-1)).toEqual({ left: -9, right: 8 });
    run.stop();
  });

  it('stands an upright instrument up for the whole view, lays it down for the close-up, and redraws its shadow as it moves', () => {
    const stances = [], standing = rig({ showcase: { ...SHOWCASE, upright: true } });
    standing.orient = u => stances.push(u);
    const { studio, latest, run } = open({ first: standing, current: { view: 'freePlay' } });
    expect(stances.at(-1)).toBe(1);
    pump(2);
    const redrawn = studio.refreshShadow.mock.calls.length;
    latest.current.closeUp = true;
    pump(20);
    const during = studio.refreshShadow.mock.calls.length;
    expect(stances.at(-1)).toBeGreaterThan(0);
    expect(stances.at(-1)).toBeLessThan(1);
    expect(during).toBeGreaterThan(redrawn + 5);
    pump(40);
    expect(stances.at(-1)).toBe(0);
    // Once it has settled, nothing moves, so nothing is redrawn.
    const settled = studio.refreshShadow.mock.calls.length;
    pump(10);
    expect(studio.refreshShadow.mock.calls.length).toBe(settled);
    run.stop();
  });

  it('with reduced motion, jumps to the close-up and fits the turn limits to it straight away', () => {
    reduced = true;
    const { studio, latest, run } = open({ first: rig({ showcase: SHOWCASE }), current: { view: 'freePlay' } });
    pump(2);
    const asked = studio.limitsAsked;
    latest.current.closeUp = true;
    pump(1);
    expect(studio.shots.at(-1)).toEqual({ left: -9, right: 8 });
    expect(studio.limitsAsked).toBeGreaterThan(asked);
    run.stop();
  });
});

describe('looking after the stage', () => {
  it('watches the bars as well as the stage, since a button in one changes the room left', () => {
    const { el, run } = open();
    expect(observed).toEqual([el, el.querySelector('.guitar-stage-top'), el.querySelector('.guitar-stage-bottom')]);
    run.stop();
  });

  it('hands back the instrument on stage and the studio when it stops', () => {
    const first = rig(), [geometry] = first.owned.geometries;
    const { studio, run } = open({ first });
    run.stop();
    expect(geometry.dispose).toHaveBeenCalled();
    expect(studio.dispose).toHaveBeenCalled();
  });

  it('hands back the instrument it replaces', () => {
    const first = rig(), [geometry] = first.owned.geometries;
    const { run } = open({ first });
    run.swap(rig());
    expect(geometry.dispose).toHaveBeenCalled();
    run.stop();
  });
});
