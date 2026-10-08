import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Raycaster, RingGeometry, Vector3 } from 'three';
import { GUITAR_COLORS, guitarMidi } from './guitar.js';
import { fretSpace, modelNeck } from './guitarNeck.js';
import { boxCorners } from './stage/framing.js';
import { castShadows, lacquer } from './stage/modelFinish.js';
import { collectResources } from './stage/models.js';

/**
 * guitarModelRig.js — the downloaded guitar, made playable.
 *
 * The prepared model has no strings between nut and saddle (see
 * scripts/models/prepare.mjs). This draws them from the measured ends, puts a
 * click target and a marker at every place on them, and inlays the fret dots
 * the model lacks. It returns what guitarRig.js returns for the guitar built
 * in code, plus the box the free-play showcase frames, so the stage plays
 * either one.
 */

export const INLAY_FRETS = [3, 5, 7, 9, 12];
/** A light-gauge acoustic set, 12 to 53 thousandths of an inch, low E first. */
const GAUGES_INCHES = [0.053, 0.042, 0.032, 0.024, 0.016, 0.012];
const SCALE_INCHES = 25.4;
/** Any thinner and a string flickers in and out between pixels. */
const MIN_RADIUS = 0.009;
/** E, A, D and G are bronze-wound; B and E are plain steel, as on the model's own string ends. */
const WOUND_STRINGS = 4;
/** The strings of an acoustic guitar: their gauges, the scale they are strung on, and how many, from the lowest, are wound. */
const ACOUSTIC_STRINGS = Object.freeze({ gauges: GAUGES_INCHES, scaleInches: SCALE_INCHES, wound: WOUND_STRINGS });
/** A bass guitar's: four wound strings, 45 to 105, on a 34 inch scale. */
export const BASS_STRINGS = Object.freeze({ gauges: Object.freeze([0.105, 0.085, 0.065, 0.045]), scaleInches: 34, wound: 4 });
const DOT_LIFT = 0.06;
/**
 * A marker is drawn this much larger than its shape when it shows something
 * (guitarStageView.js), and should then still fit between the strings where
 * they are closest; a held note's marker, a little larger again, may touch.
 */
const SHOWN_MARKER = 1.5;
const MARKER_SHARE_OF_GAP = 0.95;
const TARGET_HEIGHT = 0.16;
const INLAY = Object.freeze({ radius: 0.1, thickness: 0.01 });
/** Gloss on the body, satin on the neck; the rosewood fretboard and bridge stay bare. */
const LACQUER = Object.freeze({
  top: { clearcoat: 0.85, clearcoatRoughness: 0.1 },
  sides: { clearcoat: 0.85, clearcoatRoughness: 0.12 },
  back: { clearcoat: 0.85, clearcoatRoughness: 0.12 },
  binding: { clearcoat: 0.7, clearcoatRoughness: 0.15 },
  neck: { clearcoat: 0.4, clearcoatRoughness: 0.35 },
});
/** Concept G1: from beyond the body on the treble side and a little above, so the neck runs up and away to the right. */
const SHOWCASE = Object.freeze({ azimuthDeg: 140, elevationDeg: 34 });
const UP = new Vector3(0, 1, 0);

/** How far apart neighbouring strings are where they cross x: the closer of the two gaps either side of string `s`. */
function gapAt(neck, s, x) {
  const z = neck.stringAt(s, x).z;
  const gaps = [s - 1, s + 1].filter(t => t >= 0 && t < neck.count).map(t => Math.abs(neck.stringAt(t, x).z - z));
  return Math.min(...gaps);
}

/** One string, a cylinder from its measured nut point to its measured saddle point. */
function buildString({ shapes, mat, set }, { nut, bridge }, s, scaleLength) {
  const from = new Vector3(...nut), to = new Vector3(...bridge);
  const along = to.clone().sub(from), length = along.length();
  const gauge = set.gauges[Math.min(s, set.gauges.length - 1)];
  const radius = Math.max(MIN_RADIUS, (gauge / 2) * (scaleLength / set.scaleInches));
  const wound = s < set.wound;
  const wire = new Mesh(shapes.wire, mat(wound ? '#c9a46c' : '#dedcd6', { metalness: 0.85, roughness: wound ? 0.38 : 0.24 }));
  wire.position.copy(from).add(to).multiplyScalar(0.5);
  wire.quaternion.setFromUnitVectors(UP, along.normalize());
  wire.scale.set(radius, length, radius);
  wire.castShadow = true;
  wire.userData.restY = wire.position.y;
  return wire;
}

/** The click target and the marker for every place on string `s`, open through `maxFret`. */
function buildPlaces({ shapes, mat, inactive, neck }, s, maxFret) {
  const targets = [], dots = [];
  for (let fret = 0; fret <= maxFret; fret++) {
    const { x, width } = fretSpace(fret), at = neck.stringAt(s, x);
    const place = { midi: guitarMidi(s, fret), string: s, fret };
    const target = new Mesh(shapes.hitBox, inactive);
    target.position.set(x, at.y + 0.03, at.z);
    target.scale.set(width, TARGET_HEIGHT, gapAt(neck, s, x) * 0.98);
    const dot = new Mesh(shapes.disk, mat(GUITAR_COLORS[s], { roughness: 0.8, emissiveIntensity: 0 }));
    dot.position.set(x, at.y + DOT_LIFT, at.z);
    for (const o of [target, dot]) o.userData = place;
    targets.push(target); dots.push(dot);
  }
  return { targets, dots };
}

/**
 * Pearl dots resting on the fretboard's surface, which is found by looking
 * straight down onto the model's 'fretboard' part: fingerboards are curved
 * across, so one height would bury the dots at the edges. Two dots at the
 * twelfth fret, between the A and D strings and between the G and B.
 */
function buildInlays({ mat, shapes }, model, neck, maxFret) {
  const fretboard = [];
  model.scene.traverse(object => { if (object.isMesh && object.userData.part === 'fretboard') fretboard.push(object); });
  if (!fretboard.length) return [];
  model.scene.updateMatrixWorld(true);
  const ray = new Raycaster(), down = new Vector3(0, -1, 0), pearl = mat('#f6efe2', { roughness: 0.22, iridescence: 0.7, iridescenceIOR: 1.35, clearcoat: 0.6 });
  const between = (a, b, x) => (neck.stringAt(a, x).z + neck.stringAt(b, x).z) / 2;
  return INLAY_FRETS.filter(fret => fret <= maxFret).flatMap(fret => {
    const { x } = fretSpace(fret);
    const zs = fret === 12 ? [between(1, 2, x), between(3, 4, x)] : [between(0, neck.count - 1, x)];
    return zs.flatMap(z => {
      ray.set(new Vector3(x, 10, z), down);
      const hit = ray.intersectObjects(fretboard)[0];
      if (!hit) return [];
      const inlay = new Mesh(shapes.inlay, pearl);
      inlay.position.set(x, hit.point.y + 0.002, z);
      inlay.receiveShadow = true;
      inlay.userData.inlay = fret;
      return [inlay];
    });
  });
}

/**
 * @param {object} options
 * @param {{ geometries: Set, materials: Set, textures: Set }} options.owned resources the stage disposes with this guitar; the model's own are added too
 * @param {number} options.maxFret last fret that can be played
 * @param {{ scene: import('three').Group, fit: object }} options.model from loadInstrumentModel('guitar')
 * @param {boolean} [options.lacquered] gloss on the body and satin on the neck; costs a clearcoat pass, so full tier only
 * @param {{ gauges: number[], scaleInches: number, wound: number }} [options.strings] the set it is strung with; an acoustic guitar's unless given
 * @returns {{ instrument: Group, strings: Mesh[], targets: Mesh[], dots: Mesh[], shapes: { disk: object, ring: object }, neck: object, showcase: object, ground: object }}
 *   `ground` is the box the floor and its shadow are fitted to
 */
export function buildModelGuitarRig({ owned, maxFret, model, lacquered = false, strings: set = ACOUSTIC_STRINGS }) {
  const { fit } = model, neck = modelNeck(fit);
  const narrowest = Math.min(...Array.from({ length: neck.count }, (_, s) => gapAt(neck, s, fit.nutX)));
  const dotRadius = (narrowest * MARKER_SHARE_OF_GAP) / 2 / SHOWN_MARKER;
  const ring = new RingGeometry(dotRadius * 0.8, dotRadius * 1.1, 32); ring.rotateX(-Math.PI / 2);
  const shapes = {
    wire: new CylinderGeometry(1, 1, 1, 12, 1),
    hitBox: new BoxGeometry(1, 1, 1),
    disk: new CylinderGeometry(dotRadius, dotRadius, dotRadius * 0.17, 32),
    ring,
    inlay: new CylinderGeometry(INLAY.radius, INLAY.radius, INLAY.thickness, 32),
  };
  Object.values(shapes).forEach(g => owned.geometries.add(g));
  const mat = (color, props = {}) => { const m = new MeshPhysicalMaterial({ color, roughness: 0.68, ...props }); owned.materials.add(m); return m; };
  const inactive = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  owned.materials.add(inactive);
  const parts = { shapes, mat, inactive, neck, set };

  castShadows(model.scene);
  if (lacquered) lacquer(model.scene, LACQUER);
  const found = collectResources(model.scene);
  found.geometries.forEach(g => owned.geometries.add(g));
  found.materials.forEach(m => owned.materials.add(m));
  found.textures.forEach(t => owned.textures.add(t));

  const instrument = new Group();
  instrument.add(model.scene);
  const strings = fit.strings.map((measured, s) => buildString(parts, measured, s, fit.scaleLength ?? set.scaleInches));
  const targets = [], dots = [];
  for (let s = 0; s < neck.count; s++) {
    const places = buildPlaces(parts, s, maxFret);
    targets.push(...places.targets); dots.push(...places.dots);
  }
  instrument.add(...strings, ...targets, ...dots, ...buildInlays(parts, model, neck, maxFret));
  return { instrument, strings, targets, dots, shapes: { disk: shapes.disk, ring }, neck, showcase: showcaseOf(fit), ground: fit.bounds };
}

/** The G1 shot of the whole guitar: framed to its parts' boxes, which hug the narrow neck far closer than one box round everything. */
function showcaseOf(fit) {
  const parts = Object.values(fit.parts ?? {});
  return { box: fit.bounds, ...(parts.length && { keep: parts.flatMap(boxCorners) }), ...SHOWCASE };
}
