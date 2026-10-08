import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./models.js', () => ({ loadInstrumentModel: vi.fn(), collectResources: vi.fn() }));

const { loadInstrumentModel, collectResources } = await import('./models.js');
const { loadRig, newOwned, otherRigs, rigFrom } = await import('./otherRigs.js');

const resource = () => ({ dispose: vi.fn() });
const rigFor = id => ({ id, owned: { geometries: new Set([resource()]), materials: new Set([resource()]), textures: new Set([resource()]) } });
const disposed = rig => rig.disposed === true || [...rig.kept].every(item => item.dispose.mock.calls.length === 1);
/** A rig that remembers what it owned, since disposing empties the sets. */
const tracked = id => { const rig = rigFor(id); rig.kept = [...rig.owned.geometries, ...rig.owned.materials, ...rig.owned.textures]; return rig; };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('the rigs of instruments shown in place of a stage\'s own', () => {
  it('builds one the first time it is asked for, and says when it is ready', async () => {
    const rig = tracked('bass'), build = vi.fn(async () => rig), onReady = vi.fn();
    const rigs = otherRigs({ build, onReady, onFailed: vi.fn() });
    expect(rigs.get('bass')).toBeNull();
    expect(rigs.get('bass')).toBeNull();
    await settle();
    expect(build).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith('bass');
    expect(rigs.get('bass')).toBe(rig);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('keeps each instrument\'s rig apart', async () => {
    const rigs = otherRigs({ build: async id => tracked(id), onReady: vi.fn(), onFailed: vi.fn() });
    rigs.get('bass'); rigs.get('electric');
    await settle();
    expect(rigs.get('bass').id).toBe('bass');
    expect(rigs.get('electric').id).toBe('electric');
  });

  it('reports one that could not be built, and tries again the next time it is asked for', async () => {
    const good = tracked('bass');
    const build = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('no graphics')).mockResolvedValueOnce(good);
    const onFailed = vi.fn(), onReady = vi.fn();
    const rigs = otherRigs({ build, onReady, onFailed });
    rigs.get('bass');
    await settle();
    expect(onFailed).toHaveBeenLastCalledWith('bass', 'its files could not be loaded');
    rigs.get('bass');
    await settle();
    expect(onFailed).toHaveBeenLastCalledWith('bass', 'no graphics');
    expect(onReady).not.toHaveBeenCalled();
    rigs.get('bass');
    await settle();
    expect(rigs.get('bass')).toBe(good);
  });

  it('reports a builder that throws at once, rather than leaving the stage waiting', async () => {
    const onFailed = vi.fn();
    const rigs = otherRigs({ build: () => { throw new Error('bad measurements'); }, onReady: vi.fn(), onFailed });
    expect(rigs.get('bass')).toBeNull();
    await settle();
    expect(onFailed).toHaveBeenCalledWith('bass', 'bad measurements');
  });

  it('disposes, when the stage stops, of every rig that never went on stage', async () => {
    const shown = tracked('bass'), waiting = tracked('electric');
    const rigs = otherRigs({ build: async id => (id === 'bass' ? shown : waiting), onReady: vi.fn(), onFailed: vi.fn() });
    rigs.get('bass'); rigs.get('electric');
    await settle();
    // The stage runner disposes of what it was given to show.
    rigs.staged(shown);
    rigs.stop();
    expect(disposed(waiting)).toBe(true);
    expect(shown.kept.every(item => item.dispose.mock.calls.length === 0)).toBe(true);
  });

  it('disposes of a rig that arrives after the stage has stopped, and tells nobody', async () => {
    const late = tracked('bass'), onReady = vi.fn(), onFailed = vi.fn();
    const rigs = otherRigs({ build: async () => late, onReady, onFailed });
    rigs.get('bass');
    rigs.stop();
    await settle();
    expect(disposed(late)).toBe(true);
    expect(onReady).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
    expect(rigs.get('bass')).toBeNull();
  });
});

describe('building a rig on a downloaded model', () => {
  const model = { scene: 'the model' };
  let ofModel;
  beforeEach(() => {
    ofModel = { geometries: new Set([resource()]), materials: new Set(), textures: new Set([resource()]) };
    collectResources.mockReset().mockReturnValue(ofModel);
    loadInstrumentModel.mockReset();
  });

  it('starts every rig with nothing to its name', () => {
    const first = newOwned(), second = newOwned();
    expect(first).toEqual({ geometries: new Set(), materials: new Set(), textures: new Set() });
    expect(second.geometries).not.toBe(first.geometries);
  });

  it('hands the builder what the rig will own and the model, and names the rig after it', () => {
    const build = vi.fn(owned => { owned.geometries.add('a string'); return { strings: 4 }; });
    const rig = rigFrom(model, 'guitar-bass', build);
    expect(build).toHaveBeenCalledWith(rig.owned, model);
    expect(rig).toMatchObject({ strings: 4, model: 'guitar-bass' });
    expect(rig.owned.geometries.has('a string')).toBe(true);
  });

  it('disposes of what was made so far, and of the model, when the builder throws', () => {
    const made = resource(), fromModel = [...ofModel.geometries, ...ofModel.textures];
    expect(() => rigFrom(model, 'guitar-bass', owned => { owned.materials.add(made); throw new Error('no strings'); })).toThrow('no strings');
    expect(made.dispose).toHaveBeenCalledTimes(1);
    expect(collectResources).toHaveBeenCalledWith('the model');
    for (const item of fromModel) expect(item.dispose).toHaveBeenCalledTimes(1);
  });

  it('fetches the model first, and builds nothing when its files cannot be loaded', async () => {
    const build = vi.fn(() => ({ strings: 4 }));
    loadInstrumentModel.mockResolvedValueOnce(null);
    expect(await loadRig('guitar-bass', build)).toBeNull();
    expect(build).not.toHaveBeenCalled();
    loadInstrumentModel.mockResolvedValueOnce(model);
    expect(await loadRig('guitar-bass', build)).toMatchObject({ strings: 4, model: 'guitar-bass' });
    expect(loadInstrumentModel).toHaveBeenLastCalledWith('guitar-bass');
  });
});
