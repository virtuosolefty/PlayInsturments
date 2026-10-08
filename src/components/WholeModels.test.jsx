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

  it('says which are only to look at, and says nothing of the ones the stage plays in their turn', async () => {
    await render(<ModelChooser models={models} value="drums" onChoose={() => {}} onClose={() => {}} />);
    expect(card('Acoustic kit').textContent).toContain('To look at');
    expect(card('Practice kit').textContent).not.toContain('To look at');
    await render(<ModelChooser models={modelsFor('violin')} value="violin" onChoose={() => {}} onClose={() => {}} />);
    expect(card('Electric violin').textContent).not.toContain('To look at');
    expect(card('Electric violin').textContent).not.toContain('You play this one');
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

  it('stays out of the way until Whole instrument is selected, then opens the pop-up', async () => {
    await render(<WholeModels instrument="drums" active={false} />);
    expect(dialog()).toBeNull();
    await render(<WholeModels instrument="drums" active />);
    expect(dialog()).not.toBeNull();
    expect(card('Practice kit').getAttribute('aria-pressed')).toBe('true');
    expect(viewer()).toBeNull();
  });
});

describe('an instrument that is only looked at', () => {
  it('is shown in the viewer over the stage, with its maker\'s credit', async () => {
    await render(<WholeModels instrument="drums" active />);
    await click(card('Electronic kit'));
    expect(dialog()).toBeNull();
    expect(viewer().dataset.model).toBe('drums-electronic');
    const caption = container.querySelector('.model-caption');
    expect(caption.textContent).toContain('Electronic kit');
    expect(caption.textContent).toContain('SINNIK');
    expect(caption.textContent).toContain('CC BY 4.0');
  });

  it('leaves the instrument you play on the stage when that is the one chosen', async () => {
    await render(<WholeModels instrument="drums" active />);
    await click(card('Practice kit'));
    expect(dialog()).toBeNull();
    expect(viewer()).toBeNull();
    expect(container.querySelector('.model-caption')).toBeNull();
  });

  it('tells the stage when it takes the stage\'s place, and when it gives it back', async () => {
    const onShowing = vi.fn();
    await render(<WholeModels instrument="drums" active onShowing={onShowing} />);
    expect(onShowing).toHaveBeenLastCalledWith(false);
    await click(card('Acoustic kit'));
    expect(onShowing).toHaveBeenLastCalledWith(true);
    await render(<WholeModels instrument="drums" active={false} onShowing={onShowing} />);
    expect(onShowing).toHaveBeenLastCalledWith(false);
  });

  it('can be changed from the stage, with the one on show marked in the pop-up', async () => {
    await render(<WholeModels instrument="drums" active />);
    await click(card('Electronic kit'));
    await click(container.querySelector('.model-change'));
    expect(card('Electronic kit').getAttribute('aria-pressed')).toBe('true');
    await click(document.querySelector('button[aria-label="Close"]'));
    expect(viewer().dataset.model).toBe('drums-electronic');
  });

  it('is put away when the view goes back to Learn', async () => {
    await render(<WholeModels instrument="drums" active />);
    await click(card('Electronic kit'));
    await render(<WholeModels instrument="drums" active={false} />);
    expect(viewer()).toBeNull();
    expect(dialog()).toBeNull();
    expect(container.querySelector('.model-change')).toBeNull();
  });

  it('gives the stage back, and says so, when it cannot be shown', async () => {
    await render(<WholeModels instrument="drums" active />);
    await click(card('Electronic kit'));
    await click(viewer().querySelector('button'));
    expect(viewer()).toBeNull();
    expect(container.querySelector('[role="status"]').textContent).toBe('The electronic kit could not be shown. The practice kit is back on the stage.');
  });

  it('is forgotten when the instrument changes', async () => {
    await render(<WholeModels instrument="drums" active />);
    await click(card('Electronic kit'));
    await render(<WholeModels instrument="cello" active />);
    expect(viewer()).toBeNull();
  });
});

describe('an instrument the stage plays in the whole-instrument view', () => {
  it('is handed to the stage, which puts it on its own rig: no viewer', async () => {
    const onStage = vi.fn();
    await render(<WholeModels instrument="guitar" active staged="guitar" onStage={onStage} />);
    expect(card('Acoustic guitar').getAttribute('aria-pressed')).toBe('true');
    await click(card('Bass guitar'));
    expect(onStage).toHaveBeenCalledWith('guitar-bass');
    expect(dialog()).toBeNull();
    expect(viewer()).toBeNull();
  });

  it('is named, with its maker\'s credit, once the stage says it is showing it', async () => {
    await render(<WholeModels instrument="guitar" active staged="guitar-bass" onStage={() => {}} />);
    await click(document.querySelector('button[aria-label="Close"]'));
    const caption = container.querySelector('.model-caption');
    expect(caption.textContent).toContain('Bass guitar');
    expect(caption.textContent).toContain('Kanade_Tatibana');
    expect(viewer()).toBeNull();
    await click(container.querySelector('.model-change'));
    expect(card('Bass guitar').getAttribute('aria-pressed')).toBe('true');
  });

  it('has no caption while the stage shows the instrument you play', async () => {
    await render(<WholeModels instrument="guitar" active staged="guitar" onStage={() => {}} />);
    expect(container.querySelector('.model-caption')).toBeNull();
  });

  it('gives way to the instrument you play when that is chosen again', async () => {
    const onStage = vi.fn();
    await render(<WholeModels instrument="violin" active staged="violin-electric" onStage={onStage} />);
    await click(card('Violin'));
    expect(onStage).toHaveBeenCalledWith('violin');
  });

  it('shows what the stage says went wrong with it', async () => {
    await render(<WholeModels instrument="guitar" active staged="guitar" onStage={() => {}} stageNotice="The bass guitar could not be shown. The acoustic guitar is back on the stage." />);
    expect(container.querySelector('[role="status"]').textContent).toBe('The bass guitar could not be shown. The acoustic guitar is back on the stage.');
  });

});
