import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, RingGeometry, SRGBColorSpace } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GUITAR_COLORS, GUITAR_TUNING, guitarMidi } from './guitar.js';
import { STRING_POSTS, buildGuitarFrame } from './guitarBody.js';
import { DRAWN_NECK, fretSpace, fretX, NUT_X, stringGauge, stringZ, WIRE_Y } from './guitarNeck.js';

/**
 * guitarRig.js — the code-built guitar and everything on it that can be played.
 *
 * Returns the instrument plus the three sets of meshes the stage animates:
 * the string wires, the invisible click targets, and the position markers.
 * Where those sit comes from guitarNeck.js, so a different guitar model only
 * has to supply the same sets.
 */

const NECK_Z = 0.72; // the neck is drawn narrower than life; the body group undoes this
const NUT_BLOCK = { x: NUT_X - 0.07, width: 0.12 };
const WIRE = { x: 5.7, length: 23.65 };
export { WIRE_Y };
const INLAY_FRETS = [3, 5, 7, 9, 12];
const FRET_WIRES = 12;

// Generated locally: no model downloads or textures on the audio path.
function woodTexture(base, grain) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = base; ctx.fillRect(0, 0, 1024, 128);
  for (let row = 0; row < 180; row++) {
    ctx.strokeStyle = grain; ctx.globalAlpha = 0.02 + (row % 7) * 0.005; ctx.lineWidth = 0.5 + (row % 3) * 0.5;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 8) { const y = row * 0.74 + Math.sin(x / (90 + row % 20) + row) * 1.4; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
}

/** A rounded neck with cream binding, a rosewood playing surface, nut, frets and pearl inlays. */
function buildNeck({ mesh, mat, owned, shapes, lacquered }) {
  const rosewood = woodTexture('#33201a', '#c88c62'), maple = woodTexture('#8a5d3a', '#d9a574');
  owned.textures.add(rosewood); owned.textures.add(maple);
  const satin = lacquered ? { roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 } : {};
  mesh(shapes.box, mat('#ffffff', { map: maple, ...satin }), -0.15, -0.29, 0, 12.3, 0.5, 3.56);
  mesh(shapes.box, mat('#c4a67e'), 0, -0.04, 0, 12.55, 0.08, 3.58);
  mesh(shapes.box, mat('#ffffff', { map: rosewood }), 0, 0.05, 0, 12.5, 0.18, 3.47);
  mesh(shapes.box, mat('#f4e9d6', { roughness: 0.27 }), NUT_BLOCK.x, 0.135, 0, NUT_BLOCK.width, 0.13, 3.48);
  const chrome = mat('#dddce1', { metalness: 0.78, roughness: 0.22 });
  for (let f = 1; f <= FRET_WIRES; f++) mesh(shapes.box, chrome, fretX(f), 0.18, 0, 0.044, 0.09, 3.48);
  const pearl = mat('#f6efe2', { roughness: 0.22, iridescence: 0.7, iridescenceIOR: 1.35, clearcoat: 0.6 });
  for (const f of INLAY_FRETS) {
    const { x } = fretSpace(f);
    for (const z of f === 12 ? [0.47, -0.47] : [0]) mesh(shapes.disk, pearl, x, 0.148, z, 0.85, 0.55, 0.85);
  }
}

/** One wire along the neck, and its run past the nut to the tuner post on the headstock. */
function buildString({ mesh, mat, shapes, real }, s) {
  const z = stringZ(s), gauge = stringGauge(s);
  const wire = mesh(shapes.box, mat(s < 3 ? '#c6aa79' : '#e9e5da', { metalness: 0.75, roughness: 0.25 }), WIRE.x, WIRE_Y, z, WIRE.length, gauge, gauge);
  const zr = z * NECK_Z, dx = STRING_POSTS[s] - NUT_BLOCK.x, dz = (s < 3 ? 1.2 : -1.2) - zr, run = Math.hypot(dx, dz);
  const tail = new Mesh(shapes.box, wire.material);
  tail.position.set(NUT_BLOCK.x + dx / 2, 0.17, zr + dz / 2);
  tail.scale.set(run, gauge, gauge);
  tail.rotation.y = Math.atan2(-dz, dx);
  tail.castShadow = true;
  real.add(tail);
  return wire;
}

/** The click target and the marker for every place on one string, open through `maxFret`. */
function buildPlaces({ mesh, mat, shapes, inactive }, s, maxFret) {
  const z = stringZ(s), targets = [], dots = [];
  for (let fret = 0; fret <= maxFret; fret++) {
    const { x, width } = fretSpace(fret);
    const place = { midi: guitarMidi(s, fret), string: s, fret };
    const target = mesh(shapes.hitBox, inactive, x, 0.28, z, width, 0.14, 0.53);
    const dot = mesh(shapes.disk, mat(GUITAR_COLORS[s], { roughness: 0.8, emissiveIntensity: 0 }), x, 0.3, z, 1.55, 1, 1.55);
    for (const o of [target, dot]) { o.userData = place; o.castShadow = false; o.receiveShadow = false; }
    targets.push(target); dots.push(dot);
  }
  return { targets, dots };
}

/**
 * @param {object} options
 * @param {{ geometries: Set, materials: Set, textures: Set }} options.owned resources the stage disposes on unmount
 * @param {number} options.maxFret last fret that can be played
 * @param {boolean} [options.lacquered] gloss finish on the wood; costs a clearcoat pass, so full tier only
 * @returns {{ instrument: Group, strings: Mesh[], targets: Mesh[], dots: Mesh[], shapes: { disk: object, ring: object }, neck: object }}
 *   `neck` is the neck description (guitarNeck.js) the labels and the camera read
 */
export function buildGuitarRig({ owned, maxFret, lacquered = false }) {
  const instrument = new Group();
  instrument.scale.z = NECK_Z;
  const ring = new RingGeometry(0.12, 0.165, 32); ring.rotateX(-Math.PI / 2);
  const shapes = { box: new RoundedBoxGeometry(1, 1, 1, 2, 0.075), hitBox: new BoxGeometry(1, 1, 1), disk: new CylinderGeometry(0.15, 0.15, 0.026, 32), ring };
  Object.values(shapes).forEach(g => owned.geometries.add(g));
  const mat = (color, props = {}) => { const m = new MeshPhysicalMaterial({ color, roughness: 0.68, clearcoat: 0.08, clearcoatRoughness: 0.65, ...props }); owned.materials.add(m); return m; };
  const inactive = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  owned.materials.add(inactive);
  const mesh = (geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const o = new Mesh(geometry, material); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
    o.castShadow = true; o.receiveShadow = true; instrument.add(o); return o;
  };
  // Body and headstock in real proportions: undo the neck's squash.
  const real = new Group(); real.scale.z = 1 / NECK_Z;
  const parts = { mesh, mat, owned, shapes, inactive, real, lacquered };

  buildNeck(parts);
  instrument.add(real);
  real.add(buildGuitarFrame(mat, owned, { lacquered }));
  const strings = [], targets = [], dots = [];
  GUITAR_TUNING.forEach((_, s) => {
    strings.push(buildString(parts, s));
    const places = buildPlaces(parts, s, maxFret);
    targets.push(...places.targets); dots.push(...places.dots);
  });
  strings.forEach(wire => { wire.userData.restY = WIRE_Y; });
  return { instrument, strings, targets, dots, shapes: { disk: shapes.disk, ring: shapes.ring }, neck: DRAWN_NECK };
}
