/**
 * @vitest-environment jsdom
 *
 * Bringing back the files you imported — and saying so when one of them does
 * not come back.
 *
 * This path used to swallow a failed re-parse on the grounds that it "wasn't
 * worth a toast on load". But the file does not reappear and nothing else ever
 * mentions it, so from the other side of the screen a piece you imported has
 * simply vanished and the app is the thing that lost it. The rules worth
 * pinning down are that a lost file is named, a browser with no vault at all
 * stays quiet, and neither case takes the files that *did* load down with it.
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listScoreFiles = vi.fn();
const vaultSupported = vi.fn(() => true);

vi.mock('../lib/vault.js', () => ({
  listScoreFiles: (...args) => listScoreFiles(...args),
  packFromFiles: vi.fn(),
  putSamplePack: vi.fn(),
  putScoreFile: vi.fn().mockResolvedValue(undefined),
  supported: (...args) => vaultSupported(...args),
}));

vi.mock('../lib/audio.js', () => ({
  audio: { start: vi.fn(), reloadInstrument: vi.fn() },
}));

/** Anything named "broken…" is a file the parser can no longer read. */
vi.mock('../lib/score.js', () => ({
  loadScoreFromFile: vi.fn(async (file) => {
    if (file.name.startsWith('broken')) throw new Error('not a MIDI file');
    return { id: file.name, title: file.name, notes: [{ midi: 60 }] };
  }),
}));

const { useImports } = await import('./useImports.js');

/** One row as the vault stores it: original bytes, not a parsed score. */
const entry = (name, addedAt = 1) => ({
  id: name,
  name,
  kind: 'midi',
  data: new Uint8Array([1, 2, 3]).buffer,
  addedAt,
});

let container;
let root;
let errors;
let scores;

/** `onError` has to be stable — the restore effect depends on it. */
const onError = (message) => errors.push(message);
const onScoreLoaded = () => {};

function Harness() {
  const { localScores } = useImports({ onError, onScoreLoaded });
  scores = localScores;
  return null;
}

/** Mount and let the vault promise and its re-parses settle. */
async function mount() {
  await act(async () => {
    root.render(<Harness />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  errors = [];
  scores = [];
  vaultSupported.mockReturnValue(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('restoring imported files', () => {
  it('brings back everything that still parses', async () => {
    listScoreFiles.mockResolvedValue([entry('nocturne.mid', 2), entry('gymnopedie.mid', 1)]);
    await mount();
    expect(scores.map((s) => s.title)).toEqual(['nocturne.mid', 'gymnopedie.mid']);
    expect(errors).toEqual([]);
  });

  it('says nothing at all when nothing went wrong', async () => {
    listScoreFiles.mockResolvedValue([entry('nocturne.mid')]);
    await mount();
    expect(errors).toEqual([]);
  });

  it('names the file it could not reopen', async () => {
    listScoreFiles.mockResolvedValue([entry('broken-waltz.mid')]);
    await mount();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('broken-waltz.mid');
    expect(errors[0]).toContain('One saved file');
  });

  it('names all of them, and counts them, when several are lost', async () => {
    listScoreFiles.mockResolvedValue([entry('broken-a.mid', 2), entry('broken-b.xml', 1)]);
    await mount();
    expect(errors[0]).toContain('2 saved files');
    expect(errors[0]).toContain('broken-a.mid');
    expect(errors[0]).toContain('broken-b.xml');
  });

  it('keeps the files that did load when one of them is lost', async () => {
    // The failure must not take the rest of the library down with it — that
    // would turn one unreadable file into an empty drawer.
    listScoreFiles.mockResolvedValue([entry('broken.mid', 2), entry('fine.mid', 1)]);
    await mount();
    expect(scores.map((s) => s.title)).toEqual(['fine.mid']);
    expect(errors).toHaveLength(1);
  });

  it('reports a vault that exists but would not open', async () => {
    listScoreFiles.mockRejectedValue(new Error('the store is corrupt'));
    await mount();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('the store is corrupt');
  });

  it('stays quiet in a browser with no vault to lose anything from', async () => {
    // No IndexedDB is not a loss — there was never anywhere to keep a file.
    // Complaining here would put an error in front of every Firefox private
    // window on load.
    vaultSupported.mockReturnValue(false);
    listScoreFiles.mockRejectedValue(new Error('This browser has no IndexedDB'));
    await mount();
    expect(errors).toEqual([]);
  });

  it('does nothing when there is nothing saved', async () => {
    listScoreFiles.mockResolvedValue([]);
    await mount();
    expect(scores).toEqual([]);
    expect(errors).toEqual([]);
  });
});
