import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { stringKit } from './instruments.js';
import { buildBowedRig } from './bowedRig.js';

const STRINGS = [
  { nut: [-6.04, 0, 0.355], bridge: [18.05, 4.23, 0.873], radius: 0.061 },
  { nut: [-6.05, 0, 0.125], bridge: [18.05, 4.4, 0.324], radius: 0.061 },
  { nut: [-6.06, 0, -0.125], bridge: [18.05, 4.4, -0.324], radius: 0.052 },
  { nut: [-6.05, 0, -0.355], bridge: [18.05, 4.24, -0.874], radius: 0.04 },
];
// Shaped like public/models/cello.json: the C string nearest the viewer, the endpin far down the +x end.
const FIT = {
  nutX: -6.05, scaleLength: 24.1, strings: STRINGS,
  bounds: { min: [-12, -4.9, -8.6], max: [38.6, 4.35, 8.6] },
  parts: { body: { min: [4, -4.9, -8.6], max: [30.4, 1.3, 8.6] }, fittings: { min: [-12, -4.4, -2.6], max: [38.6, 3.3, 2.5] }, fingerboard: { min: [-5.9, -0.4, -1.06], max: [14.3, 3.2, 1.06] } },
};
const BOARD_TOP = -0.12;

/** A stand-in for the loaded cello: a fingerboard for the tapes to lie on, and a body. */
function fakeModel(fit = FIT) {
  const scene = new Group();
  const board = new Mesh(new BoxGeometry(20, 0.2, 2), new MeshStandardMaterial());
  board.position.set(4, BOARD_TOP - 0.1, 0);
  board.userData.part = 'fingerboard';
  const body = new Mesh(new BoxGeometry(26, 6, 17), new MeshStandardMaterial());
  body.position.set(17, -2, 0);
  body.userData.part = 'body';
  scene.add(board, body);
  return { scene, fit };
}
const owned = () => ({ geometries: new Set(), materials: new Set(), textures: new Set() });
const cello = stringKit('cello'), violin = stringKit('violin');
const build = (options = {}) => buildBowedRig({ owned: owned(), kit: cello, maxFret: 5, model: fakeModel(), ...options });
const ends = wire => {
  wire.updateMatrixWorld(true);
  return [new Vector3(0, -0.5, 0), new Vector3(0, 0.5, 0)].map(p => p.applyMatrix4(wire.matrixWorld));
};

describe('a downloaded violin or cello, made playable', () => {
  it('draws four strings of its own from the measured nut to the measured bridge', () => {
    const rig = build();
    expect(rig.strings).toHaveLength(4);
    rig.strings.forEach((wire, s) => {
      const [from, to] = ends(wire);
      [0, 1, 2].forEach(k => {
        expect(from.getComponent(k)).toBeCloseTo(STRINGS[s].nut[k], 5);
        expect(to.getComponent(k)).toBeCloseTo(STRINGS[s].bridge[k], 5);
      });
      expect(wire.userData.restY).toBe(wire.position.y);
      // As thick as the model's own string ends, so they join up at the nut and the bridge.
      expect(wire.scale.x).toBeCloseTo(STRINGS[s].radius, 6);
    });
  });

  it('gives every place from the open string to the last a target and a marker', () => {
    const rig = build();
    expect(rig.dots).toHaveLength(4 * 6);
    // Each place's target, then a bowing stretch for each string's open note.
    expect(rig.targets).toHaveLength(4 * 6 + 4);
    rig.targets.slice(0, rig.dots.length).forEach((target, i) => {
      const place = target.userData;
      expect(place).toEqual({ midi: cello.midi(place.string, place.fret), string: place.string, fret: place.fret });
      expect(rig.dots[i].userData).toBe(place);
      const [from, to] = rig.neck.reach(place.fret, 5);
      expect(target.position.x - target.scale.x / 2).toBeCloseTo(from, 10);
      expect(target.position.x + target.scale.x / 2).toBeCloseTo(to, 10);
      expect(rig.dots[i].position.x).toBeCloseTo(rig.neck.markX(place.fret), 10);
      expect(rig.dots[i].position.y).toBeGreaterThan(rig.neck.stringAt(place.string, rig.dots[i].position.x).y);
    });
  });

  it('bows the open strings from near the bridge, as the 2D fingerboard does', () => {
    const rig = build();
    expect(rig.bowZones).toHaveLength(4);
    rig.bowZones.forEach((zone, s) => {
      const open = rig.targets.find(t => t.userData.string === s && t.userData.fret === 0);
      // The same place as the open string at the nut, so pointing at either shows and plays the same note.
      expect(zone.userData).toBe(open.userData);
      expect(rig.targets).toContain(zone);
      const from = zone.position.x - zone.scale.x / 2, to = zone.position.x + zone.scale.x / 2;
      expect(from).toBeLessThan(rig.neck.contactX());
      expect(to).toBeGreaterThan(rig.neck.contactX());
      expect(to).toBeLessThan(STRINGS[s].bridge[0]);
      expect(from).toBeGreaterThan(rig.neck.placeX(12));
      expect(zone.position.z).toBeCloseTo(rig.neck.stringAt(s, zone.position.x).z, 10);
    });
  });

  it('keeps neighbouring strings\' targets apart', () => {
    const rig = build();
    for (let s = 0; s < 3; s++) {
      const [here, next] = [s, s + 1].map(string => rig.targets.find(t => t.userData.string === string && t.userData.fret === 2));
      expect(here.position.z - here.scale.z / 2).toBeGreaterThan(next.position.z + next.scale.z / 2 - 1e-9);
    }
  });

  it('tapes the first-position finger places, lying on the fingerboard', () => {
    const rig = build();
    expect(rig.tapes.map(t => t.userData.tape)).toEqual([2, 3, 4, 5]);
    rig.tapes.forEach(tape => {
      tape.geometry.computeBoundingBox();
      const box = tape.geometry.boundingBox;
      expect((box.min.x + box.max.x) / 2).toBeCloseTo(rig.neck.placeX(tape.userData.tape), 6);
      expect(box.min.y).toBeGreaterThanOrEqual(BOARD_TOP - 1e-6);
      expect(box.max.y).toBeLessThan(BOARD_TOP + 0.03);
      // Across all four strings.
      expect(box.max.z).toBeGreaterThan(rig.neck.stringAt(0, rig.neck.placeX(tape.userData.tape)).z);
      expect(box.min.z).toBeLessThan(rig.neck.stringAt(3, rig.neck.placeX(tape.userData.tape)).z);
    });
    // The violin's tapes, only as far as the visible places reach.
    expect(build({ kit: violin, maxFret: 4 }).tapes.map(t => t.userData.tape)).toEqual([2, 4]);
  });

  it('carries a bow that shows on the string being played', () => {
    const rig = build();
    expect(rig.bow.group.parent).toBe(rig.instrument);
    expect(rig.bow.group.visible).toBe(false);
  });

  it('stands the cello on its endpin for the showcase, and lays it back down', () => {
    const rig = build();
    expect(rig.showcase.upright).toBe(true);
    rig.orient(1);
    rig.instrument.updateMatrixWorld(true);
    const nut = new Vector3(FIT.nutX, 0, 0).applyMatrix4(rig.instrument.matrixWorld);
    const endpin = new Vector3(FIT.bounds.max[0], 0, 0).applyMatrix4(rig.instrument.matrixWorld);
    expect(nut.y).toBeGreaterThan(endpin.y + 40);
    // The endpin stands on the floor, where the lying cello's back rests.
    expect(endpin.y).toBeCloseTo(FIT.bounds.min[1], 1);
    rig.orient(0);
    expect(rig.instrument.rotation.z).toBeCloseTo(0, 10);
    expect(rig.instrument.position.y).toBeCloseTo(0, 10);
    // The floor and its shadow reach under the cello standing and lying.
    expect(rig.ground.min[1]).toBeCloseTo(FIT.bounds.min[1], 1);
    expect(rig.ground.max[1]).toBeGreaterThan(40);
  });

  it('frames the standing cello\'s showcase around it as it stands', () => {
    const rig = build();
    const ys = rig.showcase.keep.map(p => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(45);
  });

  it('shows the violin lying down, from three-quarters', () => {
    const rig = build({ kit: violin, maxFret: 7 });
    expect(rig.showcase.upright).toBeFalsy();
    expect(rig.orient).toBeUndefined();
    expect(rig.ground).toEqual(FIT.bounds);
  });

  it('hands every geometry and material on stage, the model\'s own included, to the stage to dispose', () => {
    const resources = owned();
    const rig = buildBowedRig({ owned: resources, kit: cello, maxFret: 5, model: fakeModel(), lacquered: true });
    rig.instrument.traverse(object => {
      if (!object.isMesh) return;
      expect(resources.geometries.has(object.geometry)).toBe(true);
      expect(resources.materials.has(object.material)).toBe(true);
    });
    expect(resources.geometries.has(rig.shapes.ring)).toBe(true);
  });

  it('varnishes the body when asked, and leaves the fingerboard bare', () => {
    const model = fakeModel();
    buildBowedRig({ owned: owned(), kit: cello, maxFret: 5, model, lacquered: true });
    const part = name => model.scene.children.find(o => o.userData.part === name);
    expect(part('body').material.clearcoat).toBeGreaterThan(0.5);
    expect(part('fingerboard').material.isMeshPhysicalMaterial).toBeFalsy();
  });
});
