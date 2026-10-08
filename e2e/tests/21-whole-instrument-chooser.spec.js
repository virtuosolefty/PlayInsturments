import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { SHOWN_ONLY_MODEL } from '../helpers/models.js';
import { chooseWorkspace as workspace } from '../helpers/workspace.js';

/**
 * Choosing which instrument the whole-instrument view shows. Selecting Whole
 * instrument opens a pop-up of pictures; the instrument that is played stays
 * on the stage, and any other is shown in its place until Learn.
 *
 * The instruments that are only shown are prepared from downloads, so which
 * of them a checkout has varies. These tests serve their own: the cello that
 * is always there stands in for whichever one a test offers, and the rest are
 * answered as missing.
 *
 * The stage is at full detail, which headless Chromium draws in software at a
 * frame or two a second, so every test is marked slow.
 */

const STAND_IN = readFileSync(new URL('../../public/models/cello.glb', import.meta.url));
const SHOWN = { showcase: true, view: { azimuthDeg: 20, elevationDeg: 12 }, bounds: JSON.parse(readFileSync(new URL('../../public/models/cello.json', import.meta.url), 'utf8')).bounds };

const stage = page => page.locator('.guitar-stage').first();
const viewButton = (page, name) => page.getByRole('group', { name: 'Stage view' }).getByRole('button', { name, exact: true });
const chooser = page => page.getByRole('dialog', { name: 'Whole instrument' });
const cards = page => chooser(page).locator('.model-card');
const card = (page, name) => cards(page).filter({ has: page.getByText(name, { exact: true }) });
const viewer = page => page.locator('.model-viewer');
const hint = page => stage(page).locator('.guitar-stage-bottom .guitar-stage-hint');

/** Serves `there` (model ids) from the stand-in and answers every other shown-only model as missing. */
async function serveModels(page, there, { brokenFiles = [] } = {}) {
  await page.route(SHOWN_ONLY_MODEL, route => {
    const [, id, kind] = route.request().url().match(/\/models\/([a-z-]+)\.(json|glb)$/);
    if (!there.includes(id)) return route.fulfill({ status: 404, body: 'Not found' });
    if (kind === 'json') return route.fulfill({ json: { name: id, ...SHOWN } });
    if (brokenFiles.includes(id)) return route.fulfill({ status: 500, body: 'Broken' });
    return route.fulfill({ body: STAND_IN, contentType: 'model/gltf-binary' });
  });
}

async function open(page, instrument) {
  await page.addInitScript(practiceInstrument => {
    localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: { settingsVersion: 5, onboarded: true, renderer: 'gl', practiceInstrument, countInBars: 0, stageQuality: 'full', learningView: 'studio' } }));
  }, instrument);
  await page.goto('/');
  await expect(stage(page).locator('canvas').first()).toBeVisible({ timeout: 60_000 });
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // A request these tests answer as missing or broken is logged by the browser itself.
  page.on('console', message => { if (message.type() === 'error' && !/fetchPriority|Failed to load resource/.test(message.text())) errors.push(message.text()); });
  return errors;
}

test('Whole instrument opens a pop-up of pictures; another instrument takes the stage until Learn', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await serveModels(page, ['cello-antique']);
  await open(page, 'cello');
  await workspace(page, 'Free play');
  await viewButton(page, 'Whole instrument').click({ timeout: 60_000 });

  await expect(chooser(page)).toBeVisible();
  await expect(cards(page).locator('strong')).toHaveText(['Cello', 'Antique cello']);
  await expect(card(page, 'Cello')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'Cello')).toBeFocused();
  await expect(card(page, 'Cello')).toContainText('You play this one');
  // The played cello's picture ships with the app.
  await expect.poll(() => card(page, 'Cello').locator('img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);

  await card(page, 'Antique cello').click();
  await expect(chooser(page)).toBeHidden();
  await expect(viewer(page)).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(viewer(page)).toHaveAttribute('data-model', 'cello-antique');
  const caption = page.locator('.model-caption');
  await expect(caption).toContainText('Antique cello');
  await expect(caption.getByRole('link', { name: 'slidon' })).toHaveAttribute('href', 'https://sketchfab.com/slidon');
  await expect(caption.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  await expect(hint(page)).toHaveText('Drag to turn · Learn to play');

  // Dragging turns it; Reset view puts it back.
  const box = await viewer(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await expect(viewer(page).getByRole('button', { name: 'Reset view' })).toBeVisible();
  await viewer(page).getByRole('button', { name: 'Reset view' }).click();
  await expect(viewer(page).getByRole('button', { name: 'Reset view' })).toHaveCount(0);

  // The pop-up comes back from the stage, with the one on show marked; Escape leaves things as they are.
  await page.getByRole('button', { name: 'Choose instrument', exact: true }).click();
  await expect(card(page, 'Antique cello')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(chooser(page)).toBeHidden();
  await expect(viewer(page)).toHaveCount(1);

  // Choosing the cello that is played puts the stage's own back.
  await page.getByRole('button', { name: 'Choose instrument', exact: true }).click();
  await card(page, 'Cello').click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(viewButton(page, 'Whole instrument')).toHaveAttribute('aria-pressed', 'true');

  // Learn puts everything away.
  await page.getByRole('button', { name: 'Choose instrument', exact: true }).click();
  await card(page, 'Antique cello').click();
  await expect(viewer(page)).toHaveCount(1);
  await viewButton(page, 'Learn').click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose instrument', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('with only the played instrument there, Whole instrument shows it without a pop-up', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await serveModels(page, []);
  await open(page, 'guitar');
  await workspace(page, 'Free play');
  await viewButton(page, 'Whole instrument').click({ timeout: 60_000 });
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'guitar', { timeout: 60_000 });
  await expect(chooser(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose instrument', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an instrument that cannot be shown gives the stage back and says so', async ({ page }) => {
  test.slow();
  await serveModels(page, ['guitar-bass'], { brokenFiles: ['guitar-bass'] });
  await open(page, 'guitar');
  await workspace(page, 'Free play');
  await viewButton(page, 'Whole instrument').click({ timeout: 60_000 });
  await card(page, 'Bass guitar').click();
  await expect(page.locator('.model-notice')).toHaveText('The bass guitar could not be shown. The acoustic guitar is back on the stage.', { timeout: 30_000 });
  await expect(viewer(page)).toHaveCount(0);
  await expect(viewButton(page, 'Whole instrument')).toHaveAttribute('aria-pressed', 'true');
});

test('the drum kit offers its other kits in free play, and keeps the practice kit for playing', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await serveModels(page, ['drums-acoustic']);
  await open(page, 'drums');
  // A lesson has one kit: the one that is hit.
  await expect(page.getByRole('group', { name: 'Stage view' })).toHaveCount(0);
  await workspace(page, 'Free play');
  await viewButton(page, 'Whole instrument').click({ timeout: 60_000 });
  await expect(cards(page).locator('strong')).toHaveText(['Practice kit', 'Acoustic kit']);
  await card(page, 'Acoustic kit').click();
  await expect(viewer(page)).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(page.locator('.model-caption')).toContainText('art.katja');
  await expect(hint(page)).toHaveText('Drag to turn · Learn to play the kit');
  // The names over the practice kit are not left floating over another kit.
  await expect(page.locator('.drum-labels')).toBeHidden();

  await viewButton(page, 'Learn').click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(page.locator('.drum-labels')).toBeVisible();
  await expect(hint(page)).toHaveText('Tap a drum to play · drag the floor to turn');
  expect(errors).toEqual([]);
});
