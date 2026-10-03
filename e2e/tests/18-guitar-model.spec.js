import { test, expect } from '@playwright/test';

/**
 * The downloaded guitar on the full stage: lessons frame its neck (concept
 * G3); free play shows it whole from three-quarters (G1) and swings in to a
 * close-up of the neck to play. The light stage keeps the guitar built in
 * code, and so does the full stage when the model cannot be loaded.
 *
 * Headless Chromium draws the full stage in software at a frame or two a
 * second, so these tests are marked slow.
 */

const stage = page => page.locator('.guitar-stage');
const workspace = (page, name) => page.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name, exact: true }).click();
const closeUp = page => page.getByRole('button', { name: 'Close-up', exact: true });
const labels = (page, kind) => page.locator(`.guitar-position-label${kind ? `.${kind}` : ''}`);

/** Opens the guitar studio at the given 3D detail. The full stage's first frame takes seconds in software. */
async function open(page, stageQuality) {
  await page.addInitScript(quality => {
    localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: { settingsVersion: 5, onboarded: true, renderer: 'gl', practiceInstrument: 'guitar', countInBars: 0, stageQuality: quality } }));
  }, stageQuality);
  await page.goto('/');
  await expect(stage(page).locator('canvas')).toBeVisible({ timeout: 60_000 });
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && !/fetchPriority/.test(message.text())) errors.push(message.text()); });
  return errors;
}

test('the full stage shows the downloaded guitar, whole in free play and close up to play', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await open(page, 'full');
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'guitar', { timeout: 60_000 });
  // The lesson frames the neck, labelled as before.
  await expect(labels(page, 'fret')).toHaveCount(12, { timeout: 30_000 });
  await expect(labels(page, 'string')).toHaveCount(6);

  await workspace(page, 'Free play');
  await expect(closeUp(page)).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
  // The whole guitar is too small to label.
  await expect(labels(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.guitar-stage-hint')).toContainText('Close-up');

  await closeUp(page).click();
  await expect(closeUp(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(labels(page, 'fret')).toHaveCount(12, { timeout: 15_000 });
  await expect(labels(page, 'string')).toHaveCount(6);
  // The E minor shape: two fingers and four open strings.
  await expect(labels(page, 'finger')).toHaveCount(6);

  // A fret in the close-up plays its note: fret 4 on the G string is B3.
  await page.evaluate(async () => { window.__notes = []; (await import('/src/lib/midiInput.js')).midiInput.onMessage(m => window.__notes.push(m)); });
  const fret = await labels(page, 'fret').getByText('4', { exact: true }).boundingBox();
  const string = await labels(page, 'string').getByText('G3', { exact: true }).boundingBox();
  await page.mouse.click(fret.x + fret.width / 2, string.y + string.height / 2);
  await expect.poll(() => page.evaluate(() => window.__notes.find(m => m.type === 'noteon')?.midi), { timeout: 30_000 }).toBe(59);

  await closeUp(page).click();
  await expect(closeUp(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(labels(page)).toHaveCount(0, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('the light stage keeps the guitar built in code, with nothing to close in on', async ({ page }) => {
  await open(page, 'light');
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'drawn');
  await workspace(page, 'Free play');
  await expect(labels(page, 'fret')).toHaveCount(12);
  await expect(closeUp(page)).toHaveCount(0);
  // The model is never fetched for the light stage.
  const asked = await page.evaluate(() => performance.getEntriesByType('resource').some(entry => /\/models\/guitar\.(glb|json)/.test(entry.name)));
  expect(asked).toBe(false);
});

test('when the model cannot be loaded, the full stage shows the drawn guitar instead', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await page.route('**/models/guitar.glb', route => route.fulfill({ status: 404, body: '' }));
  await open(page, 'full');
  await expect(stage(page)).toHaveAttribute('data-stage-tier', 'full');
  await expect(labels(page, 'fret')).toHaveCount(12, { timeout: 30_000 });
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'drawn');
  await workspace(page, 'Free play');
  await expect(labels(page, 'fret')).toHaveCount(12, { timeout: 30_000 });
  await expect(closeUp(page)).toHaveCount(0);
  // The browser logs the missing file this test serves; nothing else may go wrong.
  expect(errors.filter(message => !/Failed to load resource.*404/.test(message))).toEqual([]);
});
