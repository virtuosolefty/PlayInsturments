import { test, expect } from '@playwright/test';
import { collectErrors, seedSettings } from '../helpers/studio.js';

/** The browser's own note of a file a test serves as missing. */
const MISSING_FILE = /Failed to load resource.*404/;
import { chooseWorkspace as workspace } from '../helpers/workspace.js';

/**
 * The downloaded violin and cello on the full stage: lessons, and free play's
 * Learn view, lay them across the stage with tapes and finger numbers
 * (concepts V3, C3); free play's Whole instrument view shows all of them (V1,
 * C1). The light stage, and any stage whose model cannot be loaded, keeps the
 * 2D fingerboard.
 *
 * Headless Chromium draws the full stage in software at a frame or two a
 * second, so the full-stage tests are marked slow.
 */

const stage = page => page.locator('.bowed-stage-3d');
const labels = (page, kind) => stage(page).locator(`.guitar-position-label${kind ? `.${kind}` : ''}`);
const viewButton = (page, name) => page.getByRole('group', { name: 'Stage view' }).getByRole('button', { name, exact: true });
const notes = page => page.evaluate(() => window.__notes.map(m => `${m.type}:${m.midi}`));

async function open(page, instrument, stageQuality) {
  await seedSettings(page, { renderer: 'gl', practiceInstrument: instrument, stageQuality }, { everyLoad: true });
  await page.goto('/');
  await expect(page.locator('.bowed-workspace')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(async () => { window.__notes = []; (await import('/src/lib/midiInput.js')).midiInput.onMessage(m => window.__notes.push(m)); });
}

test('on the full stage the violin is the downloaded model, mapped for lessons and whole in free play', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page, { ignore: MISSING_FILE });
  await open(page, 'violin', 'full');
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'violin', { timeout: 60_000 });
  // V3: string names down the edge, each with its number and octave, and a number over each first-position tape.
  await expect(labels(page, 'string')).toHaveText(['4 G3', '3 D4', '2 A4', '1 E5'], { timeout: 30_000 });
  await expect(labels(page, 'tape')).toHaveText(['1', '2', '3', '4']);
  // The open G is the lesson's first note.
  await expect(stage(page)).toHaveAttribute('data-target-positions', '1');

  await workspace(page, 'Free play');
  // Free play opens on Learn: the D major scale's eight places, labelled with their fingers.
  await expect(viewButton(page, 'Fingerboard')).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await expect(labels(page, 'finger')).toHaveCount(8, { timeout: 30_000 });
  // The whole violin is too small to label.
  await viewButton(page, 'Whole instrument').click();
  // The pop-up offers the other instruments (spec 21); this test keeps the violin that is played.
  await page.getByRole('dialog', { name: 'Whole instrument' }).locator('.model-card', { has: page.getByText('Violin', { exact: true }) }).click();
  await expect(viewButton(page, 'Whole instrument')).toHaveAttribute('aria-pressed', 'true');
  await expect(labels(page)).toHaveCount(0, { timeout: 30_000 });
  await viewButton(page, 'Fingerboard').click();
  await expect(labels(page, 'finger')).toHaveCount(8, { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('pressing a place on the 3D neck bows it until release', async ({ page }) => {
  test.slow();
  await open(page, 'violin', 'full');
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'violin', { timeout: 60_000 });
  const tape = await labels(page, 'tape').getByText('1', { exact: true }).boundingBox();
  await expect(labels(page, 'tape')).toHaveCount(4, { timeout: 30_000 });
  const box = await stage(page).boundingBox(), hint = stage(page).locator('.guitar-stage-hint');
  // Feel down the first tape for the A string, as a player would, by the hint under the stage.
  let found = false;
  for (let y = box.y + 20; y < box.y + box.height - 30 && !found; y += 2) {
    await page.mouse.move(tape.x + tape.width / 2, y);
    found = (await hint.textContent()).startsWith('A string · finger 1');
  }
  expect(found).toBe(true);
  await page.mouse.down();
  await expect.poll(() => notes(page), { timeout: 30_000 }).toEqual(['noteon:71']);
  await expect(stage(page)).toHaveAttribute('data-held-positions', '1', { timeout: 30_000 });
  await page.mouse.up();
  await expect.poll(() => notes(page), { timeout: 30_000 }).toEqual(['noteon:71', 'noteoff:71']);
});

test('the light stage keeps the 2D fingerboard for the violin and the cello', async ({ page }) => {
  await open(page, 'violin', 'light');
  await expect(page.getByRole('group', { name: 'Playable violin fingerboard' })).toBeVisible();
  await expect(stage(page)).toHaveCount(0);
  await page.getByRole('group', { name: 'Practice instrument' }).getByRole('button', { name: 'Cello', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Playable cello fingerboard' })).toBeVisible();
  await expect(stage(page)).toHaveCount(0);
  const asked = await page.evaluate(() => performance.getEntriesByType('resource').some(entry => /\/models\/(violin|cello)\./.test(entry.name)));
  expect(asked).toBe(false);
});

test('a cello that cannot be loaded gives way to the 2D fingerboard', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page, { ignore: MISSING_FILE });
  await page.route('**/models/cello.glb', route => route.fulfill({ status: 404, body: '' }));
  await open(page, 'cello', 'full');
  await expect(page.getByRole('group', { name: 'Playable cello fingerboard' })).toBeVisible({ timeout: 60_000 });
  await expect(stage(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('under the 3D stage the 2D finger buttons stay one click away for keyboard players', async ({ page }) => {
  test.slow();
  await open(page, 'cello', 'full');
  await expect(stage(page)).toHaveAttribute('data-stage-model', 'cello', { timeout: 60_000 });
  await page.getByText('Show finger buttons · keyboard accessible').click();
  const start = page.locator('.bowed-finger-controls .bowed-zone[tabindex="0"]');
  await start.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  // The roving tab stop has moved two places up the string, to the first finger.
  await expect(start).toHaveAttribute('aria-label', /finger 1/);
  await page.keyboard.down('Enter');
  await expect.poll(() => notes(page), { timeout: 30_000 }).toHaveLength(1);
  await page.keyboard.up('Enter');
  await expect.poll(() => notes(page), { timeout: 30_000 }).toHaveLength(2);
});
