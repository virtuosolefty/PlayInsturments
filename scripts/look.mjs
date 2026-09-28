/**
 * look.mjs — reproduce a specific setup and photograph it.
 *
 * Judging the roll from a default 88-key view is not the same as judging it
 * from the one a person is actually sitting in front of. This seeds the
 * settings first, so the screenshot is of their app rather than of mine.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const URL = process.argv[2] ?? 'http://localhost:5199/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('shots', { recursive: true });

const ROLL = process.env.ROLL ?? 'gl';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1571, height: 962 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

// A 25-key MPK Mini, zoomed to 61%, Stage roll on, Wait mode — as reported.
await page.addInitScript((roll) => {
  localStorage.setItem(
    'piano-practice-coach:v1',
    JSON.stringify({
      version: 1,
      songs: {},
      settings: {
        onboarded: true,
        renderer: roll,
        keyboardId: 'mpk-mini',
        fit: 'fold',
        pps: 110,
        mode: 'wait',
        countInBars: 0,
      },
    }),
  );
}, ROLL);

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await wait(3000);
const name = `look-${ROLL}`;
await page.screenshot({ path: `shots/${name}.png` });
console.log(`  wrote shots/${name}.png`);
} finally {
  await browser.close();
}
