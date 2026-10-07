import { watchSound } from '../helpers/sound.js';
import { test, expect } from '@playwright/test';
const workspace = (page, name) => page.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name, exact: true });
const instrument = (page, name) => page.getByRole('group', { name: 'Practice instrument' }).getByRole('button', { name, exact: true });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('piano-practice-coach:v1')) localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: { onboarded: true, countInBars: 0, settingsVersion: 5, renderer: 'canvas' } })); });
  await page.goto('/'); await expect(page.locator('.piece-title')).toContainText('C Major');
});

test('themes persist and do not interrupt a live 3D practice session', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await setRenderer(page, '3D Stage');
  await expect(page.locator('.roll-gl canvas')).toHaveCount(2);
  await page.locator('.zone-mode button').filter({ hasText: 'Wait for me' }).click();
  await page.locator('.pad-play').click();
  await expect(page.locator('.wait-hint')).toBeVisible();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to dark theme' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.pad-play')).toContainText('Pause');
  await expect(page.locator('.roll-gl canvas')).toHaveCount(2);
  await page.locator('.pad-play').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.roll-gl canvas')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('correct first note displays 100% so far and separate piece completion', async ({ page }) => {
  await instrument(page, 'Guitar').click();
  await page.locator('.zone-mode button').filter({ hasText: 'Wait for me' }).click();
  await page.locator('.pad-play').click();
  await expect(page.locator('.wait-hint')).toContainText('E2');
  await watchSound(page);
  await page.getByRole('button', { name: 'String 6, open, E2', exact: true }).click();
  await expect(page.locator('.live-accuracy strong')).toHaveText('100%');
  await expect(page.locator('.completion-label strong')).toHaveText('1 / 24');
  await expect(page.locator('.live-timing')).toContainText('Not measured in Wait for me');
});

test('free play is audible, never records a score, and remembers handedness', async ({ page }) => {
  await instrument(page, 'Guitar').click();
  await workspace(page, 'Free play').click();
  await expect(page.locator('.pad-play')).toHaveCount(0);
  await page.getByRole('button', { name: 'Am', exact: true }).click();
  await watchSound(page);
  await page.getByRole('button', { name: '↓ Strum Am', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__studioHeardSound)).toBe(true);
  await page.getByRole('checkbox', { name: 'Left-handed' }).check();
  await page.locator('#practice-stage').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('region', { name: 'Chord workspace' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('piano-practice-coach:v1')).songs))).toEqual([]);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Left-handed' })).toBeChecked();
});

test('unified library favorites and last selected piece survive reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('group', { name: 'Library instrument' }).getByRole('button', { name: 'Guitar', exact: true }).click();
  await page.getByRole('button', { name: 'Favorite D major · melody builder', exact: true }).click();
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.locator('.song-row:visible')).toHaveCount(1);
  await page.locator('.song-row:visible .song').click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Guitar exercise' })).toHaveValue('guitar-d-major');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Guitar exercise' })).toHaveValue('guitar-d-major');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfavorite D major · melody builder', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Library instrument' }).getByRole('button', { name: 'Piano', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search pieces and composers' }).fill('Ode to Joy');
  await page.locator('.song-list .song:visible').first().click();
  await page.reload();
  await expect(page.locator('.piece-title')).toHaveText('Ode to Joy');
});

test('the stage takes most of a small laptop window, and saving is a line in the More menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const stage = await page.locator('#practice-stage').boundingBox();
  expect(stage.height / 720).toBeGreaterThanOrEqual(0.55);
  await expect(page.locator('.topbar > .saved-locally')).toHaveCount(0);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'More' });
  await expect(menu).toContainText('Saved on this device');
  await expect(menu.getByRole('button', { name: 'Help', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeFocused();
});

test('setup tests input without grading and contains keyboard focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Instrument setup', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your instrument, ready to play.' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Play a test note' }).click();
  await expect(dialog.locator('.setup-output-status')).toContainText('Test note sent');
  await expect(dialog.locator('.setup-detected')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Done', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close instrument setup' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Instrument setup', exact: true })).toBeFocused();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('piano-practice-coach:v1')).songs))).toEqual([]);
});

test('desktop focus view expands the stage and restores the side panel', async ({ page }) => {
  const before = await page.locator('.pane.center').boundingBox();
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.locator('.pane.right')).toBeHidden();
  const after = await page.locator('.pane.center').boundingBox();
  expect(after.width).toBeGreaterThan(before.width + 200);
  await page.getByRole('button', { name: 'Exit focus', exact: true }).click();
  await expect(page.locator('.pane.right')).toBeVisible();
});

async function setRenderer(page, name) {
 await page.getByRole('button',{name:'Instrument settings',exact:true}).click();
 await page.getByRole('button',{name,exact:true}).click();
 await page.keyboard.press('Escape');
}
