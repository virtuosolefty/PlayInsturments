/**
 * panels.mjs — look at the parts of the app a screenshot of the roll misses.
 *
 * The touch calibrator, the velocity curve, the feedback meters, the practice
 * report: all built without ever being seen. This opens each one and writes it
 * to `shots/`.
 *
 *   node scripts/panels.mjs [url]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const URL = process.argv[2] ?? 'http://localhost:5199/';
const OUT = 'shots';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const log = [];
page.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));

const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log(`  wrote ${OUT}/${n}.png`);
};

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1000);

  const welcome = page.locator('.first-run-overlay');
  if (await welcome.count()) {
    await page.locator('.first-run-overlay button', { hasText: /Let's play/i }).first().click();
    await welcome.waitFor({ state: 'detached', timeout: 5000 });
    await wait(400);
  }

  // Library ▸ Keyboard — the velocity curve and both calibrators live here.
  await page.locator('.drawer-toggle').click();
  await wait(500);
  await shot('p1-library-songs');

  const keyboardTab = page.locator('.drawer-tabs button', { hasText: /Keyboard/i }).first();
  if (await keyboardTab.count()) {
    await keyboardTab.click();
    await wait(600);
    await shot('p2-keyboard-panel');

    // Scroll the pane so the touch curve is on screen.
    await page.locator('.pane.left').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await wait(400);
    await shot('p3-velocity-curve');
  }

  // The touch calibrator dialog.
  const calibrate = page.locator('button', { hasText: /^Calibrate$/ });
  if ((await calibrate.count()) > 1) {
    await calibrate.nth(1).click();
    await wait(600);
    await shot('p4-touch-calibrator');
    await page.keyboard.press('Escape');
    await wait(300);
  }

  await page.keyboard.press('Escape'); // close the drawer
  await wait(400);

  // Play a little and feed notes in, so the feedback panel has real numbers.
  await page.keyboard.press('Space');
  await wait(1500);
  for (const k of ['a', 's', 'd', 'f', 'g', 'h', 'j']) {
    await page.keyboard.press(k);
    await wait(180);
  }
  await wait(500);
  await shot('p5-feedback-meters');

  // Stop, which raises the practice report.
  await page.keyboard.press('0');
  await wait(1800);
  await shot('p6-practice-report');
} catch (err) {
  log.push(`[panels] ${err.message}`);
  await shot('p99-failed');
} finally {
  writeFileSync(`${OUT}/panels.log`, log.join('\n') + '\n');
  console.log(`\n--- page output ---\n${log.join('\n') || '  (silent)'}`);
  await browser.close();
}
