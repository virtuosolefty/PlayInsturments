/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstrumentButtons from './InstrumentButtons.jsx';

let container, root;
const render = ui => act(() => root.render(ui));
const buttons = () => [...container.querySelectorAll('button')];

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('the instrument buttons', () => {
  it('list the five instruments in a named group, the one in hand pressed', () => {
    render(<InstrumentButtons label="Practice instrument" current="cello" onPick={() => {}} />);
    expect(container.querySelector('[role="group"]').getAttribute('aria-label')).toBe('Practice instrument');
    expect(buttons().map(b => b.textContent)).toEqual(['Piano', 'Guitar', 'Violin', 'Cello', 'Drums']);
    expect(buttons().filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent)).toEqual(['Cello']);
  });

  it('press the guitar button for a bass, which sits behind it', () => {
    render(<InstrumentButtons label="x" current="bass" onPick={() => {}} />);
    expect(buttons().filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent)).toEqual(['Guitar']);
  });

  it('report the picker id of the button pressed, and hold what the page asks them to', () => {
    const onPick = vi.fn();
    render(<InstrumentButtons label="x" current="piano" onPick={onPick} content={id => `<${id}>`} buttonProps={id => ({ title: `about ${id}` })} />);
    act(() => buttons()[2].click());
    expect(onPick).toHaveBeenCalledWith('violin');
    expect(buttons()[2].textContent).toBe('<violin>');
    expect(buttons()[2].getAttribute('title')).toBe('about violin');
  });
});
