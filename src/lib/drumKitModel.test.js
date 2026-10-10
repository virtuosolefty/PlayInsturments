import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { DRUM_PIECES } from './drums.js';
import { KIT_LAYOUT, buildDrumKit, modelPieceFor } from './drumKitModel.js';

describe('the kit layout', () => {
  it('has a place on the model for every piece of the kit', () => {
    const placed = new Set(KIT_LAYOUT.map(spec => spec.id));
    for (const piece of DRUM_PIECES) expect(placed.has(modelPieceFor(piece.id)), piece.id).toBe(true);
    expect(modelPieceFor('hihat-open')).toBe('hihat');
    expect(modelPieceFor('snare')).toBe('snare');
  });

  it('is set up as a right-handed kit seen from the stool', () => {
    const at = id => KIT_LAYOUT.find(spec => spec.id === id).position;
    expect(at('hihat')[0]).toBeLessThan(at('snare')[0]);
    expect(at('snare')[0]).toBeLessThan(0);
    expect(at('tom-floor')[0]).toBeGreaterThan(0);
    expect(at('ride')[0]).toBeGreaterThan(at('tom-mid')[0]);
    expect(at('tom-high')[0]).toBeLessThan(at('tom-mid')[0]);
    // Cymbals above the drums, the kick on the floor.
    expect(at('crash')[1]).toBeGreaterThan(at('tom-high')[1]);
    expect(at('kick')[1]).toBeLessThan(at('snare')[1]);
  });

  it('keeps the drums from standing inside each other', () => {
    const solid = KIT_LAYOUT.filter(spec => spec.kind !== 'cymbal' && spec.kind !== 'hihat');
    for (const [i, a] of solid.entries()) {
      for (const b of solid.slice(i + 1)) {
        const gap = Math.hypot(...a.position.map((v, k) => v - b.position[k])) - a.radius - b.radius;
        expect(gap, `${a.id} and ${b.id}`).toBeGreaterThan(-0.12);
      }
    }
  });
});

describe('the built kit', () => {
  const kit = buildDrumKit({ highlight: '#123456' });

  it('gives every placed piece something to hit, a marker and a place for its name', () => {
    expect([...kit.pieces.keys()]).toEqual(KIT_LAYOUT.map(spec => spec.id));
    for (const piece of kit.pieces.values()) {
      expect(piece.surface.isMesh).toBe(true);
      expect(piece.surface.material.emissive).toBeDefined();
      expect(piece.ring.visible).toBe(false);
      expect(piece.ring.material.color.getHexString()).toBe('123456');
      expect(piece.anchor.toArray().every(Number.isFinite)).toBe(true);
      expect(kit.targets.some(target => target.userData.piece === piece.id)).toBe(true);
    }
  });

  it('never offers a marker ring as something to hit', () => {
    const rings = new Set([...kit.pieces.values()].map(piece => piece.ring));
    expect(kit.targets.some(target => rings.has(target))).toBe(false);
    expect(kit.targets.every(target => kit.pieces.has(target.userData.piece))).toBe(true);
  });

  it('flashes each piece on its own material', () => {
    const surfaces = [...kit.pieces.values()].map(piece => piece.surface.material);
    expect(new Set(surfaces).size).toBe(surfaces.length);
  });

  it('stands on the floor inside the box the camera frames', () => {
    const measured = new Box3();
    for (const child of kit.group.children) if (!child.userData.ground) measured.expandByObject(child);
    expect(measured.min.y).toBeGreaterThanOrEqual(-0.01);
    for (const axis of [0, 1, 2]) {
      expect(measured.min.getComponent(axis)).toBeGreaterThanOrEqual(kit.box.min[axis] - 0.02);
      expect(measured.max.getComponent(axis)).toBeLessThanOrEqual(kit.box.max[axis] + 0.02);
    }
  });

  it('keeps track of everything it made, so the stage can dispose of it', () => {
    let meshes = 0;
    kit.group.traverse(node => {
      if (!node.isMesh) return;
      meshes += 1;
      expect(kit.resources.geometries.has(node.geometry)).toBe(true);
      expect(kit.resources.materials.has(node.material)).toBe(true);
    });
    expect(meshes).toBeGreaterThan(40);
  });
});
