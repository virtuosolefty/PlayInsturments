import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWebglProbe, stageTierHere, webglAvailable, webglRendererName } from './webgl.js';

const RENDERER = 0x1F01, UNMASKED = 0x9246;

/** A document whose canvases hand out a fake WebGL context reporting `plain` (and `unmasked` through the debug extension). */
function fakeDocument({ plain, unmasked = null, available = true }) {
  const lose = vi.fn();
  const gl = {
    RENDERER,
    getParameter: key => (key === RENDERER ? plain : key === UNMASKED ? unmasked : null),
    getExtension: name => (name === 'WEBGL_lose_context' ? { loseContext: lose } : name === 'WEBGL_debug_renderer_info' && unmasked ? { UNMASKED_RENDERER_WEBGL: UNMASKED } : null),
  };
  const canvas = { getContext: vi.fn(() => (available ? gl : null)) };
  return { document: { createElement: () => canvas }, canvas, lose };
}

describe('asking the GPU', () => {
  beforeEach(() => resetWebglProbe());
  afterEach(() => { vi.unstubAllGlobals(); resetWebglProbe(); });

  it('asks once, hands the probe context back, and remembers the GPU\'s name', () => {
    const fake = fakeDocument({ plain: 'ANGLE (Intel, Intel(R) UHD Graphics)' });
    vi.stubGlobal('document', fake.document);
    expect(webglAvailable()).toBe(true);
    expect(webglRendererName()).toBe('ANGLE (Intel, Intel(R) UHD Graphics)');
    expect(webglAvailable()).toBe(true);
    expect(fake.canvas.getContext).toHaveBeenCalledTimes(1);
    expect(fake.lose).toHaveBeenCalledTimes(1);
  });

  it('reads the real name through the debug extension when the plain answer is a placeholder', () => {
    vi.stubGlobal('document', fakeDocument({ plain: 'WebKit WebGL', unmasked: 'Apple M2' }).document);
    expect(webglRendererName()).toBe('Apple M2');
  });

  it('says nothing about a GPU it cannot reach', () => {
    vi.stubGlobal('document', fakeDocument({ plain: 'x', available: false }).document);
    expect(webglAvailable()).toBe(false);
    expect(webglRendererName()).toBe('');
  });
});

describe('the detail a 3D stage would get here', () => {
  beforeEach(() => resetWebglProbe());
  afterEach(() => { vi.unstubAllGlobals(); resetWebglProbe(); });

  it('follows a forced choice whatever the GPU', () => {
    vi.stubGlobal('document', fakeDocument({ plain: 'Google SwiftShader' }).document);
    expect(stageTierHere('full')).toBe('full');
    expect(stageTierHere('light')).toBe('light');
  });

  it('gives software rendering the light stage and a real GPU the full one', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8 });
    vi.stubGlobal('document', fakeDocument({ plain: 'Google SwiftShader' }).document);
    expect(stageTierHere('auto')).toBe('light');
    resetWebglProbe();
    vi.stubGlobal('document', fakeDocument({ plain: 'ANGLE (NVIDIA GeForce RTX 3060)' }).document);
    expect(stageTierHere('auto')).toBe('full');
  });
});
