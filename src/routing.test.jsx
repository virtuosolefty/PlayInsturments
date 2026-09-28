/**
 * @vitest-environment jsdom
 *
 * Where the sound comes from.
 *
 * "This app" and "A plugin" are supposed to be exclusive: picking the plugin
 * means the browser stops sounding notes, or you hear every note twice in two
 * different timbres. This is the test that says so, driven the way a player
 * drives it — a real note in, and a check on which engine got it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('tone', () => {
  class Node {
    connect() {
      return this;
    }
    toDestination() {
      return this;
    }
    dispose() {}
    set() {}
    triggerAttackRelease() {}
    triggerAttack() {}
    triggerRelease() {}
    releaseAll() {}
    rampTo() {}
  }
  return {
    start: vi.fn().mockResolvedValue(undefined),
    now: () => 0,
    loaded: vi.fn().mockResolvedValue(undefined),
    getContext: () => ({ lookAhead: 0 }),
    dbToGain: (db) => 10 ** (db / 20),
    Frequency: () => ({ toNote: () => 'C4' }),
    Gain: class extends Node {
      constructor() {
        super();
        this.gain = { rampTo() {} };
      }
    },
    Reverb: Node,
    Meter: class extends Node {
      getValue() {
        return -60;
      }
    },
    Sampler: Node,
    PolySynth: Node,
    Synth: Node,
    NoiseSynth: Node,
    MetalSynth: Node,
    MembraneSynth: Node,
  };
});

const SONGS = resolve(process.cwd(), 'public/songs');
let container;
let root;

/** A MIDI output port that records what it was sent. */
const fakePort = () => ({
  id: 'plugin-1',
  name: 'MPK mini IV MIDI Port',
  manufacturer: 'Akai',
  state: 'connected',
  send: vi.fn(),
});

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  HTMLCanvasElement.prototype.getContext = () => ({
    setTransform() {}, fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {},
    moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, closePath() {}, stroke() {}, fill() {},
    fillText() {}, save() {}, restore() {}, setLineDash() {}, drawImage() {}, rect() {}, clip() {},
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  });

  const manifest = JSON.parse(readFileSync(resolve(SONGS, 'songs.json'), 'utf8'));
  global.fetch = vi.fn(async (url) => {
    if (String(url).endsWith('songs.json')) {
      return { ok: true, status: 200, json: async () => manifest };
    }
    const file = String(url).replace(/^\//, '');
    const buf = readFileSync(resolve(process.cwd(), 'public', file));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(buf).buffer,
      text: async () => buf.toString('utf8'),
      json: async () => JSON.parse(buf.toString('utf8')),
    };
  });

  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.restoreAllMocks();
  localStorage.clear();
});

/**
 * Mount with a chosen sound source and a MIDI output port already present,
 * then play one note and report which engine sounded it.
 */
async function playOneNote(instrumentSource, { ports = 'present' } = {}) {
  localStorage.setItem(
    'piano-practice-coach:v1',
    JSON.stringify({
      version: 1,
      songs: {},
      settings: { countInBars: 0, instrumentSource, forwardInput: true },
    }),
  );

  const { midiOutput } = await import('./lib/midiOutput.js');
  const { audio } = await import('./lib/audio.js');
  const { emitSyntheticMidi } = await import('./lib/midiInput.js');

  const port = fakePort();
  midiOutput.outputs = [port];
  midiOutput.selectedId = port.id;

  const { default: App } = await import('./App.jsx');
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });

  // A port that goes away after you chose it — unplugged, or the browser
  // re-enumerating the device list.
  if (ports === 'dropped') midiOutput.outputs = [];

  const toApp = vi.spyOn(audio, 'attack');
  port.send.mockClear();

  await act(async () => {
    emitSyntheticMidi({ type: 'noteon', midi: 60, velocity: 0.8 });
    await new Promise((r) => setTimeout(r, 40));
  });

  return { app: toApp.mock.calls.length, plugin: port.send.mock.calls.length };
}

/** Mount in a chosen source + mode and let the score play itself for a moment. */
async function playTheScore(instrumentSource, mode) {
  localStorage.setItem(
    'piano-practice-coach:v1',
    JSON.stringify({
      version: 1,
      songs: {},
      settings: { countInBars: 0, instrumentSource, forwardInput: true, mode },
    }),
  );

  const { midiOutput } = await import('./lib/midiOutput.js');
  const { audio } = await import('./lib/audio.js');

  const port = fakePort();
  midiOutput.outputs = [port];
  midiOutput.selectedId = port.id;

  const { default: App } = await import('./App.jsx');
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });

  const toApp = vi.spyOn(audio, 'play');
  port.send.mockClear();

  const play = [...container.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Play'),
  );
  await act(async () => {
    play.click();
    await new Promise((r) => setTimeout(r, 700));
  });

  return { app: toApp.mock.calls.length, plugin: port.send.mock.calls.length };
}

describe('picking where the sound comes from', () => {
  it('sounds in the browser and nowhere else on "This app"', async () => {
    const heard = await playOneNote('internal');
    expect(heard.app).toBeGreaterThan(0);
    expect(heard.plugin).toBe(0);
  });

  it('sounds in the plugin and NOT in the browser on "A plugin"', async () => {
    // The bug this is here for: both engines sounding the same note, which is
    // every note twice in two different timbres.
    const heard = await playOneNote('external');
    expect(heard.plugin).toBeGreaterThan(0);
    expect(heard.app).toBe(0);
  });

  it('does not quietly become the instrument when the plugin port drops', async () => {
    // The actual bug. `instrumentFor` used to fall back to the browser the
    // moment the output list looked empty, so you got the app and the plugin
    // at once — the plugin because it hears the controller directly, the app
    // because it had silently taken the job back.
    const heard = await playOneNote('external', { ports: 'dropped' });
    expect(heard.app).toBe(0);
  });

  it('plays the score through the browser on "This app"', async () => {
    const heard = await playTheScore('internal', 'listen');
    expect(heard.app).toBeGreaterThan(0);
    expect(heard.plugin).toBe(0);
  });

  it('plays the score through the plugin and NOT the browser on "A plugin"', async () => {
    // Listen mode always sounds the score, so this is the other way the two
    // engines could end up talking over each other.
    const heard = await playTheScore('external', 'listen');
    expect(heard.plugin).toBeGreaterThan(0);
    expect(heard.app).toBe(0);
  });
});
