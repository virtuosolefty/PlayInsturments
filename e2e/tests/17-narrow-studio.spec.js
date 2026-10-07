import { test, expect } from '@playwright/test';
import { chooseWorkspace as workspace } from '../helpers/workspace.js';

/**
 * The studio on tablets, phones and small laptops. Before this, from 701px to
 * 1099px the top bar could not fit and pushed the studio past the window, so its
 * right side was cut off; free play's stage was a 165px strip; and below 901px
 * the chord and scale explorers sat in a side panel free play had no way to open.
 */

const stage = page => page.locator('.guitar-stage');

function open(page, { instrument = 'guitar', free = true } = {}) {
  return async () => {
    await page.addInitScript(inst => {
      if (!localStorage.getItem('piano-practice-coach:v1')) localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: { settingsVersion: 5, onboarded: true, renderer: 'gl', practiceInstrument: inst, countInBars: 0 } }));
    }, instrument);
    await page.goto('/');
    if (free) await workspace(page, 'Free play');
  };
}

/**
 * The right edge of the furthest-right visible thing in the top bar and in the
 * studio's main pane, against the window. (Below 901px the side panel is parked
 * off the right edge on purpose, hidden, until it is opened.)
 */
const rightEdges = page => page.evaluate(() => {
  const shown = el => el.offsetParent && getComputedStyle(el).visibility !== 'hidden';
  const right = selector => Math.max(...[...document.querySelectorAll(selector)].filter(shown).map(el => el.getBoundingClientRect().right));
  return { window: innerWidth, topbar: right('.topbar > *'), studio: right('.pane.center *'), page: document.documentElement.scrollWidth };
});

const boxes = locator => locator.evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));

test.describe('on a tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('free play fits the window, gives the guitar a real stage, and shows the chord explorer under it', async ({ page }) => {
    await open(page)();
    await expect(stage(page).locator('canvas')).toBeVisible();
    const edges = await rightEdges(page);
    expect(edges.topbar).toBeLessThanOrEqual(edges.window);
    expect(edges.studio).toBeLessThanOrEqual(edges.window);
    expect((await stage(page).boundingBox()).height).toBeGreaterThanOrEqual(260);

    await page.evaluate(async () => { window.__notes = []; (await import('/src/lib/midiInput.js')).midiInput.onMessage(m => window.__notes.push(m)); });
    const explorer = page.getByRole('region', { name: 'Chord workspace' });
    await explorer.scrollIntoViewIfNeeded();
    await expect(explorer).toBeVisible();
    await explorer.getByRole('button', { name: 'Am', exact: true }).click();
    await expect(explorer.getByRole('button', { name: 'Am', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await explorer.getByRole('button', { name: '↓ Strum Am', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__notes.filter(m => m.type === 'noteon').length)).toBeGreaterThanOrEqual(5);
  });

  test('a lesson fits the window and keeps its short stage', async ({ page }) => {
    await open(page, { free: false })();
    await expect(stage(page).locator('canvas')).toBeVisible();
    const edges = await rightEdges(page);
    expect(edges.topbar).toBeLessThanOrEqual(edges.window);
    expect(edges.studio).toBeLessThanOrEqual(edges.window);
    expect(Math.round((await stage(page).boundingBox()).height)).toBe(165);
  });

  test('the violin scale explorer shows under the stage', async ({ page }) => {
    await open(page, { instrument: 'violin' })();
    const explorer = page.getByRole('region', { name: 'Violin scale explorer' });
    await explorer.scrollIntoViewIfNeeded();
    await expect(explorer).toBeVisible();
    expect((await rightEdges(page)).studio).toBeLessThanOrEqual(820);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the stage keeps its labels apart and its own top bar on the stage', async ({ page }) => {
    await open(page)();
    await stage(page).scrollIntoViewIfNeeded();
    await expect(stage(page).locator('canvas')).toBeVisible();
    expect((await stage(page).boundingBox()).height).toBeGreaterThanOrEqual(200);

    const strings = (await boxes(page.locator('.guitar-position-label.string'))).sort((a, b) => a.top - b.top);
    expect(strings).toHaveLength(6);
    for (let i = 1; i < strings.length; i++) expect(strings[i].top).toBeGreaterThanOrEqual(strings[i - 1].bottom - 0.5);

    const frets = (await boxes(page.locator('.guitar-position-label.fret'))).sort((a, b) => a.left - b.left);
    expect(frets.map(f => f.text)).toEqual(expect.arrayContaining(['1', '3', '5', '7', '9', '12']));
    for (let i = 1; i < frets.length; i++) expect(frets[i].left).toBeGreaterThanOrEqual(frets[i - 1].right - 0.5);

    const box = await stage(page).boundingBox();
    const picks = await page.locator('.guitar-open-picks').boundingBox();
    expect(picks.x + picks.width).toBeLessThanOrEqual(box.x + box.width);
    const topBar = await page.locator('.guitar-stage-top').boundingBox();
    expect(topBar.y + topBar.height).toBeLessThanOrEqual(strings[0].top);
  });

  test('the instrument gets the screen: one-row bars, a tab bar at the bottom, and 44px controls', async ({ page }) => {
    await open(page)();
    await expect(stage(page).locator('canvas')).toBeVisible();
    expect((await page.locator('#practice-stage').boundingBox()).y).toBeLessThanOrEqual(140);
    expect((await page.locator('.topbar').boundingBox()).height).toBeLessThanOrEqual(64);
    const tabs = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
    expect(Math.round(tabs.y + tabs.height)).toBe(844);
    const short = await page.evaluate(() => [...document.querySelectorAll('.topbar button, .studio-header button')]
      .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      .map(el => ({ name: el.textContent.trim() || el.getAttribute('aria-label'), height: Math.round(el.getBoundingClientRect().height) }))
      .filter(button => button.height < 44));
    expect(short).toEqual([]);
  });

  test('the header sheet changes the instrument, then closes', async ({ page }) => {
    await open(page)();
    const toggle = page.getByRole('button', { name: /Change instrument or workspace/ });
    const picker = page.getByRole('group', { name: 'Practice instrument' });
    await expect(toggle).toContainText('Guitar · Free play');
    await expect(picker).toBeHidden();
    await toggle.click();
    await picker.getByRole('button', { name: 'Violin', exact: true }).click();
    await expect(toggle).toContainText('Violin · Free play');
    await expect(picker).toBeHidden();
    await toggle.click();
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
  });

  test('the chord explorer can be reached and played, laid out in one column', async ({ page }) => {
    await open(page)();
    const explorer = page.getByRole('region', { name: 'Chord workspace' });
    const strum = explorer.getByRole('button', { name: /^↓ Strum/ });
    await strum.scrollIntoViewIfNeeded();
    await expect(strum).toBeVisible();
    const strumBox = await strum.boundingBox();
    expect(strumBox.x + strumBox.width).toBeLessThanOrEqual(390);
    // In three columns the diagram box was 150px wide; in one it takes the card's width.
    expect((await explorer.locator('.chord-visual').boundingBox()).width).toBeGreaterThan(250);
    await explorer.getByRole('button', { name: 'C', exact: true }).click();
    await expect(explorer.getByRole('button', { name: 'C', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('on a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the top bar keeps to one line and the stage fits the screen', async ({ page }) => {
    await open(page)();
    await expect(stage(page).locator('canvas')).toBeVisible();
    expect((await page.locator('.topbar').boundingBox()).height).toBeLessThan(80);
    expect((await stage(page).boundingBox()).height).toBeLessThanOrEqual(390);
    const room = await page.locator('.guitar-workspace').evaluate(el => el.clientHeight);
    expect(room).toBeGreaterThanOrEqual(100);
    // The header's buttons stay clickable rather than sliding under the controls.
    await workspace(page, 'Learn');
    await expect(page.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Learn', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('on a small laptop', () => {
  for (const width of [901, 960, 1024]) {
    test(`at ${width}px the top bar fits, and switching sound on moves nothing`, async ({ page }) => {
      await page.setViewportSize({ width, height: 768 });
      await open(page, { free: false })();
      await expect(page.locator('.topbar')).toBeVisible();
      const edges = await rightEdges(page);
      expect(edges.topbar).toBeLessThanOrEqual(edges.window);
      expect(edges.studio).toBeLessThanOrEqual(edges.window);
      const enable = page.locator('.topbar').getByRole('button', { name: /Enable sound/ });
      if (await enable.count()) {
        const before = await page.locator('.topbar .io-strip').boundingBox();
        await enable.click();
        await expect(page.locator('.topbar .io-strip')).toContainText('Sound ready');
        const after = await page.locator('.topbar .io-strip').boundingBox();
        expect(after.x).toBeCloseTo(before.x, 0);
        expect(after.width).toBeCloseTo(before.width, 0);
      }
    });
  }

  test('at 901px the top bar still fits with a drill\'s back button in it', async ({ page }) => {
    await page.setViewportSize({ width: 901, height: 768 });
    await open(page, { free: false })();
    await expect(page.locator('.topbar .spacer')).toBeAttached();
    // The button a drill adds to the top bar, as TopBar renders it, with a long piece title.
    await page.evaluate(() => {
      const button = Object.assign(document.createElement('button'), { className: 'back-to-piece', textContent: '← C Major Scale — Two Octaves' });
      document.querySelector('.topbar .spacer').before(button);
    });
    const { topbar, window } = await rightEdges(page);
    expect(topbar).toBeLessThanOrEqual(window);
  });

  test('the studio header keeps its title readable rather than squeezing it beside the buttons', async ({ page }) => {
    for (const width of [701, 760, 901, 960, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      if (width === 701) await open(page, { free: false })();
      const title = await page.locator('.studio-heading h2').boundingBox();
      expect(title.width, `title width at ${width}px`).toBeGreaterThanOrEqual(150);
      const buttons = await page.locator('.studio-header-actions').boundingBox();
      const titleBottom = title.y + title.height;
      // Either beside the title with room to spare, or on a line of their own below it.
      expect(buttons.x >= title.x + title.width - 1 || buttons.y >= titleBottom - 1, `buttons clear of the title at ${width}px`).toBe(true);
    }
  });
});
