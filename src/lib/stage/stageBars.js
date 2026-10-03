/**
 * stageBars.js — the room a stage's own top and bottom bars leave the instrument.
 *
 * Both string stages float a bar across the top (title, open-string buttons)
 * and one across the bottom (legend, hint) over the canvas. The camera and
 * the labels keep clear of them.
 */

/** Where the stage's top bar ends and its bottom bar begins, in stage pixels; null while the stage has no size. */
export function barEdges(el, { top = '.guitar-stage-top', bottom = '.guitar-stage-bottom' } = {}) {
  const stage = el.getBoundingClientRect();
  if (!stage.height) return null;
  const topBox = el.querySelector(top)?.getBoundingClientRect();
  const bottomBox = el.querySelector(bottom)?.getBoundingClientRect();
  return { height: stage.height, top: topBox?.height ? topBox.bottom - stage.top : 0, bottom: bottomBox?.height ? bottomBox.top - stage.top : stage.height };
}

/** The band between the bars in the -1 to 1 screen units the turntable and the framing fit to. */
export const clearOfBars = edges => (edges ? { x: 1, top: 1 - (2 * edges.top) / edges.height, bottom: 1 - (2 * edges.bottom) / edges.height } : undefined);

/** The band string names must stay in: between the bars, with a little room. */
const STRING_BAND_MARGIN = 2;
export const stringBandOf = edges => edges && { top: edges.top + STRING_BAND_MARGIN, bottom: edges.bottom - STRING_BAND_MARGIN };
