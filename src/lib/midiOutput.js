/**
 * midiOutput.js — letting something else be the instrument.
 *
 * A browser cannot host a VST or AU plugin: they are native code expecting a
 * host process, and there is no web sandbox that runs them. What a browser
 * *can* do is send the plugin notes. Open Mini Grand (or any soft synth, or a
 * hardware module) on a MIDI port, point the app at it, and the real instrument
 * makes the sound while the app keeps doing what it is good at — reading your
 * playing and judging it.
 *
 * This is the same arrangement Synthesia offers, and on an MPK Mini it is
 * nearly free: the controller already exposes a port built for AIR plugins.
 */

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const ALL_NOTES_OFF = 123;
const CONTROL_CHANGE = 0xb0;

export class MidiOutputManager {
  constructor() {
    this.access = null;
    this.outputs = [];
    this.selectedId = null;
    this.listeners = new Set();
    /** midi -> true, so a stop can silence exactly what we started. */
    this.sounding = new Map();
    /** Notes handed to a port that did not take them — see `_drop`. */
    this.notesDropped = 0;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() {
    const snapshot = {
      outputs: this.outputs.map((o) => ({ id: o.id, name: o.name, manufacturer: o.manufacturer })),
      selectedId: this.selectedId,
      running: this.running,
    };
    for (const fn of this.listeners) fn(snapshot);
  }

  /** Share the MIDIAccess the input manager already obtained. */
  attach(access) {
    if (!access) return this;
    this.access = access;
    this.refresh();
    return this;
  }

  refresh() {
    if (!this.access) return this;
    this.outputs = [...this.access.outputs.values()];
    if (!this.outputs.some((o) => o.id === this.selectedId)) {
      // Prefer a port that looks like it leads somewhere musical. On an MPK the
      // plugin port is exactly that, and on Windows a loopback cable is the
      // usual way into a plugin host.
      const preferred = this.outputs.find((o) => /plugin|loop|virtual|iac|synth/i.test(o.name ?? ''));
      this.selectedId = (preferred ?? this.outputs[0])?.id ?? null;
    }
    this._notify();
    return this;
  }

  select(id) {
    if (id !== this.selectedId) this.releaseAll();
    this.selectedId = id;
    this._notify();
    return this;
  }

  get port() {
    return this.outputs.find((o) => o.id === this.selectedId) ?? null;
  }

  get available() {
    return this.outputs.length > 0;
  }

  /**
   * True when notes sent right now would actually reach something.
   *
   * `available` says a port exists somewhere; this says the one we are pointed
   * at is still there. The distinction is not academic — the audio engine had
   * exactly this pair conflated, and the result was the app showing a healthy
   * instrument while playing an entire piece in silence. A USB port that was
   * unplugged mid-session leaves a selected id behind that resolves to nothing,
   * and every note after that goes nowhere.
   *
   * A port that will not say what state it is in is assumed fine, for the same
   * reason the audio engine assumes it: refusing to play because we could not
   * confirm would be worse than the bug.
   */
  get running() {
    const port = this.port;
    if (!port) return false;
    return port.state === undefined || port.state !== 'disconnected';
  }

  /**
   * A note handed over and not delivered.
   *
   * Counted rather than logged each time, and warned about once: the scheduler
   * can send hundreds a minute, and a line each would bury the first — which is
   * the only one that tells you when it started going wrong.
   */
  _drop(reason) {
    this.notesDropped += 1;
    if (this.notesDropped === 1 || this.notesDropped % 100 === 0) {
      console.warn(
        `[midi-out] ${this.notesDropped} note(s) sent to the instrument but not delivered — ${reason}`,
      );
    }
  }

  /**
   * Everything below mirrors the AudioEngine's surface — `now`, `play`,
   * `attack`, `release`, `releaseAll` — so the scheduler and the engine can
   * hold either one without knowing which. Times are seconds throughout, as
   * they are for Tone; Web MIDI wants milliseconds, and that conversion happens
   * here and nowhere else.
   */
  get now() {
    return performance.now() / 1000;
  }

  _send(bytes, whenSec) {
    const port = this.port;
    if (!port) {
      this._drop('no output port selected');
      return;
    }
    try {
      port.send(bytes, whenSec === undefined ? undefined : whenSec * 1000);
    } catch (err) {
      // The port really can vanish mid-send on unplug, and that single dropped
      // note is nobody's problem. Every note after it is, and swallowing this
      // without a trace was the only thing standing between "my cable came
      // loose" and half an hour of wondering why the app went quiet.
      this._drop(err.message ?? 'the port rejected it');
    }
  }

  attack(midi, velocity = 0.8, whenSec = undefined, channel = 0) {
    const value = Math.max(1, Math.min(127, Math.round(velocity * 127)));
    this.sounding.set(midi, true);
    this._send([NOTE_ON | (channel & 0x0f), midi & 0x7f, value], whenSec);
  }

  release(midi, whenSec = undefined, channel = 0) {
    this.sounding.delete(midi);
    this._send([NOTE_OFF | (channel & 0x0f), midi & 0x7f, 0], whenSec);
  }

  /**
   * Sound a note for a fixed length. The note-off is scheduled on the port
   * rather than with setTimeout, so a phrase keeps its rhythm even if the main
   * thread stalls.
   */
  play(midi, durationSec = 0.6, whenSec = undefined, velocity = 0.8) {
    const start = whenSec ?? this.now;
    this.attack(midi, velocity, start);
    this._send([NOTE_OFF, midi & 0x7f, 0], start + Math.max(0.05, durationSec));
    // Scheduled ahead, so it is not "sounding now" in the sense releaseAll cares
    // about; the note-off is already queued on the port.
    this.sounding.delete(midi);
  }

  /** Silence everything — on stop, on port change, on unload. */
  releaseAll(channel = 0) {
    for (const midi of [...this.sounding.keys()]) this.release(midi, undefined, channel);
    this._send([CONTROL_CHANGE | (channel & 0x0f), ALL_NOTES_OFF, 0]);
    this.sounding.clear();
  }
}

export const midiOutput = new MidiOutputManager();

export const INSTRUMENT_MODES = {
  INTERNAL: 'internal',
  EXTERNAL: 'external',
};
