import { STORAGE_KEY } from './storage.js';

/**
 * Saves `settings` as a returning player's, before the page loads: past the
 * welcome card, with no count-in. By default only a first load is seeded, so a
 * reload finds whatever the page has saved since; `everyLoad` starts every
 * load from these settings.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [settings] added to, or replacing, the defaults
 * @param {{ everyLoad?: boolean }} [options]
 */
export async function seedSettings(page, settings = {}, { everyLoad = false } = {}) {
  await page.addInitScript(({ key, saved, always }) => {
    if (always || !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, songs: {}, settings: saved }));
  }, { key: STORAGE_KEY, saved: { settingsVersion: 5, onboarded: true, countInBars: 0, ...settings }, always: everyLoad });
}

/**
 * Every page error and console error from now on, as a list the test can
 * expect to be empty. React's warning about `fetchPriority` is not the app's.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ ignore?: RegExp }} [options] other messages to leave out, such as the browser's own note of a file the test serves as missing
 */
export function collectErrors(page, { ignore } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !/fetchPriority/.test(text) && !ignore?.test(text)) errors.push(text);
  });
  return errors;
}
