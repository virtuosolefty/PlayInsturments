import { test, expect } from '@playwright/test';
import { onlyPlayedModels } from '../helpers/models.js';
import { chooseWorkspace as workspace } from '../helpers/workspace.js';

/**
 * The two guitars on the full stage. Lessons, and free play's Learn view,
 * play the guitar built in code (concept G3), whose wider strings are easier
 * to hit; free play's Whole instrument view shows the downloaded model from
 * three-quarters (G1). The model is fetched the first time free play opens.
 * The light stage keeps the drawn guitar everywhere, and so does the full
 * stage when the model cannot be loaded.
 *
 * Headless Chromium draws the full stage in software at a frame or two a
 * second, so these tests are marked slow.
 */

const stage = page => page.locator('.guitar-stage');
const stageView = page => page.getByRole('group', { name: 'Stage view' });
const viewButton = (page, name) => stageView(page).getByRole('button', { name, exact: true });
const labels = (page, kind) => page.locator(`.guitar-position-label${kind ? `.${kind}` : ''}`);
const modelAsked = page => page.evaluate(() => performance.getEntriesByType('resource').some(entry => /\/models\/guitar\.(glb|json)/.test(entry.name)));

const status = page => page.locator('.guitar-stage .stage-status');
const inside = (inner, outer) => inner.x >= outer.x - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5;

/** Opens the guitar studio at the given 3D detail. The full stage's first frame takes seconds in software. */
async function open(page, stageQuality) {
  // These tests are about the guitar that is played; choosing another to look at is spec 21.
  await onlyPlayedModels(page);
  await page.addInitScript(quality => {
    localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: { settingsVersion: 5, onboarded: true, renderer: 'gl', practiceInstrument: 'guitar', countInBars: 0, stageQuality: quality } }));
  }, stageQuality);
  await page.goto('/');
  await expect(stage(page).locator('canvas')).toBeVisible({ timeout: 60_000 });
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && !/fetchPriority|Failed to load resource.*404/.test(message.text())) errors.push(message.text()); });
  return errors;
}

test('lessons and Learn play the drawn guitar; Whole instrument shows the downloaded one', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await open(page, 'full');
  await expect(stage(page)).toHaveAttribute('data-stage-tier', 'full');
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'drawn');
  // String names carry their number, as tablature counts them, and their octave.
  await expect(labels(page, 'fret')).toHaveCount(12, { timeout: 30_000 });
  await expect(labels(page, 'string')).toHaveText(['6 E2', '5 A2', '4 D3', '3 G3', '2 B3', '1 E4']);
  // A lesson has no other view, so the model is not fetched for it.
  await expect(stageView(page)).toHaveCount(0);
  expect(await modelAsked(page)).toBe(false);

  await workspace(page, 'Free play');
  // Free play opens on Learn: the same playable neck, with the E minor shape's two fingers and four open strings.
  await expect(viewButton(page, 'Learn')).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'drawn');
  await expect(labels(page, 'finger')).toHaveCount(6, { timeout: 30_000 });
  // A fret plays its note: fret 4 on the G string is B3.
  await page.evaluate(async () => { window.__notes = []; (await import('/src/lib/midiInput.js')).midiInput.onMessage(m => window.__notes.push(m)); });
  const fret = await labels(page, 'fret').getByText('4', { exact: true }).boundingBox();
  const string = await labels(page, 'string').getByText('G3', { exact: true }).boundingBox();
  await page.mouse.click(fret.x + fret.width / 2, string.y + string.height / 2);
  await expect.poll(() => page.evaluate(() => window.__notes.find(m => m.type === 'noteon')?.midi), { timeout: 30_000 }).toBe(59);

  await viewButton(page, 'Whole instrument').click();
  await expect(viewButton(page, 'Whole instrument')).toHaveAttribute('aria-pressed', 'true');
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'guitar', { timeout: 60_000 });
  // The whole guitar is too small to label.
  await expect(labels(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.guitar-stage-hint')).toContainText('Learn to play the frets');

  await viewButton(page, 'Learn').click();
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'drawn', { timeout: 15_000 });
  await expect(labels(page, 'fret')).toHaveCount(12, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('the light stage keeps the guitar built in code, with no other view to switch to', async ({ page }) => {
  await open(page, 'light');
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'drawn');
  await workspace(page, 'Free play');
  await expect(labels(page, 'fret')).toHaveCount(12);
  await expect(stageView(page)).toHaveCount(0);
  // The model is never fetched for the light stage.
  expect(await modelAsked(page)).toBe(false);
});

test('when the model cannot be loaded, free play keeps the drawn guitar, says so, and keeps the switch to try again', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await page.route('**/models/guitar.glb', route => route.fulfill({ status: 404, body: '' }));
  await open(page, 'full');
  await expect(stage(page)).toHaveAttribute('data-stage-tier', 'full');
  await workspace(page, 'Free play');
  await expect(labels(page, 'fret')).toHaveCount(12, { timeout: 30_000 });
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'drawn');
  // A model that failed while nobody was waiting for it says nothing.
  await expect(viewButton(page, 'Learn')).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await expect(status(page)).toBeEmpty();
  // Asking for it tries again, and says why the drawn guitar stays, without losing the keyboard's place.
  const whole = viewButton(page, 'Whole instrument');
  await whole.focus();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('The 3D guitar could not be loaded. Choose Whole instrument to try again.', { timeout: 30_000 });
  await expect(viewButton(page, 'Learn')).toHaveAttribute('aria-pressed', 'true');
  await expect(whole).toBeFocused();
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'drawn');
  // The browser logs the missing file this test serves; nothing else may go wrong.
  expect(errors.filter(message => !/Failed to load resource.*404/.test(message))).toEqual([]);
});

for (const width of [390, 360]) {
  test(`on a ${width}px phone the legend, the view switch and Reset view all fit on the stage`, async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width, height: 800 });
    await open(page, 'full');
    await workspace(page, 'Free play');
    await expect(viewButton(page, 'Learn')).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
    await stage(page).scrollIntoViewIfNeeded();
    const room = await stage(page).boundingBox();
    // The second button shows "Whole" here, and keeps its full name.
    await expect(viewButton(page, 'Whole instrument')).toHaveText('Whole', { useInnerText: true });
    expect(inside(await page.getByRole('group', { name: 'Stage view' }).boundingBox(), room)).toBe(true);
    // Turn the view from the background, so Reset view appears beside the switch.
    const canvas = await stage(page).locator('canvas').boundingBox();
    const reset = page.getByRole('button', { name: 'Reset view', exact: true });
    for (const [fx, fy] of [[0.5, 0.88], [0.12, 0.3], [0.85, 0.3]]) {
      const x = canvas.x + canvas.width * fx, y = canvas.y + canvas.height * fy;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 90, y + 20, { steps: 10 });
      await page.mouse.up();
      if (await reset.isVisible().catch(() => false)) break;
    }
    await expect(reset).toBeVisible({ timeout: 15_000 });
    expect(inside(await reset.boundingBox(), room)).toBe(true);
    expect(inside(await page.locator('.guitar-stage-legend').boundingBox(), room)).toBe(true);
    // Nothing was pushed out of view for the stage to scroll to.
    expect(await stage(page).evaluate(el => el.scrollLeft)).toBe(0);
  });
}
