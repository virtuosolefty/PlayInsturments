import { BOWED_TAPES } from './bowed.js';
import { stringColumn, STRING_LABEL_INSET } from './guitarStageView.js';
import { noteName } from './theory.js';

/**
 * bowedStageView.js — what the 3D violin and cello stage writes over the
 * instrument, decided without Three.js so it can be tested.
 *
 * Markers use the guitar stage's looks (guitarStageView.js `dotLook`), so a
 * played, pointed-at or suggested place reads the same on every instrument.
 */

/** Outlined markers leave the dark fingerboard showing through, so their numbers are drawn light. */
const OUTLINED = new Set(['target', 'hover']);
const UNLABELLED = new Set(['idle', 'possible']);
/** String names float this far above their string at the nut. */
const NAME_LIFT = 0.1;

/** The hint for the place under the pointer, as the 2D fingerboard words it: string, finger and pitch. */
export function placeText(kit, { string, fret }) {
  const finger = kit.finger(fret);
  const where = fret === 0 ? 'open string' : finger != null ? `finger ${finger}` : `${fret} semitones up`;
  return `${kit.stringName(string).note} string · ${where} · ${noteName(kit.midi(string, fret))}`;
}

/** What a marker at a place says: the first-position finger, or the note where no finger reaches or when asked. */
export function markerText(kit, { string, fret }, labelMode) {
  const note = noteName(kit.midi(string, fret)).replace(/\d/g, '');
  if (labelMode === 'notes') return note;
  const finger = kit.finger(fret);
  return finger == null ? note : String(finger);
}

/**
 * Every text label the bowed stage overlays: the string names at the nut
 * (number and pitch, tied back to their string where they had to move off it;
 * see guitarStageView.js `stringColumn`), the finger number over each tape,
 * and the finger or note on each marker showing.
 *
 * @param {object} view
 * @param {(x: number, y: number, z: number) => { x: number, y: number }} view.project instrument units to stage pixels
 * @param {number} view.width stage width in pixels
 * @param {object} view.kit stringKit('violin' or 'cello')
 * @param {object} view.neck bowedNeck(fit)
 * @param {number} view.maxFret last visible place
 * @param {{ string: number, fret: number, state: string, at: { x: number, y: number, z: number } }[]} [view.markers]
 *   the markers drawn now, with where each one is in the instrument's units
 * @param {'fingers'|'notes'} [view.labelMode]
 * @param {number} [view.fontSize]
 * @param {{ top: number, bottom: number }|null} [view.stringBand] stage pixels the string names must stay between
 * @returns {{ text: string, x: number, y: number, kind: string }[]}
 */
export function bowedLabels({ project, width, kit, neck, maxFret, markers = [], labelMode = 'fingers', fontSize = 14, stringBand = null }) {
  void width;
  const size = Number.isFinite(fontSize) ? fontSize : 14;
  const names = stringColumn(kit.tuning.map((pitch, s) => {
    const at = neck.stringAt(s, neck.nutX);
    return { text: noteName(pitch), number: kit.stringName(s).number, ...project(neck.nutX, at.y + NAME_LIFT, at.z), kind: 'string', to: project(neck.nutX, at.y, at.z) };
  }), { x: STRING_LABEL_INSET, fontSize: size, band: stringBand });
  const tapes = (BOWED_TAPES[kit.id] ?? []).filter(tape => tape.fret <= maxFret).map(tape => {
    const x = neck.placeX(tape.fret), at = neck.tapeLabelAt(x);
    return { text: String(tape.finger), ...project(x, at.y, at.z), kind: 'tape' };
  });
  const fingers = markers.filter(marker => !UNLABELLED.has(marker.state)).map(marker => ({
    text: markerText(kit, marker, labelMode), ...project(marker.at.x, marker.at.y, marker.at.z), kind: OUTLINED.has(marker.state) ? 'finger inverse' : 'finger',
  }));
  return [...names, ...tapes, ...fingers];
}
