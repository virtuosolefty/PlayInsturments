import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GUITAR_COLORS } from './guitar.js';
import { STRING_POSTS } from './guitarBody.js';
import { buildGuitarRig, WIRE_Y } from './guitarRig.js';

/**
 * Pins the code-built guitar to the numbers the stage has always drawn.
 *
 * The expectations below are written out as literals, copied from GuitarStage
 * before it was split into modules, and deliberately do not import
 * guitarNeck.js: a changed constant there must fail here, not agree with itself.
 */
const fretX = f => -6.05 + 24.1 * (1 - 2 ** (-f / 12));
const mid = f => (fretX(f - 1) + fretX(f)) / 2;
const stringZ = s => (2.5 - s) * 0.56;
const gauge = s => 0.014 + (5 - s) * 0.004;
const hex = material => `#${material.color.getHexString()}`;
const at = o => o.position.toArray();
const size = o => o.scale.toArray();
const closeTo = (actual, expected) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));

// Three builds geometry without a browser; only the painted textures ask for a canvas.
beforeAll(() => {
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (_, key) => (String(key).startsWith('create') ? () => gradient : () => {}), set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
});
afterAll(() => vi.unstubAllGlobals());

const owned = () => ({ geometries: new Set(), materials: new Set(), textures: new Set() });
const build = (options = {}) => buildGuitarRig({ owned: owned(), maxFret: 12, ...options });
/** Neck, nut, frets and inlays: the direct children that are not strings, targets or markers. */
function fixtures(rig) {
  const playable = new Set([...rig.strings, ...rig.targets, ...rig.dots]);
  return rig.instrument.children.filter(o => o.isMesh && !playable.has(o));
}
const realGroup = rig => rig.instrument.children.find(o => o.isGroup);

describe('the code-built guitar', () => {
  it('squashes the neck and undoes the squash for the body', () => {
    const rig = build();
    expect(rig.instrument.scale.toArray()).toEqual([1, 1, 0.72]);
    expect(realGroup(rig).scale.z).toBeCloseTo(1 / 0.72, 12);
  });

  it('builds the neck, nut, twelve frets and six inlays where they have always been', () => {
    const [maple, binding, rosewood, nut, ...rest] = fixtures(build());
    closeTo([...at(maple), ...size(maple)], [-0.15, -0.29, 0, 12.3, 0.5, 3.56]);
    closeTo([...at(binding), ...size(binding)], [0, -0.04, 0, 12.55, 0.08, 3.58]);
    closeTo([...at(rosewood), ...size(rosewood)], [0, 0.05, 0, 12.5, 0.18, 3.47]);
    closeTo([...at(nut), ...size(nut)], [-6.12, 0.135, 0, 0.12, 0.13, 3.48]);
    expect(hex(binding.material)).toBe('#c4a67e');
    expect(hex(nut.material)).toBe('#f4e9d6');
    expect(nut.material.roughness).toBe(0.27);

    const frets = rest.slice(0, 12), inlays = rest.slice(12);
    expect(rest).toHaveLength(18);
    frets.forEach((fret, i) => {
      closeTo([...at(fret), ...size(fret)], [fretX(i + 1), 0.18, 0, 0.044, 0.09, 3.48]);
      expect(fret.material).toBe(frets[0].material);
    });
    expect(frets[0].material).toMatchObject({ metalness: 0.78, roughness: 0.22 });
    expect(hex(frets[0].material)).toBe('#dddce1');
    expect(inlays.map(at)).toEqual([[mid(3), 0.148, 0], [mid(5), 0.148, 0], [mid(7), 0.148, 0], [mid(9), 0.148, 0], [mid(12), 0.148, 0.47], [mid(12), 0.148, -0.47]]);
    inlays.forEach(inlay => expect(size(inlay)).toEqual([0.85, 0.55, 0.85]));
  });

  it('strings the neck low E to high E, bronze for the wound three', () => {
    const { strings } = build();
    expect(strings).toHaveLength(6);
    strings.forEach((wire, s) => {
      closeTo([...at(wire), ...size(wire)], [5.7, 0.23, stringZ(s), 23.65, gauge(s), gauge(s)]);
      expect(hex(wire.material)).toBe(s < 3 ? '#c6aa79' : '#e9e5da');
      expect(wire.material).toMatchObject({ metalness: 0.75, roughness: 0.25 });
    });
    expect(WIRE_Y).toBe(0.23);
    expect(new Set(strings.map(w => w.material)).size).toBe(6);
  });

  it('runs each string past the nut to its tuner post', () => {
    const rig = build();
    const tails = realGroup(rig).children.filter(o => o.isMesh);
    expect(tails).toHaveLength(6);
    tails.forEach((tail, s) => {
      const zr = stringZ(s) * 0.72, dx = STRING_POSTS[s] + 6.12, dz = (s < 3 ? 1.2 : -1.2) - zr, run = Math.hypot(dx, dz);
      closeTo([...at(tail), ...size(tail)], [-6.12 + dx / 2, 0.17, zr + dz / 2, run, gauge(s), gauge(s)]);
      expect(tail.rotation.y).toBeCloseTo(Math.atan2(-dz, dx), 10);
      expect(tail.material).toBe(rig.strings[s].material);
    });
  });

  it('gives every place a click target and a marker that share one description', () => {
    const { targets, dots } = build();
    expect(targets).toHaveLength(6 * 13);
    expect(dots).toHaveLength(6 * 13);
    targets.forEach((target, i) => {
      const s = Math.floor(i / 13), fret = i % 13;
      const x = fret === 0 ? -6.45 : mid(fret), width = fret === 0 ? 0.5 : fretX(fret) - fretX(fret - 1);
      expect(target.userData).toEqual({ midi: [40, 45, 50, 55, 59, 64][s] + fret, string: s, fret });
      closeTo([...at(target), ...size(target)], [x, 0.28, stringZ(s), width, 0.14, 0.53]);
      closeTo([...at(dots[i]), ...size(dots[i])], [x, 0.3, stringZ(s), 1.55, 1, 1.55]);
      expect(dots[i].userData).toBe(target.userData);
      expect(hex(dots[i].material)).toBe(GUITAR_COLORS[s]);
      expect(dots[i].material.roughness).toBe(0.8);
      for (const o of [target, dots[i]]) expect([o.castShadow, o.receiveShadow]).toEqual([false, false]);
    });
    expect(new Set(dots.map(d => d.material)).size).toBe(dots.length);
    expect(targets[0].material).toMatchObject({ transparent: true, opacity: 0, depthWrite: false });
  });

  it('builds places only up to the last visible fret', () => {
    const { targets, dots } = build({ maxFret: 5 });
    expect(targets).toHaveLength(6 * 6);
    expect(dots).toHaveLength(6 * 6);
    expect(Math.max(...targets.map(t => t.userData.fret))).toBe(5);
  });

  it('registers everything it creates for disposal', () => {
    const mine = owned();
    const rig = buildGuitarRig({ owned: mine, maxFret: 12 });
    const used = { geometries: new Set(), materials: new Set(), textures: new Set() };
    rig.instrument.traverse(o => {
      if (!o.isMesh) return;
      used.geometries.add(o.geometry);
      for (const material of [o.material].flat()) { used.materials.add(material); if (material.map) used.textures.add(material.map); }
    });
    used.geometries.add(rig.shapes.ring);
    for (const kind of ['geometries', 'materials', 'textures']) for (const item of used[kind]) expect(mine[kind].has(item), `${kind}: ${item.type ?? item.constructor.name}`).toBe(true);
    expect(mine.textures.size).toBe(4);
  });
});

describe('the lacquered finish', () => {
  const body = rig => realGroup(rig).children.find(o => o.isGroup).children[0];
  const flat = rig => { const found = []; rig.instrument.traverse(o => o.isMesh && o.material.type === 'MeshBasicMaterial' && o.material.opacity === 1 && found.push(o)); return found; };

  it('is off by default: plain materials on the body and no soundhole cover', () => {
    const rig = build();
    body(rig).material.forEach(m => expect(m.type).toBe('MeshStandardMaterial'));
    expect(flat(rig)).toHaveLength(0);
  });

  it('adds a clearcoat to the body and a matte disc over the painted soundhole', () => {
    const rig = build({ lacquered: true });
    body(rig).material.forEach(m => expect(m).toMatchObject({ type: 'MeshPhysicalMaterial', clearcoat: 0.6, clearcoatRoughness: 0.12 }));
    expect(flat(rig)).toHaveLength(1);
  });

  it('leaves the playable neck where it was', () => {
    const plain = build(), glossy = build({ lacquered: true });
    plain.targets.forEach((target, i) => { expect(at(glossy.targets[i])).toEqual(at(target)); expect(size(glossy.targets[i])).toEqual(size(target)); });
    plain.strings.forEach((wire, i) => expect(at(glossy.strings[i])).toEqual(at(wire)));
  });
});
