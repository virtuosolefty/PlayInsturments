/**
 * shoot.mjs — look at the running app.
 *
 * The gap this closes: nothing in `npm test` can see. jsdom stubs the canvas
 * and has no WebGL at all, so a roll that draws nothing, a lane in the wrong
 * colour or a control that throws the moment you touch it all pass the suite
 * without complaint. Two bugs shipped that way in a day — a suspended audio
 * clock behind a green light, and a renderer that crashed on its own toggle.
 *
 * Not a test framework. It opens the dev server in a real Chromium, drives it,
 * and writes PNGs plus every console message and page error to
 * `shots/`. What it is for is being *looked at*.
 *
 *   node scripts/shoot.mjs [url]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const URL = process.argv[2] ?? 'http://localhost:5199/';
const OUT = 'shots';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/** Everything the page says about itself, kept whether or not it looks fatal. */
const log = [];
page.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => log.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`));

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  wrote ${OUT}/${name}.png`);
};

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1200);
  await shot('01-boot');

  // The welcome card sits over everything on a first run and swallows clicks
  // until it is dismissed — which is what a real first-time user meets too.
  const welcome = page.locator('.first-run-overlay');
  if (await welcome.count()) {
    await page.locator('.first-run-overlay button', { hasText: /Let's play/i }).first().click();
    await welcome.waitFor({ state: 'detached', timeout: 5000 });
    await wait(500);
    await shot('02-after-welcome');
  }

  // The canvas roll, which is the baseline the GL one has to match.
  await shot('03-canvas-roll');

  // Options -> Roll view -> Stage.
  const options = page.locator('button', { hasText: /Options/i }).first();
  if (await options.count()) {
    await options.click();
    await wait(400);
    await shot('04-options-open');

    const toggle = page.locator('.fit-switch button', { hasText: /^Stage$/ }).first();
    if (await toggle.count()) {
      await toggle.click();
      await wait(2500); // the Three.js chunk has to arrive
      await page.keyboard.press('Escape');
      await wait(800);
      await shot('05-gl-roll');
    } else {
      log.push('[shoot] no Stage roll button found in Options');
    }
  } else {
    log.push('[shoot] no Options button found');
  }

  // Toggle the renderer several times. Each teardown used to leak a WebGL
  // context and the browser only allows about sixteen before it starts killing
  // live ones, so this is the shape of that bug, reproduced on demand.
  for (let i = 0; i < 6; i += 1) {
    await page.locator('button', { hasText: /Options/i }).first().click();
    await wait(250);
    await page.locator('.fit-switch button', { hasText: i % 2 === 0 ? /^Trainer$/ : /^Stage$/ }).first().click();
    await wait(500);
    await page.keyboard.press('Escape');
    await wait(250);
  }
  await shot('07-after-toggling');

  // Playing, so the hit line, keys and level meter have something to show.
  await page.keyboard.press('Space');
  await wait(2500);
  await shot('06-gl-playing');
  await page.keyboard.press('Space');
} catch (err) {
  log.push(`[shoot] ${err.message}`);
  await shot('99-failed');
} finally {
  writeFileSync(`${OUT}/console.log`, log.join('\n') + '\n');
  console.log(`\n--- page output (${log.length} lines) ---`);
  console.log(log.join('\n') || '  (silent)');
  await browser.close();
}
