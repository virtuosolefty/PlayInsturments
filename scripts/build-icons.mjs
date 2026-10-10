/**
 * build-icons.mjs — the app's icon as the PNG files a phone asks for.
 *
 * public/favicon.svg is the one drawing. A home screen wants it as PNG at 192
 * and 512 pixels, a "maskable" one whose background runs to the edges (the
 * phone cuts its own shape out of it), and iOS wants a 180 pixel square.
 * A headless Chromium draws them, as it does the models' textures.
 *
 *   node scripts/build-icons.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = 'public/icons';
const mark = readFileSync('public/favicon.svg', 'utf8');
// The same mark with its background square to the edges, for a phone to cut its own shape from.
const bleed = mark.replace(/rx="14"/, 'rx="0"');
if (bleed === mark) throw new Error('public/favicon.svg no longer has the rounded background this script squares off');

const ICONS = [
  { file: 'icon-192.png', size: 192, svg: mark },
  { file: 'icon-512.png', size: 512, svg: mark },
  { file: 'icon-maskable-512.png', size: 512, svg: bleed },
  { file: 'apple-touch-icon.png', size: 180, svg: bleed },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size, svg } of ICONS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    writeFileSync(`${OUT}/${file}`, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
    console.log(`  ${file}  ${size}×${size}`);
  }
} finally {
  await browser.close();
}
