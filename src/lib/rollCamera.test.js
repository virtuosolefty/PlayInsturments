/**
 * Where the Stage camera stands.
 *
 * The first describe block is the one that matters. A camera on the wrong side
 * of the roll renders a picture that is wrong in a way nothing else in the
 * suite can see: every note is in its lane, every key is under its note, the
 * timing is exact, and the instrument recedes away from the player instead of
 * towards them. It shipped like that. One assertion about depth catches it.
 */

import { describe, expect, it } from 'vitest';
import { acrossAt, PIANO_CAMERA, PITCH_MAX, PITCH_MIN, projectOnto, stagedCamera } from './rollCamera.js';

/** A widescreen window showing two octaves — the shape that got it wrong. */
const TABLE = { w: 1008, l: 780, aspect: 1440 / 780 };
const shotOf = (t = TABLE, standing = 20) =>
  stagedCamera(t.w, t.l, t.aspect, { standing });

describe('the dimensional performance view', () => {
  it('exposes visible front faces without cropping either end of the keyboard', () => {
    for (const [w,h] of [[1600,760],[1000,480],[1280,280]]) {
      const shot=stagedCamera(w,h,w/h,PIANO_CAMERA);
      const face=projectOnto(shot,h-4,18),base=projectOnto(shot,h-4,0);
      expect((face.y-base.y)*h/2).toBeGreaterThan(4);
      expect(face.y).toBeGreaterThan(-1);
      expect(acrossAt(shot,projectOnto(shot,h,18).depth)).toBeGreaterThanOrEqual(w/2-.5);
      expect(projectOnto(shot,0).depth / base.depth).toBeGreaterThan(1.15);
    }
  });
});

describe('the player is at the keyboard end', () => {
  it('puts the keys nearer the camera than the top of the roll', () => {
    const shot = shotOf();
    expect(projectOnto(shot, TABLE.l).depth).toBeLessThan(projectOnto(shot, 0).depth);
  });

  it('makes the far end of the roll visibly smaller, not merely smaller', () => {
    // Same span of keys measured at both ends: the vanishing point is the
    // entire reason to run this renderer, so a token 2% is a failure too.
    const shot = shotOf();
    const near = acrossAt(shot, projectOnto(shot, TABLE.l).depth);
    const far = acrossAt(shot, projectOnto(shot, 0).depth);
    expect(far / near).toBeGreaterThan(1.2);
  });

  it('keeps the roll above the keyboard on screen', () => {
    const shot = shotOf();
    expect(projectOnto(shot, 0).y).toBeGreaterThan(projectOnto(shot, TABLE.l).y);
  });

  it('lifts a note standing off the table, never buries it', () => {
    const shot = shotOf();
    const flat = projectOnto(shot, 400, 0);
    const proud = projectOnto(shot, 400, 16);
    expect(proud.y).toBeGreaterThan(flat.y);
    expect(proud.depth).toBeLessThan(flat.depth);
  });
});

describe('the whole instrument is in frame', () => {
  it('sits the front of the keys just inside the bottom edge', () => {
    // The gap under the keyboard was the visible half of the same bug. Pinning
    // the near edge is what closes it.
    const shot = shotOf();
    const near = projectOnto(shot, TABLE.l).y;
    expect(near).toBeGreaterThan(-1);
    expect(near).toBeLessThan(-0.9);
  });

  it('keeps the top of the roll inside the top edge', () => {
    expect(projectOnto(shotOf(), 0).y).toBeLessThan(1);
  });

  it('fits the full width where the table is widest', () => {
    const shot = shotOf();
    const room = acrossAt(shot, projectOnto(shot, TABLE.l, 20).depth);
    expect(room).toBeGreaterThanOrEqual(TABLE.w / 2);
  });

  it('fits every window shape it is likely to meet', () => {
    const shapes = [
      [1008, 780, 1440 / 780],
      [1920, 620, 1920 / 620], // wide and short: the full keyboard on a laptop
      [700, 900, 700 / 900], // tall and narrow: a side-by-side window
      [400, 300, 400 / 300],
      [2560, 1300, 2560 / 1300],
    ];
    for (const [w, l, aspect] of shapes) {
      const shot = stagedCamera(w, l, aspect, { standing: 20 });
      const near = projectOnto(shot, l, 20);
      const far = projectOnto(shot, 0);
      expect(near.depth).toBeGreaterThan(0);
      expect(near.y).toBeGreaterThanOrEqual(-1);
      expect(far.y).toBeLessThanOrEqual(1);
      expect(acrossAt(shot, near.depth)).toBeGreaterThanOrEqual(w / 2 - 0.5);
    }
  });
});

describe('the pitch it settles on', () => {
  it('flattens for a table too wide to view from low down', () => {
    const narrow = stagedCamera(700, 780, 1440 / 780, { standing: 20 });
    const wide = stagedCamera(1440, 780, 1440 / 780, { standing: 20 });
    expect(wide.pitch).toBeGreaterThan(narrow.pitch);
  });

  it('never leaves the band between a corridor and a plan view', () => {
    for (const w of [200, 700, 1008, 1440, 2560, 5000]) {
      const shot = stagedCamera(w, 780, 1440 / 780, { standing: 20 });
      expect(shot.pitch).toBeGreaterThanOrEqual(PITCH_MIN);
      expect(shot.pitch).toBeLessThanOrEqual(PITCH_MAX);
    }
  });

  it('comes all the way down when the table is small enough to allow it', () => {
    expect(stagedCamera(500, 780, 1440 / 780, { standing: 20 }).pitch).toBe(PITCH_MIN);
  });

  it('survives a window with no size yet', () => {
    const shot = stagedCamera(0, 0, 0);
    expect(Number.isFinite(shot.dist)).toBe(true);
    expect(Number.isFinite(shot.focusY)).toBe(true);
    expect(shot.dist).toBeGreaterThan(0);
  });
});
