/**
 * pageTitle.js — the browser tab's title while the studio is open.
 *
 * The tab used to say the same thing everywhere, so someone with the app open
 * beside other tabs, or a screen reader announcing a page change, could not
 * tell a lesson on the guitar from a piece on the piano.
 *
 * @param {{ piece?: string | null, instrument?: string, freePlay?: boolean, home?: boolean }} where
 */
export function pageTitle({ piece = null, instrument = '', freePlay = false, home = false } = {}) {
  const what = home ? 'Learning path' : freePlay ? 'Free play' : piece;
  return [what, instrument, 'Practice Deck'].filter(Boolean).join(' · ').replace(/ · Practice Deck$/, ' — Practice Deck');
}
