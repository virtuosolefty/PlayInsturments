/**
 * @vitest-environment jsdom
 *
 * The difference between "an instrument is loaded" and "you will hear it".
 *
 * These two were conflated, and the result was the worst kind of bug: Listen
 * mode scheduling every note of a piece onto a suspended audio clock, playing
 * the whole thing in silence, while the top bar showed a green light next to
 * the instrument name. The engine was working. The app said it was working.
 * Nothing made a sound.
 *
 * `running` is the getter that tells those apart. It existed, with a comment
 * saying exactly this, and was never called from anywhere.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Mutable so a test can suspend the clock the way a backgrounded tab does. */
const rawContext = { state: 'running', addEventListener: vi.fn() };
const context = { lookAhead: 0, rawContext };

/**
 * How many of each Tone class have ever been constructed.
 *
 * Counted rather than merely stubbed, because the thing worth defending about
 * the cue voices is not what they sound like — it is that there is one of each.
 */
const built = {};

vi.mock('tone', () => {
  class Node {
    constructor() {
      const name = new.target.name || 'Node';
      built[name] = (built[name] ?? 0) + 1;
    }
    connect() {
      return this;
    }
    toDestination() {
      return this;
    }
    dispose() {}
    set() {}
    triggerAttackRelease() {}
    releaseAll() {}
  }
  return {
    start: vi.fn().mockResolvedValue(undefined),
    now: () => 0,
    loaded: vi.fn().mockResolvedValue(undefined),
    getContext: () => context,
    dbToGain: (db) => 10 ** (db / 20),
    Frequency: (midi) => ({ toNote: () => `midi${midi}` }),
    Gain: class extends Node {
      constructor() {
        super();
        this.gain = { rampTo() {} };
      }
    },
    Reverb: class Reverb extends Node {},
    Meter: class Meter extends Node {
      getValue() {
        return -60;
      }
    },
    Sampler: class Sampler extends Node {},
    // Named separately so `built` can tell them apart — aliasing them all to
    // one class would make every count read as the same number.
    PolySynth: class PolySynth extends Node {},
    Synth: class Synth extends Node {},
    NoiseSynth: class NoiseSynth extends Node {},
    MetalSynth: class MetalSynth extends Node {},
    MembraneSynth: class MembraneSynth extends Node {},
    Filter: class Filter extends Node {},
    Vibrato: class Vibrato extends Node {},
  };
});

const { audio } = await import('./audio.js');

const sounding = () => ({ triggerAttackRelease: vi.fn() });

beforeEach(() => {
  rawContext.state = 'running';
  audio.ready = false;
  audio.instrument = null;
  audio.notesDropped = 0;
  audio.instrumentType = 'piano';
  vi.restoreAllMocks();
});

describe('instrument selection', () => {
  it('does not boot audio just to select guitar', () => {
    audio.setInstrumentType('guitar');
    expect(audio.ready).toBe(false);
    expect(audio.instrumentType).toBe('guitar');
  });
  it('boots directly into the guitar voice without loading piano samples', async () => {
    audio._loadPromise = null;
    audio.setInstrumentType('guitar');
    const upgrade = vi.spyOn(audio, '_upgrade');
    await audio.start();
    expect(audio.sourceLabel).toBe('Guitar · synthesized');
    expect(upgrade).not.toHaveBeenCalled();
  });
  it('disposes a late piano sample instead of replacing the selected guitar', async () => {
    let finish;
    const lateInstrument = { dispose: vi.fn() };
    vi.spyOn(audio, '_loadImportedPack').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = audio._upgrade();
    audio.ready = true;
    audio.setInstrumentType('guitar');
    const guitarVoice = audio.instrument;
    finish({ instrument: lateInstrument, label: 'Late piano', source: 'test' });
    await pending;
    expect(audio.instrument).toBe(guitarVoice);
    expect(audio.sourceLabel).toBe('Guitar · synthesized');
    expect(lateInstrument.dispose).toHaveBeenCalledOnce();
  });
  it('gives the violin and cello their own bowed voices', async () => {
    audio._loadPromise = null;
    audio.setInstrumentType('violin');
    await audio.start();
    expect(audio.sourceLabel).toBe('Violin · synthesized');
    audio.setInstrumentType('cello');
    expect(audio.instrumentType).toBe('cello');
    expect(audio.sourceLabel).toBe('Cello · synthesized');
  });
  it('treats an unknown instrument as the piano', () => {
    audio.setInstrumentType('guitar');
    audio.setInstrumentType('theremin');
    expect(audio.instrumentType).toBe('piano');
  });
  it('disposes the whole bowed signal chain, not only the synth', async () => {
    audio._loadPromise = null;
    audio.setInstrumentType('violin');
    await audio.start();
    const voice = audio.instrument;
    const parts = voice._chain;
    expect(parts.length).toBeGreaterThan(0);
    const spies = parts.map(part => vi.spyOn(part, 'dispose'));
    voice.dispose();
    spies.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});

/**
 * The clicks and buzzes, and why they are not built per sound.
 *
 * Reported as "sometimes while practising I see a lag". Every metronome beat
 * used to construct a whole MembraneSynth and every wrong note a whole
 * PolySynth, each played for a tenth of a second and disposed on a timer.
 * Profiled against the production build: seven main-thread stalls of 53–77 ms
 * in fourteen seconds of playing, and none at all with the cues switched off.
 *
 * A synth is an instrument, not a note. These assertions are what stops it
 * quietly becoming a note again.
 */
describe('the cue voices', () => {
  const bootFresh = async () => {
    for (const key of Object.keys(built)) delete built[key];
    audio.ready = false;
    audio._loadPromise = null;
    await audio.start();
  };

  it('builds one of each, however much they are used', async () => {
    await bootFresh();
    const after = { ...built };

    for (let i = 0; i < 200; i += 1) {
      audio.metronomeTick(i % 4 === 0, i * 0.5);
      audio.errorCue('missed', 0.7);
      audio.errorCue('timing', 0.5);
      audio.errorCue('wrong', i / 200);
    }

    // Two hundred beats and six hundred mistakes later, nothing new exists.
    expect(built).toEqual(after);
    expect(built.MembraneSynth).toBe(1);
    expect(built.NoiseSynth).toBe(1);
    expect(built.MetalSynth).toBe(1);
  });

  it('still says nothing before there is anything to say it with', () => {
    audio.ready = false;
    expect(() => {
      audio.metronomeTick(true);
      audio.errorCue('wrong', 1);
    }).not.toThrow();
  });

  it('carries the accent and the severity on the trigger', async () => {
    await bootFresh();
    const click = vi.spyOn(audio.click, 'triggerAttackRelease');
    audio.metronomeTick(true, 4);
    audio.metronomeTick(false, 4.5);
    // Note, duration, when, velocity — the accent is 6 dB, which is half amplitude.
    expect(click.mock.calls[0]).toEqual(['C5', 0.03, 4, 1]);
    expect(click.mock.calls[1]).toEqual(['G4', 0.03, 4.5, 0.5]);

    const buzz = vi.spyOn(audio.buzz, 'triggerAttackRelease');
    audio.errorCue('wrong', 0);
    audio.errorCue('wrong', 1);
    expect(buzz.mock.calls[0][3]).toBeCloseTo(0.4, 6);
    expect(buzz.mock.calls[1][3]).toBeCloseTo(1, 6);
  });
});

describe('whether the app can actually make a sound', () => {
  it('is not running before an instrument exists', () => {
    expect(audio.running).toBe(false);
  });

  it('is running once loaded, with the clock going', () => {
    audio.ready = true;
    expect(audio.running).toBe(true);
  });

  it('is NOT running when the clock has been suspended under it', () => {
    // The whole bug in one assertion. `ready` stays true — an instrument is
    // loaded and the UI used to report exactly this — but every note scheduled
    // onto a suspended context is silent.
    audio.ready = true;
    rawContext.state = 'suspended';
    expect(audio.ready).toBe(true);
    expect(audio.running).toBe(false);
  });

  it('comes back when the clock does', () => {
    audio.ready = true;
    rawContext.state = 'suspended';
    expect(audio.running).toBe(false);
    rawContext.state = 'running';
    expect(audio.running).toBe(true);
  });

  it('assumes the best when the context will not say', () => {
    // jsdom, and any browser too old to report state. Refusing to make a sound
    // because we could not confirm the clock would be worse than the bug.
    audio.ready = true;
    const previous = rawContext.state;
    delete rawContext.state;
    expect(audio.running).toBe(true);
    rawContext.state = previous;
  });
});

describe('notes that were asked for and not sounded', () => {
  it('counts a note dropped because nothing is loaded', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    audio.play(60);
    expect(audio.notesDropped).toBe(1);
  });

  it('counts a note the instrument refused', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    audio.ready = true;
    audio.instrument = {
      triggerAttackRelease: () => {
        throw new Error('Start time must be strictly greater than previous start time');
      },
    };
    audio.play(60);
    audio.play(62);
    expect(audio.notesDropped).toBe(2);
  });

  it('counts nothing when the note sounds', () => {
    audio.ready = true;
    audio.instrument = sounding();
    audio.play(60);
    expect(audio.notesDropped).toBe(0);
    expect(audio.instrument.triggerAttackRelease).toHaveBeenCalled();
  });

  it('says so once rather than once per note', () => {
    // The reference scheduler asks for hundreds a minute. A console line each
    // buries the first one, which is the only interesting one.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 40; i += 1) audio.play(60 + (i % 12));
    expect(audio.notesDropped).toBe(40);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

/**
 * The output level.
 *
 * A meter is a readout, and the rule a readout has to obey is that it can
 * never stop the instrument working. Adding this one unguarded threw on a Tone
 * build without `Meter` and took the whole boot down with it — no instrument,
 * no sound, for a decoration. These pin the guard in place.
 */
describe('the output level', () => {
  it('is nothing when the clock is not running', () => {
    audio.ready = false;
    expect(audio.level).toBe(0);
  });

  it('is nothing when there is no meter at all', () => {
    audio.ready = true;
    const meter = audio.meter;
    audio.meter = null;
    expect(audio.level).toBe(0);
    audio.meter = meter;
  });

  it('normalises decibels onto 0..1', () => {
    audio.ready = true;
    audio.meter = { getValue: () => -60 };
    expect(audio.level).toBe(0);
    audio.meter = { getValue: () => 0 };
    expect(audio.level).toBe(1);
    audio.meter = { getValue: () => -30 };
    expect(audio.level).toBeCloseTo(0.5, 6);
  });

  it('clamps anything outside the range rather than overflowing the bar', () => {
    audio.ready = true;
    audio.meter = { getValue: () => -200 };
    expect(audio.level).toBe(0);
    audio.meter = { getValue: () => 12 };
    expect(audio.level).toBe(1);
  });

  it('takes the loudest channel when the meter reports several', () => {
    audio.ready = true;
    audio.meter = { getValue: () => [-60, -30] };
    expect(audio.level).toBeCloseTo(0.5, 6);
  });

  it('survives a meter reporting nothing usable', () => {
    // -Infinity is what a silent bus reports, and NaN is what a broken one
    // does. Neither may reach a style attribute.
    audio.ready = true;
    audio.meter = { getValue: () => -Infinity };
    expect(audio.level).toBe(0);
    audio.meter = { getValue: () => NaN };
    expect(audio.level).toBe(0);
  });
});
