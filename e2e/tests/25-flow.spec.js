import { test, expect } from '@playwright/test';
import { collectErrors, seedSettings } from '../helpers/studio.js';

/**
 * Free play, practice and input, made easier to follow: free play has one row
 * of things to do and says the note played last; a chord's legend sits under
 * its diagram; the path names the lesson to do; Input & sound is three steps
 * with everything else under More options; and the top bar says when the
 * controller asked for is not there.
 */

const workspace = (page, name) => page.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name, exact: true });
const bar = page => page.getByRole('toolbar', { name: 'Free play' });

async function open(page, settings) {
  await seedSettings(page, { renderer: 'canvas', learningView: 'studio', ...settings });
  await page.goto('/');
  await expect(page.locator('.studio-header, .learning-home').first()).toBeVisible({ timeout: 30_000 });
}

test('free play has one row of things to do, and says the note played last', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, { practiceInstrument: 'guitar' });
  await expect(bar(page)).toHaveCount(0);
  await workspace(page, 'Free play').click();
  await expect(bar(page).getByRole('button')).toHaveText(['Chords', 'Tuner', 'Check input']);
  const last = page.getByRole('status', { name: 'Last note played' });
  await expect(last).toContainText('—');
  await page.getByRole('group', { name: 'Playable guitar fretboard' }).getByRole('button', { name: 'String 6, fret 3, G2' }).click();
  await expect(last).toContainText('G2');
  // Chords puts the keyboard on the chord explorer.
  await bar(page).getByRole('button', { name: 'Chords' }).click();
  await expect(page.getByRole('group', { name: 'Guitar chords' }).getByRole('button', { name: 'Em', exact: true })).toBeFocused();
  // The tuner and Input & sound open from here.
  await bar(page).getByRole('button', { name: 'Tuner' }).click();
  await page.getByRole('dialog', { name: 'Tuner' }).getByRole('button', { name: 'Close tuner' }).click();
  await bar(page).getByRole('button', { name: 'Check input' }).click();
  await expect(page.getByRole('dialog', { name: 'Your instrument, ready to play.' })).toBeVisible();
  await page.keyboard.press('Escape');
  // The piano has no explorer and no tuner, and says which computer keys play it.
  await page.getByRole('group', { name: 'Practice instrument' }).getByRole('button', { name: 'Piano', exact: true }).click();
  await workspace(page, 'Free play').click();
  await expect(bar(page).getByRole('button')).toHaveText(['Check input']);
  await expect(bar(page)).toContainText('Computer keys');
  await page.keyboard.press('d');
  await expect(last).toContainText('E4');
  expect(errors).toEqual([]);
});

test('a chord says what its colours mean under the diagram, and folds its feel away', async ({ page }) => {
  await open(page, { practiceInstrument: 'guitar' });
  await workspace(page, 'Free play').click();
  const card = page.getByRole('region', { name: 'Chord workspace' });
  await expect(card.locator('.chord-legend span')).toHaveText(['Root', 'Finger', 'Played', '○ Open', '× Muted']);
  const feel = card.locator('.chord-feel');
  await expect(feel).not.toHaveAttribute('open', '');
  await expect(feel.locator('summary')).toContainText('72% · 32 ms');
  await feel.locator('summary').click();
  await expect(card.getByRole('slider', { name: 'Strum spread' })).toBeVisible();
});

test('the path names the lesson to do, and tells finishing from stars', async ({ page }) => {
  await open(page, { practiceInstrument: 'guitar', learningView: 'home' });
  const lessons = page.locator('.learning-stage-lessons button');
  await expect(lessons.first()).toContainText('Meet the six strings');
  await expect(lessons.first().locator('.lesson-next')).toContainText('Next · Start');
  await expect(lessons.first().locator('.lesson-mark')).toHaveClass(/open/);
  // Nothing is finished yet, so no lesson shows stars.
  await expect(page.locator('.learning-stage-lessons .path-stars')).toHaveCount(0);
  await expect(page.locator('.learning-key')).toContainText('Finished: the next lesson is open');
  await expect(page.locator('.learning-key')).toContainText('How well you know it');
});

test('the tempo slider marks the written tempo and offers the way back to it', async ({ page }) => {
  await open(page, { practiceInstrument: 'piano', rate: 0.8 });
  await expect(page.locator('.tempo-target')).toBeVisible();
  const back = page.getByRole('button', { name: 'Written tempo', exact: true });
  await back.click();
  await expect(page.getByRole('slider', { name: 'Playback speed' })).toHaveValue('1');
  await expect(back).toHaveCount(0);
});

test('Input & sound is three steps, with everything else under More options', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, { practiceInstrument: 'piano' });
  await page.getByRole('button', { name: 'Input & sound', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your instrument, ready to play.' });
  await expect(dialog.locator('.setup-step .setup-section-title')).toHaveText(['✓Choose how you play', '✓Check you are heard', '3Check the sound']);
  const more = dialog.locator('.setup-more');
  await expect(more).not.toHaveAttribute('open', '');
  await more.locator('> summary').click();
  await expect(more.getByText('Sound arrives late?')).toBeVisible();
  // Touch is a controller's to measure, so it is offered when one is how you play.
  await expect(more.getByText('Keys feel too loud or too soft?')).toHaveCount(0);
  await dialog.getByRole('button', { name: /^MIDI controller/ }).click();
  await expect(more.getByText('Keys feel too loud or too soft?')).toBeVisible();
  await expect(more.getByLabel('Keyboard', { exact: true })).toBeVisible();
  await expect(more.getByRole('group', { name: 'Fit pieces to my keys' }).getByRole('button')).toHaveText(['As written', 'Octave shift', 'Fit my keys']);
  // A plugin making the sound is for the few: one more fold down.
  await expect(more.locator('.advanced-sound')).not.toHaveAttribute('open', '');
  // Measuring opens its own dialog in place of this one.
  await more.getByRole('button', { name: 'Measure the timing offset' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await page.keyboard.press('Escape');
  // The library keeps to music: the keyboard's settings are no longer a tab of it.
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveText(['Songs', 'Today’s plan', 'Progress']);
  expect(errors).toEqual([]);
});

test('a guitar is not asked about a keyboard', async ({ page }) => {
  await open(page, { practiceInstrument: 'guitar' });
  await page.getByRole('button', { name: 'Input & sound', exact: true }).click();
  const more = page.getByRole('dialog', { name: 'Your instrument, ready to play.' }).locator('.setup-more');
  await more.locator('> summary').click();
  await expect(more.getByText('Sound arrives late?')).toBeVisible();
  await expect(more.getByText('Your keyboard')).toHaveCount(0);
});

test.describe('with a controller', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__inputs = new Map();
      window.__access = { inputs: window.__inputs, outputs: new Map(), onstatechange: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => window.__access });
      window.__plugIn = () => {
        window.__inputs.set('late', { id: 'late', name: 'Late keyboard', state: 'connected', onmidimessage: null });
        window.__access.onstatechange?.();
      };
    });
  });

  test('the top bar says when the controller asked for is not there', async ({ page }) => {
    await open(page, { practiceInstrument: 'piano', inputMethod: 'midi' });
    const trigger = page.locator('.setup-trigger');
    await expect(trigger.locator('.setup-label')).toHaveText('No controller found');
    await expect(trigger).toHaveClass(/missing/);
    await page.evaluate(() => window.__plugIn());
    await expect(trigger.locator('.setup-label')).toHaveText('Controller connected');
    await expect(trigger).toHaveAttribute('title', /Late keyboard is connected/);
  });

  test('a controller plugged in while the app is open is announced, and checked in one click', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, { practiceInstrument: 'piano' });
    await expect(page.locator('.setup-label')).toHaveText('Input & sound');
    await expect(page.locator('.device-toast')).toHaveCount(0);
    await page.evaluate(() => window.__plugIn());
    const toast = page.locator('.device-toast');
    await expect(toast).toContainText('Late keyboard is connected and ready to play.');
    await toast.getByRole('button', { name: 'Check it' }).click();
    await expect(toast).toHaveCount(0);
    const dialog = page.getByRole('dialog', { name: 'Your instrument, ready to play.' });
    await expect(dialog.getByRole('button', { name: /^MIDI controller/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('combobox', { name: 'MIDI input' })).toHaveValue('late');
    expect(errors).toEqual([]);
  });
});
