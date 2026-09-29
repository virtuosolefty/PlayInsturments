import { CanvasTexture, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, SRGBColorSpace, Shape, SphereGeometry } from 'three';

/**
 * The parts of the 3D guitar that frame the playable neck: a 3+3 headstock
 * with tuners and an acoustic body (spruce top, rosette, soundhole,
 * tortoiseshell pickguard). Decorative only — the fret hit boxes, feedback
 * and audio path live in GuitarStage and are untouched by any of this.
 *
 * Everything here is built in real proportions; GuitarStage squashes the neck
 * across its width, so these parts sit in a group that undoes that squash.
 */

export const BODY_START = 6.0; // where the neck meets the body, at fret 12
export const BODY_LENGTH = 18;
const TOP_W = 1024, TOP_H = 740, UNIT = TOP_W / BODY_LENGTH;
const SOUNDHOLE = { x: BODY_START + 2.65, r: 1.45 };
export const STRING_POSTS = [-8.15, -7.55, -6.95, -6.95, -7.55, -8.15]; // low E … high E

// Upper bout, waist and lower bout of a dreadnought outline; y runs across the body.
const HALF_BODY = [
  [0, 2.8, 1.2, 4.9, 3.4, 5.0],
  [5.6, 5.1, 6.2, 4.1, 7.6, 4.1],
  [9.4, 4.1, 10.2, 6.2, 12.8, 6.2],
  [16.2, 6.2, 18, 4.4, 18, 0],
];

/** Traces the body outline onto a THREE.Shape or a 2D canvas context. */
export function traceBody(path, x0 = BODY_START) {
  path.moveTo(x0, 0);
  HALF_BODY.forEach(([a, b, c, d, e, f]) => path.bezierCurveTo(x0 + a, b, x0 + c, d, x0 + e, f));
  for (let i = HALF_BODY.length - 1; i >= 0; i--) {
    const [a, b, c, d] = HALF_BODY[i];
    const [sx, sy] = i ? HALF_BODY[i - 1].slice(4) : [0, 0];
    path.bezierCurveTo(x0 + c, -d, x0 + a, -b, x0 + sx, -sy);
  }
}

function traceHeadstock(path) {
  path.moveTo(-6.05, 1.3);
  path.bezierCurveTo(-6.55, 1.32, -6.8, 1.66, -7.25, 1.74);
  path.lineTo(-8.2, 1.66);
  path.bezierCurveTo(-8.62, 1.62, -8.74, 1.1, -8.66, 0.55);
  path.bezierCurveTo(-8.62, 0.25, -8.52, 0.12, -8.56, 0);
  path.bezierCurveTo(-8.52, -0.12, -8.62, -0.25, -8.66, -0.55);
  path.bezierCurveTo(-8.74, -1.1, -8.62, -1.62, -8.2, -1.66);
  path.lineTo(-7.25, -1.74);
  path.bezierCurveTo(-6.8, -1.66, -6.55, -1.32, -6.05, -1.3);
  path.closePath();
}

/** A flat shape extruded downward, so its top face sits at `top`. */
function slab(trace, depth, top) {
  const shape = new Shape(); trace(shape);
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 24 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, top, 0);
  return geometry;
}

function paintRosette(ctx) {
  const { x, r } = SOUNDHOLE;
  const ring = (inner, outer, color) => { ctx.beginPath(); ctx.arc(x, 0, outer, 0, Math.PI * 2); ctx.arc(x, 0, inner, 0, Math.PI * 2, true); ctx.fillStyle = color; ctx.fill(); };
  ring(r + 0.12, r + 0.2, '#1d120c');
  // Abalone: short iridescent segments around the ring.
  const shells = ['#4fb3a9', '#7a6fc2', '#5fc58f', '#3d8fb8', '#a38bd6', '#6bd0c0'];
  for (let a = 0; a < 360; a += 4) {
    ctx.beginPath(); ctx.arc(x, 0, r + 0.44, (a * Math.PI) / 180, ((a + 4.4) * Math.PI) / 180); ctx.arc(x, 0, r + 0.22, ((a + 4.4) * Math.PI) / 180, (a * Math.PI) / 180, true);
    ctx.fillStyle = shells[(a / 4) % shells.length]; ctx.fill();
  }
  ring(r + 0.44, r + 0.5, '#1d120c');
  ring(r + 0.5, r + 0.56, '#f1e6cf');
  ring(r + 0.56, r + 0.6, '#1d120c');
  // The soundhole: dark, with the far rim catching a little light.
  const hole = ctx.createRadialGradient(x - 0.3, 0.2, 0.1, x, 0, r);
  hole.addColorStop(0, '#040302'); hole.addColorStop(0.8, '#120a06'); hole.addColorStop(1, '#3a2415');
  ctx.beginPath(); ctx.arc(x, 0, r, 0, Math.PI * 2); ctx.fillStyle = hole; ctx.fill();
}

function paintPickguard(ctx) {
  const { x } = SOUNDHOLE;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, 0, 2.12, Math.PI * 0.98, Math.PI * 1.86, false);
  ctx.bezierCurveTo(x + 2.6, -2.0, x + 3.3, -3.1, x + 2.3, -4.0);
  ctx.bezierCurveTo(x + 1.1, -4.8, x - 1.2, -4.4, x - 1.9, -2.9);
  ctx.bezierCurveTo(x - 2.3, -2.0, x - 2.25, -0.6, x - 2.12, 0.07);
  ctx.closePath();
  ctx.fillStyle = '#3a1a0c'; ctx.fill();
  ctx.clip();
  for (let i = 0; i < 140; i++) {
    const px = x - 2.4 + ((i * 37) % 53) / 9.6, py = -((i * 23) % 47) / 10.4;
    const spot = ctx.createRadialGradient(px, py, 0, px, py, 0.18 + (i % 5) * 0.07);
    spot.addColorStop(0, i % 3 ? '#9a4c1c66' : '#c9803a55'); spot.addColorStop(1, '#00000000');
    ctx.fillStyle = spot; ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
  }
  ctx.restore();
}

/** Spruce top in body coordinates: 1 texture pixel row per UNIT across. */
function paintTop(x0) {
  const canvas = document.createElement('canvas'); canvas.width = TOP_W; canvas.height = TOP_H;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(UNIT, 0, 0, -UNIT, -x0 * UNIT, (TOP_H / 2));
  ctx.fillStyle = '#e6c38b'; ctx.fillRect(x0 - 1, -8, BODY_LENGTH + 2, 16);
  // Spruce grain runs the length of the top.
  for (let i = 0; i < 150; i++) {
    const y = -6.6 + i * 0.089 + Math.sin(i * 1.7) * 0.02;
    ctx.strokeStyle = `rgba(150, 96, 44, ${0.05 + (i % 4) * 0.035})`; ctx.lineWidth = 0.012 + (i % 3) * 0.012;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.bezierCurveTo(x0 + 6, y + 0.03, x0 + 12, y - 0.03, x0 + BODY_LENGTH, y + 0.02); ctx.stroke();
  }
  // A soft amber burst toward the edge, then binding and purfling.
  ctx.save(); ctx.beginPath(); traceBody(ctx, x0); ctx.clip();
  for (let i = 10; i >= 0; i--) { ctx.beginPath(); traceBody(ctx, x0); ctx.lineWidth = 0.2 + i * 0.16; ctx.strokeStyle = 'rgba(122, 64, 22, 0.075)'; ctx.stroke(); }
  ctx.beginPath(); traceBody(ctx, x0); ctx.lineWidth = 0.36; ctx.strokeStyle = '#1f120b'; ctx.stroke();
  ctx.beginPath(); traceBody(ctx, x0); ctx.lineWidth = 0.28; ctx.strokeStyle = '#efe2c4'; ctx.stroke();
  ctx.restore();
  paintPickguard(ctx);
  paintRosette(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.repeat.set(1 / BODY_LENGTH, UNIT / TOP_H);
  texture.offset.set(-x0 / BODY_LENGTH, 0.5);
  return texture;
}

/**
 * @param {(color: string, props?: object) => import('three').Material} mat material factory that GuitarStage disposes
 * @param {{ geometries: Set, materials: Set, textures: Set }} owned resources GuitarStage disposes on unmount
 */
export function buildGuitarFrame(mat, owned) {
  // The large surfaces use the standard material: a clearcoat over this much
  // of the screen is costly on software GL and adds little at this distance.
  const plain = (color, props = {}) => { const m = new MeshStandardMaterial({ color, ...props }); owned.materials.add(m); return m; };
  const frame = new Group();
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    owned.geometries.add(geometry);
    const o = new Mesh(geometry, material); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; frame.add(o); return o;
  };
  const top = paintTop(BODY_START); owned.textures.add(top);
  const spruce = plain('#ffffff', { map: top, roughness: 0.36 });
  const sides = plain('#4b2716', { roughness: 0.4 });
  add(slab(traceBody, 0.46, -0.06), [spruce, sides]);

  const veneer = plain('#18110e', { roughness: 0.28 });
  add(slab(traceHeadstock, 0.22, 0.02), [veneer, plain('#6d4a2c', { roughness: 0.55 })]);

  const chrome = mat('#e2e1e6', { metalness: 0.85, roughness: 0.2 });
  const button = mat('#f1e7d4', { roughness: 0.28, clearcoat: 0.6 });
  const post = new CylinderGeometry(0.07, 0.08, 0.2, 16);
  const shaft = new CylinderGeometry(0.035, 0.035, 0.5, 10); shaft.rotateX(Math.PI / 2);
  const bean = new SphereGeometry(0.2, 18, 12);
  STRING_POSTS.forEach((x, s) => {
    const side = s < 3 ? 1 : -1;
    add(post, chrome, x, 0.12, side * 1.2);
    add(shaft, chrome, x, 0.0, side * 1.98);
    const knob = add(bean, button, x, 0.0, side * 2.36); knob.scale.set(0.62, 0.42, 1);
  });
  return frame;
}
