import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { bowedNeck } from './bowedNeck.js';
import { bowAngle, buildBow } from './bowedBow.js';

const FIT = {
  nutX: -6.05, scaleLength: 24.1,
  strings: [
    { nut: [-6.08, -0.05, 0.558], bridge: [18.05, 2.954, 1.313], radius: 0.042 },
    { nut: [-6.04, 0.031, 0.197], bridge: [18.05, 3.213, 0.479], radius: 0.033 },
    { nut: [-6.04, 0.032, -0.224], bridge: [18.05, 3.214, -0.433], radius: 0.025 },
    { nut: [-6.04, -0.013, -0.530], bridge: [18.05, 2.949, -1.271], radius: 0.015 },
  ],
  bounds: { min: [-12.2, -3.74, -7.33], max: [29.58, 3.27, 7.38] },
};
const neck = bowedNeck(FIT);
const owned = () => ({ geometries: new Set(), materials: new Set(), textures: new Set() });

/** Height of the line through string s's point at angle a (toward +z), where it crosses string t. */
const lineAt = (s, t, angle) => {
  const x = neck.contactX(), p = neck.stringAt(s, x), q = neck.stringAt(t, x);
  return p.y + Math.tan(angle) * (q.z - p.z);
};

describe('the angle the bow plays each string at', () => {
  it('touches only the string it plays: every other string stays below the hair', () => {
    for (let s = 0; s < 4; s++) {
      const angle = bowAngle(neck, s);
      for (let t = 0; t < 4; t++) {
        if (t === s) continue;
        expect(lineAt(s, t, angle)).toBeGreaterThan(neck.stringAt(t, neck.contactX()).y);
      }
    }
  });

  it('tips from the lowest string\'s side over to the highest\'s', () => {
    const angles = [0, 1, 2, 3].map(s => bowAngle(neck, s));
    angles.slice(1).forEach((a, i) => expect(a).toBeGreaterThan(angles[i]));
  });
});

describe('the bow', () => {
  const kit = { id: 'violin' };

  it('is about as long as a real violin bow, against the strings\' scale', () => {
    const bow = buildBow({ kit, fit: FIT, neck, owned: owned() });
    // A violin bow is 750 mm against 328 mm of string.
    expect(bow.length).toBeCloseTo(24.1 * 750 / 328, 1);
    expect(buildBow({ kit: { id: 'cello' }, fit: FIT, neck, owned: owned() }).length).toBeCloseTo(24.1 * 710 / 690, 1);
  });

  it('stays hidden until something sounds', () => {
    const bow = buildBow({ kit, fit: FIT, neck, owned: owned() });
    expect(bow.group.visible).toBe(false);
    bow.play(null, { now: 0, still: true });
    expect(bow.group.visible).toBe(false);
  });

  it('rests its hair on the sounding string at the contact point', () => {
    const bow = buildBow({ kit, fit: FIT, neck, owned: owned() });
    for (let s = 0; s < 4; s++) {
      bow.play(s, { now: 0, still: true });
      expect(bow.group.visible).toBe(true);
      bow.group.updateMatrixWorld(true);
      const contact = new Vector3(0, -bow.hairThickness, bow.contactAlong()).applyMatrix4(bow.group.matrixWorld);
      const string = neck.stringAt(s, neck.contactX());
      expect(contact.x).toBeCloseTo(neck.contactX(), 6);
      // The hair's underside sits on the top of the string.
      expect(Math.hypot(contact.y - string.y, contact.z - string.z)).toBeCloseTo(FIT.strings[s].radius, 3);
    }
  });

  it('travels along its length while the note sounds, and holds still when motion is reduced', () => {
    const bow = buildBow({ kit, fit: FIT, neck, owned: owned() });
    bow.play(2, { now: 0, still: false });
    const first = bow.group.position.clone();
    expect(bow.play(2, { now: 600, still: false })).toBe(true);
    expect(bow.group.position.distanceTo(first)).toBeGreaterThan(0.5);
    bow.play(2, { now: 0, still: true });
    const held = bow.group.position.clone();
    // Nothing moved, so nothing needs drawing again.
    expect(bow.play(2, { now: 600, still: true })).toBe(false);
    expect(bow.group.position.distanceTo(held)).toBe(0);
    // Moving to another string, or stopping, does.
    expect(bow.play(1, { now: 600, still: true })).toBe(true);
    expect(bow.play(null, { now: 700, still: true })).toBe(true);
    expect(bow.play(null, { now: 800, still: true })).toBe(false);
  });

  it('keeps the frog on the high strings\' side and the tip past the low ones', () => {
    const bow = buildBow({ kit, fit: FIT, neck, owned: owned() });
    bow.play(1, { now: 0, still: true });
    bow.group.updateMatrixWorld(true);
    const frog = new Vector3(0, 0, 0).applyMatrix4(bow.group.matrixWorld), tip = new Vector3(0, 0, bow.length).applyMatrix4(bow.group.matrixWorld);
    expect(frog.z).toBeLessThan(FIT.strings[3].bridge[2]);
    expect(tip.z).toBeGreaterThan(FIT.strings[0].bridge[2]);
  });

  it('hands every geometry and material it makes to the stage to dispose', () => {
    const resources = owned(), bow = buildBow({ kit, fit: FIT, neck, owned: resources });
    bow.group.traverse(object => {
      if (!object.isMesh) return;
      expect(resources.geometries.has(object.geometry)).toBe(true);
      expect(resources.materials.has(object.material)).toBe(true);
    });
  });
});
