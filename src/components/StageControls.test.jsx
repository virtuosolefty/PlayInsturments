/**
 * @vitest-environment jsdom
 *
 * The controls and labels the 3D string stages share: the Fretboard | Whole
 * instrument switch, Reset view, the labels over the instrument, and the hook
 * that keeps free play opening on Learn.
 */

import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStageView } from '../hooks/useStageView.js';
import { STRING_FONT_MAX } from '../lib/guitarStageView.js';
import ResetViewButton from './ResetViewButton.jsx';
import StageLabels from './StageLabels.jsx';
import StageViewSwitch from './StageViewSwitch.jsx';

let container;
let root;

const render = ui => act(() => root.render(ui));
const button = name => container.querySelector(`button[aria-label="${name}"]`) ?? [...container.querySelectorAll('button')].find(b => b.textContent === name);

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

describe('the Fretboard | Whole instrument switch', () => {
  it('presses the view shown and reports the other when it is chosen', () => {
    const onChange = vi.fn();
    render(<StageViewSwitch label="Fretboard" short="Frets" value="learn" onChange={onChange} />);
    expect(container.querySelector('[role="group"]').getAttribute('aria-label')).toBe('Stage view');
    expect(button('Fretboard').getAttribute('aria-pressed')).toBe('true');
    expect(button('Whole instrument').getAttribute('aria-pressed')).toBe('false');
    act(() => button('Whole instrument').click());
    expect(onChange).toHaveBeenCalledWith('whole');
  });

  it('keeps the full name of the first view where a phone shows a short one', () => {
    for (const [label, short] of [['Fretboard', 'Frets'], ['Fingerboard', 'Fingers'], ['Practice kit', 'Kit']]) {
      render(<StageViewSwitch label={label} short={short} value="learn" onChange={() => {}} />);
      const first = button(label);
      expect(first.getAttribute('aria-label')).toBe(label);
      expect(first.querySelector('.stage-view-long').textContent).toBe(label);
      expect(first.querySelector('.stage-view-short').textContent).toBe(short);
    }
  });

  it('keeps the full name of the second view where a phone shows only "Whole"', () => {
    render(<StageViewSwitch label="Fretboard" short="Frets" value="whole" onChange={() => {}} />);
    const whole = button('Whole instrument');
    expect(whole.getAttribute('aria-pressed')).toBe('true');
    // The name is the visible text in full, and the part a phone hides is its own span.
    expect(whole.textContent).toBe('Whole instrument');
    expect(whole.querySelector('.stage-view-more').textContent).toBe(' instrument');
  });
});

describe('Reset view', () => {
  it('keeps its name when a phone shows only its icon, and is greyed until the view is turned', () => {
    const onReset = vi.fn(), onFocusChange = vi.fn();
    render(<ResetViewButton turned={false} onReset={onReset} onFocusChange={onFocusChange} />);
    const reset = button('Reset view');
    expect(reset.getAttribute('aria-disabled')).toBe('true');
    expect(reset.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    render(<ResetViewButton turned onReset={onReset} onFocusChange={onFocusChange} />);
    expect(reset.getAttribute('aria-disabled')).toBe('false');
    act(() => reset.click());
    expect(onReset).toHaveBeenCalled();
    act(() => reset.focus());
    expect(onFocusChange).toHaveBeenLastCalledWith(true);
    act(() => reset.blur());
    expect(onFocusChange).toHaveBeenLastCalledWith(false);
  });
});

describe('labels over the stage', () => {
  const name = (number, text, leader = null) => ({ kind: 'string', number, text, x: 28, y: 100, leader });

  it('writes a string name as its number and its pitch, each in its own part', () => {
    render(<StageLabels labels={[name(3, 'G3')]} labelSize={14} />);
    const label = container.querySelector('.guitar-position-label.string');
    expect(label.textContent).toBe('3 G3');
    expect(label.querySelector('.string-number').textContent).toBe('3');
    expect(label.querySelector('.string-note').textContent).toBe('G3');
    expect(label.style.fontSize).toBe(`${Math.min(14, STRING_FONT_MAX)}px`);
  });

  it('draws a haloed leader for each name moved off its string, and no layer when none was', () => {
    const leader = { from: { x: 50, y: 100 }, to: { x: 240, y: 112 } };
    render(<StageLabels labels={[name(1, 'E4', leader), name(2, 'B3'), { kind: 'fret', text: '5', x: 300, y: 40 }]} labelSize={14} />);
    const lines = container.querySelectorAll('.guitar-stage-leaders line');
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute('class')).toBe('halo');
    expect([...lines].map(l => ['x1', 'y1', 'x2', 'y2'].map(a => Number(l.getAttribute(a))))).toEqual([[50, 100, 240, 112], [50, 100, 240, 112]]);
    expect(container.querySelector('.guitar-stage-leaders').getAttribute('aria-hidden')).toBe('true');
    // Other labels are plain text at the chosen size.
    expect(container.querySelector('.guitar-position-label.fret').textContent).toBe('5');
    render(<StageLabels labels={[name(2, 'B3')]} labelSize={14} />);
    expect(container.querySelector('.guitar-stage-leaders')).toBeNull();
  });

  it('hides the labels from assistive technology only when asked', () => {
    render(<StageLabels labels={[name(1, 'E5')]} labelSize={14} />);
    expect(container.querySelector('.guitar-position-label').hasAttribute('aria-hidden')).toBe(false);
    render(<StageLabels labels={[name(1, 'E5')]} labelSize={14} decorative />);
    expect(container.querySelector('.guitar-position-label').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('free play opening on Learn', () => {
  function Probe({ view, choose, seen }) {
    const [stageView, setStageView] = useStageView(view);
    useEffect(() => { seen.push(stageView); });
    useEffect(() => { if (choose) setStageView(choose); }, [choose, setStageView]);
    return null;
  }

  it('starts on Learn, keeps a choice while free play lasts, and goes back to Learn when free play is left', () => {
    const seen = [];
    render(<Probe view="freePlay" seen={seen} />);
    expect(seen.at(-1)).toBe('learn');
    render(<Probe view="freePlay" choose="whole" seen={seen} />);
    expect(seen.at(-1)).toBe('whole');
    render(<Probe view="lesson" choose="whole" seen={seen} />);
    expect(seen.at(-1)).toBe('learn');
  });
});
