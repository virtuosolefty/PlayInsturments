import { describe, expect, it } from 'vitest';
import { createPacer } from './pacing.js';

const ON_TIME = 16.7, MISSED = 33.3; // a 60 Hz display: a frame on time, and one that took two refreshes
const SETTLE = 8, WINDOW = 30;

/** Feeds `count` identical frame gaps; returns the last change the pacer announced, or null. */
function feed(pacer, ms, count) {
  let changed = null;
  for (let i = 0; i < count; i++) changed = pacer.sample(ms) ?? changed;
  return changed;
}
/**
 * One full decision: the frames the pacer lets settle, then a window in which
 * `late` frames, spread evenly, took `slow` ms and the rest took `quick` ms.
 */
function round(pacer, late = 0, { quick = ON_TIME, slow = MISSED } = {}) {
  feed(pacer, quick, SETTLE);
  let changed = null;
  const every = late ? Math.floor(WINDOW / late) : 0;
  for (let i = 0, used = 0; i < WINDOW; i++) {
    const isLate = late > 0 && used < late && i % every === 0;
    if (isLate) used++;
    changed = pacer.sample(isLate ? slow : quick) ?? changed;
  }
  return changed;
}

describe('trading resolution for frame rate', () => {
  it('leaves the resolution alone while frames arrive on time', () => {
    const pacer = createPacer({ ratio: 2 });
    expect(feed(pacer, ON_TIME, 500)).toBeNull();
    expect(pacer.ratio).toBe(2);
  });

  it('steps down once a full window of frames has run slow, and not before', () => {
    const pacer = createPacer({ ratio: 2 });
    expect(feed(pacer, MISSED, SETTLE + WINDOW - 1)).toBeNull();
    expect(pacer.sample(MISSED)).toBe(1.75);
    expect(pacer.ratio).toBe(1.75);
  });

  it('steps down when one frame in five is late, even though the typical frame is on time', () => {
    const pacer = createPacer({ ratio: 2 });
    expect(round(pacer, 6)).toBe(1.75);
    expect(round(pacer, 0)).toBeNull();
    expect(pacer.ratio).toBe(1.75);
  });

  it('shrugs off the odd hitch', () => {
    const pacer = createPacer({ ratio: 2 });
    for (let i = 0; i < 10; i++) expect(round(pacer, 2, { slow: 120 })).toBeNull();
    expect(pacer.ratio).toBe(2);
  });

  it('measures lateness against the display it is on, whatever its refresh rate', () => {
    const fast = { quick: 6.9, slow: 13.9 }; // 144 Hz
    const smooth = createPacer({ ratio: 2 }), dropping = createPacer({ ratio: 2 });
    expect(round(smooth, 0, fast)).toBeNull();
    expect(round(dropping, 6, fast)).toBe(1.75);
  });

  it('keeps stepping down while that helps and frames are still late, then holds', () => {
    const pacer = createPacer({ ratio: 2 });
    expect(round(pacer, 6)).toBe(1.75);
    expect(round(pacer, 4)).toBe(1.5); // better, but still more than one frame in ten late
    expect(round(pacer, 1)).toBeNull();
    expect(feed(pacer, ON_TIME, 300)).toBeNull();
    expect(pacer.ratio).toBe(1.5);
  });

  it('never goes below its floor', () => {
    const pacer = createPacer({ ratio: 1.25 });
    expect(feed(pacer, MISSED, SETTLE + WINDOW)).toBe(1);
    expect(feed(pacer, 28, (SETTLE + WINDOW) * 3)).toBeNull();
    expect(pacer.ratio).toBe(1);
  });

  it('does nothing when it starts at the floor', () => {
    const pacer = createPacer({ ratio: 1 });
    expect(feed(pacer, MISSED, (SETTLE + WINDOW) * 3)).toBeNull();
    expect(pacer.ratio).toBe(1);
  });

  it('puts the resolution back when lowering it did not help', () => {
    // A 30 Hz display, or a page that is slow for some other reason: fewer pixels change nothing.
    const pacer = createPacer({ ratio: 2 });
    expect(feed(pacer, MISSED, SETTLE + WINDOW)).toBe(1.75);
    expect(feed(pacer, MISSED, SETTLE + WINDOW)).toBe(2);
    expect(pacer.ratio).toBe(2);
  });

  it('waits a good while after a step that did not help, then is willing to try again', () => {
    const pacer = createPacer({ ratio: 2, cooldown: 100 });
    feed(pacer, MISSED, SETTLE + WINDOW);
    expect(feed(pacer, MISSED, SETTLE + WINDOW)).toBe(2);
    expect(feed(pacer, MISSED, 100 + SETTLE + WINDOW - 1)).toBeNull();
    expect(pacer.sample(MISSED)).toBe(1.75);
  });

  it('ignores the first frames, while shaders compile and textures upload', () => {
    const pacer = createPacer({ ratio: 2 });
    feed(pacer, 400, SETTLE);
    expect(feed(pacer, ON_TIME, 200)).toBeNull();
    expect(pacer.ratio).toBe(2);
  });

  it('starts its window over after a pause, so the gap is not read as a slow frame', () => {
    const pacer = createPacer({ ratio: 2 });
    feed(pacer, MISSED, SETTLE + WINDOW - 1);
    pacer.pause();
    expect(feed(pacer, MISSED, SETTLE + WINDOW - 1)).toBeNull();
    expect(pacer.sample(MISSED)).toBe(1.75);
  });

  it('honours a custom floor, step and target', () => {
    const pacer = createPacer({ ratio: 3, floor: 2, step: 0.5, slowMs: 12 });
    expect(feed(pacer, ON_TIME, SETTLE + WINDOW)).toBe(2.5);
    expect(feed(pacer, 14, SETTLE + WINDOW)).toBe(2);
    expect(feed(pacer, 12.5, (SETTLE + WINDOW) * 2)).toBeNull();
    expect(pacer.ratio).toBe(2);
  });
});
