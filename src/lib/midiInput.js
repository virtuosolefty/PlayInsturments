/**
 * midiInput.js — Web MIDI plumbing.
 *
 * Handles the MPK Mini and any other class-compliant controller:
 *   - enumerates inputs and survives hot-plug (statechange)
 *   - auto-selects a device whose name looks like an MPK
 *   - normalises running-status / note-on-with-velocity-0 into proper note-offs
 *   - passes through the hardware timestamp so timing scoring is honest
 *   - decodes CC64 (sustain) and the MPK's knobs/pads so they don't look like notes
 */

export const MIDI_STATUS = {
  UNSUPPORTED: 'unsupported',
  DENIED: 'denied',
  IDLE: 'idle',
  READY: 'ready',
  ERROR: 'error',
};

const MIDI_REQUEST_TIMEOUT_MS = 8000;
const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const PITCH_BEND = 0xe0;

/**
 * Multi-port controllers often expose DAW, plug-in and DIN ports alongside
 * the port that carries the keyboard notes. Prefer the playable port instead
 * of whichever vendor-labelled port the browser happens to enumerate first.
 */
export function preferredMidiInput(inputs) {
  const ranked = inputs.map((input, index) => {
    const name = input.name ?? '';
    let score = 0;
    if (/\bmidi(?:\s+\d+)?\s+port\b/i.test(name)) score += 100;
    if (/\bkeyboard\b/i.test(name)) score += 60;
    if (/\bmpk\b|\bakai\b/i.test(name)) score += 20;
    if (/\b(?:daw|plugin|software control|din)\b/i.test(name)) score -= 100;
    return { input, index, score };
  });

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.input ?? null;
}

export class MidiInputManager {
  constructor() {
    this.access = null;
    this.status = MIDI_STATUS.IDLE;
    this.error = null;
    this.inputs = [];
    this.selectedId = null;
    this.handlers = new Set();
    this.deviceListeners = new Set();
    this.accessListeners = new Set();
    this._boundMessage = this._onMessage.bind(this);
    // Name-based picking is a guess. A controller with several ports (MPK mini IV
    // has MIDI, DAW, Plugin and DIN) can leave us listening to one that never
    // carries notes, and then the keys do nothing and nothing says why. So until
    // the chosen port has produced a note, the first real note on any other port
    // moves the selection there — unless the user picked a port themselves.
    this._explicit = false;
    this._selectedHeard = false;
    this._probes = new Map();
  }

  _probeFor(id) {
    if (!this._probes.has(id)) {
      this._probes.set(id, (event) => {
        const [status, , velocity = 0] = event.data;
        if (this._explicit || this._selectedHeard) return;
        if ((status & 0xf0) !== NOTE_ON || velocity === 0) return;
        this._apply(id);
        this._onMessage(event);
      });
    }
    return this._probes.get(id);
  }

  /** Fires with the MIDIAccess once it exists, so outputs can be enumerated. */
  onAccess(fn) {
    this.accessListeners.add(fn);
    if (this.access) fn(this.access);
    return () => this.accessListeners.delete(fn);
  }

  get supported() {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  onMessage(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  onDevicesChanged(fn) {
    this.deviceListeners.add(fn);
    return () => this.deviceListeners.delete(fn);
  }

  _notifyDevices() {
    const snapshot = {
      status: this.status,
      error: this.error,
      inputs: this.inputs.map((i) => ({ id: i.id, name: i.name, manufacturer: i.manufacturer })),
      selectedId: this.selectedId,
    };
    for (const fn of this.deviceListeners) fn(snapshot);
  }

  async connect() {
    if (!this.supported) {
      this.status = MIDI_STATUS.UNSUPPORTED;
      this.error = 'This browser has no Web MIDI API. Use Chrome, Edge or Opera.';
      this._notifyDevices();
      return this;
    }
    // A browser that never shows its permission prompt (or cannot open the
    // device) leaves this promise pending forever, which looked like an endless
    // "Checking…". Give up waiting after a while and say so; if the browser does
    // answer later, the late answer is still adopted.
    const request = navigator.requestMIDIAccess({ sysex: false });
    request.then((access) => { if (!this.access) this._adopt(access); }, () => {});
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('no answer from the browser'), { name: 'TimeoutError' })), MIDI_REQUEST_TIMEOUT_MS);
    });
    try {
      const access = await Promise.race([request, timeout]);
      if (!this.access) this._adopt(access);
    } catch (err) {
      this.status = err?.name === 'SecurityError' ? MIDI_STATUS.DENIED : MIDI_STATUS.ERROR;
      this.error =
        this.status === MIDI_STATUS.DENIED
          ? 'MIDI permission was blocked. Allow MIDI access for this site and reload.'
          : err?.name === 'TimeoutError'
            ? 'The browser did not answer the MIDI request. Look for a permission prompt near the address bar, or open the app in Chrome or Edge.'
            : `Could not open MIDI: ${err.message}`;
      this._notifyDevices();
    } finally {
      clearTimeout(timer);
    }
    return this;
  }

  _adopt(access) {
    this.access = access;
    this.access.onstatechange = () => {
      this._refreshInputs();
      this.accessListeners.forEach((fn) => fn(this.access));
    };
    this.status = MIDI_STATUS.READY;
    this.error = null;
    this._refreshInputs();
    // The same MIDIAccess carries the output ports, which is how the app
    // hands note duty to an external instrument.
    this.accessListeners.forEach((fn) => fn(this.access));
  }

  _refreshInputs() {
    if (!this.access) return;
    const next = [...this.access.inputs.values()];

    for (const input of this.inputs) input.onmidimessage = null;
    this.inputs = next;

    const stillThere = next.some((i) => i.id === this.selectedId);
    if (!stillThere) {
      this.selectedId = preferredMidiInput(next)?.id ?? null;
      this._explicit = false;
      this._selectedHeard = false;
    }
    this._apply(this.selectedId);
  }

  /** The user's own choice: honoured, and never auto-followed away from. */
  select(id) {
    this._explicit = true;
    return this._apply(id);
  }

  _apply(id) {
    if (id !== this.selectedId) this._selectedHeard = false;
    this.selectedId = id;
    for (const input of this.inputs) {
      input.onmidimessage = input.id === id ? this._boundMessage : this._probeFor(input.id);
    }
    this._notifyDevices();
    return this;
  }

  _onMessage(event) {
    const [rawStatus, d1 = 0, d2 = 0] = event.data;
    const type = rawStatus & 0xf0;
    const channel = rawStatus & 0x0f;
    // MIDIMessageEvent.timeStamp is in the performance.now() domain.
    const at = event.timeStamp || performance.now();

    let msg = null;
    if (type === NOTE_ON && d2 > 0) {
      this._selectedHeard = true;
      msg = { type: 'noteon', midi: d1, velocity: d2 / 127, channel, at };
    } else if (type === NOTE_OFF || (type === NOTE_ON && d2 === 0)) {
      msg = { type: 'noteoff', midi: d1, velocity: 0, channel, at };
    } else if (type === CONTROL_CHANGE) {
      if (d1 === 64) msg = { type: 'sustain', value: d2 >= 64, channel, at };
      else msg = { type: 'cc', controller: d1, value: d2 / 127, channel, at };
    } else if (type === PITCH_BEND) {
      msg = { type: 'pitchbend', value: ((d2 << 7) | d1) / 8192 - 1, channel, at };
    } else {
      return;
    }
    for (const fn of this.handlers) fn(msg);
  }

  destroy() {
    for (const input of this.inputs) input.onmidimessage = null;
    if (this.access) this.access.onstatechange = null;
    this.handlers.clear();
    this.deviceListeners.clear();
  }
}

export const midiInput = new MidiInputManager();

/**
 * Test hook: lets the UI (computer keyboard, on-screen piano, automated tests)
 * inject events through exactly the same path as real hardware.
 *
 * The `synthetic` flag matters: these sources have a fixed note range and no
 * octave buttons, so anything that infers the shape of your keybed from the
 * notes arriving must ignore them.
 */
export function emitSyntheticMidi(msg) {
  for (const fn of midiInput.handlers) {
    fn({ at: performance.now(), channel: 0, velocity: 0.75, synthetic: true, ...msg });
  }
}

/** QWERTY -> MIDI map so the app is usable without hardware. Z row = lower octave. */
export const KEYBOARD_MAP = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71,
  k: 72, o: 73, l: 74, p: 75, ';': 76, "'": 77,
  z: 48, x: 50, c: 52, v: 53, b: 55, n: 57, m: 59, ',': 60,
};
