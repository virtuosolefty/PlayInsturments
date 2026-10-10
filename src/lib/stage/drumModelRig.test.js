import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { buildDrumModelRig } from './drumModelRig.js';

const part = (name, material, [x, y, z] = [0, 0, 0]) => {
  const made = new Mesh(new BoxGeometry(1, 1, 1), material);
  made.name = name;
  made.position.set(x, y, z);
  return made;
};

/** A kit: a snare, two crash cymbals, and a stand that is nobody's, all sharing one material as a downloaded kit does. */
function kit() {
  const shared = new MeshStandardMaterial({ color: '#888888' });
  const scene = new Group();
  const snare = part('drum-snare-0', shared, [1, 5, 2]);
  const crashA = part('drum-crash-0', shared, [-3, 9, 0]);
  const crashB = part('drum-crash-1', shared, [3, 9, 0]);
  const stand = part('part7', shared);
  scene.add(snare, crashA, crashB, stand);
  return { scene, snare, crashA, crashB, stand, shared };
}

describe('a drum kit that is hit', () => {
  it('finds each drum by the name its part was given, and counts the crash cymbals as one drum', () => {
    expect(buildDrumModelRig(kit().scene).ids.sort()).toEqual(['crash', 'snare']);
  });

  it('gives each drum a material of its own, so that lighting one does not light the stand', () => {
    const { scene, snare, crashA, stand, shared } = kit();
    buildDrumModelRig(scene);
    expect(snare.material).not.toBe(shared);
    expect(snare.material).not.toBe(crashA.material);
    expect(stand.material).toBe(shared);
  });

  it('lights a drum in the colour it was hit with, and no other', () => {
    const { scene, snare, crashA, stand } = kit();
    const rig = buildDrumModelRig(scene);
    rig.hit('snare', '#00ff00', 1, 1000);
    expect(rig.update(1000)).toBe(true);
    expect(snare.material.emissive.g).toBeGreaterThan(0);
    expect(snare.material.emissive.r).toBe(0);
    expect(crashA.material.emissive.getHex()).toBe(0);
    expect(stand.material.emissive.getHex()).toBe(0);
  });

  it('presses a drum down and lets it come back to exactly where it was', () => {
    const { scene, snare } = kit();
    const rig = buildDrumModelRig(scene);
    rig.hit('snare', '#ffffff', 1, 0);
    rig.update(20);
    expect(snare.position.y).toBeLessThan(5);
    expect(snare.scale.x).toBeGreaterThan(1);
    expect(rig.update(10000)).toBe(true);
    expect(snare.position.toArray()).toEqual([1, 5, 2]);
    expect(snare.scale.toArray()).toEqual([1, 1, 1]);
    expect(snare.material.emissive.getHex()).toBe(0);
  });

  it('rocks every cymbal of a kind on its stand, about its own centre', () => {
    const { scene, crashA, crashB, snare } = kit();
    const rig = buildDrumModelRig(scene);
    rig.hit('crash', '#ffffff', 1, 0);
    rig.update(60);
    expect(crashA.rotation.x).not.toBe(0);
    expect(crashB.rotation.x).not.toBe(0);
    expect(crashA.position.toArray()).toEqual([-3, 9, 0]);
    expect(snare.rotation.x).toBe(0);
  });

  it('says it has nothing to draw once every hit has died away', () => {
    const rig = buildDrumModelRig(kit().scene);
    expect(rig.update(0)).toBe(false);
    rig.hit('crash', '#ffffff', 1, 0);
    expect(rig.update(100)).toBe(true);
    expect(rig.update(5000)).toBe(true); // the frame that puts it back
    expect(rig.update(5016)).toBe(false);
  });

  it('only lights a drum for someone who has asked for less motion', () => {
    const { scene, snare, crashA } = kit();
    const rig = buildDrumModelRig(scene, { reducedMotion: () => true });
    rig.hit('snare', '#ffffff', 1, 0);
    rig.hit('crash', '#ffffff', 1, 0);
    rig.update(50);
    expect(snare.material.emissive.r).toBeGreaterThan(0);
    expect(snare.position.y).toBe(5);
    expect(crashA.rotation.x).toBe(0);
  });

  it('ignores a hit on a drum the kit does not have, and a harder hit moves it further', () => {
    const { scene, snare } = kit();
    const rig = buildDrumModelRig(scene);
    rig.hit('cowbell', '#ffffff', 1, 0);
    expect(rig.update(10)).toBe(false);
    rig.hit('snare', '#ffffff', 0.3, 0);
    rig.update(10);
    const soft = 5 - snare.position.y;
    rig.hit('snare', '#ffffff', 1, 0);
    rig.update(10);
    expect(5 - snare.position.y).toBeGreaterThan(soft);
  });
});
