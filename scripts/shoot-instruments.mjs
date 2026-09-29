/**
 * shoot-instruments.mjs — the welcome page's "Inside the studio" previews.
 *
 * Opens each string instrument's first guided lesson in the dark theme at
 * 1280×720 (the size the welcome page reserves) and writes
 * public/media/<instrument>-studio.png. Needs the dev server running.
 *
 *   node scripts/shoot-instruments.mjs [url] [instrument ...]
 */
import { chromium } from '@playwright/test';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const wanted = process.argv.slice(3);
const LESSONS = {
  guitar: { study: 'guitarStudyId', id: 'guitar-open-strings', stage: '.guitar-stage canvas' },
  violin: { study: 'violinStudyId', id: 'violin-open-strings', stage: '.bowed-stage svg' },
  cello: { study: 'celloStudyId', id: 'cello-open-strings', stage: '.bowed-stage svg' },
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [instrument, lesson] of Object.entries(LESSONS)) {
    if (wanted.length && !wanted.includes(instrument)) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ instrument, lesson }) => {
      localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: {
        onboarded: true, practiceInstrument: instrument, learningView: 'lesson', theme: 'dark', renderer: 'gl',
        settingsVersion: 5, [lesson.study]: lesson.id, learning: { [instrument]: { lessonId: lesson.id, step: 'sound' } },
      } }));
    }, { instrument, lesson });
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator(lesson.stage).first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);
    if (errors.length) throw new Error(`${instrument}: ${errors.join('; ')}`);
    await page.screenshot({ path: `public/media/${instrument}-studio.png` });
    console.log(`wrote public/media/${instrument}-studio.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
