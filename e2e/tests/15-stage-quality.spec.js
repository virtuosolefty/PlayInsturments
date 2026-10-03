import { test, expect } from '@playwright/test';

const stage = page => page.locator('.guitar-stage');
const detail = page => page.getByRole('group', { name: '3D detail' });
const openSettings = page => page.getByRole('button', { name: 'Instrument settings', exact: true }).click();

/**
 * Headless Chromium draws WebGL in software, which is the case the automatic
 * tier exists for; a headed run on a graphics card should get the full stage.
 * Ask the browser which this is, so the suite holds either way.
 */
async function automaticTier(page) {
  const name = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '';
  });
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) ? 'light' : 'full';
}

/** Chooses a detail level and waits for the stage that was showing to be replaced by a new one. */
async function chooseDetail(page, name) {
  const old = await stage(page).locator('canvas').elementHandle();
  await detail(page).getByRole('button', { name, exact: true }).click();
  await expect.poll(() => old.evaluate(canvas => canvas.isConnected), { timeout: 30_000 }).toBe(false);
  await expect(stage(page).locator('canvas')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('piano-practice-coach:v1')) localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: { settingsVersion: 5, onboarded: true, renderer: 'gl', practiceInstrument: 'guitar', countInBars: 0 } }));
  });
  await page.goto('/');
  await expect(stage(page).locator('canvas')).toBeVisible();
});

test('automatic detail suits the renderer, and a chosen detail is remembered', async ({ page }) => {
  await expect(stage(page)).toHaveAttribute('data-stage-tier', await automaticTier(page));
  await openSettings(page);
  await expect(detail(page).getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await chooseDetail(page, 'Light');
  await expect(stage(page)).toHaveAttribute('data-stage-tier', 'light');
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(stage(page)).toHaveAttribute('data-stage-tier', 'light');
  await openSettings(page);
  await expect(detail(page).getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('the full stage can be forced and starts cleanly', async ({ page }) => {
  // Software rendering draws the full stage at about a frame a second, so everything here is slow.
  test.slow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Three reports a shader that failed to compile on the console, not as an exception.
  page.on('console', message => { if (message.type() === 'error' && !/fetchPriority/.test(message.text())) errors.push(message.text()); });
  await openSettings(page);
  await chooseDetail(page, 'Full');
  await expect(stage(page)).toHaveAttribute('data-stage-tier', 'full');
  await expect(stage(page).locator('canvas')).toHaveCount(1);
  await expect(page.locator('.guitar-position-label.fret')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('picking on the neck still works after the detail is changed', async ({ page }) => {
  await page.evaluate(async () => { window.__notes = []; (await import('/src/lib/midiInput.js')).midiInput.onMessage(m => window.__notes.push(m)); });
  await page.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Free play', exact: true }).click();
  await openSettings(page);
  await chooseDetail(page, 'Light');
  await page.keyboard.press('Escape');
  const fretLabel = page.locator('.guitar-position-label.fret').getByText('4', { exact: true });
  await expect(fretLabel).toBeVisible();
  const fret = await fretLabel.boundingBox();
  const string = await page.locator('.guitar-position-label.string').getByText('G3', { exact: true }).boundingBox();
  await page.mouse.click(fret.x + fret.width / 2, string.y + string.height / 2);
  await expect.poll(() => page.evaluate(() => window.__notes.find(m => m.type === 'noteon')?.midi)).toBe(59);
  await expect(stage(page)).toHaveAttribute('data-held-positions', '1');
});

test('3D detail is offered only where the 3D string stage is showing', async ({ page }) => {
  await openSettings(page);
  await expect(detail(page)).toBeVisible();
  await page.getByRole('button', { name: '2D Trainer', exact: true }).click();
  await expect(detail(page)).toHaveCount(0);
  await page.getByRole('button', { name: '3D Stage', exact: true }).click();
  await expect(detail(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('group', { name: 'Practice instrument' }).getByRole('button', { name: 'Piano', exact: true }).click();
  await openSettings(page);
  await expect(page.getByRole('group', { name: 'Stage appearance' })).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
});
