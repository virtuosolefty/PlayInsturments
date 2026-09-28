/**
 * @vitest-environment jsdom
 *
 * Whether the external instrument is actually receiving anything.
 *
 * The audio engine had `available`-style optimism conflated with "you will
 * hear this", and the result was an entire piece scheduled in silence behind a
 * healthy-looking indicator. This is the same surface on the other route — the
 * one where a plugin or a hardware module is the instrument — and it had the
 * same hole: every send wrapped in a catch that said nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MidiOutputManager } from './midiOutput.js';

/** A port that takes notes, or refuses them the way an unplugged one does. */
const port = (over = {}) => ({
  id: 'p1',
  name: 'Mini Grand',
  manufacturer: 'AIR',
  state: 'connected',
  send: vi.fn(),
  ...over,
});

/** `outputs` is normally filled by refresh() from a real MIDIAccess. */
const managerWith = (p) => {
  const m = new MidiOutputManager();
  if (p) {
    m.outputs = [p];
    m.selectedId = p.id;
  }
  return m;
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('whether notes are reaching the instrument', () => {
  it('is not running with no port selected', () => {
    expect(managerWith(null).running).toBe(false);
  });

  it('is running when the selected port is connected', () => {
    expect(managerWith(port()).running).toBe(true);
  });

  it('is NOT running when the port was unplugged under it', () => {
    // `available` still says yes — there is an entry in `outputs` and an id
    // selected. That pair is exactly what let the audio engine claim health
    // while making no sound.
    const m = managerWith(port({ state: 'disconnected' }));
    expect(m.available).toBe(true);
    expect(m.running).toBe(false);
  });

  it('is not running when the selected id no longer matches any port', () => {
    const m = managerWith(port());
    m.selectedId = 'gone';
    expect(m.running).toBe(false);
  });

  it('assumes the best when a port will not say what state it is in', () => {
    const p = port();
    delete p.state;
    expect(managerWith(p).running).toBe(true);
  });

  it('reports running in the snapshot listeners receive', () => {
    const m = managerWith(port());
    const seen = [];
    m.onChange((s) => seen.push(s));
    m._notify();
    expect(seen[0].running).toBe(true);
  });
});

describe('notes that were sent and not delivered', () => {
  it('counts a note with nowhere to send it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = managerWith(null);
    m.attack(60, 0.8);
    expect(m.notesDropped).toBe(1);
  });

  it('counts a note the port threw on', () => {
    // What an unplugged cable looks like from here, mid-run.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = managerWith(
      port({
        send: () => {
          throw new Error('The port is disconnected.');
        },
      }),
    );
    m.attack(60, 0.8);
    m.release(60);
    expect(m.notesDropped).toBe(2);
  });

  it('counts nothing when the note goes through', () => {
    const p = port();
    const m = managerWith(p);
    m.attack(60, 0.8);
    expect(m.notesDropped).toBe(0);
    expect(p.send).toHaveBeenCalled();
  });

  it('says so once rather than once per note', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = managerWith(null);
    for (let i = 0; i < 30; i += 1) m.attack(60 + (i % 12), 0.8);
    expect(m.notesDropped).toBe(30);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
