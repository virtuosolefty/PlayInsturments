import { fitProblem } from './models.js';

/**
 * modelAvailability.js — whether a model's files are there to be shown.
 *
 * The instruments that are only shown (stageModels.js) are prepared from
 * downloads, one at a time, so a site may have some and not others. A model is
 * offered only when its measurements are served and usable; the question is
 * asked once a page, with the small file the viewer needs anyway.
 *
 * The file is read, not just asked after: a development server answers an
 * unknown address with the app's own page and a success code.
 */

const asked = new Map(); // base + id → Promise<boolean>

/**
 * @param {string} id a model's id
 * @param {{ base?: string }} [options] where the model files are served from
 * @returns {Promise<boolean>}
 */
export function modelAvailable(id, { base = `${import.meta.env?.BASE_URL ?? '/'}models/` } = {}) {
  const key = `${base}${id}`;
  if (!asked.has(key)) {
    asked.set(key, (async () => {
      try {
        const response = await fetch(`${key}.json`);
        return response.ok && fitProblem(await response.json()) === null;
      } catch {
        // No file, no network, or not measurements: either way there is nothing to show.
        return false;
      }
    })());
  }
  return asked.get(key);
}
