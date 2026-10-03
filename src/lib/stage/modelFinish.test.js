import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { castShadows, lacquer } from './modelFinish.js';

function guitarParts() {
  const grain = new CanvasTexture({ width: 1, height: 1 });
  const wood = new MeshStandardMaterial({ color: '#c08040', map: grain, roughness: 0.6 });
  const ebony = new MeshStandardMaterial({ color: '#201814' });
  const part = (name, material) => { const mesh = new Mesh(new BoxGeometry(), material); mesh.userData.part = name; return mesh; };
  const top = part('top', wood), back = part('back', wood), fretboard = part('fretboard', ebony);
  const root = new Group(); root.add(top, back, fretboard);
  return { root, top, back, fretboard, wood, ebony, grain };
}

describe('finishing a downloaded instrument', () => {
  it('lets every part cast and catch the shadow', () => {
    const { root } = guitarParts();
    castShadows(root);
    root.traverse(object => { if (object.isMesh) expect([object.castShadow, object.receiveShadow]).toEqual([true, true]); });
  });

  it('coats the named parts, keeping their own colour, grain and roughness', () => {
    const { root, top, grain } = guitarParts();
    lacquer(root, { top: { clearcoat: 0.8, clearcoatRoughness: 0.12 } });
    expect(top.material.isMeshPhysicalMaterial).toBe(true);
    expect(top.material.clearcoat).toBe(0.8);
    expect(top.material.clearcoatRoughness).toBe(0.12);
    expect(top.material.color.equals(new Color('#c08040'))).toBe(true);
    expect(top.material.map).toBe(grain);
    expect(top.material.roughness).toBe(0.6);
    // Without this define the shader is compiled without the clear coat.
    expect(top.material.defines).toEqual({ STANDARD: '', PHYSICAL: '' });
  });

  it('coats a material shared by several parts once, and leaves other parts alone', () => {
    const { root, top, back, fretboard, ebony } = guitarParts();
    const coated = lacquer(root, { top: { clearcoat: 0.8, clearcoatRoughness: 0.1 }, back: { clearcoat: 0.8, clearcoatRoughness: 0.1 } });
    expect(back.material).toBe(top.material);
    expect([...coated]).toEqual([top.material]);
    expect(fretboard.material).toBe(ebony);
  });

  it('disposes the plain materials it replaces, but not their textures', () => {
    const { root, wood, grain } = guitarParts();
    const disposed = vi.fn(), textureDisposed = vi.fn();
    wood.addEventListener('dispose', disposed);
    grain.addEventListener('dispose', textureDisposed);
    lacquer(root, { top: { clearcoat: 1, clearcoatRoughness: 0.1 } });
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(textureDisposed).not.toHaveBeenCalled();
  });
});
