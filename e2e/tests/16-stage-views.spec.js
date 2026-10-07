import { test, expect } from '@playwright/test';
import { chooseWorkspace as workspace } from '../helpers/workspace.js';

/**
 * The guitar stage's camera views: lessons look through a fixed long lens
 * (concept G3); free play lets the player turn the guitar (concept G1).
 */

const stage = page => page.locator('.guitar-stage');
const resetButton = page => page.getByRole('button', { name: 'Reset view', exact: true });
const fretLabel = (page, n) => page.locator('.guitar-position-label.fret').getByText(String(n), { exact: true });

async function centre(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags across the stage from a point given as fractions of the canvas. */
async function drag(page, from, by) {
  const box = await stage(page).locator('canvas').boundingBox();
  const x = box.x + box.width * from[0], y = box.y + box.height * from[1];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by[0], y + by[1], { steps: 10 });
  await page.mouse.up();
}

const moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Starts recording every note the instrument sends; read them back with `notesPlayed`. */
const listenForNotes = page => page.evaluate(async () => { window.__notes = []; (await import('/src/lib/midiInput.js')).midiInput.onMessage(m => window.__notes.push(m)); });
const notesPlayed = page => page.evaluate(() => window.__notes.filter(m => m.type === 'noteon').map(m => m.midi));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('piano-practice-coach:v1')) localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: { settingsVersion: 5, onboarded: true, renderer: 'gl', practiceInstrument: 'guitar', countInBars: 0 } }));
  });
  await page.goto('/');
  await expect(stage(page).locator('canvas')).toBeVisible();
});

test('free play turns the guitar when the background is dragged, without playing anything', async ({ page }) => {
  await listenForNotes(page);
  await workspace(page, 'Free play');
  await expect(stage(page)).toHaveAttribute('data-view', 'freePlay');
  await expect(stage(page).locator('.guitar-stage-hint')).toContainText('drag to turn');
  const twelfth = fretLabel(page, 12);
  const before = await centre(twelfth);
  await drag(page, [0.5, 0.88], [160, 0]);
  await expect.poll(async () => moved(await centre(twelfth), before)).toBeGreaterThan(25);
  await expect(resetButton(page)).toBeVisible();
  expect(await notesPlayed(page)).toEqual([]);

  await resetButton(page).click();
  await expect.poll(async () => moved(await centre(twelfth), before), { timeout: 10_000 }).toBeLessThan(2);
  await expect(resetButton(page)).toHaveCount(0);
});

test('a double-click on the background puts the view back', async ({ page }) => {
  await workspace(page, 'Free play');
  const twelfth = fretLabel(page, 12);
  const before = await centre(twelfth);
  await drag(page, [0.5, 0.88], [-120, 40]);
  await expect.poll(async () => moved(await centre(twelfth), before)).toBeGreaterThan(25);
  const box = await stage(page).locator('canvas').boundingBox();
  await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.88);
  await expect.poll(async () => moved(await centre(twelfth), before), { timeout: 10_000 }).toBeLessThan(2);
});

test('Reset view keeps keyboard focus until the player moves on', async ({ page }) => {
  await workspace(page, 'Free play');
  await drag(page, [0.5, 0.88], [160, 0]);
  const button = resetButton(page);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-disabled', 'true', { timeout: 10_000 });
  await expect(button).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(resetButton(page)).toHaveCount(0);
});

test('a first-position neck stays between the bars however far it is turned', async ({ page }) => {
  await workspace(page, 'Free play');
  await page.getByRole('combobox', { name: 'Visible guitar frets' }).selectOption('5');
  await expect(page.locator('.guitar-position-label.fret')).toHaveCount(5);
  const band = async () => {
    const top = await stage(page).locator('.guitar-stage-top').boundingBox();
    const bottom = await stage(page).locator('.guitar-stage-bottom').boundingBox();
    const canvas = await stage(page).locator('canvas').boundingBox();
    return { top: top.y + top.height, bottom: bottom.y, left: canvas.x, right: canvas.x + canvas.width };
  };
  const fingers = page.locator('.guitar-position-label.finger');
  for (const by of [[600, 300], [-600, -300], [600, -300]]) {
    await drag(page, [0.5, 0.88], by);
    await expect(resetButton(page)).toBeVisible();
    const { top, bottom, left, right } = await band();
    for (const label of await fingers.all()) {
      const { x, y } = await centre(label);
      expect(y).toBeGreaterThan(top);
      expect(y).toBeLessThan(bottom);
      expect(x).toBeGreaterThan(left);
      expect(x).toBeLessThan(right);
    }
    const fifth = await centre(fretLabel(page, 5));
    expect(fifth.x).toBeLessThan(right);
    expect(fifth.y).toBeGreaterThan(top - 20);
    await resetButton(page).click();
    await expect(resetButton(page)).toHaveCount(0, { timeout: 10_000 });
  }
});

test('a drag that starts on the neck plays the note there instead of turning', async ({ page }) => {
  await listenForNotes(page);
  await workspace(page, 'Free play');
  const fourth = fretLabel(page, 4), before = await centre(fourth);
  const string = await centre(page.locator('.guitar-position-label.string').getByText('G3', { exact: true }));
  await page.mouse.move(before.x, string.y);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, string.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__notes.find(m => m.type === 'noteon')?.midi)).toBe(59);
  expect(moved(await centre(fourth), before)).toBeLessThan(2);
  await expect(resetButton(page)).toHaveCount(0);
});

test('lessons keep a fixed view, and going back to a lesson straightens a turned guitar', async ({ page }) => {
  await expect(stage(page)).toHaveAttribute('data-view', 'lesson');
  const lessonTwelfth = await centre(fretLabel(page, 12));
  await drag(page, [0.5, 0.04], [160, 0]);
  expect(moved(await centre(fretLabel(page, 12)), lessonTwelfth)).toBeLessThan(2);
  await expect(resetButton(page)).toHaveCount(0);

  await workspace(page, 'Free play');
  await drag(page, [0.5, 0.88], [160, 0]);
  await expect(resetButton(page)).toBeVisible();
  await workspace(page, 'Learn');
  await expect(stage(page)).toHaveAttribute('data-view', 'lesson');
  await expect(resetButton(page)).toHaveCount(0);
  await expect.poll(async () => moved(await centre(fretLabel(page, 12)), lessonTwelfth), { timeout: 10_000 }).toBeLessThan(2);
});
