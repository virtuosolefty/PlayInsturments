/**
 * @vitest-environment jsdom
 *
 * Your best combo and your ghost are both saved after every run, and the roll
 * is built to draw them — but only if this hook hands them back. It once did
 * not, and App's optional chaining turned that into a silent 0 and null, so the
 * record never lit up and the ghost never raced you.
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppData } from './useAppData.js';
import { recordCombo, recordGhost } from '../lib/storage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let data;

function Probe() {
  data = useAppData();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
});

afterEach(() => act(() => root.unmount()));

describe('useAppData — records saved by a run come back out', () => {
  it('returns the best combo for a song and arrangement', () => {
    recordCombo({ songId: 'scale', variant: 'full' }, 42);
    expect(data.getBestCombo('scale', 'full')).toBe(42);
    expect(data.getBestCombo('scale', 'folded')).toBe(0);
  });

  it('returns the ghost of the best run', () => {
    recordGhost({ songId: 'scale', variant: 'full', overall: 0.9 }, [{ id: 'n1', deltaMs: 12.4 }]);
    expect(data.getGhost('scale', 'full')).toMatchObject({ deltas: { n1: 12 } });
    expect(data.getGhost('other', 'full')).toBeNull();
  });
});
