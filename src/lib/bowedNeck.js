/**
 * bowedNeck.js — where the finger places are on a downloaded violin or cello.
 *
 * Numbers only, in stage units: scripts/models/prepare.mjs puts every model's
 * nut at x = -6.05 with 24.1 units of string to the bridge, the lowest string
 * nearest the viewer (+z). A bowed instrument has no frets. Place n is the
 * point n semitones up the string, where 2^(-n/12) of it is left to vibrate;
 * the UI calls it a finger place, and the code keeps the guitar's `fret` name
 * so the tab, the feedback and the matcher stay shared (see bowed.js).
 */

/** x of place `n` on the string; 0 is the nut. */
export const placeX = (fit, n) => fit.nutX + fit.scaleLength * (1 - 2 ** (-n / 12));

/** The open string is marked just past the nut, where no finger stops it. */
const OPEN_MARK = 0.45;
/** How far past the last visible place the lesson map reaches, and how far past the scroll. */
const PAST_LAST_PLACE = 2.6;
const PAST_SCROLL = 0.3;
/** Where the bow meets the strings, as a share of the string from the nut: past the fingerboard, nearer the bridge. */
const CONTACT = 0.88;
/** How far past the outer strings, below and above them, the playable surface reaches. */
const SURFACE = Object.freeze({ below: 0.1, above: 0.3 });

/**
 * The neck of a downloaded violin or cello, from its measurements.
 *
 * @param {{ nutX: number, scaleLength: number, strings: { nut: number[], bridge: number[] }[], bounds: { min: number[] } }} fit
 */
export function bowedNeck(fit) {
  const strings = fit.strings;
  if (!strings?.length) throw new Error('A bowed neck needs measured strings');
  const count = strings.length, last = count - 1;
  const stringAt = (s, x) => {
    const { nut, bridge } = strings[s], t = (x - nut[0]) / (bridge[0] - nut[0]);
    return { y: nut[1] + t * (bridge[1] - nut[1]), z: nut[2] + t * (bridge[2] - nut[2]) };
  };
  const gapAt = (s, x) => {
    const z = stringAt(s, x).z;
    return Math.min(...[s - 1, s + 1].filter(t => t >= 0 && t < count).map(t => Math.abs(stringAt(t, x).z - z)));
  };
  const spacing = x => Math.abs(stringAt(0, x).z - stringAt(last, x).z) / last;
  const markX = fret => (fret === 0 ? fit.nutX + OPEN_MARK : placeX(fit, fret));
  const middle = (a, b) => (placeX(fit, a) + placeX(fit, b)) / 2;
  return Object.freeze({
    count,
    nutX: fit.nutX,
    stringAt,
    gapAt,
    placeX: n => placeX(fit, n),
    markX,
    /** The stretch of string, from and to, that a press means place `fret`: nearer it than its neighbours. */
    reach: (fret, maxFret) => [
      fret === 0 ? fit.nutX : middle(fret - 1, fret),
      fret === maxFret ? placeX(fit, fret) + (placeX(fit, fret) - placeX(fit, fret - 1)) / 2 : middle(fret, fret + 1),
    ],
    /** The lesson map: from the scroll to just past the last visible place. */
    span: maxFret => ({ left: fit.bounds.min[0] - PAST_SCROLL, right: placeX(fit, maxFret) + PAST_LAST_PLACE }),
    corners: maxFret => [fit.nutX, placeX(fit, maxFret)].flatMap(x => {
      const near = stringAt(0, x).z + spacing(x) / 2, far = stringAt(last, x).z - spacing(x) / 2, y = stringAt(0, x).y;
      return [y - SURFACE.below, y + SURFACE.above].flatMap(height => [far, near].map(z => [x, height, z]));
    }),
    /** Where a tape's finger number sits: beyond the highest string, as the guitar's fret numbers do. */
    tapeLabelAt: x => ({ y: stringAt(last, x).y, z: stringAt(last, x).z - 1.3 * spacing(x) }),
    /** Where along the strings the bow plays. */
    contactX: () => fit.nutX + CONTACT * fit.scaleLength,
  });
}
