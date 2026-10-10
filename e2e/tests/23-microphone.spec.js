import { test, expect } from '@playwright/test';
import { fakeMicrophone } from '../helpers/fakeMicrophone.js';
import { collectErrors, seedSettings } from '../helpers/studio.js';

/**
 * The tuner and the microphone input, on real sound.
 *
 * Chromium is given a WAV file as its microphone (helpers/fakeMicrophone.js):
 * a guitar's A string plucked fifteen cents flat and left to ring, then its
 * six open strings from low to high. So the sound goes through the browser's
 * own microphone path, the analyser, the pitch detection and the note
 * tracking, exactly as a player's would.
 *
 * Each test opens a fresh page, and the file starts again from its beginning
 * when the page first asks for the microphone.
 */

const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];
// Long enough before the first note for the page to load and ask for the microphone.
const LEAD_IN = 6;

test.use({
  launchOptions: {
    args: fakeMicrophone('microphone-spec', [
      { midi: 45, seconds: 5, cents: -15, rest: 1.5 },
      ...OPEN_STRINGS.map(midi => ({ midi, seconds: 0.7 })),
    ], { leadIn: LEAD_IN }),
  },
});

async function open(page, settings = {}) {
  await seedSettings(page, { practiceInstrument: 'guitar', renderer: 'canvas', learningView: 'studio', ...settings });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Guitar studio' })).toBeVisible({ timeout: 30_000 });
}

test('the tuner names the note it hears, how far off it is, and which string to turn', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Tuner', exact: true }).click();
  const tuner = page.getByRole('dialog', { name: 'Tuner' });
  await expect(tuner).toBeVisible();
  await expect(tuner.getByText('Listening')).toBeVisible({ timeout: 15_000 });
  // Opening the tuner turned the microphone on, and the top bar says so.
  await expect(page.locator('.setup-label')).toHaveText('Microphone on');

  const face = tuner.locator('.tuner-face');
  await expect(face).toHaveAttribute('data-note', 'A2', { timeout: 20_000 });
  // Fifteen cents flat, to within what a decaying string and a few readings allow.
  await expect.poll(async () => Number(await face.getAttribute('data-cents')), { timeout: 5_000 }).toBeLessThanOrEqual(-11);
  expect(Number(await face.getAttribute('data-cents'))).toBeGreaterThanOrEqual(-19);
  await expect(tuner.locator('.tuner-verdict')).toContainText('cents flat');
  await expect(tuner.locator('.tuner-strings li.tuning')).toHaveAttribute('data-string', '5');
  await expect(tuner.locator('.tuner-strings li.tuning')).toContainText('tune up');

  // Closing it lets the microphone go.
  await tuner.getByRole('button', { name: 'Done' }).click();
  await expect(tuner).toHaveCount(0);
  await expect(page.locator('.setup-label')).toHaveText('Input & sound');
  expect(errors).toEqual([]);
});

test('with the microphone as the input, a lesson hears the real notes and does not play them back', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, { inputMethod: 'mic', mode: 'wait' });
  // Chosen on an earlier visit, the microphone does not come on because the page was opened.
  await expect(page.locator('.setup-label')).toHaveText('Microphone off');
  await page.evaluate(async () => {
    const { midiInput } = await import('/src/lib/midiInput.js');
    const { audio } = await import('/src/lib/audio.js');
    window.__heard = []; window.__sounded = 0; window.__buzzed = 0;
    midiInput.onMessage(message => { if (message.type === 'noteon') window.__heard.push([message.midi, message.source]); });
    const attack = audio.attack.bind(audio), cue = audio.errorCue.bind(audio);
    audio.attack = (...rest) => { window.__sounded += 1; return attack(...rest); };
    audio.errorCue = (...rest) => { window.__buzzed += 1; return cue(...rest); };
  });
  // The first click anywhere turns it on.
  await page.locator('.brand').click();
  await expect(page.locator('.setup-label')).toHaveText('Microphone on', { timeout: 15_000 });
  // Meet the six strings starts with the six open strings, low to high: the notes the microphone is about to hear.
  await page.getByRole('button', { name: 'Play', exact: true }).click();

  // The long flat A comes first; it is not the note the lesson is waiting for, so it moves nothing on,
  // and being a wrong note it would normally buzz.
  const fromOpenStrings = async () => (await page.evaluate(() => window.__heard)).slice(-6);
  await expect.poll(fromOpenStrings, { timeout: 30_000 }).toEqual(OPEN_STRINGS.map(midi => [midi, 'mic']));
  // All six were matched: the lesson now waits for its seventh note, back down on the B string.
  await expect(page.locator('.guitar-next strong')).toHaveText('B3 · string 2 · open');
  // The guitar sounded them; the app must not sound them again, nor buzz at the wrong one for the microphone to hear.
  expect(await page.evaluate(() => window.__sounded)).toBe(0);
  expect(await page.evaluate(() => window.__buzzed)).toBe(0);
  expect((await page.evaluate(() => window.__heard))[0]).toEqual([45, 'mic']);
  expect(errors).toEqual([]);
});

test('Input & sound offers the microphone, says what it hears, and what it cannot', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await page.getByRole('button', { name: 'Input & sound', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your instrument, ready to play.' });
  const choices = dialog.getByRole('group', { name: 'Input preference' });
  await expect(choices.getByRole('button')).toHaveCount(3);
  await choices.getByRole('button', { name: /Microphone/ }).click();
  await expect(dialog.getByRole('heading', { name: 'Microphone on' })).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator('.setup-mic-limits')).toContainText('single notes');
  await expect(dialog.locator('.setup-mic-limits')).toContainText('Nothing is recorded');
  // The first note in the file is the A string.
  await expect(dialog.locator('.setup-microphone .setup-detected')).toHaveText('✓ Heard A2 from your guitar.', { timeout: 25_000 });
  // The choice is kept, and the microphone stays on behind the dialog.
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.setup-label')).toHaveText('Microphone on');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('piano-practice-coach:v1')).settings.inputMethod)).toBe('mic');
  expect(errors).toEqual([]);
});

test('the microphone is not offered for the drums, which have no one pitch to hear', async ({ page }) => {
  await seedSettings(page, { practiceInstrument: 'drums', renderer: 'canvas', learningView: 'studio', inputMethod: 'mic' });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Drum studio' })).toBeVisible({ timeout: 30_000 });
  // Chosen on another instrument, it stays off here.
  await expect(page.locator('.setup-label')).toHaveText('Input & sound');
  await page.getByRole('button', { name: 'Input & sound', exact: true }).click();
  const microphone = page.getByRole('group', { name: 'Input preference' }).getByRole('button', { name: /Microphone/ });
  await expect(microphone).toBeDisabled();
  await expect(microphone).toContainText('Not for drums');
});
