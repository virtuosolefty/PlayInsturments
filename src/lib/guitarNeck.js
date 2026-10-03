/**
 * guitarNeck.js — where the playable places on the 3D guitar neck are.
 *
 * Numbers only, in stage units, so the mesh, the click targets, the labels and
 * the camera all read the same geometry. The neck runs along x from the nut;
 * strings sit side by side along z with low E nearest the viewer.
 */

import { GUITAR_TUNING } from './guitar.js';

export const STRING_COUNT = GUITAR_TUNING.length;
/** Just inside the nut, where the vibrating string begins. */
export const NUT_X = -6.05;
/** Nut to saddle. The twelfth fret is half of this from the nut. */
export const SCALE_LENGTH = 24.1;
const STRING_PITCH = 0.56;

/** x of fret wire `fret`; 0 is the nut. Equal temperament: each fret leaves 2^(-1/12) of the string. */
export const fretX = fret => NUT_X + SCALE_LENGTH * (1 - 2 ** (-fret / 12));

/** The open string is played from a short space behind the nut. */
export const OPEN_SPACE = Object.freeze({ x: -6.45, width: 0.5 });

/** Centre and width of the space a finger presses for `fret`, wire to wire. */
export function fretSpace(fret) {
  if (fret === 0) return OPEN_SPACE;
  const from = fretX(fret - 1), to = fretX(fret);
  return { x: (from + to) / 2, width: to - from };
}

/** z of string `string` (0 = low E). */
export const stringZ = string => ((STRING_COUNT - 1) / 2 - string) * STRING_PITCH;

/** Drawn thickness of string `string`: heavier toward the bass. */
export const stringGauge = string => 0.014 + (STRING_COUNT - 1 - string) * 0.004;

/** Height of the drawn guitar's strings above its neck's centreline. */
export const WIRE_Y = 0.23;

/** How far past the outer strings, and above the fingerboard, the playable surface reaches. */
const SURFACE = Object.freeze({ beyondStrings: 0.3, height: 0.3 });

/**
 * The eight corners of the playable surface out to `maxFret`: open-string
 * places behind the nut through the last fret, a little past the outer
 * strings, up to where the markers sit. In neck units, before the stage
 * squashes the neck across its width.
 */
export function fretboardCorners(maxFret) {
  const across = stringZ(0) + SURFACE.beyondStrings;
  const xs = [OPEN_SPACE.x - OPEN_SPACE.width / 2, fretX(maxFret)];
  return xs.flatMap(x => [0, SURFACE.height].flatMap(y => [-across, across].map(z => [x, y, z])));
}

const HEADSTOCK_LEFT = -9.6;

/** How far past the last visible fret the camera reaches: the body's shoulder once the whole neck is shown. */
const pastLastFret = maxFret => fretX(maxFret) + (maxFret >= 12 ? 2.6 : 0.4);

/**
 * The stretch the camera must show: string names and headstock through the
 * last visible fret, plus the body's shoulder once the whole neck is shown.
 */
export function neckSpan(maxFret) {
  return { left: HEADSTOCK_LEFT, right: pastLastFret(maxFret) };
}

/**
 * The neck the stage plays on, whichever guitar is shown: where each string
 * runs, where labels sit, what the camera frames and what must stay in view.
 * Coordinates are in the guitar's own units; the stage projects them through
 * the guitar's transform.
 *
 * - `stringAt(s, x)` is string s's centreline where it crosses x.
 * - `labelAt(kind, s, x)` is where string s's name ('string', at the nut) or
 *   a chord label ('chord') floats above it.
 * - `fretLabelAt(x)` is where a fret number at x sits, beyond the treble edge.
 */
export const DRAWN_NECK = Object.freeze({
  count: STRING_COUNT,
  nutX: NUT_X,
  stringAt: s => ({ y: WIRE_Y, z: stringZ(s) }),
  labelAt: (kind, s) => ({ y: kind === 'string' ? 0.3 : 0.35, z: stringZ(s) }),
  fretLabelAt: () => ({ y: 0.14, z: -2.13 }),
  span: neckSpan,
  corners: fretboardCorners,
});

/** How much of a downloaded guitar's headstock the lesson camera shows: the posts, not the whole tuner heads. */
const HEADSTOCK_SHOWN = 3.6;

/**
 * The neck of a downloaded guitar, from its measurements (public/models/guitar.json):
 * each string runs straight from where it leaves the nut to where it crosses
 * the saddle, so the strings fan out as on the real instrument.
 *
 * @param {{ nutX: number, strings: { nut: number[], bridge: number[] }[] }} fit
 */
export function modelNeck(fit) {
  const strings = fit.strings;
  if (!strings?.length) throw new Error('A model neck needs measured strings');
  const last = strings.length - 1;
  const stringAt = (s, x) => {
    const { nut, bridge } = strings[s], t = (x - nut[0]) / (bridge[0] - nut[0]);
    return { y: nut[1] + t * (bridge[1] - nut[1]), z: nut[2] + t * (bridge[2] - nut[2]) };
  };
  const spacing = x => Math.abs(stringAt(0, x).z - stringAt(last, x).z) / last;
  return Object.freeze({
    count: strings.length,
    nutX: fit.nutX,
    stringAt,
    labelAt: (kind, s, x) => { const at = stringAt(s, x); return { y: at.y + (kind === 'string' ? 0.1 : 0.12), z: at.z }; },
    // As far beyond the high string as the drawn neck puts its numbers: about 1.3 string spacings.
    fretLabelAt: x => ({ y: stringAt(last, x).y - 0.04, z: stringAt(last, x).z - 1.3 * spacing(x) }),
    span: maxFret => ({ left: fit.nutX - HEADSTOCK_SHOWN, right: pastLastFret(maxFret) }),
    corners: maxFret => {
      const xs = [OPEN_SPACE.x - OPEN_SPACE.width / 2, fretX(maxFret)];
      return xs.flatMap(x => {
        const near = stringAt(0, x).z + spacing(x) / 2, far = stringAt(last, x).z - spacing(x) / 2, y = stringAt(0, x).y;
        return [y - SURFACE.height / 3, y + SURFACE.height].flatMap(height => [far, near].map(z => [x, height, z]));
      });
    },
  });
}
