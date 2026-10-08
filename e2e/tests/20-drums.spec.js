import { test, expect } from '@playwright/test';
import { watchSound } from '../helpers/sound.js';
import { chooseWorkspace as workspace } from '../helpers/workspace.js';

/**
 * The drums: lanes to read, a 3D kit to hit, and a pad for each drum. A hit
 * is a General MIDI drum note, so the pads, the computer keys, the 3D kit and
 * a controller all go through the same practice engine.
 *
 * Headless Chromium draws the 3D kit in software, so the tests that show it
 * are marked slow.
 */

const stage = page => page.locator('.drum-stage');
const pads = page => page.getByRole('group', { name: 'Drum pads' });
const pad = (page, name) => pads(page).getByRole('button', { name, exact: true });
const notes = (page, type = 'noteon') => page.evaluate(kind => window.__notes.filter(m => m.type === kind).map(m => m.midi), type);
const listen = page => page.evaluate(async () => { window.__notes = []; (await import('/src/lib/midiInput.js')).midiInput.onMessage(m => window.__notes.push(m)); });
const send = (page, midi) => page.evaluate(async note => {
  const { emitSyntheticMidi } = await import('/src/lib/midiInput.js');
  emitSyntheticMidi({ type: 'noteon', midi: note, velocity: 0.8, source: 'test-controller' });
  emitSyntheticMidi({ type: 'noteoff', midi: note, velocity: 0, source: 'test-controller' });
}, midi);

/** Opens the drums. `settings` adds to, or replaces, what a returning drummer has saved. */
async function open(page, settings = {}) {
  await page.addInitScript(saved => {
    // Only the first load: a reload must find what the drummer left.
    if (!localStorage.getItem('piano-practice-coach:v1')) localStorage.setItem('piano-practice-coach:v1', JSON.stringify({ version: 1, songs: {}, settings: saved }));
  }, { settingsVersion: 5, onboarded: true, countInBars: 0, practiceInstrument: 'drums', renderer: 'canvas', learningView: 'studio', ...settings });
  await page.goto('/');
  if ((settings.learningView ?? 'studio') === 'studio') await expect(page.getByRole('region', { name: 'Drum studio' })).toBeVisible({ timeout: 30_000 });
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && !/fetchPriority/.test(message.text())) errors.push(message.text()); });
  return errors;
}

test('the drums open with lanes to read, a 3D kit to hit and the pads a click away', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await open(page, { renderer: 'gl' });
  await expect(stage(page).locator('canvas')).toBeVisible({ timeout: 60_000 });
  await expect(stage(page)).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(page.getByRole('group', { name: 'Practice instrument' }).getByRole('button')).toHaveText(['Piano', 'Guitar', 'Violin', 'Cello', 'Drums']);
  // Meet the kit plays every piece but the open hi-hat, which shares the closed one's cymbals.
  await expect(page.locator('.drum-lanes')).toHaveAttribute('data-lanes', '8');
  await expect(page.locator('.drum-label')).toHaveCount(8, { timeout: 30_000 });
  await expect(page.locator('.guitar-next')).toContainText('Kick · press K');
  await expect(page.getByLabel('Drum exercise').locator('option')).toHaveCount(6);
  // On a wide screen the pads fold away under the kit, and open for anyone who wants them.
  await expect(pads(page)).toBeHidden();
  await page.getByText('Show drum pads · keyboard accessible').click();
  await expect(pads(page).getByRole('button')).toHaveCount(9);
  await expect(page.locator('.drum-pad.next')).toHaveAttribute('data-piece', 'kick');
  expect(errors).toEqual([]);
});

test('a pad, a key, the kit card and the 3D kit each play their drum, and it is heard', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await open(page, { renderer: 'gl' });
  await expect(stage(page)).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await workspace(page, 'Free play');
  await expect(stage(page)).toHaveAttribute('data-view', 'freePlay');
  await expect(page.locator('.pad-play')).toHaveCount(0);
  await listen(page);
  await watchSound(page);

  await page.getByText('Show drum pads · keyboard accessible').click();
  await pad(page, 'Snare drum, key S').click();
  await expect.poll(() => notes(page)).toEqual([38]);
  expect(await page.evaluate(() => window.__notes[0].source)).toBe('drums-screen');
  await expect.poll(() => page.evaluate(() => window.__studioHeardSound)).toBe(true);

  // Each drum is the letter it starts with.
  await page.locator('#practice-stage').focus();
  await page.keyboard.press('k');
  await expect.poll(() => notes(page)).toEqual([38, 36]);
  await page.keyboard.press('h');
  await expect.poll(() => notes(page)).toEqual([38, 36, 42]);

  await page.getByRole('button', { name: 'Hear the crash cymbal', exact: true }).click();
  await expect.poll(() => notes(page)).toEqual([38, 36, 42, 49]);

  // The kick's name sits on its batter head, so a tap there is a tap on the drum.
  const kick = await page.locator('.drum-label', { hasText: 'Kick' }).boundingBox();
  await page.mouse.click(kick.x + kick.width / 2, kick.y + kick.height / 2);
  await expect.poll(() => notes(page), { timeout: 30_000 }).toEqual([38, 36, 42, 49, 36]);

  // A drum hit is let go by itself: nothing is left sounding.
  await expect.poll(async () => (await notes(page, 'noteoff')).length).toBe(5);
  // Free play never records a score.
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('piano-practice-coach:v1')).songs))).toEqual([]);
  expect(errors).toEqual([]);
});

test('Wait for me moves on at the right drum, names a wrong one, and takes a controller\'s other snare', async ({ page }) => {
  await open(page);
  await page.locator('.zone-mode button').filter({ hasText: 'Wait for me' }).click();
  await page.locator('.pad-play').click();
  await expect(page.locator('.wait-hint')).toContainText('Kick');

  await page.locator('#practice-stage').focus();
  await page.keyboard.press('k');
  await expect(page.locator('.completion-label strong')).toHaveText('1 / 8');
  await expect(page.locator('.wait-hint')).toContainText('Snare');

  // The wrong drum is named as a drum, not as the pitch its MIDI number would be.
  await page.keyboard.press('c');
  await expect(page.locator('.detailed-events .event').first()).toContainText('Wrong drum');
  await expect(page.locator('.detailed-events .event').first()).toContainText('Crash');
  await expect(page.locator('.completion-label strong')).toHaveText('1 / 8');

  // An electronic kit may send note 40 for its snare; it counts as the snare.
  await send(page, 40);
  await expect(page.locator('.completion-label strong')).toHaveText('2 / 8');
  await expect(page.locator('.wait-hint')).toContainText('Hi-hat');
  await expect(page.locator('.live-timing')).toContainText('Not measured in Wait for me');
});

test('on the 2D trainer the pads are the whole kit, and work from the keyboard', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await expect(stage(page)).toHaveCount(0);
  await expect(page.locator('.drum-pads.large')).toBeVisible();
  await expect(pads(page).getByRole('button')).toHaveCount(9);
  await expect(page.locator('.drum-pad.next')).toHaveAttribute('data-piece', 'kick');
  // The side pane speaks of beats and drums, and lists the drums where a piano piece has its range.
  await expect(page.locator('.practice-objective')).toHaveText('A steady beat, one hit at a time.');
  await page.locator('.piece-details summary').click();
  await expect(page.locator('.piece-facts')).toContainText('Drums');
  await expect(page.locator('.piece-facts')).not.toContainText('Range');
  await listen(page);
  await pad(page, 'Floor tom, key F').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => notes(page)).toEqual([43]);
  await expect.poll(async () => (await notes(page, 'noteoff')).length).toBe(1);
  // A study has its own lanes: the backbeat is kick and snare alone.
  await page.getByLabel('Drum exercise').selectOption('drums-backbeat');
  await expect(page.locator('.drum-lanes')).toHaveAttribute('data-lanes', '2');
  await expect(page.locator('.studio-header')).toContainText('Kick and snare');
  expect(errors).toEqual([]);
});

test('a phone stacks the lanes, the kit and pads big enough to tap', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { renderer: 'gl' });
  await expect(stage(page)).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  // On a phone the pads are the easier thing to hit, so they are out, not folded away.
  await expect(pads(page).getByRole('button')).toHaveCount(9);
  const lanes = await page.locator('.drum-lanes').boundingBox();
  const kit = await stage(page).boundingBox();
  expect(kit.y).toBeGreaterThanOrEqual(lanes.y + lanes.height - 1);
  for (const box of await pads(page).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()))) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await listen(page);
  await pad(page, 'Hi-hat, key H').scrollIntoViewIfNeeded();
  await pad(page, 'Hi-hat, key H').click();
  await expect.poll(() => notes(page)).toEqual([42]);
  expect(errors).toEqual([]);
});

test('the learning home starts a drummer on Meet the kit', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, { learningView: 'home' });
  await expect(page.getByRole('group', { name: 'Learning instrument' }).getByRole('button', { name: 'Drums', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  const card = page.locator('.next-lesson-card');
  await expect(card.getByRole('heading', { name: 'Meet the kit' })).toBeVisible();
  await expect(card).toContainText('Find every drum and cymbal');
  await expect(card).toContainText('Find the drums');
  await card.getByRole('button', { name: /Start my first lesson/ }).click();
  await expect(page.getByRole('region', { name: 'Drum studio' })).toBeVisible();
  await expect(page.locator('.drum-lanes')).toBeVisible();
  await expect(page.locator('.guitar-next')).toContainText('Kick · press K');
  expect(errors).toEqual([]);
});

test('a new drummer confirms sound, hears that a wrong drum is a different drum, and finds the kick', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, { learningView: 'home' });
  await page.getByRole('button', { name: /Start my first lesson/ }).click();
  await expect(page.locator('.studio-heading h2')).toHaveText('Meet the kit');
  await watchSound(page);
  await page.getByRole('button', { name: 'Play a test note', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__studioHeardSound)).toBe(true);
  await page.getByRole('button', { name: 'I heard it' }).click();

  await expect(page.locator('.first-note-target')).toContainText('Kick · press K');
  await page.locator('#practice-stage').focus();
  await page.keyboard.press('c');
  await expect(page.locator('.lesson-note-feedback')).toContainText('That was a different drum. Look for Kick.');
  await page.getByRole('button', { name: 'Play Kick on screen' }).click();
  await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Listen');
  await expect(page.locator('.lesson-note-feedback')).toContainText('You found Kick');

  // The glossary is the drummer's own: no middle C, no finger numbers.
  await page.getByRole('button', { name: /A little help with the terms/ }).click();
  await expect(page.locator('.lesson-glossary')).toContainText('The kick is played with your foot');
  expect(errors).toEqual([]);
});

test('a guided drum phrase waits for each drum in turn and saves the lesson', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await open(page, {
    learningView: 'lesson', errorCues: false,
    learning: { drums: { lessonId: 'drums-meet-the-kit', step: 'follow', rate: 0.65, soundConfirmed: true, firstNoteDone: true, listened: true, followed: false, practised: false, completed: {} } },
  });
  await expect(page.locator('.lesson-guide h2')).toHaveText('Find each drum. Take your time.');
  await expect(page.getByRole('button', { name: 'Play this step', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play this step', exact: true }).click();
  // Hit whichever drums the music is waiting for, as a learner reading the hint would.
  await page.evaluate(async () => {
    const { emitSyntheticMidi } = await import('/src/lib/midiInput.js');
    const midiOf = { Kick: 36, Snare: 38, 'Hi-hat': 42, 'Open hat': 46, 'High tom': 50, 'Mid tom': 47, 'Floor tom': 43, Crash: 49, Ride: 51 };
    let lastAt = 0;
    window.__followTimer = setInterval(() => {
      if (performance.now() - lastAt < 300) return;
      const hint = document.querySelector('.wait-hint');
      if (!hint) return;
      const wanted = hint.textContent.replace('waiting for', '').split('+').map(name => midiOf[name.trim()]).filter(Boolean);
      if (!wanted.length) return;
      lastAt = performance.now();
      wanted.forEach(midi => { emitSyntheticMidi({ type: 'noteon', midi, velocity: 0.72 }); setTimeout(() => emitSyntheticMidi({ type: 'noteoff', midi }), 90); });
    }, 100);
  });
  await expect(page.locator('.lesson-result h3')).toHaveText('Guided practice completed', { timeout: 65_000 });
  await page.evaluate(() => clearInterval(window.__followTimer));
  await expect(page.locator('.lesson-result')).toContainText('8 notes hit · 0 missed · 0 extra notes');
  await page.getByRole('button', { name: 'Next: add a rhythm →' }).click();
  await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Practice');
  await page.reload();
  await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Practice');
  await page.getByRole('button', { name: 'Save & leave' }).click();
  await expect(page.locator('.learning-roadmap > header')).toContainText('1 guided');
  expect(errors).toEqual([]);
});
