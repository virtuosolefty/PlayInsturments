import { watchSound } from '../helpers/sound.js';
import { test, expect } from '@playwright/test';
import { seedSettings } from '../helpers/studio.js';

test.beforeEach(async ({ page }) => {
  await seedSettings(page, { renderer: 'canvas' }, { everyLoad: true });
  await page.goto('/');
  await expect(page.locator('.piece-title')).toContainText('C Major');
});

const guitar = page => page.getByRole('group', { name: 'Practice instrument' }).getByRole('button', { name: 'Guitar', exact: true });
const piano = page => page.getByRole('group', { name: 'Practice instrument' }).getByRole('button', { name: 'Piano', exact: true });

test('guitar input is audible and a correct open string is scored by the shared engine', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await guitar(page).click();
  await expect(page.getByRole('combobox', { name: 'Guitar exercise' })).toHaveValue('guitar-open-strings');
  await page.locator('.zone-mode button').filter({ hasText: 'Wait for me' }).click();
  await page.locator('.pad-play').click();
  await expect(page.locator('.wait-hint')).toContainText('E2');
  await watchSound(page);
  await page.getByRole('button', { name: 'String 6, open, E2', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__studioHeardSound)).toBe(true);
  await expect(page.locator('.io-strip')).toContainText('Guitar · synthesized');
  await expect(page.locator('.guitar-next')).toContainText('A2');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('.report:not(.first-run)')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('piano-practice-coach:v1')));
  expect(stored.songs['guitar-open-strings'].sessions).toHaveLength(1);
  expect(stored.songs['guitar-open-strings'].sessions[0].variant).toBe('guitar:standard:12');
  expect(Object.keys(stored.songs).every(id => id.startsWith('guitar-'))).toBe(true);
  expect(errors).toEqual([]);
});

test('piano settings survive a guitar visit; guitar studies and chords are interactive', async ({ page }) => {
  await page.getByRole('button', { name: 'Practice settings', exact: true }).click();
  await page.getByRole('button', { name: 'Right hand', exact: true }).click();
  await page.keyboard.press('Escape');
  await guitar(page).click();
  await page.getByRole('combobox', { name: 'Guitar exercise' }).selectOption('guitar-c-major');
  await expect(page.locator('.guitar-next')).toContainText('C3 · string 5 · fret 3');
  await page.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Free play', exact: true }).click();
  await page.getByRole('button', { name: 'Am', exact: true }).click();
  await watchSound(page);
  await page.getByRole('button', { name: '↓ Strum Am', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Left-handed' }).check();
  await expect(page.locator('.guitar-fretboard')).toHaveClass(/left-handed/);
  await page.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Learn', exact: true }).click();
  await piano(page).click();
  await page.getByRole('button', { name: 'Practice settings', exact: true }).click();
  await expect(page.locator('.hands-switch button.on')).toHaveText('Right hand');
  await page.keyboard.press('Escape');
  await expect(page.locator('.piece-title')).toContainText('C Major');
  await guitar(page).click();
  await expect(page.getByRole('combobox', { name: 'Guitar exercise' })).toHaveValue('guitar-c-major');
  const restored = await page.context().newPage();
  await restored.goto('/');
  await expect(restored.getByRole('combobox', { name: 'Guitar exercise' })).toHaveValue('guitar-c-major');
  await restored.close();
});

test('Three.js renders both instruments and recovers from context loss', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await setRenderer(page, '3D Stage');
  await expect(page.locator('.roll-gl canvas')).toHaveCount(2);
  for (let i = 0; i < 3; i++) {
    await guitar(page).click();
    await expect(page.locator('.guitar-stage canvas')).toBeVisible();
    await piano(page).click();
    await expect(page.locator('.roll-gl canvas')).toHaveCount(2);
  }
  await guitar(page).click();
  await expect(page.locator('.guitar-stage canvas')).toBeVisible();
  await page.locator('.guitar-stage canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('button',{name:'Instrument settings',exact:true}).click();
  await expect(page.getByRole('button', { name: '2D Trainer', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.guitar-fretboard')).toBeVisible();
  expect(errors).toEqual([]);
});

test('library search finds a piano piece', async ({ page }) => {
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search pieces and composers' }).fill('Ode to Joy');
  await expect(page.locator('.song-list .song')).not.toHaveCount(0);
  await expect(page.locator('.song-list .song').first()).toContainText('Ode to Joy');
  await page.getByRole('button', { name: 'Library', exact: true }).click();

});

async function setRenderer(page, name) {
 await page.getByRole('button',{name:'Instrument settings',exact:true}).click();
 await page.getByRole('button',{name,exact:true}).click();
 await page.keyboard.press('Escape');
}
