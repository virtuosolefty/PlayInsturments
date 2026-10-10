import { QUIET, detectPitch } from './pitch.js';

/**
 * micInput.js — listening to a real instrument through the microphone.
 *
 * One microphone, shared by whoever wants it: the tuner (TunerDialog.jsx) and
 * the note input (useMicInput.js) each `hold` it while they need it, and it is
 * released when the last one lets go. About thirty times a second it reads a
 * tenth of a second of sound (`listenPlan`) and reports its pitch (pitch.js).
 *
 * The sound is analysed in the browser and then forgotten. Nothing is
 * recorded, stored or sent anywhere.
 *
 * The browser is asked to cancel the app's own sound out of what the
 * microphone hears, so a demonstration played through the speakers is not
 * taken for the player's notes. It is asked not to suppress noise or level the
 * volume: both are made for speech, and treat a long held note as a noise to
 * be removed.
 */

export const MIC_STATUS = Object.freeze({ OFF: 'off', STARTING: 'starting', ON: 'on', DENIED: 'denied', UNSUPPORTED: 'unsupported', ERROR: 'error' });

const CONSTRAINTS = Object.freeze({ audio: Object.freeze({ echoCancellation: true, noiseSuppression: false, autoGainControl: false }) });
/** How often the sound is read, in milliseconds. */
const INTERVAL_MS = 30;
/** An audio clock is asked to wake no more often than this, in milliseconds. */
const WAKE_EVERY_MS = 1000;

/**
 * How much sound to read at a time, for the rate the sound card runs at.
 *
 * At the usual rates that is 4096 samples, 85 to 93 ms: long enough for two
 * cycles of a bass guitar's low E. A card running at twice or four times
 * that has its samples thinned back to about 48 kHz first (`step`), or the
 * same 4096 would be too short for a low note and the search would cost
 * several times as much. A slow one (a wireless headset's 16 kHz) is read
 * 2048 at a time, so a note is not a quarter of a second old when it is heard.
 *
 * @returns {{ step: number, rate: number, size: number, fftSize: number, latencyMs: number }}
 *   `fftSize` is what the browser is asked for, always a power of two; `rate` and `size` are what
 *   pitch.js is given after thinning; `latencyMs` is how long ago a note really began by the time it
 *   is reported: half the stretch it is measured over, and one more reading to be sure of it
 *   (noteTracker.js). The note is stamped that much earlier, so that playing in time is judged in time.
 */
export function listenPlan(sampleRate) {
  const step = sampleRate > 60000 ? 2 ** Math.round(Math.log2(sampleRate / 48000)) : 1;
  const rate = sampleRate / step;
  const size = rate <= 24000 ? 2048 : 4096;
  return { step, rate, size, fftSize: size * step, latencyMs: Math.round((size / 2 / rate) * 1000 + INTERVAL_MS) };
}

/** The latency at the usual 48 kHz: what is assumed until a microphone is on and its own is known. */
export const MIC_LATENCY_MS = listenPlan(48000).latencyMs;

/** Every `step` samples of `raw` averaged into one of `out`. */
function thin(raw, step, out) {
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let k = 0; k < step; k++) sum += raw[i * step + k];
    out[i] = sum / step;
  }
  return out;
}

/** Lowest and highest notes a piano has: what to listen for when the instrument has no strings to go by. */
const PIANO = Object.freeze({ lowest: 21, highest: 108 });

/**
 * The notes worth listening for on an instrument: from just under its lowest
 * string to two octaves above its highest. Anything else heard is a voice, a
 * door or an overtone, not a note played.
 *
 * @param {{ tuning: number[] } | null} kit a string kit (instruments.js), or null for the piano
 */
export function micRange(kit) {
  if (!kit?.tuning?.length) return { ...PIANO };
  return { lowest: Math.min(...kit.tuning) - 2, highest: Math.max(...kit.tuning) + 24 };
}

const WHY = Object.freeze({
  NotAllowedError: null, // the person said no: its own status, not an error
  NotFoundError: 'No microphone was found. Plug one in, or check that this device has one.',
  NotReadableError: 'The microphone is in use by another program. Close it there and try again.',
});

const browser = () => ({
  getUserMedia: globalThis.navigator?.mediaDevices?.getUserMedia ? constraints => navigator.mediaDevices.getUserMedia(constraints) : null,
  createContext: () => new (globalThis.AudioContext ?? globalThis.webkitAudioContext)(),
  now: () => performance.now(),
  every: (fn, ms) => setInterval(fn, ms),
  cancel: id => clearInterval(id),
  // Calls `fn` at the next click or key press, which is when a browser lets sound start. Returns a way to stop waiting.
  atGesture: fn => {
    const once = () => { stop(); fn(); };
    const stop = () => { for (const type of ['pointerdown', 'keydown']) window.removeEventListener(type, once, true); };
    for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, once, true);
    return stop;
  },
});

export class MicInput {
  /** @param {object} [deps] the browser's microphone, audio clock and timers; given by tests */
  constructor(deps = null) {
    this.deps = deps;
    this.status = MIC_STATUS.OFF;
    this.error = null;
    this.started = Promise.resolve();
    this.holders = new Set();
    this.changeListeners = new Set();
    this.pitchListeners = new Set();
    this.live = null;
    /** How long ago a note began by the time it is reported, for the microphone now on (`listenPlan`). */
    this.latencyMs = MIC_LATENCY_MS;
    // Counts starts and stops, so a start that was overtaken while the browser was still asking can tell.
    this.attempt = 0;
  }

  /** Told `{ status, error }` whenever either changes. Returns a way to stop. */
  onChange(fn) { this.changeListeners.add(fn); return () => this.changeListeners.delete(fn); }
  /** Told `{ hz, clarity, rms, at }` for each reading while the microphone is on. Returns a way to stop. */
  onPitch(fn) { this.pitchListeners.add(fn); return () => this.pitchListeners.delete(fn); }

  _set(status, error = null) {
    this.status = status;
    this.error = error;
    for (const fn of [...this.changeListeners]) fn({ status, error });
  }

  /**
   * Keeps the microphone on for as long as `who` needs it, starting it if it
   * is off. Returns the function that lets go; the microphone is released
   * when nobody holds it.
   */
  hold(who) {
    this.holders.add(who);
    if (this.status === MIC_STATUS.OFF) this.started = this._start();
    return () => {
      if (!this.holders.delete(who)) return;
      if (!this.holders.size) this._stop(MIC_STATUS.OFF);
    };
  }

  /** Asks again after a refusal or a fault, if anyone is still waiting. */
  retry() {
    if (this.status === MIC_STATUS.ON || this.status === MIC_STATUS.STARTING || !this.holders.size) return this.started;
    this.started = this._start();
    return this.started;
  }

  async _start() {
    const deps = this.deps ?? browser();
    if (!deps.getUserMedia) { this._set(MIC_STATUS.UNSUPPORTED); return; }
    const attempt = ++this.attempt;
    this._set(MIC_STATUS.STARTING);
    let stream = null, context = null, stopWaiting = () => {};
    const wake = () => { context?.resume?.()?.catch?.(() => {}); };
    try {
      stream = await deps.getUserMedia(CONSTRAINTS);
      context = deps.createContext();
      // A page that has made no sound yet may get a sleeping audio clock, which hears nothing. Some browsers
      // wake it for a page that is listening; others only at a click or a key press. So it is asked now, and
      // again at the next one, and the microphone does not wait: until it wakes there is simply silence.
      if (context.state === 'suspended') {
        wake();
        stopWaiting = deps.atGesture?.(wake) ?? stopWaiting;
      }
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      context?.close?.();
      if (attempt !== this.attempt) return;
      if (error?.name === 'NotAllowedError') this._set(MIC_STATUS.DENIED);
      else this._set(MIC_STATUS.ERROR, WHY[error?.name] ?? `The microphone could not be started: ${error?.message ?? 'unknown fault'}.`);
      return;
    }
    const release = () => { stopWaiting(); stream.getTracks().forEach(track => track.stop()); context.close?.(); };
    // Everyone let go while the browser was still asking, or it was asked again since: this microphone is not wanted.
    if (attempt !== this.attempt) { release(); return; }

    // Permission was given, but the browser can still refuse to join this microphone to this audio clock.
    // Whatever goes wrong from here, the microphone must not be left on with nothing able to turn it off.
    let timer = null;
    try {
      const plan = listenPlan(context.sampleRate);
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = plan.fftSize;
      source.connect(analyser);
      const raw = new Float32Array(plan.fftSize), thinned = plan.step > 1 ? new Float32Array(plan.size) : raw;
      let woken = deps.now();
      timer = deps.every(() => {
        const now = deps.now();
        // A clock that fell asleep after starting (a phone call, the tab put away) hears nothing until it is woken.
        if (context.state === 'suspended' && now - woken >= WAKE_EVERY_MS) { woken = now; wake(); }
        analyser.getFloatTimeDomainData(raw);
        const samples = plan.step > 1 ? thin(raw, plan.step, thinned) : raw;
        const frame = { ...detectPitch(samples, plan.rate, { silence: QUIET }), at: now };
        for (const fn of [...this.pitchListeners]) fn(frame);
      }, INTERVAL_MS);
      this.latencyMs = plan.latencyMs;
    } catch (error) {
      if (timer !== null) deps.cancel(timer);
      release();
      this._set(MIC_STATUS.ERROR, `The microphone could not be set up: ${error?.message ?? 'unknown fault'}.`);
      return;
    }
    this.live = { release, stop: () => deps.cancel(timer) };
    for (const track of stream.getTracks()) track.onended = () => this._stop(MIC_STATUS.ERROR, 'The microphone was disconnected.');
    this._set(MIC_STATUS.ON);
  }

  _stop(status, error = null) {
    this.attempt += 1;
    const live = this.live;
    this.live = null;
    if (live) { live.stop(); live.release(); }
    if (this.status !== status || this.error !== error) this._set(status, error);
  }
}

export const micInput = new MicInput();
