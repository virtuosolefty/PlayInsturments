/**
 * @vitest-environment jsdom
 *
 * The credits Help shows are for the models on this site: the three that are
 * played always are, and each of the others once its files are there.
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShownCredits } from './useShownCredits.js';

const server = vi.hoisted(() => ({ has: () => true }));
vi.mock('../lib/stage/modelAvailability.js', () => ({ modelAvailable: vi.fn(async id => server.has(id)) }));

let container;
let root;

function Credits() {
  return <ul>{useShownCredits().map(credit => <li key={credit.model}>{credit.model}</li>)}</ul>;
}
const listed = () => [...container.querySelectorAll('li')].map(item => item.textContent);

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the credits Help shows', () => {
  it('are for the played instruments alone when no other model is on the site', async () => {
    server.has = () => false;
    await act(async () => { root.render(<Credits />); });
    expect(listed()).toEqual(['guitar', 'violin', 'cello']);
  });

  it('add each model that is only shown once its files are there', async () => {
    server.has = id => ['guitar-bass', 'drums-electronic'].includes(id);
    await act(async () => { root.render(<Credits />); });
    expect(listed()).toEqual(['guitar', 'violin', 'cello', 'guitar-bass', 'drums-electronic']);
  });

  it('never ask after the played instruments, which are always there', async () => {
    const { modelAvailable } = await import('../lib/stage/modelAvailability.js');
    modelAvailable.mockClear();
    await act(async () => { root.render(<Credits />); });
    expect(modelAvailable.mock.calls.map(([id]) => id).sort()).toEqual(['cello-antique', 'drums-acoustic', 'drums-electronic', 'guitar-bass', 'violin-electric']);
  });
});
