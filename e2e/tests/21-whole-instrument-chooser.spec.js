import { test, expect } from '@playwright/test';
import { collectErrors, seedSettings } from '../helpers/studio.js';
import { chooseWorkspace as workspace } from '../helpers/workspace.js';

/**
 * Choosing which instrument the whole-instrument view shows. Selecting Whole
 * instrument opens a pop-up of pictures; the instrument that is played stays
 * on the stage, and any other is shown in its place until Learn.
 *
 * Three of the others go on the stage's own rig and answer to playing: the
 * bass guitar's strings move, and the bow plays on the electric violin and the
 * antique cello. The two drum kits are only looked at, in the viewer.
 *
 * The tests use the site's own files; one serves a broken file in place of the
 * bass guitar's.
 *
 * The stage is at full detail, which headless Chromium draws in software at a
 * frame or two a second, so every test has a long time to run.
 */

const stage = page => page.locator('.guitar-stage').first();
const viewButton = (page, name) => page.getByRole('group', { name: 'Stage view' }).getByRole('button', { name, exact: true });
const chooser = page => page.getByRole('dialog', { name: 'Whole instrument' });
const cards = page => chooser(page).locator('.model-card');
const card = (page, name) => cards(page).filter({ has: page.getByText(name, { exact: true }) });
const viewer = page => page.locator('.model-viewer');
const caption = page => page.locator('.model-caption');
const change = page => page.getByRole('button', { name: 'Choose instrument', exact: true });
const hint = page => stage(page).locator('.guitar-stage-bottom .guitar-stage-hint');
const onStage = (page, id) => expect(stage(page)).toHaveAttribute('data-stage-model', id, { timeout: 90_000 });
const pictured = (page, name) => expect.poll(() => card(page, name).locator('img').evaluate(image => image.naturalWidth), { message: `${name} has a picture` }).toBeGreaterThan(0);

async function open(page, instrument) {
  await seedSettings(page, { renderer: 'gl', practiceInstrument: instrument, stageQuality: 'full', learningView: 'studio' }, { everyLoad: true });
  await page.goto('/');
  await expect(stage(page).locator('canvas').first()).toBeVisible({ timeout: 60_000 });
}

/** Opens `instrument` in free play and selects Whole instrument, which opens the pop-up when there is a choice. */
async function openWhole(page, instrument) {
  await open(page, instrument);
  await workspace(page, 'Free play');
  await viewButton(page, 'Whole instrument').click({ timeout: 60_000 });
}

/** Bows the open A string from the finger buttons, holding it for as long as `during` takes. */
async function bowOpenA(page, during) {
  const fingers = page.getByText(/Show finger buttons/);
  if (await page.getByRole('button', { name: /A string · open string/ }).first().isHidden()) await fingers.click();
  await page.getByRole('button', { name: /A string · open string/ }).first().focus();
  await page.keyboard.down('Enter');
  try { await during(); } finally { await page.keyboard.up('Enter'); }
}

test('Whole instrument opens a pop-up of pictures; another cello takes the stage, bow and all, until Learn', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await openWhole(page, 'cello');

  await expect(chooser(page)).toBeVisible();
  await expect(cards(page).locator('strong')).toHaveText(['Cello', 'Antique cello']);
  await expect(card(page, 'Cello')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'Cello')).toBeFocused();
  await expect(card(page, 'Cello')).toContainText('You play this one');
  await pictured(page, 'Cello');
  await pictured(page, 'Antique cello');

  // The stage puts the other cello on a rig of its own: no viewer.
  await card(page, 'Antique cello').click();
  await expect(chooser(page)).toBeHidden();
  await onStage(page, 'cello-antique');
  await expect(viewer(page)).toHaveCount(0);
  await expect(caption(page)).toContainText('Antique cello');
  await expect(caption(page).getByRole('link', { name: 'slidon' })).toHaveAttribute('href', 'https://sketchfab.com/slidon');
  await expect(caption(page).getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  await expect(hint(page)).toHaveText('Drag to turn · hold by the bridge to bow an open string · Fingerboard for the finger places');

  // Playing it moves its bow: the A string is the cello's fourth, counted from the lowest.
  await bowOpenA(page, async () => {
    await expect(stage(page)).toHaveAttribute('data-bowing', '3', { timeout: 30_000 });
    await expect(stage(page)).toHaveAttribute('data-held-positions', '1');
  });
  await expect(stage(page)).not.toHaveAttribute('data-bowing', /\d/, { timeout: 30_000 });

  // The pop-up comes back from the stage, with the one on show marked; Escape leaves things as they are.
  await change(page).click();
  await expect(card(page, 'Antique cello')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(chooser(page)).toBeHidden();
  await onStage(page, 'cello-antique');

  // Choosing the cello that is played puts it back.
  await change(page).click();
  await card(page, 'Cello').click();
  await onStage(page, 'cello');
  await expect(caption(page)).toHaveCount(0);
  await expect(viewButton(page, 'Whole instrument')).toHaveAttribute('aria-pressed', 'true');

  // Fingerboard always goes back to the cello that is played, whichever was on show.
  await change(page).click();
  await card(page, 'Antique cello').click();
  await onStage(page, 'cello-antique');
  await viewButton(page, 'Fingerboard').click();
  await onStage(page, 'cello');
  await expect(change(page)).toHaveCount(0);
  await expect(caption(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the electric violin is bowed like the violin it stands in for', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await openWhole(page, 'violin');
  await expect(cards(page).locator('strong')).toHaveText(['Violin', 'Electric violin']);
  await pictured(page, 'Electric violin');
  await card(page, 'Electric violin').click();
  await onStage(page, 'violin-electric');
  await expect(caption(page)).toContainText('Belzar Sirus');
  // The A string is the violin's third.
  await bowOpenA(page, async () => {
    await expect(stage(page)).toHaveAttribute('data-bowing', '2', { timeout: 30_000 });
  });
  await expect(stage(page)).not.toHaveAttribute('data-bowing', /\d/, { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('the bass guitar\'s four strings answer to the guitar\'s six', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  // Still strings are drawn only when one starts or stops sounding, which leaves the stage free to look more often.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWhole(page, 'guitar');
  await expect(cards(page).locator('strong')).toHaveText(['Acoustic guitar', 'Bass guitar']);
  await pictured(page, 'Bass guitar');
  await card(page, 'Bass guitar').click();
  await onStage(page, 'guitar-bass');
  await expect(viewer(page)).toHaveCount(0);
  await expect(caption(page)).toContainText('Kanade_Tatibana');
  await expect(hint(page)).toHaveText('Drag to turn · Fretboard to play the frets');

  // A strum is over quickly, so the most strings seen sounding at once is remembered as it happens.
  const mostSounding = async () => {
    await page.evaluate(() => {
      const el = document.querySelector('.guitar-stage');
      window.__mostStrings = 0;
      window.__stringWatch?.disconnect();
      window.__stringWatch = new MutationObserver(() => { window.__mostStrings = Math.max(window.__mostStrings, Number(el.dataset.soundingStrings) || 0); });
      window.__stringWatch.observe(el, { attributes: true, attributeFilter: ['data-sounding-strings'] });
    });
    await page.getByRole('button', { name: /Strum Em/ }).first().click();
    await expect.poll(() => page.evaluate(() => window.__mostStrings), { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    return page.evaluate(() => window.__mostStrings);
  };
  // E minor sounds all six guitar strings for a second; the bass has the lowest four to move. Software
  // rendering looks at the strings about once a second, so it may catch the strum part-way: some, never more than four.
  const onBass = await mostSounding();
  expect(onBass).toBeGreaterThan(0);
  expect(onBass).toBeLessThanOrEqual(4);

  // The guitar that is played takes the stage back, and answers the same strum.
  await change(page).click();
  await card(page, 'Acoustic guitar').click();
  await onStage(page, 'guitar');
  await expect(caption(page)).toHaveCount(0);
  expect(await mostSounding()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('both other drum kits load from the site\'s own files, and are not marked as only to look at', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await openWhole(page, 'drums');
  await expect(cards(page).locator('strong')).toHaveText(['Practice kit', 'Acoustic kit', 'Electronic kit']);
  for (const [name, id, author] of [['Acoustic kit', 'drums-acoustic', 'art.katja'], ['Electronic kit', 'drums-electronic', 'SINNIK']]) {
    if (!await chooser(page).isVisible()) await change(page).click();
    await pictured(page, name);
    await expect(card(page, name)).not.toContainText('To look at');
    await card(page, name).click();
    await expect(viewer(page)).toHaveAttribute('data-model', id);
    await expect(viewer(page)).toHaveAttribute('data-ready', 'true', { timeout: 150_000 });
    await expect(caption(page)).toContainText(author);
  }
  expect(errors).toEqual([]);
});

test('an instrument that cannot be shown gives the stage back and says so', async ({ page }) => {
  test.slow();
  await page.route('**/models/guitar-bass.glb', route => route.fulfill({ status: 500, body: 'Broken' }));
  await openWhole(page, 'guitar');
  await card(page, 'Bass guitar').click();
  await expect(page.locator('.model-notice')).toHaveText('The bass guitar could not be shown. The acoustic guitar is back on the stage.', { timeout: 30_000 });
  await expect(viewer(page)).toHaveCount(0);
  await expect(caption(page)).toHaveCount(0);
  await expect(viewButton(page, 'Whole instrument')).toHaveAttribute('aria-pressed', 'true');
});

test('a kit that is only looked at takes the stage in the viewer, and Learn gives the practice kit back', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await open(page, 'drums');
  // A lesson has one kit: the one that is hit.
  await expect(page.getByRole('group', { name: 'Stage view' })).toHaveCount(0);
  await workspace(page, 'Free play');
  await viewButton(page, 'Whole instrument').click({ timeout: 60_000 });
  await card(page, 'Acoustic kit').click();
  await expect(viewer(page)).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(caption(page)).toContainText('art.katja');
  await expect(hint(page)).toHaveText('Drag to turn · keys and pads play it · Practice kit to tap the drums');
  // The names over the practice kit are not left floating over another kit.
  await expect(page.locator('.drum-labels')).toBeHidden();

  // Dragging turns it; Reset view puts it back.
  const box = await viewer(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await expect(viewer(page).getByRole('button', { name: 'Reset view' })).toBeVisible();
  await viewer(page).getByRole('button', { name: 'Reset view' }).click();
  await expect(viewer(page).getByRole('button', { name: 'Reset view' })).toHaveCount(0);

  await viewButton(page, 'Practice kit').click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(page.locator('.drum-labels')).toBeVisible();
  await expect(hint(page)).toHaveText('Tap a drum to play · drag the floor to turn');
  expect(errors).toEqual([]);
});
