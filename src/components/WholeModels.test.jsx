/**
 * @vitest-environment jsdom
 *
 * Choosing which instrument the whole-instrument view shows: the pop-up of
 * pictures that opens when Whole instrument is selected, and what follows a
 * choice. The 3D viewer itself needs a graphics card, so it is stood in for.
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModelChooser from './ModelChooser.jsx';
import WholeModels from './WholeModels.jsx';
import { modelsFor } from '../lib/stageModels.js';

// Which of the instruments that are only shown have their files on the server.
const server = vi.hoisted(() => ({ has: () => true }));
vi.mock('../lib/stage/modelAvailability.js', () => ({ modelAvailable: async id => server.has(id) }));

vi.mock('./ModelViewer.jsx', () => ({
  default: ({ model, onFailed }) => <div data-testid="viewer" data-model={model.id}><button onClick={() => onFailed('no graphics')}>break</button></div>,
}));

let container;
let root;

const render = ui => act(async () => { root.render(ui); });
const dialog = () => document.querySelector('[role="dialog"]');
const card = name => [...document.querySelectorAll('.model-card')].find(button => button.querySelector('strong').textContent === name);
const click = element => act(async () => { element.click(); });
const viewer = () => container.querySelector('[data-testid="viewer"]');

beforeEach(() => {
  server.has = () => true;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the pop-up of instruments to choose from', () => {
  const models = modelsFor('drums');

  it('shows each one with its picture, its name and a line about it', async () => {
    await render(<ModelChooser instrument="drums" models={models} value="drums" onChoose={() => {}} onClose={() => {}} />);
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(dialog().textContent).toContain('Whole instrument');
    const cards = [...document.querySelectorAll('.model-card')];
    expect(cards.map(button => button.querySelector('strong').textContent)).toEqual(['Practice kit', 'Acoustic kit', 'Electronic kit']);
    expect(cards.map(button => button.querySelector('img').getAttribute('src'))).toEqual(models.map(model => `/media/models/${model.id}.webp`));
    expect(card('Electronic kit').textContent).toContain('Mesh pads on a rack');
  });

  it('marks the one being shown, and says which is the one you play', async () => {
    await render(<ModelChooser instrument="drums" models={models} value="drums-acoustic" onChoose={() => {}} onClose={() => {}} />);
    expect(card('Acoustic kit').getAttribute('aria-pressed')).toBe('true');
    expect(card('Practice kit').getAttribute('aria-pressed')).toBe('false');
    expect(card('Practice kit').textContent).toContain('You play this one');
    expect(card('Acoustic kit').textContent).not.toContain('You play this one');
  });

  it('tells its opener which was chosen, and when it is closed', async () => {
    const onChoose = vi.fn(), onClose = vi.fn();
    await render(<ModelChooser instrument="drums" models={models} value="drums" onChoose={onChoose} onClose={onClose} />);
    await click(card('Electronic kit'));
    expect(onChoose).toHaveBeenCalledWith('drums-electronic');
    await click(document.querySelector('button[aria-label="Close"]'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps a card usable when its picture is missing', async () => {
    await render(<ModelChooser instrument="drums" models={models} value="drums" onChoose={() => {}} onClose={() => {}} />);
    const picture = card('Acoustic kit').querySelector('img');
    await act(async () => { picture.dispatchEvent(new Event('error')); });
    expect(card('Acoustic kit').classList.contains('no-picture')).toBe(true);
    expect(card('Acoustic kit').querySelector('strong').textContent).toBe('Acoustic kit');
  });
});

describe('the whole-instrument view\'s choice of instrument', () => {
  it('offers nothing where there is nothing to choose', async () => {
    await render(<WholeModels instrument="piano" active />);
    expect(container.innerHTML).toBe('');
    expect(dialog()).toBeNull();
  });

  it('has no pop-up when only the instrument you play is there to see', async () => {
    server.has = () => false;
    await render(<WholeModels instrument="guitar" active />);
    expect(dialog()).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('offers only the instruments whose files are there', async () => {
    server.has = id => id === 'drums-electronic';
    await render(<WholeModels instrument="drums" active />);
    expect([...document.querySelectorAll('.model-card strong')].map(name => name.textContent)).toEqual(['Practice kit', 'Electronic kit']);
  });

  it('tells the stage when another instrument takes its place, and when it gives it back', async () => {
    const onShowing = vi.fn();
    await render(<WholeModels instrument="guitar" active onShowing={onShowing} />);
    expect(onShowing).toHaveBeenLastCalledWith(false);
    await click(card('Bass guitar'));
    expect(onShowing).toHaveBeenLastCalledWith(true);
    await render(<WholeModels instrument="guitar" active={false} onShowing={onShowing} />);
    expect(onShowing).toHaveBeenLastCalledWith(false);
  });

  it('stays out of the way until Whole instrument is selected, then opens the pop-up', async () => {
    await render(<WholeModels instrument="guitar" active={false} />);
    expect(dialog()).toBeNull();
    await render(<WholeModels instrument="guitar" active />);
    expect(dialog()).not.toBeNull();
    expect(card('Acoustic guitar').getAttribute('aria-pressed')).toBe('true');
    expect(viewer()).toBeNull();
  });

  it('leaves the instrument you play on the stage when that is the one chosen', async () => {
    await render(<WholeModels instrument="guitar" active />);
    await click(card('Acoustic guitar'));
    expect(dialog()).toBeNull();
    expect(viewer()).toBeNull();
  });

  it('shows another instrument in its place, with its maker\'s credit', async () => {
    await render(<WholeModels instrument="guitar" active />);
    await click(card('Bass guitar'));
    expect(dialog()).toBeNull();
    expect(viewer().dataset.model).toBe('guitar-bass');
    const caption = container.querySelector('.model-caption');
    expect(caption.textContent).toContain('Bass guitar');
    expect(caption.textContent).toContain('Kanade_Tatibana');
    expect(caption.textContent).toContain('CC BY 4.0');
  });

  it('opens the pop-up again from the stage, with the one on show marked', async () => {
    await render(<WholeModels instrument="guitar" active />);
    await click(card('Bass guitar'));
    await click(container.querySelector('.model-change'));
    expect(card('Bass guitar').getAttribute('aria-pressed')).toBe('true');
    await click(document.querySelector('button[aria-label="Close"]'));
    expect(viewer().dataset.model).toBe('guitar-bass');
  });

  it('puts everything away when the view goes back to Learn', async () => {
    await render(<WholeModels instrument="guitar" active />);
    await click(card('Bass guitar'));
    await render(<WholeModels instrument="guitar" active={false} />);
    expect(viewer()).toBeNull();
    expect(dialog()).toBeNull();
    expect(container.querySelector('.model-change')).toBeNull();
  });

  it('goes back to the instrument you play, and says so, when another cannot be shown', async () => {
    await render(<WholeModels instrument="guitar" active />);
    await click(card('Bass guitar'));
    await click(viewer().querySelector('button'));
    expect(viewer()).toBeNull();
    expect(container.querySelector('[role="status"]').textContent).toBe('The bass guitar could not be shown. The acoustic guitar is back on the stage.');
  });

  it('starts again on the instrument you play when the instrument changes', async () => {
    await render(<WholeModels instrument="violin" active />);
    await click(card('Electric violin'));
    await render(<WholeModels instrument="cello" active />);
    expect(viewer()).toBeNull();
  });
});
