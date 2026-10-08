/**
 * The instruments that are only shown in the whole-instrument view are
 * prepared from downloads, so which of them a checkout has varies. Their
 * files are named <instrument>-<kind>; the instruments that are played are a
 * single word and are always there.
 */
export const SHOWN_ONLY_MODEL = /\/models\/[a-z]+-[a-z]+\.(json|glb)$/;

/**
 * Answers every shown-only model as missing, so a test sees the stage as it
 * is with the played instrument alone: Whole instrument shows it at once,
 * with no pop-up to choose from.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function onlyPlayedModels(page) {
  await page.route(SHOWN_ONLY_MODEL, route => route.fulfill({ status: 404, body: 'Not found' }));
}
