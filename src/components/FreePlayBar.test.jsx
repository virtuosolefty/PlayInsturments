/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FreePlayBar, { explorerName } from './FreePlayBar.jsx';
import { Stars } from './PathTab.jsx';
import { instrumentKit } from '../lib/instruments.js';
import { emitSyntheticMidi } from '../lib/midiInput.js';

let container, root;
const render = ui => act(() => root.render(ui));
const names = () => [...container.querySelectorAll('button')].map(b => b.textContent);
const last = () => container.querySelector('.free-play-last strong').textContent;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('free play’s bar', () => {
  it('names the explorer each instrument has, and none for the piano', () => {
    expect(['guitar', 'bass', 'violin', 'cello', 'drums'].map(id => explorerName(instrumentKit(id)))).toEqual(['Chords', 'Open strings', 'Scales', 'Scales', 'Drum keys']);
    expect(explorerName(null)).toBeNull();
  });

  it('offers the explorer, the tuner where there is one, and the input check', () => {
    render(<FreePlayBar kit={instrumentKit('guitar')} onTuner={() => {}} onSetup={() => {}} />);
    expect(container.querySelector('[role="toolbar"]').getAttribute('aria-label')).toBe('Free play');
    expect(names()).toEqual(['Chords', 'Tuner', 'Check input']);
    render(<FreePlayBar kit={null} onTuner={null} onSetup={() => {}} />);
    expect(names()).toEqual(['Check input']);
    expect(container.querySelector('.free-play-hint').textContent).toContain('Computer keys');
  });

  it('opens the tuner and Input & sound', () => {
    const onTuner = vi.fn(), onSetup = vi.fn();
    render(<FreePlayBar kit={instrumentKit('violin')} onTuner={onTuner} onSetup={onSetup} />);
    const [, tuner, setup] = [...container.querySelectorAll('button')];
    act(() => tuner.click());
    act(() => setup.click());
    expect(onTuner).toHaveBeenCalledTimes(1);
    expect(onSetup).toHaveBeenCalledTimes(1);
  });

  it('says the note played last, by its name, and a drum by the drum’s', () => {
    render(<FreePlayBar kit={null} onSetup={() => {}} />);
    expect(last()).toBe('—');
    act(() => emitSyntheticMidi({ type: 'noteon', midi: 64 }));
    expect(last()).toBe('E4');
    act(() => emitSyntheticMidi({ type: 'noteoff', midi: 64 }));
    expect(last()).toBe('E4');
    render(<FreePlayBar kit={instrumentKit('drums')} onSetup={() => {}} />);
    expect(last()).toBe('—');
    act(() => emitSyntheticMidi({ type: 'noteon', midi: 38 }));
    expect(last()).toBe('Snare drum');
  });
});

describe('a lesson’s stars', () => {
  const stars = () => container.querySelector('.path-stars');

  it('are five, filled as far as the best run, from the first finished run', () => {
    render(<Stars count={3} />);
    expect(stars().getAttribute('aria-label')).toBe('3 of 5 stars');
    expect(stars().textContent).toBe('★★★★★');
    expect(stars().querySelector('i').textContent).toBe('★★');
    // Finished with no stars yet (a guided run): five empty ones, not nothing.
    render(<Stars count={0} shown />);
    expect(stars().getAttribute('aria-label')).toBe('0 of 5 stars');
    expect(stars().querySelector('i').textContent).toBe('★★★★★');
  });

  it('are not shown for a lesson that has not been finished', () => {
    render(<Stars count={0} />);
    expect(stars()).toBeNull();
  });
});
