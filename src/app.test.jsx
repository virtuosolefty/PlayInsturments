/**
 * @vitest-environment jsdom
 *
 * Render smoke test. Mounts the whole app against a stubbed fetch, a stubbed
 * canvas and a stubbed ResizeObserver, then drives it through the paths that
 * matter: loading the library, switching songs, starting a run, and feeding
 * synthetic MIDI in so the scoring and the feedback list light up.
 *
 * Anything that throws on mount — a bad import, a typo in JSX, a hook used
 * wrongly — fails here rather than in the browser.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SONGS = resolve(process.cwd(), 'public/songs');

// Tone.js touches the real Web Audio API on import; stub the whole module.
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

let container;
let root;
let errors;

beforeEach(() => {
  errors = [];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')));

  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);

  // Every 2D method the roll actually calls. An incomplete stub is worse than
  // no stub: the missing `createRadialGradient` threw inside the animation
  // frame on every single tick, and because that is an unhandled rejection
  // rather than a test failure the suite stayed green while the roll drew
  // nothing — the same blind spot that once let a ReferenceError in the draw
  // loop ship with all tests passing.
  HTMLCanvasElement.prototype.getContext = () => ({
    setTransform() {}, fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {},
    moveTo() {}, lineTo() {}, arcTo() {}, roundRect() {}, arc() {}, closePath() {}, stroke() {}, fill() {},
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
      // Re-wrap in a realm-native ArrayBuffer, as a real fetch would return.
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
 * @param {object} [settings] seeded into storage before mount. Scoring tests
 *   pass `countInBars: 0` — a real run opens with a bar of clicks during which
 *   nothing is judged, and waiting three seconds of wall clock in every test
 *   would be slow and flaky. The count-in has its own tests below.
 */
async function mountApp(settings = {}) {
  if (Object.keys(settings).length) {
    localStorage.setItem(
      'piano-practice-coach:v1',
      JSON.stringify({ version: 1, songs: {}, settings }),
    );
  }
  const { default: App } = await import('./App.jsx');
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  // let the library fetch + first score load settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
}

const NO_COUNT_IN = { countInBars: 0 };

const text = () => container.textContent;
const buttonWith = (label) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent.includes(label));

describe('App', () => {
  it('mounts without console errors', async () => {
    await mountApp();
    expect(errors.filter((e) => !e.includes('not wrapped in act'))).toEqual([]);
  });

  it('renders the library and opens the first piece', async () => {
    await mountApp();
    expect(text()).toContain('Practice library');
    expect(text()).toContain('C Major Scale');
    expect(text()).toContain('Für Elise');
    expect(text()).toContain('Moonlight Sonata');
    // first piece auto-loaded, so the topbar shows its detected key
    expect(text()).toContain('C major');
  });

  it('shows the three practice modes and the transport', async () => {
    await mountApp();
    expect(buttonWith('Listen')).toBeTruthy();
    expect(buttonWith('Practice')).toBeTruthy();
    expect(buttonWith('Wait for me')).toBeTruthy();
    expect(buttonWith('Play')).toBeTruthy();
  });

  it('draws a canvas for the roll and keyboard', async () => {
    await mountApp();
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('switches to another song when picked', async () => {
    await mountApp();
    const target = [...container.querySelectorAll('button.song')].find((b) =>
      b.textContent.includes('Für Elise'),
    );
    await act(async () => {
      target.click();
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(target.className).toContain('active');
    expect(text()).toContain('A minor');
  });

  it('imports MusicXML from the library', async () => {
    await mountApp();
    const target = [...container.querySelectorAll('button.song')].find((b) =>
      b.textContent.includes('MusicXML import'),
    );
    await act(async () => {
      target.click();
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(text()).toContain('Twinkle, Twinkle, Little Star (MusicXML)');
  });

  it('scores synthetic MIDI once a run is playing', async () => {
    await mountApp(NO_COUNT_IN);
    const { emitSyntheticMidi } = await import('./lib/midiInput.js');

    await act(async () => {
      buttonWith('Play').click();
      await new Promise((r) => setTimeout(r, 40));
    });

    // C major scale starts on C4; play a correct note and an obviously wrong one.
    await act(async () => {
      emitSyntheticMidi({ type: 'noteon', midi: 60, velocity: 0.8 });
      emitSyntheticMidi({ type: 'noteoff', midi: 60 });
      emitSyntheticMidi({ type: 'noteon', midi: 61, velocity: 0.8 });
      emitSyntheticMidi({ type: 'noteoff', midi: 61 });
      await new Promise((r) => setTimeout(r, 180));
    });

    expect(text()).toContain('Recent notes');
    // the wrong note must be explained, not just flagged
    expect(text()).toMatch(/Adjacent key slip|Wrong note|Out of key|Dissonant/);
    expect(text()).toContain('C#4');
  });

  it('records a session to localStorage when stopped', async () => {
    await mountApp(NO_COUNT_IN);
    const { emitSyntheticMidi } = await import('./lib/midiInput.js');

    await act(async () => {
      buttonWith('Play').click();
      await new Promise((r) => setTimeout(r, 40));
    });
    await act(async () => {
      emitSyntheticMidi({ type: 'noteon', midi: 60, velocity: 0.8 });
      emitSyntheticMidi({ type: 'noteoff', midi: 60 });
      await new Promise((r) => setTimeout(r, 60));
    });
    await act(async () => {
      buttonWith('Stop').click();
      await new Promise((r) => setTimeout(r, 60));
    });

    const db = JSON.parse(localStorage.getItem('piano-practice-coach:v1'));
    const entry = Object.values(db.songs)[0];
    expect(entry.sessions.length).toBe(1);
    expect(entry.sessions[0].hit).toBeGreaterThanOrEqual(1);
    expect(entry.sessions[0].variant).toBe('full');
    expect(text()).toContain('Progress');
  });

  it('counts you in before the piece starts', async () => {
    await mountApp();
    await act(async () => {
      buttonWith('Play').click();
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(text()).toContain('get ready');
    // The clock is behind the first beat, and must never render as "-1:-3".
    expect(text()).not.toMatch(/-\d+:-?\d+/);
  });

  it('judges nothing during the count-in', async () => {
    await mountApp();
    const { emitSyntheticMidi } = await import('./lib/midiInput.js');

    await act(async () => {
      buttonWith('Play').click();
      await new Promise((r) => setTimeout(r, 40));
    });
    await act(async () => {
      // An obviously wrong note, played before the piece has begun.
      emitSyntheticMidi({ type: 'noteon', midi: 61, velocity: 0.8 });
      emitSyntheticMidi({ type: 'noteoff', midi: 61 });
      await new Promise((r) => setTimeout(r, 120));
    });

    // No judgement rows at all — checked against the DOM rather than the page
    // text, which carries the words "wrong note" in its permanent legend.
    expect(container.querySelectorAll('.event')).toHaveLength(0);
    expect(text()).toContain('Waiting for your first note');
  });

  // Only the attribute is checked here. jsdom does not load the stylesheet, so
  // computed styles in this environment cannot tell you whether `.legend`'s
  // `display: flex` is overriding `hidden` — which is the actual defect. That
  // half is verified in the browser instead.
  /**
   * Hear it, then play it. Listen mode used to be all-or-nothing — the whole
   * piece from the top, with any loop cleared on the way in — so the one bar
   * you keep failing was the one bar you could not hear.
   */
  it('hears a passage in listen mode and hands back to practice', async () => {
    await mountApp(NO_COUNT_IN);
    const pad = (cap) =>
      [...container.querySelectorAll('button.pad')].find((b) => b.textContent.includes(cap));

    await act(async () => {
      buttonWith('Hear the phrase').click();
      await new Promise((r) => setTimeout(r, 80));
    });
    // Listen is now the selected mode, and the pad has swapped to the way back.
    expect(buttonWith('Listen').className).toContain('on');
    expect(pad('Your turn')).toBeTruthy();
    expect(pad('Preview')).toBeFalsy();

    await act(async () => {
      pad('Your turn').click();
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(container.querySelector('.zone-mode button.on').textContent).toContain('Practice');
    expect(pad('Your turn')).toBeFalsy();
  });

  /**
   * Mounting with the GPU roll selected.
   *
   * This is here because it shipped broken: `webglAvailable()` was called in
   * App and never imported, so ticking the 3D box threw a ReferenceError
   * straight into the error boundary. Nothing caught it — `&&` short-circuits,
   * so with the default renderer the call is never evaluated, and no test had
   * ever set this setting. The build does not warn either; Rollup takes an
   * unresolved identifier for an implicit global.
   *
   * jsdom has no WebGL, so this also pins the fallback: asking for a renderer
   * the machine cannot provide has to quietly give you the canvas one, not a
   * blank rectangle.
   */
  it('falls back to the canvas roll when WebGL is asked for but unavailable', async () => {
    await mountApp({ ...NO_COUNT_IN, renderer: 'gl' });
    expect(errors.filter((e) => !e.includes('not wrapped in act'))).toEqual([]);
    expect(container.querySelector('canvas')).toBeTruthy();
    // The GL wrapper must not be on screen — jsdom cannot give it a context.
    expect(container.querySelector('.roll-gl')).toBeNull();
  });

  /**
   * A run where every note was missed.
   *
   * The panel used to announce TIMING — ON TIME in green over 0 of 60 notes,
   * because the needle read the mean deviation and nothing else, and the mean
   * deviation across no notes is zero. Perfect timing, from no timing. The
   * "On time" gauge did the same, reporting 0% and "± 0 ms avg" while the two
   * gauges beside it correctly said there was nothing to measure.
   *
   * Caught by looking at a screenshot, which is the only way it was ever going
   * to be caught — every number involved was arithmetically correct.
   */
  it('does not claim good timing from a run with no notes played', async () => {
    await mountApp(NO_COUNT_IN);
    await act(async () => {
      buttonWith('Play').click();
      // Long enough for notes to go past unplayed and be judged missed.
      await new Promise((r) => setTimeout(r, 900));
    });

    const panel = container.textContent;
    expect(panel).not.toContain('on time');
    expect(container.querySelector('.live-timing').textContent).toContain('Listening for a few more notes');
    expect(container.querySelector('.needle-pin')).toBeNull();
    // And the ring says "no score" rather than drawing a zero-length stroke.
    expect(container.querySelector('.live-accuracy strong').textContent).toBe('0%');
    expect(container.querySelector('.ring-fill')).toBeNull();
  });

  it('keeps detailed performance measures collapsed until asked', async () => {
    await mountApp(NO_COUNT_IN);
    const { emitSyntheticMidi } = await import('./lib/midiInput.js');
    await act(async () => {
      buttonWith('Play').click();
      await new Promise((r) => setTimeout(r, 40));
    });
    await act(async () => {
      emitSyntheticMidi({ type: 'noteon', midi: 60, velocity: 0.8 });
      emitSyntheticMidi({ type: 'noteoff', midi: 60 });
      await new Promise((r) => setTimeout(r, 120));
    });

    const legend = container.querySelector('details.section.fold');
    expect(legend).toBeTruthy();
    expect(legend.hasAttribute('open')).toBe(false);
  });

  it('shows no scoreboard until something has been judged', async () => {
    // Six gauges of zero plus three "nothing yet" messages is the wall the
    // piece panel exists to avoid; starting a run used to bring it straight back.
    await mountApp();
    await act(async () => {
      buttonWith('Play').click();
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(container.querySelectorAll('.gauge')).toHaveLength(0);
    expect(container.querySelector('.live-accuracy strong').textContent).toBe('—');
    expect(text()).not.toContain('No runs recorded yet');
    expect(text()).not.toContain('Nothing recurring yet');
  });

  it('brings the scoreboard in once a note is judged', async () => {
    await mountApp(NO_COUNT_IN);
    const { emitSyntheticMidi } = await import('./lib/midiInput.js');
    await act(async () => {
      buttonWith('Play').click();
      await new Promise((r) => setTimeout(r, 40));
    });
    await act(async () => {
      emitSyntheticMidi({ type: 'noteon', midi: 60, velocity: 0.8 });
      emitSyntheticMidi({ type: 'noteoff', midi: 60 });
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(container.querySelector('.live-accuracy strong').textContent).not.toBe('—');
    expect(container.querySelector('.run-waiting')).toBeNull();
  });

  it('finishes the count-in in wait mode instead of freezing on it', async () => {
    // Wait mode gates on the first chord, and on almost every piece that chord
    // sits at time zero. The gate opens a few milliseconds early to catch it,
    // which used to stop the clock just short of zero — leaving the countdown
    // stuck on its last beat with no way forward.
    await mountApp();
    await act(async () => {
      buttonWith('Wait for me').click();
      await new Promise((r) => setTimeout(r, 40));
    });
    await act(async () => {
      buttonWith('Play').click();
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(container.querySelector('.count-in')).toBeTruthy();

    // c-major-scale runs at 80 bpm in 4/4, so a bar of count-in is three seconds.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 3600));
    });
    expect(container.querySelector('.count-in')).toBeNull();
    expect(text()).toContain('waiting for');
  }, 15000);
});
