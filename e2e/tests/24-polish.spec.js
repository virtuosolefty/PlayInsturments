import { test, expect } from '@playwright/test';
import { collectErrors, seedSettings } from '../helpers/studio.js';

/**
 * Small things that make the app feel finished: it follows the device's
 * theme until told otherwise, each screen names itself in the browser tab,
 * the tuner is where a string player looks for it, and the studio's controls
 * wrap rather than cut a selection down to a letter.
 */

test.describe('on a device set to dark', () => {
  test.use({ colorScheme: 'dark' });

  test('a first visit opens dark, and a theme the visitor chose is kept', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('a visitor who chose light keeps light', async ({ page }) => {
    await seedSettings(page, { theme: 'light', practiceInstrument: 'piano', renderer: 'canvas', learningView: 'studio' });
    await page.goto('/');
    await expect(page.locator('.studio-header')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test('a first visit on a light device opens light', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the browser tab says where you are', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSettings(page, { practiceInstrument: 'guitar', renderer: 'canvas', learningView: 'studio' });
  await page.goto('/');
  await expect(page.locator('.studio-header')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveTitle('Meet the six strings · Guitar — Practice Deck');
  await page.getByRole('group', { name: 'Instrument type' }).getByRole('button', { name: 'Bass', exact: true }).click();
  await expect(page).toHaveTitle('Meet the four strings · Bass — Practice Deck');
  await page.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Free play', exact: true }).click();
  await expect(page).toHaveTitle('Free play · Bass — Practice Deck');
  expect(errors).toEqual([]);
});

test('the tuner is in a string instrument\'s own controls, and not on the piano or drums', async ({ page }) => {
  await seedSettings(page, { practiceInstrument: 'violin', renderer: 'canvas', learningView: 'studio' });
  await page.goto('/');
  await expect(page.locator('.studio-header')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Tuner', exact: true }).click();
  const tuner = page.getByRole('dialog', { name: 'Tuner' });
  await expect(tuner).toBeVisible();
  await expect(tuner.getByText('Open strings · G3 D4 A4 E5')).toBeVisible();
  await tuner.getByRole('button', { name: 'Close tuner' }).click();
  await expect(tuner).toHaveCount(0);
  for (const id of ['piano', 'drums']) {
    await page.getByRole('group', { name: 'Practice instrument' }).getByRole('button', { name: id === 'piano' ? 'Piano' : 'Drums', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tuner', exact: true })).toHaveCount(0);
  }
});

test.describe('on a mid-width desktop', () => {
  test.use({ viewport: { width: 1000, height: 760 } });

  test('the studio\'s controls take a second line, so no choice is cut down to a letter', async ({ page }) => {
    await seedSettings(page, { practiceInstrument: 'violin', renderer: 'canvas', learningView: 'studio' });
    await page.goto('/');
    await expect(page.locator('.studio-header')).toBeVisible({ timeout: 30_000 });
    // A select is cut down when the text it shows is wider than the select: measured, not guessed at.
    const clipped = await page.evaluate(() => {
      const ruler = document.createElement('canvas').getContext('2d');
      return [...document.querySelectorAll('.guitar-view-controls select')].filter(el => el.offsetParent).filter(el => {
        const style = getComputedStyle(el);
        ruler.font = style.font;
        const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return ruler.measureText(el.selectedOptions[0].text).width > room + 2;
      }).map(el => el.getAttribute('aria-label'));
    });
    expect(clipped).toEqual([]);
    // Everything in the row is inside the pane.
    const outside = await page.evaluate(() => {
      const pane = document.querySelector('.pane.center').getBoundingClientRect();
      return [...document.querySelectorAll('.guitar-view-controls > *')].filter(el => el.getBoundingClientRect().right > pane.right + 1).length;
    });
    expect(outside).toBe(0);
  });
});
