import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial } from 'three';
import { buildGlb, createGltfBuilder } from '../../../scripts/models/gltfIO.mjs';
import { collectResources, fitProblem, loadInstrumentModel, tagParts } from './models.js';

const FIT = {
  name: 'test', nutX: -6.05, scaleLength: 24.1,
  strings: [{ nut: [-6.05, 0, 0.3], bridge: [18.05, 0.2, 0.5], radius: 0.02 }],
  bounds: { min: [-12, -4, -7], max: [25, 0.2, 7] },
};

/** A GLB shaped like the prepared models: a root node named after the instrument, one child per part. */
function tinyGlb() {
  const builder = createGltfBuilder();
  const triangle = () => ({
    attributes: { POSITION: builder.addAccessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 'VEC3', { target: 34962 }) },
    indices: builder.addAccessor(new Uint16Array([0, 1, 2]), 'SCALAR', { target: 34963 }),
    material: 0,
  });
  const meshes = [{ name: 'top', primitives: [triangle()] }, { name: 'stringEnds', primitives: [triangle(), triangle()] }];
  const { json, bin } = builder.finish({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'test', children: [1, 2] }, { name: 'top', mesh: 0 }, { name: 'stringEnds', mesh: 1 }],
    meshes, materials: [{ name: 'wood', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
  });
  return buildGlb(json, bin);
}

const response = (body, ok = true) => ({ ok, json: async () => body, arrayBuffer: async () => body });

describe('loading a downloaded instrument', () => {
  let warn;
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); warn.mockRestore(); });

  it('parses the model and keeps its measurements, every piece tagged with its part', async () => {
    const glb = tinyGlb();
    vi.stubGlobal('fetch', vi.fn(async url => (url.endsWith('.json') ? response(FIT) : response(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)))));
    const model = await loadInstrumentModel('test', { base: '/parses/' });
    expect(model.fit).toEqual(FIT);
    const parts = new Set();
    model.scene.traverse(object => { if (object.isMesh) parts.add(object.userData.part); });
    expect([...parts].sort()).toEqual(['stringEnds', 'top']);
  });

  it('downloads each model once, however often a stage asks for it', async () => {
    const glb = tinyGlb();
    const fetch = vi.fn(async url => (url.endsWith('.json') ? response(FIT) : response(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength))));
    vi.stubGlobal('fetch', fetch);
    const first = await loadInstrumentModel('test', { base: '/once/' });
    const second = await loadInstrumentModel('test', { base: '/once/' });
    expect(fetch).toHaveBeenCalledTimes(2); // the measurements and the model, the first time only
    // Each stage gets a scene of its own, since a scene belongs to the renderer that draws it.
    expect(second.scene).not.toBe(first.scene);
  });

  it('keeps the drawn instrument when the files are missing, and tries again for the next stage', async () => {
    const fetch = vi.fn(async () => response(null, false));
    vi.stubGlobal('fetch', fetch);
    expect(await loadInstrumentModel('test', { base: '/missing/' })).toBeNull();
    expect(await loadInstrumentModel('test', { base: '/missing/' })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('keeps the drawn instrument, and says why, when the measurements have no strings', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => response(url.endsWith('.json') ? { ...FIT, strings: [] } : new ArrayBuffer(8))));
    expect(await loadInstrumentModel('test', { base: '/stringless/' })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('test model'), expect.stringContaining('strings'));
  });

  it('keeps the drawn instrument when the model cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => response(url.endsWith('.json') ? FIT : new ArrayBuffer(8))));
    expect(await loadInstrumentModel('test', { base: '/garbled/' })).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('gives up on a download that stalls, so the stage falls back instead of waiting for ever', async () => {
    // A request that never answers, until it is aborted.
    const stalled = vi.fn((url, { signal } = {}) => new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })));
    }));
    vi.stubGlobal('fetch', stalled);
    expect(await loadInstrumentModel('test', { base: '/stalled/', timeoutMs: 30 })).toBeNull();
    expect(stalled).toHaveBeenCalledWith(expect.stringContaining('/stalled/'), expect.objectContaining({ signal: expect.anything() }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('test model'), expect.stringMatching(/too long/));
  });

  it('keeps the drawn instrument when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await loadInstrumentModel('test', { base: '/offline/' })).toBeNull();
  });
});

describe('checking a model\'s measurements', () => {
  it('accepts measurements the stage can frame and play by', () => {
    expect(fitProblem(FIT)).toBeNull();
  });

  it('refuses measurements a stage would trip over after its drawn instrument had gone', () => {
    expect(fitProblem({ ...FIT, strings: [] })).toMatch(/no strings/);
    expect(fitProblem({ ...FIT, strings: [{ nut: [-6, 0], bridge: [18, 0, 0] }] })).toMatch(/both ends/);
    expect(fitProblem({ ...FIT, strings: [{ nut: [18, 0, 0], bridge: [-6, 0, 0] }] })).toMatch(/both ends/);
    expect(fitProblem({ ...FIT, scaleLength: 0 })).toMatch(/scale length/);
    expect(fitProblem({ ...FIT, nutX: 'nut' })).toMatch(/nut/);
    expect(fitProblem({ ...FIT, bounds: undefined })).toMatch(/bounds/);
    expect(fitProblem({ ...FIT, bounds: { min: [0, 0, 0], max: [1, 0, 1] } })).toMatch(/bounds/);
    expect(fitProblem(null)).toMatch(/no strings/);
  });
});

describe('the parts of a loaded model', () => {
  it('tags every piece under a part node with that part', () => {
    const scene = new Group(), root = new Group(), top = new Mesh(), strings = new Group(), end = new Mesh();
    root.name = 'guitar'; top.name = 'top'; strings.name = 'stringEnds';
    strings.add(end); root.add(top, strings); scene.add(root);
    tagParts(scene);
    expect(top.userData.part).toBe('top');
    expect(end.userData.part).toBe('stringEnds');
  });

  it('finds every geometry, material and texture to hand back, each once', () => {
    const texture = new CanvasTexture({ width: 1, height: 1 });
    const geometry = new BoxGeometry(), material = new MeshStandardMaterial({ map: texture });
    const root = new Group();
    root.add(new Mesh(geometry, material), new Mesh(geometry, [material, new MeshStandardMaterial()]));
    const found = collectResources(root);
    expect(found.geometries.size).toBe(1);
    expect(found.materials.size).toBe(2);
    expect([...found.textures]).toEqual([texture]);
  });
});
