import { describe, expect, it, vi } from 'vitest';
import { soundsInput } from '../hooks/usePracticeEngine.js';
import { MIC_LATENCY_MS, MIC_STATUS, MicInput, listenPlan, micRange } from './micInput.js';
import { midiToHz, QUIET } from './pitch.js';

/** A microphone that hears a steady tone, an audio context to read it with, and a clock and timer to drive by hand. */
function rig({ hz = 220, fail = null, suspended = false, rate: RATE = 48000, level = 0.3 } = {}) {
  const track = { stop: vi.fn(), onended: null };
  const stream = { getTracks: () => [track] };
  const context = {
    sampleRate: RATE, state: suspended ? 'suspended' : 'running',
    resume: vi.fn(async () => { context.state = 'running'; }),
    close: vi.fn(async () => { context.state = 'closed'; }),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createAnalyser: vi.fn(() => ({
      fftSize: 2048,
      getFloatTimeDomainData(buffer) { for (let i = 0; i < buffer.length; i++) buffer[i] = hz ? level * Math.sin(2 * Math.PI * hz * i / RATE) : 0; },
    })),
  };
  const ticks = [];
  let time = 1000;
  const deps = {
    getUserMedia: vi.fn(async constraints => { if (fail) throw fail; deps.constraints = constraints; return stream; }),
    createContext: vi.fn(() => context),
    now: () => time,
    every: vi.fn((fn, ms) => { ticks.push(fn); deps.interval = ms; return ticks.length; }),
    cancel: vi.fn(),
    atGesture: vi.fn(fn => { deps.gesture = fn; return deps.stopWaiting; }),
    stopWaiting: vi.fn(),
  };
  return { deps, track, context, tick: (ms = 30) => { time += ms; ticks.at(-1)(); } };
}

const denied = () => Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });

describe('the microphone', () => {
  it('starts when something first asks to listen, and says so', async () => {
    const { deps } = rig();
    const mic = new MicInput(deps);
    const seen = [];
    mic.onChange(state => seen.push(state.status));
    expect(mic.status).toBe(MIC_STATUS.OFF);
    const release = mic.hold('tuner');
    expect(mic.status).toBe(MIC_STATUS.STARTING);
    await mic.started;
    expect(mic.status).toBe(MIC_STATUS.ON);
    expect(seen).toEqual([MIC_STATUS.STARTING, MIC_STATUS.ON]);
    release();
  });

  it('asks the browser to cancel the app’s own sound but not to treat a held note as noise', async () => {
    const { deps } = rig();
    const mic = new MicInput(deps);
    mic.hold('notes');
    await mic.started;
    expect(deps.constraints).toEqual({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
  });

  it('reports the pitch it hears to everyone listening, with the time it was heard', async () => {
    const { deps, tick } = rig({ hz: midiToHz(57) });
    const mic = new MicInput(deps);
    const frames = [];
    mic.onPitch(frame => frames.push(frame));
    mic.hold('tuner');
    await mic.started;
    tick();
    expect(frames).toHaveLength(1);
    expect(Math.round(12 * Math.log2(frames[0].hz / 440) + 69)).toBe(57);
    expect(frames[0].at).toBe(1030);
    expect(frames[0].rms).toBeGreaterThan(0.1);
  });

  it('keeps listening until the last one that asked lets go, then releases the microphone', async () => {
    const { deps, track, context } = rig();
    const mic = new MicInput(deps);
    const tuner = mic.hold('tuner'), notes = mic.hold('notes');
    await mic.started;
    expect(deps.getUserMedia).toHaveBeenCalledOnce();
    tuner();
    expect(mic.status).toBe(MIC_STATUS.ON);
    expect(track.stop).not.toHaveBeenCalled();
    notes();
    expect(mic.status).toBe(MIC_STATUS.OFF);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(deps.cancel).toHaveBeenCalledOnce();
    // Letting go twice is harmless.
    notes();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('says so when the person refuses, and can be asked again', async () => {
    const { deps } = rig({ fail: denied() });
    const mic = new MicInput(deps);
    mic.hold('tuner');
    await mic.started;
    expect(mic.status).toBe(MIC_STATUS.DENIED);
    await mic.retry();
    expect(deps.getUserMedia).toHaveBeenCalledTimes(2);
    expect(mic.status).toBe(MIC_STATUS.DENIED);
  });

  it('says what went wrong when there is no microphone to use', async () => {
    const { deps } = rig({ fail: Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' }) });
    const mic = new MicInput(deps);
    mic.hold('tuner');
    await mic.started;
    expect(mic.status).toBe(MIC_STATUS.ERROR);
    expect(mic.error).toMatch(/No microphone/);
  });

  it('is unsupported where the browser has no microphone access at all', async () => {
    const mic = new MicInput({ ...rig().deps, getUserMedia: null });
    mic.hold('tuner');
    await mic.started;
    expect(mic.status).toBe(MIC_STATUS.UNSUPPORTED);
  });

  it('stops, and says why, when the microphone is unplugged', async () => {
    const { deps, track } = rig();
    const mic = new MicInput(deps);
    mic.hold('notes');
    await mic.started;
    track.onended();
    expect(mic.status).toBe(MIC_STATUS.ERROR);
    expect(mic.error).toMatch(/disconnected/);
  });

  it('lets the microphone go, and says so, if it cannot be set up after permission was given', async () => {
    const { deps, track, context } = rig();
    // A browser that refuses to join this microphone to this audio clock, as some do over a sample-rate mismatch.
    context.createMediaStreamSource = vi.fn(() => { throw new Error('sample rates differ'); });
    const mic = new MicInput(deps);
    mic.hold('notes');
    await mic.started;
    expect(mic.status).toBe(MIC_STATUS.ERROR);
    expect(mic.error).toMatch(/could not be set up/);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    // And it can be asked again once the fault is gone.
    context.createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
    await mic.retry();
    expect(mic.status).toBe(MIC_STATUS.ON);
  });

  it('asks an audio clock that falls asleep later to wake again', async () => {
    const { deps, context, tick } = rig();
    const mic = new MicInput(deps);
    mic.hold('notes');
    await mic.started;
    expect(context.resume).not.toHaveBeenCalled();
    // A phone call, or the tab put away: the clock stops under a microphone that is still on.
    context.state = 'suspended';
    tick(1200);
    expect(context.resume).toHaveBeenCalledOnce();
    // It is asked about once a second, not on every reading.
    tick(30);
    expect(context.resume).toHaveBeenCalledOnce();
  });

  it('does not go looking for a note in the sound of a quiet room', async () => {
    const { deps, tick } = rig({ level: QUIET / 2 });
    const mic = new MicInput(deps);
    const frames = [];
    mic.onPitch(frame => frames.push(frame));
    mic.hold('tuner');
    await mic.started;
    tick();
    expect(frames[0].hz).toBeNull();
    expect(frames[0].rms).toBeGreaterThan(0);
  });

  it('hears a bass guitar’s low E on a sound card running at twice the usual rate', async () => {
    const { deps, tick } = rig({ hz: 41.2, rate: 96000 });
    const mic = new MicInput(deps);
    const frames = [];
    mic.onPitch(frame => frames.push(frame));
    mic.hold('notes');
    await mic.started;
    tick();
    expect(Math.abs(1200 * Math.log2(frames[0].hz / 41.2))).toBeLessThan(10);
  });

  it('does not start a microphone nobody is waiting for any more', async () => {
    const { deps, track } = rig();
    const mic = new MicInput(deps);
    const release = mic.hold('tuner');
    release();
    await mic.started;
    expect(mic.status).toBe(MIC_STATUS.OFF);
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('asks a sleeping audio clock to wake, and again at the next click, without waiting on it', async () => {
    const { deps, context } = rig({ suspended: true });
    // A browser that will not wake the clock until the page is clicked: the request never settles.
    context.resume = vi.fn(() => new Promise(() => {}));
    const mic = new MicInput(deps);
    const release = mic.hold('tuner');
    await mic.started;
    expect(mic.status).toBe(MIC_STATUS.ON);
    expect(context.resume).toHaveBeenCalledOnce();
    deps.gesture();
    expect(context.resume).toHaveBeenCalledTimes(2);
    // Letting the microphone go stops waiting for that click.
    release();
    expect(deps.stopWaiting).toHaveBeenCalledOnce();
  });

  it('does not wait for a click when the audio clock is already running', async () => {
    const { deps } = rig();
    const mic = new MicInput(deps);
    mic.hold('tuner');
    await mic.started;
    expect(deps.atGesture).not.toHaveBeenCalled();
  });
});

describe('how much sound is read at a time', () => {
  it('is about a tenth of a second at the usual rates, read as it comes', () => {
    expect(listenPlan(48000)).toMatchObject({ step: 1, rate: 48000, size: 4096, fftSize: 4096 });
    expect(listenPlan(44100)).toMatchObject({ step: 1, rate: 44100, size: 4096, fftSize: 4096 });
  });

  it('thins a fast sound card’s samples, so a low note still fits and the work stays the same', () => {
    expect(listenPlan(96000)).toMatchObject({ step: 2, rate: 48000, size: 4096, fftSize: 8192 });
    expect(listenPlan(88200)).toMatchObject({ step: 2, rate: 44100, fftSize: 8192 });
    expect(listenPlan(192000)).toMatchObject({ step: 4, rate: 48000, fftSize: 16384 });
  });

  it('reads fewer samples from a slow one, such as a wireless headset, so a note is not reported late', () => {
    const plan = listenPlan(16000);
    expect(plan).toMatchObject({ step: 1, rate: 16000, size: 2048, fftSize: 2048 });
    expect(plan.latencyMs).toBeLessThan(110);
  });

  it('always asks the browser for a size it can give: a power of two', () => {
    for (const rate of [8000, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 144000, 176400, 192000]) {
      const { fftSize } = listenPlan(rate);
      expect(Number.isInteger(Math.log2(fftSize)), `${rate}`).toBe(true);
      expect(fftSize, `${rate}`).toBeLessThanOrEqual(32768);
    }
  });

  it('says how long ago a note began by the time it is heard, for the rate in use', async () => {
    expect(listenPlan(48000).latencyMs).toBe(MIC_LATENCY_MS);
    const { deps } = rig({ rate: 16000 });
    const mic = new MicInput(deps);
    expect(mic.latencyMs).toBe(MIC_LATENCY_MS);
    mic.hold('notes');
    await mic.started;
    expect(mic.latencyMs).toBe(listenPlan(16000).latencyMs);
  });
});

describe('what the microphone listens for', () => {
  it('is the range of the instrument in hand, with a little room below and plenty above', () => {
    expect(micRange({ tuning: [40, 45, 50, 55, 59, 64] })).toEqual({ lowest: 38, highest: 88 });
    expect(micRange({ tuning: [67, 60, 64, 69] })).toEqual({ lowest: 58, highest: 93 });
    expect(micRange(null)).toEqual({ lowest: 21, highest: 108 });
  });

  it('allows for the time it takes to hear a note at all', () => {
    expect(MIC_LATENCY_MS).toBeGreaterThan(40);
    expect(MIC_LATENCY_MS).toBeLessThan(150);
  });
});

describe('sounding what the player played', () => {
  it('sounds a note from the screen, the keys or a controller, which make no sound of their own', () => {
    expect(soundsInput({ type: 'noteon', midi: 60 })).toBe(true);
    expect(soundsInput({ type: 'noteon', midi: 60, source: 'guitar-screen' })).toBe(true);
    expect(soundsInput({ type: 'noteon', midi: 60, synthetic: true })).toBe(true);
  });

  it('makes no sound of any kind for a note heard through the microphone, a wrong-note buzz included', () => {
    // `soundsInput` is the one question the engine asks before the note and before its error cue: a buzz
    // through the speakers would be heard by the microphone as another wrong note, and buzz again.
    expect(soundsInput({ type: 'noteon', midi: 61, source: 'mic' })).toBe(false);
  });

  it('never sounds a note heard through the microphone: the instrument already has', () => {
    expect(soundsInput({ type: 'noteon', midi: 60, source: 'mic' })).toBe(false);
    expect(soundsInput({ type: 'noteoff', midi: 60, source: 'mic' })).toBe(false);
  });
});
