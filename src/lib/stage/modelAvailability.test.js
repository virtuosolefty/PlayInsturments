import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelAvailable } from './modelAvailability.js';

const SHOWN = { name: 'kit', showcase: true, bounds: { min: [-10, 0, -6], max: [10, 9, 6] } };
const answer = (body, ok = true) => ({ ok, json: async () => { if (body instanceof Error) throw body; return body; } });

describe('whether a model is there to be shown', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('is, when its measurements are served and can be used', async () => {
    const fetch = vi.fn(async () => answer(SHOWN));
    vi.stubGlobal('fetch', fetch);
    expect(await modelAvailable('kit-a', { base: '/there/' })).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/there/kit-a.json');
  });

  it('is not, when the server has no such file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(null, false)));
    expect(await modelAvailable('kit-b', { base: '/missing/' })).toBe(false);
  });

  it('is not, when the server answers with a page instead of measurements', async () => {
    // A development server answers an unknown address with the app's own page.
    vi.stubGlobal('fetch', vi.fn(async () => answer(new SyntaxError('Unexpected token <'))));
    expect(await modelAvailable('kit-c', { base: '/page/' })).toBe(false);
  });

  it('is not, when its measurements could not frame it, or the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer({ ...SHOWN, bounds: undefined })));
    expect(await modelAvailable('kit-d', { base: '/broken/' })).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await modelAvailable('kit-e', { base: '/offline/' })).toBe(false);
  });

  it('asks once a page for each model', async () => {
    const fetch = vi.fn(async () => answer(SHOWN));
    vi.stubGlobal('fetch', fetch);
    await Promise.all([modelAvailable('kit-f', { base: '/once/' }), modelAvailable('kit-f', { base: '/once/' })]);
    await modelAvailable('kit-f', { base: '/once/' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
