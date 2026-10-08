/**
 * shoot-models.mjs — the pictures in the whole-instrument pop-up.
 *
 * Opens each instrument in free play at full detail, selects Whole instrument,
 * chooses each model in turn and photographs the stage without its labels and
 * buttons. Writes public/media/models/<id>.webp, 640×400. Needs the dev
 * server running, and the machine's own graphics card: the full stage is a
 * frame or two a second in software.
 *
 *   node scripts/shoot-models.mjs [url] [model id ...]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { STAGE_MODELS } from '../src/lib/stageModels.js';
import { toWebp } from './models/images.mjs';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const wanted = process.argv.slice(3);
const OUT = 'public/media/models';
const SHAPE = 640 / 400;
/** Everything on a stage that is not the instrument. */
const BARE = '.guitar-stage-top, .guitar-stage-bottom, .model-caption, .model-change, .model-notice, .drum-labels, .stage-status, .guitar-stage > :not(canvas):not(.model-viewer), .model-viewer > :not(canvas) { visibility: hidden !important; }';

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
const shots = [];
try {
  for (const [instrument, models] of Object.entries(STAGE_MODELS)) {
    if (wanted.length && !models.some(model => wanted.includes(model.id))) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(settings => {
      localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings }));
    }, { settingsVersion: 5, onboarded: true, renderer: 'gl', practiceInstrument: instrument, theme: 'dark', learningView: 'studio', stageQuality: 'full' });
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Free play', exact: true }).click();
    const stage = page.locator('.guitar-stage').first();
    const whole = page.getByRole('group', { name: 'Stage view' }).getByRole('button', { name: 'Whole instrument' });
    await whole.waitFor({ timeout: 60000 });
    await whole.click();
    for (const model of models) {
      if (wanted.length && !wanted.includes(model.id)) continue;
      if (!await page.getByRole('dialog', { name: 'Whole instrument' }).count()) await page.getByRole('button', { name: 'Choose instrument', exact: true }).click();
      await page.locator('.model-card', { has: page.getByText(model.label, { exact: true }) }).click();
      if (model.played) await page.locator('.model-viewer').waitFor({ state: 'detached' });
      else await page.locator('.model-viewer[data-ready="true"]').waitFor({ timeout: 60000 });
      // The camera swings to the whole instrument; let it settle and the textures arrive.
      await page.waitForTimeout(3000);
      const bare = await page.addStyleTag({ content: BARE });
      const box = await stage.boundingBox();
      const width = Math.min(box.width, box.height * SHAPE), height = width / SHAPE;
      const png = await page.screenshot({ clip: { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height } });
      await bare.evaluate(node => node.remove());
      if (errors.length) throw new Error(`${model.id}: ${errors.join('; ')}`);
      shots.push({ id: model.id, bytes: new Uint8Array(png) });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
const encoded = await toWebp(shots.map(shot => ({ bytes: shot.bytes, mimeType: 'image/png', maxSize: 640, quality: 0.86 })));
shots.forEach((shot, i) => {
  writeFileSync(`${OUT}/${shot.id}.webp`, encoded[i].bytes);
  console.log(`wrote ${OUT}/${shot.id}.webp ${encoded[i].width}×${encoded[i].height} ${Math.round(encoded[i].bytes.length / 1024)} kB`);
});
