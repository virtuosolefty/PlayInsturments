/**
 * shoot-instruments.mjs — the welcome page's "Inside the studio" previews.
 *
 * Opens each instrument's first guided lesson in the dark theme at 1280×720
 * (the size the welcome page reserves) and writes
 * public/media/<instrument>-studio.png. Needs the dev server running, and the
 * machine's own graphics card: the downloaded models and the 3D kit are only
 * drawn at full detail, and a picture of the lighter stage would not be what a
 * visitor gets. Take them again whenever the studio's look changes; they were
 * a month out of date once, and showed a screen that no longer existed.
 *
 *   node scripts/shoot-instruments.mjs [url] [instrument ...]
 */
import { chromium } from '@playwright/test';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const wanted = process.argv.slice(3);
const LESSONS = {
  piano: { id: 'path-01-home-five-right', stage: '.roll-area canvas' },
  guitar: { study: 'guitarStudyId', id: 'guitar-open-strings', stage: '.guitar-stage[data-stage-tier="full"] canvas' },
  violin: { study: 'violinStudyId', id: 'violin-open-strings', stage: '.bowed-stage-3d[data-stage-model="violin"] canvas' },
  cello: { study: 'celloStudyId', id: 'cello-open-strings', stage: '.bowed-stage-3d[data-stage-model="cello"] canvas' },
  drums: { study: 'drumsStudyId', id: 'drums-meet-the-kit', stage: '.drum-stage[data-ready="true"] canvas' },
};
const GPU = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'];

const browser = await chromium.launch({ args: GPU });
try {
  for (const [instrument, lesson] of Object.entries(LESSONS)) {
    if (wanted.length && !wanted.includes(instrument)) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ instrument, lesson }) => {
      localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: {
        onboarded: true, practiceInstrument: instrument, learningView: 'lesson', theme: 'dark', renderer: 'gl',
        settingsVersion: 5, stageQuality: 'full', ...(lesson.study && { [lesson.study]: lesson.id }), learning: { [instrument]: { lessonId: lesson.id, step: 'sound' } },
      } }));
    }, { instrument, lesson });
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator(lesson.stage).first().waitFor({ timeout: 90000 });
    // The camera settles and the textures arrive.
    await page.waitForTimeout(5000);
    if (errors.length) throw new Error(`${instrument}: ${errors.join('; ')}`);
    await page.screenshot({ path: `public/media/${instrument}-studio.png` });
    console.log(`wrote public/media/${instrument}-studio.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
