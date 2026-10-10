import { test, expect } from '@playwright/test';
import { collectErrors, seedSettings } from '../helpers/studio.js';
import { chooseWorkspace as workspace } from '../helpers/workspace.js';

/**
 * The bass: its own lessons, its own four strings and its own voice, in the
 * guitar's studio, behind the guitar's button.
 *
 * These run on the drawn fretboard, which is what headless Chromium shows. The bass on its 3D model is the last test, at full detail.
 */

const notes = page => page.evaluate(() => window.__notes.filter(m => m.type === 'noteon').map(m => m.midi));
const listen = page => page.evaluate(async () => { window.__notes = []; (await import('/src/lib/midiInput.js')).midiInput.onMessage(m => window.__notes.push(m)); });
const picker = page => page.getByRole('group', { name: 'Practice instrument' });

/** Opens an instrument's studio as a returning player would find it. */
async function open(page, instrument, settings = {}) {
  await seedSettings(page, { practiceInstrument: instrument, renderer: 'canvas', learningView: 'studio', ...settings });
  await page.goto('/');
  // The studio, or the learning home when that is where the player left off.
  await expect(page.locator('.studio-header, .learning-home').first()).toBeVisible({ timeout: 30_000 });
}

const kind = (page, name) => page.getByRole('group', { name: 'Instrument type' }).getByRole('button', { name, exact: true });

test('the picker offers five instruments, and the bass is a kind of guitar', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, 'piano');
  await expect(picker(page).getByRole('button')).toHaveText(['Piano', 'Guitar', 'Violin', 'Cello', 'Drums']);
  await picker(page).getByRole('button', { name: 'Violin', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Violin studio' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Instrument type' })).toHaveCount(0);
  for (const [family, other, region] of [['Guitar', 'Bass', 'Bass studio']]) {
    await picker(page).getByRole('button', { name: family, exact: true }).click();
    await expect(kind(page, family)).toHaveAttribute('aria-pressed', 'true');
    await kind(page, other).click();
    await expect(page.getByRole('region', { name: region })).toBeVisible();
    await expect(page.locator('.studio-heading h2')).toHaveText('Meet the four strings');
    // The family's own button stays pressed, and comes back to the kind last used.
    await expect(picker(page).getByRole('button', { name: family, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await picker(page).getByRole('button', { name: 'Piano', exact: true }).click();
    await picker(page).getByRole('button', { name: family, exact: true }).click();
    await expect(page.getByRole('region', { name: region })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('the bass plays low notes one at a time, with open strings in place of chords', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, 'bass');
  const board = page.getByRole('group', { name: 'Playable bass fretboard' });
  await expect(board.locator('.string-name')).toHaveText(['G2', 'D2', 'A1', 'E1']);
  await expect(page.locator('.guitar-next strong')).toHaveText('E1 · string 4 · open');
  await listen(page);
  await board.getByRole('button', { name: 'String 4, fret 3, G1' }).click();
  await expect.poll(() => notes(page)).toEqual([31]);
  await workspace(page, 'Free play');
  await expect(page.getByRole('region', { name: 'Open strings' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Chord workspace' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pick string 3: A1' }).click();
  await expect.poll(() => notes(page)).toEqual([31, 33]);
  expect(errors).toEqual([]);
});

test('the bass has a learning path, a first lesson and its ten songs on the home page', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, 'bass', { learningView: 'home' });
  await expect(page.getByRole('group', { name: 'Learning instrument' }).getByRole('button', { name: 'Guitar', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(kind(page, 'Bass')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.next-lesson-card h3')).toHaveText('Meet the four strings');
  await expect(page.locator('.learning-roadmap > header')).toContainText('0 / 6 lessons finished');
  await page.getByRole('group', { name: 'Song collections' }).getByRole('button', { name: 'Songs you already know' }).click();
  await expect(page.locator('.discovery-card h4')).toHaveCount(10);
  await expect(page.locator('.discovery-card h4').first()).toHaveText('Hot Cross Buns');
  expect(errors).toEqual([]);
});

test('at full detail the bass is played on its 3D model, four strings named at the nut', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await open(page, 'bass', { renderer: 'gl', stageQuality: 'full' });
  const stage = page.locator('.fretted-model-stage');
  await expect(stage).toHaveAttribute('data-stage-model', 'guitar-bass', { timeout: 90_000 });
  // Each name carries its tablature number: string 4 is the low E.
  await expect(page.locator('.guitar-position-label.string')).toHaveText(['4 E1', '3 A1', '2 D2', '1 G2'], { timeout: 60_000 });
  // The lesson's next note is marked on the model, and the drawn fretboard is still a click away.
  await expect(stage).toHaveAttribute('data-target-positions', '1', { timeout: 30_000 });
  await expect(page.locator('.guitar-fret-controls')).not.toHaveAttribute('open', '');
  expect(errors).toEqual([]);
});
