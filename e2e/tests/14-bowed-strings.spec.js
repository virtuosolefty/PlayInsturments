import { test, expect } from '@playwright/test';

const pick = (p, name) => p.getByRole('group', { name: 'Practice instrument' }).getByRole('button', { name, exact: true }).click();
const workspace = (p, name) => p.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name, exact: true });
const events = p => p.evaluate(() => window.__notes);
const count = (p, type) => expect.poll(async () => (await events(p)).filter(m => m.type === type).length);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: { onboarded: true, countInBars: 0, settingsVersion: 5, renderer: 'canvas' } })));
  await page.goto('/');
  await expect(page.locator('.piece-title')).toContainText('C Major', { timeout: 30000 });
  await page.evaluate(async () => { window.__notes = []; (await import('/src/lib/midiInput.js')).midiInput.onMessage(m => window.__notes.push(m)); });
});

test('violin and cello join the instrument picker with their own studios', async ({ page }) => {
  await pick(page, 'Violin');
  await expect(page.getByRole('group', { name: 'Playable violin fingerboard' })).toBeVisible();
  await expect(page.locator('.guitar-next')).toContainText('G3 · G string · open (no finger)');
  await expect(page.locator('.studio-footer')).toContainText('Tuned in fifths · G D A E');
  await pick(page, 'Cello');
  await expect(page.getByRole('group', { name: 'Playable cello fingerboard' })).toBeVisible();
  await expect(page.locator('.guitar-next')).toContainText('C2 · C string · open (no finger)');
  await pick(page, 'Guitar');
  await expect(page.locator('.guitar-string').first()).toBeVisible();
});

test('a held place bows until release, slides along the string, and names itself', async ({ page }) => {
  await pick(page, 'Violin');
  await workspace(page, 'Free play').click();
  const place = page.getByRole('button', { name: 'A string · finger 1 · B4', exact: true });
  const box = await place.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await count(page, 'noteon').toBe(1);
  expect((await events(page))[0]).toMatchObject({ midi: 71, string: 2, fret: 2 });
  await page.waitForTimeout(500);
  expect((await events(page)).filter(m => m.type === 'noteoff')).toHaveLength(0);
  await expect(page.locator('.bowed-marker.held')).toHaveCount(1);
  await expect(page.locator('.bowed-bow')).toHaveCount(1);
  const higher = await page.getByRole('button', { name: 'A string · finger 3 · D5', exact: true }).boundingBox();
  await page.mouse.move(higher.x + higher.width / 2, higher.y + higher.height / 2, { steps: 4 });
  await expect.poll(async () => (await events(page)).filter(m => m.type === 'noteon').map(m => m.midi).at(-1)).toBe(74);
  await page.mouse.up();
  await expect.poll(async () => (await events(page)).filter(m => m.type === 'noteon').length).toBe((await events(page)).filter(m => m.type === 'noteoff').length);
  await expect(page.locator('.bowed-bow')).toHaveCount(0);
});

test('keyboard players rove the fingerboard and bow with Enter', async ({ page }) => {
  await pick(page, 'Cello');
  await workspace(page, 'Free play').click();
  const start = page.locator('.bowed-zone[tabindex="0"]');
  await start.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.bowed-zone[tabindex="0"]')).toHaveAttribute('aria-label', /finger 1/);
  await page.keyboard.down('Enter');
  await count(page, 'noteon').toBe(1);
  await page.keyboard.up('Enter');
  await count(page, 'noteoff').toBe(1);
});

test('the scale explorer plays a first-position scale and shows it on the fingerboard', async ({ page }) => {
  await pick(page, 'Violin');
  await workspace(page, 'Free play').click();
  await expect(page.locator('.bowed-marker.chord')).toHaveCount(8);
  await page.getByRole('group', { name: 'Violin scales' }).getByRole('button', { name: 'A', exact: true }).click();
  await expect(page.locator('.bow-card h2')).toHaveText('A');
  await page.getByRole('button', { name: '▶ Play the scale' }).click();
  await count(page, 'noteon').toBeGreaterThanOrEqual(2);
  expect((await events(page))[0].midi).toBe(69);
  await page.getByRole('button', { name: '■ Stop' }).click();
  const on = (await events(page)).filter(m => m.type === 'noteon').length;
  await expect.poll(async () => (await events(page)).filter(m => m.type === 'noteoff').length).toBe(on);
});

test('a violin lesson scores the open G with the shared practice engine', async ({ page }) => {
  await pick(page, 'Violin');
  const study = page.getByLabel('Violin exercise');
  await study.selectOption('violin-open-strings');
  await expect(page.locator('.bowed-stage')).toHaveAttribute('data-target-positions', '1');
  const open = page.getByRole('button', { name: 'G string · open string · G3', exact: true });
  await open.focus();
  await page.keyboard.down('Enter');
  await count(page, 'noteon').toBe(1);
  expect((await events(page))[0]).toMatchObject({ midi: 55, source: 'violin-screen' });
  await page.keyboard.up('Enter');
});
