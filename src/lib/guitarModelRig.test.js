import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { guitarMidi } from './guitar.js';
import { fretSpace, NUT_X } from './guitarNeck.js';
import { buildModelGuitarRig, INLAY_FRETS } from './guitarModelRig.js';

// Measurements shaped like public/models/guitar.json: six strings fanning out from the nut to the saddle.
const FIT = {
  nutX: NUT_X,
  strings: [0, 1, 2, 3, 4, 5].map(s => ({ nut: [NUT_X, 0, 0.72 - s * 0.2885], bridge: [18.4, 0.22, 1.12 - s * 0.45], radius: 0.01 })),
  bounds: { min: [-12.6, -4, -7.3], max: [25.4, 0.2, 7.3] },
};
const FRETBOARD_TOP = -0.07;

/** A stand-in for the loaded model: a fretboard to rest the inlays on, and a body. */
function fakeModel() {
  const scene = new Group();
  const fretboard = new Mesh(new BoxGeometry(17, 0.2, 2.4), new MeshStandardMaterial());
  fretboard.position.set(2.4, FRETBOARD_TOP - 0.1, 0);
  fretboard.userData.part = 'fretboard';
  const top = new Mesh(new BoxGeometry(18, 0.05, 14), new MeshStandardMaterial());
  top.position.set(16, -0.27, 0);
  top.userData.part = 'top';
  scene.add(fretboard, top);
  return { scene, fit: FIT };
}

const owned = () => ({ geometries: new Set(), materials: new Set(), textures: new Set() });
const build = (maxFret = 12) => buildModelGuitarRig({ owned: owned(), maxFret, model: fakeModel() });
const ends = wire => {
  wire.updateMatrixWorld(true);
  return [new Vector3(0, -0.5, 0), new Vector3(0, 0.5, 0)].map(p => p.applyMatrix4(wire.matrixWorld));
};

describe('the downloaded guitar, made playable', () => {
  it('puts the model on stage with six strings of our own', () => {
    const model = fakeModel(), rig = buildModelGuitarRig({ owned: owned(), maxFret: 12, model });
    expect(rig.instrument.children).toContain(model.scene);
    expect(rig.strings).toHaveLength(6);
    rig.strings.forEach(wire => expect(wire.parent).toBe(rig.instrument));
  });

  it('runs each string from where the model\'s left the nut to where it crossed the saddle', () => {
    const rig = build();
    rig.strings.forEach((wire, s) => {
      const [from, to] = ends(wire);
      const { nut, bridge } = FIT.strings[s];
      [0, 1, 2].forEach(k => {
        expect(from.getComponent(k)).toBeCloseTo(nut[k], 5);
        expect(to.getComponent(k)).toBeCloseTo(bridge[k], 5);
      });
    });
  });

  it('draws the bass strings thicker than the treble ones, and none too thin to see', () => {
    const rig = build(), widths = rig.strings.map(wire => wire.scale.x);
    widths.slice(1).forEach((w, i) => expect(w).toBeLessThanOrEqual(widths[i]));
    expect(widths[0]).toBeGreaterThan(widths[5]);
    widths.forEach(w => expect(w).toBeGreaterThanOrEqual(0.009));
  });

  it('remembers where each string rests, so it can swing about there', () => {
    build().strings.forEach(wire => expect(wire.userData.restY).toBe(wire.position.y));
  });

  it('gives every place from open to the last fret a target and a marker on its own string', () => {
    for (const maxFret of [5, 12]) {
      const rig = build(maxFret);
      expect(rig.targets).toHaveLength(6 * (maxFret + 1));
      expect(rig.dots).toHaveLength(6 * (maxFret + 1));
      rig.targets.forEach((target, i) => {
        const place = target.userData;
        expect(place).toEqual({ midi: guitarMidi(place.string, place.fret), string: place.string, fret: place.fret });
        expect(rig.dots[i].userData).toBe(place);
        const at = rig.neck.stringAt(place.string, fretSpace(place.fret).x);
        expect(target.position.x).toBeCloseTo(fretSpace(place.fret).x, 10);
        expect(target.position.z).toBeCloseTo(at.z, 10);
        // The marker floats just above its string.
        expect(rig.dots[i].position.y - at.y).toBeGreaterThan(0.02);
        expect(rig.dots[i].position.y - at.y).toBeLessThan(0.12);
      });
    }
  });

  it('keeps neighbouring strings\' targets apart, even where the strings are closest', () => {
    const rig = build();
    for (let s = 0; s < 5; s++) {
      const [here, next] = [s, s + 1].map(string => rig.targets.find(t => t.userData.string === string && t.userData.fret === 0));
      expect(here.position.z - here.scale.z / 2).toBeGreaterThan(next.position.z + next.scale.z / 2 - 1e-9);
    }
  });

  it('sizes the markers to the gap between the strings', () => {
    const rig = build(), gapAtNut = 0.2885;
    rig.shapes.disk.computeBoundingBox();
    const width = rig.shapes.disk.boundingBox.max.x - rig.shapes.disk.boundingBox.min.x;
    // A pointed-at marker is drawn at 1.5 times its size; it should still sit between its neighbours.
    expect(width * 1.5).toBeLessThan(gapAtNut);
    expect(width * 1.5).toBeGreaterThan(gapAtNut * 0.6);
  });

  it('inlays pearl dots on the fretboard at the marker frets, two at the twelfth', () => {
    const rig = build();
    const inlays = rig.instrument.children.filter(o => o.userData.inlay);
    expect(INLAY_FRETS).toEqual([3, 5, 7, 9, 12]);
    expect(inlays.map(o => o.userData.inlay)).toEqual([3, 5, 7, 9, 12, 12]);
    inlays.forEach(inlay => {
      expect(inlay.position.x).toBeCloseTo(fretSpace(inlay.userData.inlay).x, 10);
      expect(inlay.position.y).toBeCloseTo(FRETBOARD_TOP, 2);
    });
    // Only as many as the visible frets reach.
    expect(build(5).instrument.children.filter(o => o.userData.inlay).map(o => o.userData.inlay)).toEqual([3, 5]);
  });

  it('describes its neck from the measurements, and offers the whole model for the showcase view', () => {
    const rig = build();
    expect(rig.neck.nutX).toBe(NUT_X);
    expect(rig.neck.stringAt(0, NUT_X)).toEqual({ y: 0, z: 0.72 });
    expect(rig.showcase.box).toEqual(FIT.bounds);
    expect(rig.showcase.elevationDeg).toBeGreaterThan(15);
    expect(rig.showcase.keep).toBeUndefined();
    expect(rig.ground).toEqual(FIT.bounds);
  });

  it('frames the showcase to the corners of each part when the measurements list them', () => {
    const parts = { body: { min: [7, -4, -7], max: [25, 0, 7] }, neck: { min: [-12, -0.4, -1.5], max: [7, 0.2, 1.5] } };
    const rig = buildModelGuitarRig({ owned: owned(), maxFret: 12, model: { ...fakeModel(), fit: { ...FIT, parts } } });
    expect(rig.showcase.keep).toHaveLength(16);
    expect(rig.showcase.keep).toContainEqual([-12, 0.2, 1.5]);
    expect(rig.showcase.keep).toContainEqual([25, -4, -7]);
  });

  it('hands every geometry and material on stage, the model\'s own included, to the stage to dispose', () => {
    for (const lacquered of [false, true]) {
      const resources = owned();
      const rig = buildModelGuitarRig({ owned: resources, maxFret: 12, model: fakeModel(), lacquered });
      rig.instrument.traverse(object => {
        if (!object.isMesh) return;
        expect(resources.geometries.has(object.geometry)).toBe(true);
        expect(resources.materials.has(object.material)).toBe(true);
      });
      expect(resources.geometries.has(rig.shapes.ring)).toBe(true);
    }
  });

  it('lacquers the body when asked, and leaves the fretboard bare', () => {
    const model = fakeModel();
    buildModelGuitarRig({ owned: owned(), maxFret: 12, model, lacquered: true });
    const part = name => model.scene.children.find(o => o.userData.part === name);
    expect(part('top').material.clearcoat).toBeGreaterThan(0.5);
    expect(part('fretboard').material.isMeshPhysicalMaterial).toBeFalsy();
  });

  it('lets the whole model cast and catch the shadow', () => {
    const model = fakeModel();
    buildModelGuitarRig({ owned: owned(), maxFret: 12, model });
    model.scene.traverse(object => { if (object.isMesh) expect(object.castShadow && object.receiveShadow).toBe(true); });
  });
});
