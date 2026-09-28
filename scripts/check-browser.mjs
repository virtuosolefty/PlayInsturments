/**
 * check-browser.mjs — the check `npm test` cannot make.
 *
 * jsdom stubs the canvas and has no WebGL at all, so a roll that draws nothing,
 * a renderer that leaks graphics contexts, an audio clock that never starts and
 * a control that throws the moment you touch it all pass the suite in silence.
 * Every one of those has actually shipped here.
 *
 * This drives the real app in a real browser and **fails**. It is not a
 * screenshot tool with assertions bolted on: the screenshots are a by-product,
 * and the exit code is the point.
 *
 *   npm run check:browser            against http://localhost:5199
 *   npm run check:browser -- <url>
 *
 * Deliberately not part of `npm test`. It needs a dev server and a downloaded
 * browser, and a test suite that cannot run offline is a test suite people stop
 * running.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const URL = process.argv[2] ?? 'http://localhost:5199/';
const OUT = 'shots';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Console output that means something is wrong.
 *
 * Allow-list rather than deny-list: anything unrecognised is treated as a
 * problem, so a new warning has to be looked at once rather than blending into
 * noise nobody reads.
 */
const EXPECTED = [
  /\[vite\] (connecting|connected)/,
  /Download the React DevTools/,
  /Tone\.js v/,
  // Chrome will not start an audio clock before a gesture. The app handles it —
  // that is what the "Enable sound" button is for — and it is not a fault.
  /The AudioContext was not allowed to start/,
  // No MIDI hardware in a headless browser, and no sample pack on a dev server.
  /\[midi-out\] .* no output port selected/,
  /instrument source failed, staying on the fallback/,
  // Driver chatter from the headless GPU, not from us.
  /GL Driver Message/,
  /WEBGL_lose_context extension not supported/,
];

const problems = [];
const log = [];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  log.push(line);
  if (m.type() !== 'error' && m.type() !== 'warning') return;
  if (EXPECTED.some((re) => re.test(m.text()))) return;
  problems.push(`console ${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => {
  log.push(`[pageerror] ${e.message}`);
  problems.push(`page error: ${e.message}`);
});
page.on('requestfailed', (r) => {
  const why = r.failure()?.errorText ?? '';
  log.push(`[requestfailed] ${r.url()} — ${why}`);
  if (!/ERR_ABORTED/.test(why)) problems.push(`request failed: ${r.url()} — ${why}`);
});

const shot = async (n) => page.screenshot({ path: `${OUT}/${n}.png` });

/** Assert, and keep going — one failure should not hide the next. */
const check = (ok, what) => {
  if (!ok) problems.push(`check failed: ${what}`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
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

  check(await page.locator('canvas').count() > 0, 'the roll renders a canvas');
  check(await page.locator('.controls .pad').count() >= 5, 'the transport deck has its pads');
  await shot('c1-canvas');

  /** Pick a renderer from the segmented switch in the options popover. */
  const setRenderer = async (label) => {
    await page.locator('button', { hasText: /Options/i }).first().click();
    await wait(250);
    await page.locator('.fit-switch button', { hasText: new RegExp(`^${label}$`) }).first().click();
    await wait(2200);
    await page.keyboard.press('Escape');
    await wait(500);
  };

  // Counted with the popover open — the switch does not exist until then.
  await page.locator('button', { hasText: /Options/i }).first().click();
  await wait(250);
  check(
    (await page.locator('.fit-switch button', { hasText: /^(Trainer|Stage)$/ }).count()) === 2,
    'both roll views are offered',
  );
  await page.keyboard.press('Escape');
  await wait(300);

  await setRenderer('Stage');
  check((await page.locator('.roll-gl').count()) === 1, 'the Stage roll mounted');
  await shot('c2-gl');

  // Switching between them repeatedly used to leak a graphics context apiece.
  for (const label of ['Trainer', 'Stage', 'Trainer', 'Stage', 'Trainer', 'Stage']) {
    // eslint-disable-next-line no-await-in-loop
    await setRenderer(label);
  }
  check((await page.locator('.roll-gl').count()) === 1, 'the roll survives six renderer switches');
  await shot('c4-after-switches');

  // A run where nothing is played must not claim a verdict from nothing.
  await page.keyboard.press('Space');
  await wait(1400);
  const panel = (await page.locator('.pane.right').textContent()) ?? '';
  check(!/on time/i.test(panel), 'no timing verdict is claimed from an unplayed run');
  check(await page.locator('.ring-fill').count() === 0, 'the score ring draws no stroke at zero');
  await shot('c5-unmeasured');
  await page.keyboard.press('Space');
} catch (err) {
  problems.push(`threw: ${err.message}`);
  await shot('c99-failed');
} finally {
  writeFileSync(`${OUT}/check.log`, log.join('\n') + '\n');
  await browser.close();
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nfull page output in ${OUT}/check.log`);
  process.exit(1);
}
console.log('\nclean — no page errors, no unexpected console output');
