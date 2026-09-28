/**
 * @vitest-environment jsdom
 *
 * The floor under a render that throws. Worth testing directly rather than
 * trusting: a boundary that does not catch looks exactly like a boundary that
 * was never needed, right up until the day it is.
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary.jsx';

let container;
let root;
let errorLog;

const Boom = () => {
  throw new Error('the engraver exploded');
};

const render = (ui) => act(() => root.render(ui));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  errorLog = [];
  // React logs the caught error itself; keep the run readable.
  vi.spyOn(console, 'error').mockImplementation((...a) => errorLog.push(a.join(' ')));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>the app</p>
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('the app');
  });

  it('catches a throw instead of taking the page down with it', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(container.querySelector('.boundary')).toBeTruthy();
    expect(container.textContent).toContain('Something in the app broke');
  });

  it('offers to save a backup before anything else', () => {
    // The most expensive thing about a crash here is somebody reaching for a
    // hard refresh or clearing site data to fix it, so rescuing the history
    // has to be on offer at the moment of the crash.
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toContain('Save a backup');
    expect(labels[0]).toBe('Save a backup');
  });

  it('shows what actually went wrong rather than a shrug', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(container.querySelector('.boundary-detail').textContent).toContain('the engraver exploded');
  });

  it('uses a named fallback where one is given, so a part can fail alone', () => {
    render(
      <ErrorBoundary fallback={<div className="staff-fallback">notation unavailable</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(container.querySelector('.staff-fallback')).toBeTruthy();
    // The whole-app card must not appear when a scoped fallback handled it.
    expect(container.querySelector('.boundary')).toBeNull();
  });

  it('reports the failure to the console for whoever has to fix it', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(errorLog.join(' ')).toContain('the engraver exploded');
  });
});
