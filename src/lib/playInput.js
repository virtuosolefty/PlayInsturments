import { audio } from './audio.js';
import { emitSyntheticMidi } from './midiInput.js';

/** Owns screen/typing voices, including releases that arrive before audio unlock. */
export class PlayInput {
  constructor(start, emit) {
    this.start = start;
    this.emit = emit;
    this.held = new Map();
    this.starting = new Set();
    this.tails = new Set();
    this.sustained = false;
    this.error = () => {};
  }
  _sounding(midi, except = null) {
    return [...this.held.values(), ...this.tails].some(voice => voice !== except && voice.midi === midi && voice.sounding);
  }
  _cancelStarting(match) {
    for (const voice of this.starting) if (match(voice.id)) voice.cancelled = true;
  }
  _finishTail(voice) {
    clearTimeout(voice.timer);
    this.tails.delete(voice);
    if (voice.emitted && !this._sounding(voice.midi, voice)) {
      this.emit({ type: 'noteoff', midi: voice.midi, velocity: 0, ...voice.extra });
    }
  }
  _playReleasedTap(voice) {
    const shared = this._sounding(voice.midi, voice);
    voice.sounding = true;
    voice.emitted = !shared;
    this.tails.add(voice);
    if (!shared) this.emit({ type: 'noteon', midi: voice.midi, velocity: voice.velocity, ...voice.extra });
    voice.timer = setTimeout(() => this._finishTail(voice), 140);
  }
  async press(id, midi, velocity = 0.72, extra = {}) {
    this._cancelStarting(candidate => candidate === id);
    this.release(id, { cancelPending: true });
    const voice = { id, midi, velocity, extra, sounding: false, released: false, cancelled: false };
    this.held.set(id, voice);
    this.starting.add(voice);
    try {
      await this.start();
      this.starting.delete(voice);
      if (voice.cancelled) return;
      if (this.held.get(id) !== voice) {
        if (voice.released) this._playReleasedTap(voice);
        return;
      }
      const shared = this._sounding(midi, voice);
      voice.sounding = true;
      if (!shared) this.emit({ type: 'noteon', midi, velocity, ...extra });
    } catch (e) {
      this.starting.delete(voice);
      if (this.held.get(id) === voice) this.held.delete(id);
      this.error(e);
    }
  }
  release(id, { cancelPending = false } = {}) {
    const voice = this.held.get(id); if (!voice) return;
    this.held.delete(id);
    if (!voice.sounding) {
      voice.released = true;
      voice.cancelled = cancelPending;
      return;
    }
    if (!this._sounding(voice.midi, voice)) this.emit({ type: 'noteoff', midi: voice.midi, velocity: 0, ...voice.extra });
  }
  releasePrefix(prefix) {
    this._cancelStarting(id => id.startsWith(prefix));
    for (const [id] of [...this.held]) if (id.startsWith(prefix)) this.release(id, { cancelPending: true });
    for (const voice of [...this.tails]) if (voice.id.startsWith(prefix)) this._finishTail(voice);
  }
  sustain(value) { this.sustained = value; this.emit({ type: 'sustain', value }); }
  clear() {
    this._cancelStarting(() => true);
    const sounding = new Map();
    for (const voice of [...this.held.values(), ...this.tails]) if (voice.sounding) sounding.set(voice.midi, voice.extra);
    this.held.clear();
    for (const voice of this.tails) clearTimeout(voice.timer);
    this.tails.clear();
    for (const [midi, extra] of sounding) this.emit({ type: 'noteoff', midi, velocity: 0, ...extra });
    if (this.sustained) this.sustain(false);
  }
}
export const playInput = new PlayInput(() => audio.start(), emitSyntheticMidi);
