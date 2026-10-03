import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshPhysicalMaterial } from 'three';

/**
 * bowedBow.js — the bow, built in code, playing whichever string sounds.
 *
 * The bow crosses the strings near the bridge, square to them, its hair
 * resting on the sounding string and tipped so it clears the others, as a
 * player's bow is. The frog is on the high strings' side, where the right hand
 * holds it, and the tip reaches past the low strings. While the note sounds
 * the bow travels down and up along its length, unless motion is reduced.
 *
 * In its own units the bow runs along +z from the frog (z = 0) to the tip
 * (z = length), the hair underneath (y < 0) and the stick above.
 */

/** Real sizes, in millimetres, against each instrument's string length. */
const SIZES = {
  violin: { string: 328, length: 750, hair: 11, stick: 8, rise: 12, frog: 46 },
  cello: { string: 690, length: 710, hair: 13, stick: 9, rise: 14, frog: 52 },
};
const HAIR_MM = 0.8;
/** How much further than its neighbours' chord the bow tips at an outer string, so it touches only that one. */
const OUTER_TILT = (6 * Math.PI) / 180;
/** The stretch of hair that crosses the string: from near the frog to near the tip. */
const TRAVEL = Object.freeze({ middle: 0.5, swing: 0.32 });
/** One full bow, down and back up, takes this long. */
const BOW_MS = 3200;

/**
 * The angle, in the plane across the strings, that the bow plays string `s`
 * at: measured from +z toward +y. Strings run over an arched bridge, so a
 * middle string is played along the line through its neighbours, and an outer
 * string a little steeper than the line to its one neighbour.
 */
export function bowAngle(neck, s) {
  const x = neck.contactX(), at = t => neck.stringAt(t, x);
  const towardLow = (from, to) => Math.atan2(at(from).y - at(to).y, at(from).z - at(to).z);
  if (s === 0) return towardLow(0, 1) - OUTER_TILT;
  if (s === neck.count - 1) return towardLow(s - 1, s) + OUTER_TILT;
  return towardLow(s - 1, s + 1);
}

/**
 * @param {object} options
 * @param {{ id: string }} options.kit
 * @param {{ scaleLength: number, strings: { radius: number }[] }} options.fit
 * @param {object} options.neck bowedNeck(fit)
 * @param {{ geometries: Set, materials: Set }} options.owned resources the stage disposes
 */
export function buildBow({ kit, fit, neck, owned }) {
  const mm = SIZES[kit.id] ?? SIZES.violin, unit = fit.scaleLength / mm.string;
  const length = mm.length * unit, hairThickness = HAIR_MM * unit;
  const add = (geometry, material) => { owned.geometries.add(geometry); owned.materials.add(material); return new Mesh(geometry, material); };
  const mat = props => new MeshPhysicalMaterial({ roughness: 0.5, ...props });

  const group = new Group();
  group.visible = false;
  const hair = add(new BoxGeometry(mm.hair * unit, hairThickness, length), mat({ color: '#f3eee2', roughness: 0.85 }));
  hair.position.set(0, -hairThickness / 2, length / 2);
  // A straight stick is close enough at this distance; a real one arches toward the hair in the middle.
  const stick = add(new CylinderGeometry(mm.stick * unit * 0.4, mm.stick * unit * 0.5, length, 10), mat({ color: '#5a2a12', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
  stick.rotation.x = Math.PI / 2;
  stick.position.set(0, mm.rise * unit, length / 2);
  const frog = add(new BoxGeometry(mm.hair * unit * 1.25, mm.rise * unit, mm.frog * unit), mat({ color: '#15100e', roughness: 0.4, clearcoat: 0.6 }));
  frog.position.set(0, (mm.rise * unit) / 2, (mm.frog * unit) / 2);
  const tip = add(new BoxGeometry(mm.hair * unit * 1.1, mm.rise * unit, mm.frog * unit * 0.3), mat({ color: '#efe9dc', roughness: 0.4 }));
  tip.position.set(0, (mm.rise * unit) / 2, length - (mm.frog * unit * 0.3) / 2);
  // No shadow: the shadow is drawn only when the instrument moves, and redrawing it on every frame of a bow stroke costs more than a thin stick's shadow adds.
  for (const part of [hair, stick, frog, tip]) { part.castShadow = false; group.add(part); }

  let along = length * TRAVEL.middle, placed = '';
  return {
    group,
    length,
    hairThickness,
    /** How far from the frog the hair crosses the string now. */
    contactAlong: () => along,
    /**
     * Shows the bow on string `s`, part-way through its stroke at `now`; hides it when `s` is null.
     * @returns {boolean} whether the bow moved, appeared or went, so the stage must be drawn again
     */
    play(s, { now, still }) {
      if (s == null) {
        const was = group.visible;
        group.visible = false;
        placed = '';
        return was;
      }
      along = length * (TRAVEL.middle + (still ? 0 : TRAVEL.swing * Math.sin((now / BOW_MS) * 2 * Math.PI)));
      const where = `${s}|${along}`;
      if (where === placed && group.visible) return false;
      placed = where;
      const angle = bowAngle(neck, s), x = neck.contactX(), at = neck.stringAt(s, x);
      // The bow's origin is the top of its hair; the hair's underside rests on the top of the string.
      const lift = fit.strings[s].radius + hairThickness;
      // Out from the string along the bow's own up, then back along the bow to the frog.
      const up = { y: Math.cos(angle), z: -Math.sin(angle) }, along3 = { y: Math.sin(angle), z: Math.cos(angle) };
      group.rotation.set(-angle, 0, 0);
      group.position.set(x, at.y + up.y * lift - along3.y * along, at.z + up.z * lift - along3.z * along);
      group.visible = true;
      return true;
    },
  };
}
