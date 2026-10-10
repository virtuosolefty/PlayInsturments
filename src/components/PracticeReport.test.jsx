/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PracticeReport from './PracticeReport.jsx';

let container, root;
const render = ui => act(() => root.render(ui));
const button = name => [...container.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(name));

const result = (over = {}) => ({
  title: 'Meet the six strings', mode: 'practice', rate: 0.8, performance: [], passages: [],
  summary: { hit: 12, total: 12, wrongNotes: 0, meanAbsDeviationMs: 30, velocitySpread: 0.1, tooLoud: 0, tooSoft: 0 },
  grade: { headline: 'Solid run', blurb: 'Steady all the way through.', complete: true, stars: 3, coverage: 1, overall: 80, bands: { notes: 100, timing: 70, dynamics: 75 } },
  ...over,
});

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('the practice report', () => {
  it('says a complete run is finished, apart from its stars', () => {
    render(<PracticeReport result={result()} onClose={() => {}} />);
    expect(container.querySelector('.report-finished').textContent).toContain('Finished');
    expect(container.querySelector('.stars-row').getAttribute('aria-label')).toBe('3 out of 5 stars');
    render(<PracticeReport result={result({ grade: { ...result().grade, complete: false, coverage: 0.4 } })} onClose={() => {}} />);
    expect(container.querySelector('.report-finished')).toBeNull();
  });

  it('offers the run again one step slower, and the next lesson when there is one', () => {
    const onApplyRate = vi.fn(), go = vi.fn();
    render(<PracticeReport result={result()} onApplyRate={onApplyRate} onClose={() => {}} next={{ label: 'Next lesson', go }} />);
    expect(button('Slower').textContent).toBe('Slower · 70%');
    act(() => button('Slower').click());
    expect(onApplyRate).toHaveBeenCalledWith(0.7);
    act(() => button('Next lesson').click());
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('does not offer slower than the slider goes, or a next lesson that is not there', () => {
    render(<PracticeReport result={result({ rate: 0.4 })} onClose={() => {}} />);
    expect(button('Slower')).toBeUndefined();
    expect(button('Next')).toBeUndefined();
    expect(button('↻ Run again')).toBeDefined();
  });
});
