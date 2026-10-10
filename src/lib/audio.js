/**
 * audio.js — the sound engine.
 *
 * Instruments are pluggable, tried in priority order:
 *
 *   1. A LOCAL SAMPLE PACK you drop into `public/samples/<pack>/` with a
 *      `manifest.json`. This is the hook for your own studio instrument
 *      collection — browsers cannot host VST/AU plugins (they're native code
 *      with no web sandbox), but they can play the same multisampled WAVs the
 *      VST ships with. See public/samples/README.md for the layout.
 *   2. Salamander Grand Piano over CDN (good sampled acoustic grand).
 *   3. Pure Web Audio synthesis — always available, works offline.
 *
 * Everything routes through one output chain so levels stay sane:
 *   instrument -> reverb -> masterGain -> destination
 */

import * as Tone from 'tone';
import { buildDrumVoice } from './drumVoice.js';
import { getSamplePack } from './vault.js';

const INSTRUMENT_SOURCES = {
  IMPORTED: 'imported-pack',
  LOCAL: 'local-pack',
  CDN: 'salamander-cdn',
  SYNTH: 'synth',
};

const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';
const SALAMANDER_SAMPLES = {
  A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
  A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
  A7: 'A7.mp3', C8: 'C8.mp3',
};

const midiToName = (midi) => Tone.Frequency(midi, 'midi').toNote();
const VOICES = ['piano', 'guitar', 'bass', 'violin', 'cello', 'drums'];

/**
 * The plucked voices. A steel-strung guitar rings on and is bright; a bass
 * has a heavy fundamental under little else, and is louder because low notes
 * read as quieter than they are.
 */
const PLUCKED = Object.freeze({
  guitar: { label: 'Guitar', partials: [1, 0.45, 0.2, 0.08, 0.035], decay: 1.15, release: 0.35, volume: -12 },
  bass: { label: 'Bass', partials: [1, 0.5, 0.22, 0.1, 0.04], decay: 1.6, release: 0.3, volume: -6 },
});

/** The bowed voices, the same instrument at two sizes: the larger one is darker and slower to speak. */
const BOWED = Object.freeze({
  violin: { label: 'Violin', cutoff: 3000, vibrato: [5.6, 0.08], partials: [1, 0.5, 0.36, 0.26, 0.2, 0.15, 0.12, 0.09, 0.06], attack: 0.06, release: 0.4, volume: -14 },
  cello: { label: 'Cello', cutoff: 1500, vibrato: [4.8, 0.06], partials: [1, 0.62, 0.42, 0.3, 0.2, 0.14, 0.1, 0.07], attack: 0.09, release: 0.55, volume: -10 },
});

class AudioEngine {
  constructor() {
    this.ready = false;
    /** Notes asked for and not sounded — see `_drop`. */
    this.notesDropped = 0;
    this.instrument = null;
    this.source = null;
    this.sourceLabel = 'not loaded';
    this.master = null;
    this.reverb = null;
    this.cueGain = null;
    this._loadPromise = null;
    this._listeners = new Set();
    this._importedUrls = [];
    this.instrumentType = 'piano';
    this._upgradeGeneration = 0;
  }

  /** Fires when the active instrument changes, so the UI can relabel itself. */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    for (const fn of this._listeners) fn(this);
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  async start() {
    // Nudge the audio clock synchronously, before any await, so the resume
    // happens inside the click or key press that called us. This matters when
    // the engine was first booted outside a gesture — by a note from a MIDI
    // controller, say. That boot's resume is left pending by the browser, and
    // without this every later click would just await that same stuck promise:
    // the keys light up, the engine never makes a sound.
    this._kickClock();
    if (this.ready) {
      // A context can be suspended again by the browser (tab hidden, or the
      // first boot happened outside a gesture). Loading the instrument once is
      // not enough; the clock has to be running or every note is silent.
      await this._resume();
      return this;
    }
    if (!this._loadPromise) this._loadPromise = this._boot();
    return this._loadPromise;
  }

  /**
   * Get the audio clock going again.
   *
   * Public because a suspended clock is not only a start-up condition. A
   * browser will suspend the context when the tab goes to the background, and
   * on some it never really started, and in both cases every note scheduled
   * onto it is silent while the rest of the app carries on as though nothing
   * is wrong.
   */
  async resume() {
    await this._resume();
    this._notify();
    return this.running;
  }

  _kickClock() {
    try {
      const raw = Tone.getContext?.()?.rawContext;
      if (raw && raw.state !== 'running' && typeof raw.resume === 'function') raw.resume().catch(() => {});
    } catch {
      /* no context yet, or jsdom — nothing to resume */
    }
  }

  async _resume() {
    try {
      const ctx = Tone.getContext?.();
      const state = ctx?.rawContext?.state ?? ctx?.state;
      if (state && state !== 'running') await Tone.start();
    } catch (err) {
      console.warn('[audio] could not resume the audio clock:', err.message);
    }
  }

  /**
   * True when the instrument is loaded *and* the audio clock is running.
   *
   * The distinction this draws is the whole point of it. `ready` goes true as
   * soon as an instrument object exists, which it does within a frame of boot —
   * it says nothing about whether a note played through it would be heard. A
   * suspended clock swallows everything scheduled onto it in silence.
   *
   * This getter was written with that comment above it and then never called
   * anywhere: the top bar reported `ready`, so the app could show a green light
   * next to "Mini Grand" while the reference playback it was scheduling made no
   * sound at all. Whatever drives the audio indicator must read this, not
   * `ready`.
   *
   * A context that reports no state at all is assumed fine — that is jsdom and
   * any browser too old to expose it, and refusing to make a sound because we
   * could not confirm the clock would be worse than the bug.
   */
  get running() {
    if (!this.ready) return false;
    const ctx = Tone.getContext?.();
    const state = ctx?.rawContext?.state ?? ctx?.state;
    return state === undefined || state === 'running';
  }

  async _boot() {
    await Tone.start();
    Tone.getContext().lookAhead = 0.02; // tight enough for live feedback

    this.master = new Tone.Gain(0.9).toDestination();
    /**
     * A real meter on the real output.
     *
     * The studio-look work wanted a signal indicator on the instrument strip
     * and I left it out rather than animate something decorative — a level
     * display that is not reading a level is a lie with a nice gradient on it.
     * This reads the master bus, so it moves when and only when sound is
     * actually leaving the app, which also makes it the most direct answer
     * there is to "is anything coming out of this thing".
     */
    // Guarded, and the guard is the point: a level display is a readout, and a
    // readout must never be able to stop the instrument working. Unwrapped,
    // this threw on a Tone build without Meter and took the whole boot with it
    // — no instrument, no sound, for a decoration.
    try {
      this.meter = new Tone.Meter({ smoothing: 0.8 });
      this.master.connect(this.meter);
    } catch (err) {
      this.meter = null;
      console.warn('[audio] no output meter on this build:', err.message);
    }
    this.reverb = new Tone.Reverb({ decay: 1.8, wet: 0.16 }).connect(this.master);
    this.cueGain = new Tone.Gain(0.5).connect(this.master);
    this._buildCues();

    // Come up on the offline synth first. Sampled pianos are megabytes of
    // downloads, and waiting for them before reporting ready means the app
    // sits mute after you click "enable sound" — on a slow link, for fifteen
    // seconds with nothing to show for it. The synth is instant, so the very
    // first key press makes a noise; the good piano swaps itself in later.
    this._install(this._buildVoice(this.instrumentType));
    this.ready = true;
    this._watchClock();
    this._notify();
    if (this.instrumentType === 'piano') this._upgrade();
    return this;
  }

  /**
   * Tell the app when the clock stops and starts.
   *
   * Without this nothing ever re-reads `running`, so a context suspended after
   * boot leaves the UI reporting sound it is no longer making. The listener is
   * on the raw AudioContext because that is what actually fires statechange;
   * Tone's wrapper does not forward it.
   */
  _watchClock() {
    const raw = Tone.getContext?.()?.rawContext;
    if (!raw?.addEventListener) return;
    raw.addEventListener('statechange', () => this._notify());
  }

  /** Swap in a better instrument without cutting off whatever is sounding. */
  _install(next) {
    if (!next) return false;
    const previous = this.instrument;
    this.instrument = next.instrument;
    this.source = next.source;
    this.sourceLabel = next.label;
    if (previous) {
      try {
        previous.releaseAll?.();
      } catch {
        /* nothing held */
      }
      setTimeout(() => previous.dispose?.(), 2000);
    }
    return true;
  }

  /** Background hunt for a sampled piano, best source first. */
  async _upgrade() {
    if (this.instrumentType !== 'piano') return;
    const generation = ++this._upgradeGeneration;
    const attempts = [
      () => this._loadImportedPack(),
      () => this._loadLocalPack(),
      () => this._loadSalamander(),
    ];
    for (const attempt of attempts) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const better = await attempt();
        if (generation !== this._upgradeGeneration || this.instrumentType !== 'piano') {
          better?.instrument?.dispose?.();
          return;
        }
        if (better) {
          this._install(better);
          this._notify();
          return;
        }
      } catch (err) {
        console.warn('[audio] instrument source failed, staying on the fallback:', err.message);
      }
    }
  }

  /**
   * A pack the player dropped onto the app, held in IndexedDB. Preferred over
   * the checked-in folder because it is the one they chose deliberately —
   * bounced out of their own plugin, most likely.
   */
  async _loadImportedPack() {
    const pack = await getSamplePack();
    if (!pack?.files || Object.keys(pack.files).length === 0) return null;

    // Object URLs rather than data URIs: a sampled piano is tens of megabytes
    // and base64 would inflate it by a third before decoding.
    this._revokeImportedUrls();
    const urls = {};
    for (const [note, blob] of Object.entries(pack.files)) {
      const url = URL.createObjectURL(blob);
      this._importedUrls.push(url);
      urls[note] = url;
    }

    const sampler = new Tone.Sampler({ urls, baseUrl: '', release: pack.release ?? 1.1 }).connect(
      this.reverb,
    );
    await Tone.loaded();

    return {
      instrument: sampler,
      source: INSTRUMENT_SOURCES.IMPORTED,
      label: pack.name ?? 'Your sample pack',
    };
  }

  _revokeImportedUrls() {
    for (const url of this._importedUrls) URL.revokeObjectURL(url);
    this._importedUrls = [];
  }

  /** Re-scan for an imported pack after one is dropped in, without a reload. */
  async reloadInstrument() {
    if (!this.ready) return this;
    await this._upgrade();
    return this;
  }

  async _loadLocalPack() {
    const res = await fetch('/samples/manifest.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    // The pack is optional. A dev server answers a missing file with the app's
    // HTML page and a 200, which is "no pack here", not a broken manifest.
    if (/text\/html/i.test(res.headers?.get?.('content-type') ?? '')) return null;
    const manifest = await res.json();
    if (!manifest?.samples || Object.keys(manifest.samples).length === 0) return null;

    const sampler = new Tone.Sampler({
      urls: manifest.samples,
      baseUrl: manifest.baseUrl ?? '/samples/',
      release: manifest.release ?? 1,
      attack: manifest.attack ?? 0,
    }).connect(this.reverb);
    await Tone.loaded();

    return {
      instrument: sampler,
      source: INSTRUMENT_SOURCES.LOCAL,
      label: manifest.name ?? 'Local sample pack',
    };
  }

  async _loadSalamander() {
    const sampler = new Tone.Sampler({
      urls: SALAMANDER_SAMPLES,
      baseUrl: SALAMANDER_BASE,
      release: 1.2,
    }).connect(this.reverb);

    // Don't hang forever on a slow/absent network.
    await Promise.race([
      Tone.loaded(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('sample download timed out')), 20000)),
    ]);

    return {
      instrument: sampler,
      source: INSTRUMENT_SOURCES.CDN,
      label: 'Salamander Grand Piano',
    };
  }

  _buildSynth() {
    // Layered FM-ish piano: a bright bell partial over a body tone. Not a
    // Steinway, but musical and completely offline.
    const synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 32,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.004, decay: 1.4, sustain: 0.08, release: 1.1 },
      volume: -8,
    }).connect(this.reverb);
    return {
      instrument: synth,
      source: INSTRUMENT_SOURCES.SYNTH,
      label: 'Web Audio synth (offline)',
    };
  }

  /** Select a voice without touching the clock, scheduler, input or scoring. */
  setInstrumentType(type) {
    const next = VOICES.includes(type) ? type : 'piano';
    if (next === this.instrumentType) return;
    this.instrumentType = next;
    ++this._upgradeGeneration;
    if (!this.ready) return;
    this.releaseAll();
    this._install(this._buildVoice(next));
    this._notify();
    if (next === 'piano') this._upgrade();
  }

  /** A plucked string, offline: a few partials and an envelope that only dies away. */
  _buildPlucked(type) {
    const voice = PLUCKED[type];
    const instrument = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 16,
      oscillator: { type: 'custom', partials: voice.partials },
      envelope: { attack: 0.002, decay: voice.decay, sustain: 0, release: voice.release },
      volume: voice.volume,
    }).connect(this.reverb);
    return { instrument, source: INSTRUMENT_SOURCES.SYNTH, label: `${voice.label} · synthesized` };
  }

  _buildVoice(type) {
    if (type in PLUCKED) return this._buildPlucked(type);
    if (type in BOWED) return this._buildBowed(type);
    if (type === 'drums') return { instrument: buildDrumVoice(Tone, this.reverb), source: INSTRUMENT_SOURCES.SYNTH, label: 'Drums · synthesized' };
    return this._buildSynth();
  }

  /**
   * A bowed string, offline: a bright sawtooth-like spectrum (the bow's
   * buzz) under a low-pass (the wooden body), a slow attack, a held sustain
   * for as long as the bow moves, and a gentle vibrato from the left hand.
   */
  _buildBowed(type) {
    const voice = BOWED[type];
    const filter = new Tone.Filter({ type: 'lowpass', frequency: voice.cutoff, Q: 0.7 }).connect(this.reverb);
    const vibrato = new Tone.Vibrato({ frequency: voice.vibrato[0], depth: voice.vibrato[1] }).connect(filter);
    const instrument = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: { type: 'custom', partials: voice.partials },
      envelope: { attack: voice.attack, decay: 0.25, sustain: 0.82, release: voice.release },
      volume: voice.volume,
    }).connect(vibrato);
    // _install disposes the old voice; take the effects it feeds with it.
    const chain = [vibrato, filter];
    const disposeSynth = instrument.dispose.bind(instrument);
    instrument._chain = chain;
    instrument.dispose = () => { disposeSynth(); chain.forEach(part => part.dispose()); return instrument; };
    return { instrument, source: INSTRUMENT_SOURCES.SYNTH, label: `${voice.label} · synthesized` };
  }

  /* ------------------------------------------------------------- playback */

  /**
   * @param {number} midi
   * @param {number} [durationSec]
   * @param {number} [when] absolute Tone time; defaults to now
   * @param {number} [velocity] 0..1
   */
  play(midi, durationSec = 0.6, when = undefined, velocity = 0.8) {
    if (!this.instrument) {
      this._drop('no instrument loaded');
      return;
    }
    const time = when ?? Tone.now();
    try {
      this.instrument.triggerAttackRelease(
        midiToName(midi),
        Math.max(0.05, durationSec),
        time,
        Math.min(1, Math.max(0.05, velocity)),
      );
    } catch (err) {
      // Overlapping identical notes can throw on Sampler, and that really is
      // harmless. What is not harmless is the way this used to be recorded:
      // console.debug sits under Chrome's Verbose level and is hidden by
      // default, so a fault that silenced *every* scheduled note looked
      // exactly like a fault that silenced one — which is to say, like nothing
      // at all, on a screen still showing a green light.
      this._drop(err.message);
    }
  }

  /**
   * A note that was asked for and not sounded.
   *
   * Counted rather than logged per occurrence: the reference scheduler can ask
   * for hundreds a minute, and a console line each would bury the first one,
   * which is the only interesting one. `notesDropped` is what an indicator
   * should watch — if it is climbing while a run is playing, the app is
   * playing to itself.
   */
  _drop(reason) {
    this.notesDropped += 1;
    if (this.notesDropped === 1 || this.notesDropped % 100 === 0) {
      console.warn(
        `[audio] ${this.notesDropped} note(s) asked for but not sounded — ${reason}`,
      );
    }
  }

  attack(midi, velocity = 0.8) {
    if (!this.instrument) return;
    this.instrument.triggerAttack(midiToName(midi), Tone.now(), velocity);
  }

  release(midi) {
    if (!this.instrument) return;
    try {
      this.instrument.triggerRelease(midiToName(midi), Tone.now());
    } catch {
      /* PolySynth throws if the voice already released */
    }
  }

  releaseAll() {
    if (!this.instrument) return;
    try {
      this.instrument.releaseAll?.();
    } catch {
      /* noop */
    }
  }

  setVolume(db) {
    if (this.master) this.master.gain.rampTo(Tone.dbToGain(db), 0.05);
  }

  /* ------------------------------------------------------------ error cues */

  /**
   * The four blips, built once.
   *
   * Every one of these used to be constructed fresh per sound, connected into
   * the graph, played for around a tenth of a second and disposed on a timer:
   * a whole `MembraneSynth` per metronome beat, a whole `PolySynth` per wrong
   * note. That is the most expensive possible way to make a click. Constructing
   * a Tone instrument walks a defaults tree through `deepMerge`, allocates
   * several native audio nodes and wires them up, all on the main thread, and
   * then hands the lot to the garbage collector 500 ms later.
   *
   * It was measurable and it was exactly what "sometimes it lags while I'm
   * practising" meant. Profiled against the production build over fourteen
   * seconds of playing (`scripts/profile.mjs`), with the click on and error
   * cues on: seven main-thread stalls between 53 and 77 ms, 17.5% of frames
   * over budget, 99th-percentile frame 101 ms. With both off: no stalls at all,
   * 5.6% of frames over budget, 99th percentile 41 ms. Same build, same input.
   *
   * Nothing here needs to be per-sound. A synth is an instrument, not a note —
   * so these are built at boot and retriggered, and the parts that did vary per
   * sound are expressed as velocity, which is per-trigger anyway.
   */
  _buildCues() {
    // Dry, dull thud — "you skipped something".
    this.thud = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
      volume: -22,
    }).connect(this.cueGain);

    this.tick = new Tone.MetalSynth({
      frequency: 520,
      envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
      harmonicity: 3.1,
      resonance: 1200,
      volume: -30,
    }).connect(this.cueGain);

    // Wrong note: a detuned dyad whose interval gets nastier with severity.
    // Held at the top of its old volume range so severity can come off the
    // velocity instead — an 8 dB spread is 0.4 to 1.0 of full scale.
    this.buzz = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.08 },
      volume: -18,
    }).connect(this.cueGain);

    // Accent was 6 dB over the beat, which is half amplitude — so the accent
    // trigger is velocity 1 and the others 0.5.
    this.click = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.09, sustain: 0 },
      volume: -14,
    }).connect(this.cueGain);
  }

  /**
   * Audio feedback for a mistake. Severity drives how ugly it sounds, so a
   * wrong-octave slip and a fully out-of-key clang are distinguishable
   * without looking at the screen.
   *
   * Two of these three voices are monophonic, so cues landing together
   * retrigger rather than stack. At sixty to a hundred and forty milliseconds
   * apiece that is inaudible, and it is the correct behaviour anyway: eight
   * missed notes in a chord should be one thud, not eight.
   */
  errorCue(kind, severity = 0.6) {
    if (!this.ready || !this.click) return;
    const now = Tone.now();

    if (kind === 'missed') {
      this.thud.triggerAttackRelease(0.1, now);
      return;
    }
    if (kind === 'timing') {
      this.tick.triggerAttackRelease(0.05, now);
      return;
    }

    this.buzz.set({ detune: 10 + severity * 60 });
    const base = 180 + severity * 60;
    this.buzz.triggerAttackRelease(
      [base, base * (severity > 0.7 ? 1.06 : 1.5)],
      0.14,
      now,
      0.4 + severity * 0.6,
    );
  }

  metronomeTick(accent = false, when = undefined) {
    if (!this.ready || !this.click) return;
    this.click.triggerAttackRelease(accent ? 'C5' : 'G4', 0.03, when ?? Tone.now(), accent ? 1 : 0.5);
  }

  /**
   * Current output level, 0..1, or 0 when nothing is running.
   *
   * Tone reports decibels; -60 dB is the floor below which nothing is worth
   * showing and 0 dB is the ceiling. Callers get a normalised number so no UI
   * has to know about decibels to draw a bar.
   */
  get level() {
    if (!this.meter || !this.running) return 0;
    const db = this.meter.getValue();
    const value = Array.isArray(db) ? Math.max(...db) : db;
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, (value + 60) / 60));
  }

  /** Absolute audio-clock time, used to schedule reference playback ahead. */
  get now() {
    return Tone.now();
  }
}

export const audio = new AudioEngine();
