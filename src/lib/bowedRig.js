import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Raycaster, RingGeometry, Vector3 } from 'three';
import { BOWED_TAPES } from './bowed.js';
import { buildBow } from './bowedBow.js';
import { bowedNeck } from './bowedNeck.js';
import { boxCorners } from './stage/framing.js';
import { castShadows, lacquer } from './stage/modelFinish.js';
import { collectResources } from './stage/models.js';

/**
 * bowedRig.js — a downloaded violin or cello, made playable.
 *
 * The prepared model has no strings between nut and bridge (see
 * scripts/models/prepare.mjs). This draws them from the measured ends, puts a
 * press target and a marker at every finger place, lays beginner tapes on the
 * fingerboard, and adds the bow (bowedBow.js). For free play the violin is
 * shown lying at three-quarters (concept V1) and the cello standing on its
 * endpin (C1); lessons lay both across the stage (V3, C3).
 */

/** Silvery wound strings, the highest a bright plain steel, as on the 2D stage. */
const STRING_COLORS = {
  violin: ['#a9a49c', '#bdb8b0', '#ccc8c1', '#e4e2de'],
  cello: ['#aeaaa2', '#c3bfb7', '#d3d0c9', '#e3e1dc'],
};
/** Any thinner and a string flickers in and out between pixels. */
const MIN_RADIUS = 0.012;
/** How far a marker floats above the top of its string. */
const DOT_CLEARANCE = 0.03;
/** A marker is drawn this much larger than its shape when it shows something, and should still fit between the strings at the nut. */
const SHOWN_MARKER = 1.5;
const MARKER_SHARE_OF_GAP = 0.95;
const TARGET_HEIGHT = 0.24;
/** The bowing stretch where a press plays the open string, as on the 2D fingerboard: around the bow's contact point, short of the bridge. */
const BOW_ZONE = Object.freeze({ beforeContact: 1.6, shortOfBridge: 0.8 });
/** Tape across the fingerboard: its width along the string, how far it reaches past the outer strings, and how finely it follows the board's curve. */
const TAPE = Object.freeze({ width: 0.09, past: 0.6, lift: 0.01, samples: 13 });
/** Varnish over the wood; the ebony fittings and the maple bridge stay bare. */
const VARNISH = {
  violin: { body: { clearcoat: 0.7, clearcoatRoughness: 0.18 } },
  cello: { body: { clearcoat: 0.8, clearcoatRoughness: 0.15 } },
};
/** V1: from beyond the body on the treble side, a little above. C1: the cello standing, from the front three-quarters. */
const SHOWCASE = {
  violin: Object.freeze({ azimuthDeg: 140, elevationDeg: 30 }),
  cello: Object.freeze({ azimuthDeg: 60, elevationDeg: 8, upright: true }),
};
const UP = new Vector3(0, 1, 0);

const boundsOf = points => ({ min: [0, 1, 2].map(k => Math.min(...points.map(p => p[k]))), max: [0, 1, 2].map(k => Math.max(...points.map(p => p[k]))) });

/** One string, a cylinder from its measured nut point to its measured bridge point, as thick as the model's own. */
function buildString({ shapes, mat, kit }, { nut, bridge, radius }, s) {
  const from = new Vector3(...nut), to = new Vector3(...bridge), along = to.clone().sub(from);
  const colors = STRING_COLORS[kit.id] ?? STRING_COLORS.violin;
  const wire = new Mesh(shapes.wire, mat(colors[Math.min(s, colors.length - 1)], { metalness: 0.85, roughness: 0.3 }));
  const width = Math.max(MIN_RADIUS, radius ?? 0);
  wire.position.copy(from).add(to).multiplyScalar(0.5);
  wire.quaternion.setFromUnitVectors(UP, along.clone().normalize());
  wire.scale.set(width, along.length(), width);
  wire.castShadow = true;
  wire.userData.restY = wire.position.y;
  return wire;
}

/** The press target and the marker for every place on string `s`, open through `maxFret`. */
function buildPlaces({ shapes, mat, inactive, neck, kit, fit }, s, maxFret) {
  const targets = [], dots = [], clearance = (fit.strings[s].radius ?? 0) + DOT_CLEARANCE;
  for (let fret = 0; fret <= maxFret; fret++) {
    const [from, to] = neck.reach(fret, maxFret), middle = (from + to) / 2, at = neck.stringAt(s, middle);
    const place = { midi: kit.midi(s, fret), string: s, fret };
    const target = new Mesh(shapes.hitBox, inactive);
    target.position.set(middle, at.y + 0.02, at.z);
    target.scale.set(to - from, TARGET_HEIGHT, neck.gapAt(s, middle) * 0.98);
    const x = neck.markX(fret), mark = neck.stringAt(s, x);
    const dot = new Mesh(shapes.disk, mat(kit.colors[s], { roughness: 0.8, emissiveIntensity: 0 }));
    dot.position.set(x, mark.y + clearance, mark.z);
    dot.visible = false;
    for (const o of [target, dot]) o.userData = place;
    targets.push(target); dots.push(dot);
  }
  return { targets, dots };
}

/**
 * A target over each string near the bridge that bows it open: where a player
 * draws the bow, so pressing there is the natural way to play an open string.
 * Each shares its open string's place, so the marker and hint are the same.
 */
function buildBowZones({ shapes, inactive, neck, fit }, openPlaces) {
  return openPlaces.map((place, s) => {
    const from = neck.contactX() - BOW_ZONE.beforeContact, to = fit.strings[s].bridge[0] - BOW_ZONE.shortOfBridge;
    const middle = (from + to) / 2, at = neck.stringAt(s, middle);
    const zone = new Mesh(shapes.hitBox, inactive);
    zone.position.set(middle, at.y + 0.02, at.z);
    zone.scale.set(to - from, TARGET_HEIGHT, neck.gapAt(s, middle) * 0.98);
    zone.userData = place;
    return zone;
  });
}

/**
 * A strip of tape across the fingerboard at each first-position finger place,
 * following the board's curve: the surface is found by looking straight down
 * onto the model at several points across it.
 */
function buildTapes({ mat, owned, neck, kit }, model, maxFret) {
  const surfaces = [];
  model.scene.traverse(object => { if (object.isMesh && !['stringEnds', 'bridge'].includes(object.userData.part)) surfaces.push(object); });
  model.scene.updateMatrixWorld(true);
  // Drawn a little toward the camera as well as lifted, so the board never shows through it from far off.
  const ray = new Raycaster(), down = new Vector3(0, -1, 0), cream = mat('#f4ebd6', { roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return (BOWED_TAPES[kit.id] ?? []).filter(tape => tape.fret <= maxFret).flatMap(tape => {
    const x = neck.placeX(tape.fret), gap = neck.gapAt(0, x);
    const near = neck.stringAt(0, x).z + TAPE.past * gap, far = neck.stringAt(neck.count - 1, x).z - TAPE.past * gap;
    const profile = Array.from({ length: TAPE.samples }, (_, i) => far + ((near - far) * i) / (TAPE.samples - 1)).flatMap(z => {
      ray.set(new Vector3(x, 20, z), down);
      const hit = ray.intersectObjects(surfaces)[0];
      return hit ? [[hit.point.y + TAPE.lift, z]] : [];
    });
    if (profile.length < 2) return [];
    const positions = profile.flatMap(([y, z]) => [x - TAPE.width / 2, y, z, x + TAPE.width / 2, y, z]);
    const index = profile.slice(1).flatMap((_, i) => [2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    owned.geometries.add(geometry);
    const strip = new Mesh(geometry, cream);
    strip.receiveShadow = true;
    strip.userData.tape = tape.fret;
    return [strip];
  });
}

/**
 * The cello's stance: lying across the stage (0) or standing on its endpin
 * (1), with whatever part is lowest kept on the floor where the lying cello's
 * back rests, so it never sinks or floats while it is stood up.
 */
function stanceFor(instrument, fit) {
  const corners = Object.values(fit.parts ?? {}).flatMap(boxCorners), point = new Vector3();
  const shape = corners.length ? corners : boxCorners(fit.bounds), floor = fit.bounds.min[1];
  const orient = standing => {
    instrument.rotation.set(0, 0, (-Math.PI / 2) * standing);
    instrument.position.set(0, 0, 0);
    instrument.updateMatrixWorld(true);
    const lowest = Math.min(...shape.map(p => point.set(...p).applyMatrix4(instrument.matrixWorld).y));
    instrument.position.y = floor - lowest;
    instrument.updateMatrixWorld(true);
  };
  const seen = standing => { orient(standing); return shape.map(p => point.set(...p).applyMatrix4(instrument.matrixWorld).toArray()); };
  return { orient, seen };
}

/** The free-play showcase, and the floor's box, for the instrument as it is shown there. */
function showcaseOf(kit, fit, instrument) {
  const shot = SHOWCASE[kit.id] ?? SHOWCASE.violin;
  const corners = Object.values(fit.parts ?? {}).flatMap(boxCorners);
  if (!shot.upright) return { showcase: { box: fit.bounds, ...(corners.length && { keep: corners }), ...shot }, ground: fit.bounds };
  const stance = stanceFor(instrument, fit);
  const standing = stance.seen(1);
  stance.orient(0);
  const box = boundsOf(standing);
  return { showcase: { box, keep: standing, ...shot }, ground: boundsOf([...boxCorners(fit.bounds), ...standing]), orient: stance.orient };
}

/**
 * @param {object} options
 * @param {{ geometries: Set, materials: Set, textures: Set }} options.owned resources the stage disposes with this instrument; the model's own are added too
 * @param {object} options.kit stringKit('violin' or 'cello')
 * @param {number} options.maxFret last finger place shown
 * @param {{ scene: import('three').Group, fit: object }} options.model from loadInstrumentModel
 * @param {boolean} [options.lacquered] varnish on the body; costs a clearcoat pass
 */
export function buildBowedRig({ owned, kit, maxFret, model, lacquered = false }) {
  const { fit } = model, neck = bowedNeck(fit);
  const narrowest = Math.min(...Array.from({ length: neck.count }, (_, s) => neck.gapAt(s, fit.nutX)));
  const dotRadius = (narrowest * MARKER_SHARE_OF_GAP) / 2 / SHOWN_MARKER;
  const ring = new RingGeometry(dotRadius * 0.8, dotRadius * 1.1, 32); ring.rotateX(-Math.PI / 2);
  const shapes = { wire: new CylinderGeometry(1, 1, 1, 12, 1), hitBox: new BoxGeometry(1, 1, 1), disk: new CylinderGeometry(dotRadius, dotRadius, dotRadius * 0.17, 32), ring };
  Object.values(shapes).forEach(g => owned.geometries.add(g));
  const mat = (color, props = {}) => { const m = new MeshPhysicalMaterial({ color, roughness: 0.68, ...props }); owned.materials.add(m); return m; };
  const inactive = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  owned.materials.add(inactive);
  const parts = { shapes, mat, inactive, neck, kit, fit, owned };

  castShadows(model.scene);
  if (lacquered) lacquer(model.scene, VARNISH[kit.id] ?? {});
  const found = collectResources(model.scene);
  found.geometries.forEach(g => owned.geometries.add(g));
  found.materials.forEach(m => owned.materials.add(m));
  found.textures.forEach(t => owned.textures.add(t));

  const instrument = new Group();
  instrument.add(model.scene);
  const strings = fit.strings.map((measured, s) => buildString(parts, measured, s));
  const targets = [], dots = [];
  for (let s = 0; s < neck.count; s++) {
    const places = buildPlaces(parts, s, maxFret);
    targets.push(...places.targets); dots.push(...places.dots);
  }
  const bowZones = buildBowZones(parts, dots.filter(dot => dot.userData.fret === 0).map(dot => dot.userData));
  const tapes = buildTapes(parts, model, maxFret);
  const bow = buildBow({ kit, fit, neck, owned });
  instrument.add(...strings, ...targets, ...bowZones, ...dots, ...tapes, bow.group);
  const { showcase, ground, orient } = showcaseOf(kit, fit, instrument);
  return {
    instrument, strings, targets: [...targets, ...bowZones], bowZones, dots, tapes, bow, shapes: { disk: shapes.disk, ring }, neck, showcase, ground,
    ...(orient && { orient }),
  };
}
