/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TypeSwitch from './TypeSwitch.jsx';

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

describe('the instrument type switch', () => {
  it('offers the two kinds of a guitar, the one shown pressed', () => {
    render(<TypeSwitch instrument="bass" onChange={() => {}} />);
    expect(container.querySelector('[role="group"]').getAttribute('aria-label')).toBe('Instrument type');
    expect(buttons().map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Guitar', 'false'], ['Bass', 'true']]);
  });

  it('reports the instrument of the kind chosen, and nothing for the one already shown', () => {
    const onChange = vi.fn();
    render(<TypeSwitch instrument="guitar" onChange={onChange} />);
    act(() => buttons()[0].click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => buttons()[1].click());
    expect(onChange).toHaveBeenCalledWith('bass');
  });

  it('is not there for an instrument with only one kind', () => {
    for (const id of ['piano', 'violin', 'cello', 'drums']) {
      render(<TypeSwitch instrument={id} onChange={() => {}} />);
      expect(container.querySelector('.type-switch'), id).toBeNull();
    }
  });
});
