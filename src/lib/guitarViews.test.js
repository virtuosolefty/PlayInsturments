import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./stage/models.js', () => ({ loadInstrumentModel: vi.fn(), collectResources: vi.fn() }));
vi.mock('./guitarModelRig.js', () => ({ buildModelGuitarRig: vi.fn() }));
vi.mock('./stage/studio.js', () => ({ disposeResources: vi.fn() }));

const { loadInstrumentModel, collectResources } = await import('./stage/models.js');
const { buildModelGuitarRig } = await import('./guitarModelRig.js');
const { disposeResources } = await import('./stage/studio.js');
const { guitarViews } = await import('./guitarViews.js');

/** Lets the download's promise callbacks run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

let finishDownload, latest, run, drawn, states, broken, shows;

/** A stage runner that only remembers what it was asked to do. */
function fakeRun(first) {
  const fake = { rig: first, show: vi.fn(next => { fake.rig = next; }), prepare: vi.fn(), release: vi.fn() };
  return fake;
}

function open({ view = 'freePlay', stageView = 'learn', full = true } = {}) {
  latest = { current: { view, stageView } };
  return guitarViews(run, { drawn, full, maxFret: 12, latest, onState: state => states.push(state), onShow: () => { shows += 1; }, onBroken: why => broken.push(why) });
}

beforeEach(() => {
  drawn = { instrument: 'drawn guitar', owned: 'drawn resources' };
  run = fakeRun(drawn);
  states = []; broken = []; shows = 0;
  loadInstrumentModel.mockImplementation(() => new Promise(resolve => { finishDownload = resolve; }));
  collectResources.mockImplementation(scene => `resources of ${scene}`);
  buildModelGuitarRig.mockImplementation(({ owned }) => ({ instrument: 'model guitar', builtWith: owned }));
});
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

describe('which guitar each view shows', () => {
  it('keeps the drawn guitar in a lesson, and fetches no model for it', () => {
    open({ view: 'lesson' }).apply();
    expect(loadInstrumentModel).not.toHaveBeenCalled();
    expect(run.show).not.toHaveBeenCalled();
  });

  it('fetches the model once when free play opens, and shows it only in Whole instrument', async () => {
    const views = open();
    views.apply();
    expect(states).toEqual(['loading']);
    finishDownload({ scene: 'scene' });
    await settle();
    expect(states).toEqual(['loading', 'ready']);
    // Learn keeps the drawn guitar.
    expect(run.show).not.toHaveBeenCalled();

    latest.current.stageView = 'whole';
    views.apply();
    expect(run.rig).toMatchObject({ instrument: 'model guitar', model: 'guitar', maxFret: 12 });
    latest.current.stageView = 'learn';
    views.apply();
    expect(run.rig).toBe(drawn);
    expect(loadInstrumentModel).toHaveBeenCalledTimes(1);
    expect(shows).toBe(2);
  });

  it('shows the model as soon as it is built when Whole instrument was chosen before it arrived', async () => {
    open({ stageView: 'whole' }).apply();
    expect(run.show).not.toHaveBeenCalled();
    finishDownload({ scene: 'scene' });
    await settle();
    expect(run.rig.instrument).toBe('model guitar');
  });

  it('never fetches the model on the light stage', () => {
    open({ stageView: 'whole', full: false }).apply();
    expect(loadInstrumentModel).not.toHaveBeenCalled();
    expect(run.rig).toBe(drawn);
  });

  it('falls back when the runner cannot put a guitar on stage', async () => {
    run.show.mockImplementation(() => { throw new Error('no room on stage'); });
    open({ stageView: 'whole' }).apply();
    finishDownload({ scene: 'scene' });
    await settle();
    expect(broken).toEqual(['no room on stage']);
  });
});

describe('getting the model ready ahead of time', () => {
  it('readies the model to draw at a quiet moment while the player is still in Learn', async () => {
    vi.useFakeTimers();
    open().apply();
    finishDownload({ scene: 'scene' });
    await vi.advanceTimersByTimeAsync(0);
    expect(run.prepare).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run.prepare).toHaveBeenCalledWith(expect.objectContaining({ instrument: 'model guitar' }));
  });

  it('skips that once the model is already on stage', async () => {
    vi.useFakeTimers();
    open({ stageView: 'whole' }).apply();
    finishDownload({ scene: 'scene' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run.prepare).not.toHaveBeenCalled();
  });
});

describe('when the model cannot be had', () => {
  it('reports a failed download, lets the held stage show, and does not fetch again until asked', async () => {
    const views = open({ stageView: 'whole' });
    views.apply();
    finishDownload(null);
    await settle();
    expect(states).toEqual(['loading', 'failed']);
    expect(run.release).toHaveBeenCalled();
    views.apply();
    expect(loadInstrumentModel).toHaveBeenCalledTimes(1);
    views.retry();
    views.apply();
    expect(loadInstrumentModel).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toBe('loading');
  });

  it('treats a download that throws as a failed one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadInstrumentModel.mockRejectedValueOnce(new Error('offline'));
    open().apply();
    await settle();
    expect(states).toEqual(['loading', 'failed']);
    expect(warn).toHaveBeenCalled();
  });

  it('hands back what was built when building the model throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    buildModelGuitarRig.mockImplementation(() => { throw new Error('the strings do not add up'); });
    open().apply();
    finishDownload({ scene: 'scene' });
    await settle();
    expect(states).toEqual(['loading', 'failed']);
    expect(disposeResources).toHaveBeenCalledWith(expect.objectContaining({ geometries: expect.any(Set) }));
    expect(disposeResources).toHaveBeenCalledWith('resources of scene');
    expect(warn.mock.calls[0].join(' ')).toContain('the strings do not add up');
  });
});

describe('closing the stage', () => {
  it('disposes a model that arrives after the stage has closed, without building it', async () => {
    const views = open();
    views.apply();
    views.stop();
    finishDownload({ scene: 'late scene' });
    await settle();
    expect(buildModelGuitarRig).not.toHaveBeenCalled();
    expect(disposeResources).toHaveBeenCalledWith('resources of late scene');
    expect(states).toEqual(['loading']);
  });

  it('disposes a model that was built but never shown, and leaves a shown one to the runner', async () => {
    const unseen = open();
    unseen.apply();
    finishDownload({ scene: 'scene' });
    await settle();
    unseen.stop();
    expect(disposeResources).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    run = fakeRun(drawn);
    const seen = open({ stageView: 'whole' });
    seen.apply();
    finishDownload({ scene: 'scene' });
    await settle();
    seen.stop();
    expect(disposeResources).not.toHaveBeenCalled();
  });
});
