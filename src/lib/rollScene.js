/**
 * rollScene.js — the practice view as a room you look into.
 *
 * Three.js, deliberately without react-three-fiber. The canvas roll owns its
 * own requestAnimationFrame loop and reads engine state out of refs so it never
 * re-renders React during playback; r3f would put a reconciler in the middle of
 * exactly that path. This is a plain class the component drives.
 *
 * ── What this renderer is for, and what it gives up ───────────────────────
 *
 * A perspective camera, and that is the whole point of it. The 2D roll is the
 * one you learn from: equal time covers equal distance the whole way down the
 * screen, and every key is the same width as the one beside it, so "when does
 * this arrive" is a distance you can read and the keyboard matches the hardware
 * one-for-one. `rollGeometry.js` guarantees both and its tests defend them.
 *
 * Perspective breaks both on purpose. A note near the top covers less screen
 * per second than one near the line, and the outer keys narrow away. What you
 * get back is a scene with a vanishing point that reads as an instrument rather
 * than as a diagram. The interface says as much in as many words; the trade is
 * the player's to make.
 *
 * There used to be a third view — tilted *orthographic* — on the theory it
 * could have the depth without the cost. It could not: an orthographic camera
 * is affine, so tilting it yields a skewed 2D picture and nothing else. It was
 * removed rather than kept as a worse version of both its neighbours.
 *
 * ── Depth means depth ─────────────────────────────────────────────────────
 *
 * The z axis here is physical distance, not paint order, and that distinction
 * is why this file was rewritten. The first version used z as a layer index —
 * lane bed at −30, keys at +20 — which is invisible looking straight down the
 * axis and becomes about thirty pixels of vertical displacement the moment you
 * are not. The keyboard floated off the end of the roll with a black gap in
 * between.
 *
 * So everything that is *the surface* sits at z = 0 and is ordered with
 * `renderOrder`, which is the property meant for it. Only genuinely solid
 * things have thickness: note slabs standing on the surface, and the keys.
 *
 * ── And the camera stands at the keyboard ─────────────────────────────────
 *
 * Which took a second pass to get right. Depth being physical is no use if you
 * are looking at it from the wrong end, and this camera was: parked above the
 * top of the roll and tilted down, so the keys were the distant thing and the
 * notes fell away from the player. Where it goes now is solved for in
 * rollCamera.js, which is arithmetic and therefore testable, rather than here,
 * which is not.
 */

import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BLACK_H_RATIO, SHELF_H, TUNING } from './rollPaint.js';
import { PIANO_COLORS as COLORS, keyLight, noteColor, stageNoteBounds } from './pianoStage.js';
import { gridLines, noteVisible, timeWindow } from './rollGeometry.js';
import { FOV, PIANO_CAMERA, projectOnto, stagedCamera } from './rollCamera.js';

/**
 * Paint order for the things sharing the surface plane.
 *
 * All of these sit at z = 0. Ordering them by number rather than by depth is
 * what keeps the surface flat, and flat is what keeps the keyboard attached to
 * the roll.
 */
const ORDER = {
  lane: 0,
  laneBlack: 1,
  octave: 2,
  grid: 3,
  trouble: 4,
  shelf: 5,
  ghost: 6,
  hitLine: 7,
  /** Over everything, including the notes — see `_fadeTexture`. */
  fade: 20,
};

/** How much of the roll the far-end fade covers, and how far past its end. */
const FADE_RATIO = 0.34;
const FADE_OVERHANG = 60;

/**
 * How thick a note slab is, and how deep the keys are.
 *
 * Exported because the text layer draws on top of both — a note name belongs on
 * the face of the slab, not on the lane underneath it.
 *
 * These came down from 30 and 26. A slab a third as thick as its lane is wide
 * reads as a brick, and a thick one also drifts visibly off its own key: it
 * stands closer to the camera than the lane it belongs to, so perspective
 * spreads it outwards from the centre of the screen.
 */
export const NOTE_DEPTH = 18;
export const WHITE_DEPTH = 18;
const NOTE_THICKNESS = 12;
/** How far a black key stands on top of the whites. */
export const BLACK_RISE = 12;

/**
 * One key light, from in front of the player and well above.
 *
 * A direction, not a position: what a face of a box catches depends only on the
 * unit vector, so fixing that here means the shading is the same whatever size
 * the table turns out to be. Overhead and leaning forward puts 0.89 of the
 * light on the face pointing at the camera — the top of a note slab, the
 * playing surface of a key — and 0.36 on the face turned towards the player,
 * and that difference is the entire reason a slab reads as an object rather
 * than as a coloured rectangle.
 *
 * The two intensities are then chosen so a lit top face comes out at *exactly*
 * the colour the canvas roll paints flat. A run must not look like a different
 * run because it was drawn on a GPU; what the third dimension is allowed to add
 * is the darker front lip, not a brighter note.
 *
 * Hence the π. Lambert's BRDF carries a 1/π, and it applies to the ambient term
 * as well as the direct one, so intensities that read as "just under full"
 * arrive on screen at a third of that. This was set by eye twice and came out
 * grey twice; `scripts/sample.mjs` measured the pixels and the factor was
 * 0.322, which is 1/π to three figures. So:
 *
 *   top face   = (AMBIENT + KEY_LIGHT × 0.89) / π = 1.00 — canvas parity
 *   front lip  = (AMBIENT + KEY_LIGHT × 0.36) / π = 0.61
 *
 * The light itself used to sit behind the table shining away from the camera,
 * so every face you could see got ambient only. That is why solid geometry
 * rendered as flat colour no matter how thick the slabs were made.
 */
const LIGHT_DIR = [-0.38, 0.38, -0.84];
const AMBIENT = 0.28 * Math.PI;
const KEY_LIGHT = 0.86 * Math.PI;

const c = (hex) => new Color(hex);

function beveledBox(radius) {
  const geometry = new RoundedBoxGeometry(1, 1, 1, 2, radius);
  const normals = geometry.getAttribute('normal');
  const colors = [];
  for (let i = 0; i < normals.count; i++) {
    // A bright playing surface, shaded side walls, and a distinct front lip.
    // Vertex shading follows the rounded bevel instead of drawing a flat border.
    const face = 0.54 + 0.46 * Math.max(0, normals.getZ(i));
    colors.push(face, face, face);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/**
 * What a translucent fill over a lane actually looks like.
 *
 * The canvas roll draws notes with `globalAlpha`, letting the lane show
 * through. Instanced meshes carry a colour per instance but not an alpha, so
 * the composite happens here — `src·a + lane·(1−a)`, exactly what a 2D context
 * does — and the material stays opaque.
 */

/**
 * One key, with a real hinge.
 *
 * The pivot decides whether this looks like a key or a see-saw: the mesh is
 * offset inside a parent sitting at the *back* of the key, so rotating the
 * parent swings the front end down the way a real one moves.
 *
 * Black keys stand **on top of** the whites rather than beside them — raised by
 * `BLACK_RISE` and flush with them at the back. The previous version put the
 * two within a unit of each other, which z-fought, and lit the sliver of black
 * top face that stuck out into a white stripe along every accidental.
 *
 * Each key owns its clock. A shared timer forces every key into one phase, so a
 * note re-struck while another is still returning snaps; per-key elapsed time
 * lets a dozen keys each be somewhere different in the same animation, which is
 * what a chord is.
 */
class Key {
  constructor(parent, geometry, material, { x, w, black, midi }, top, height) {
    this.midi = midi;
    this.pivot = new Object3D();
    this.pivot.position.set(x + w / 2, top, black ? WHITE_DEPTH : 0);
    this.mesh = new Mesh(geometry, material);
    this.mesh.userData.midi = midi;
    this.mesh.scale.set(Math.max(1, w - 1), height, black ? BLACK_RISE : WHITE_DEPTH);
    // Half its length forward, so the hinge is the back edge and not the middle;
    // half its depth up, so the box stands on the plane rather than through it.
    this.mesh.position.set(0, height / 2, black ? BLACK_RISE / 2 : WHITE_DEPTH / 2);
    this.pivot.add(this.mesh);
    parent.add(this.pivot);

    this.state = 'up';
    this.elapsed = 0;
    this.fromAngle = 0;
    this.base = material.color.clone();
  }

  /** @param {number} dt seconds since the last frame */
  update(dt, pressedTint, targetTint) {
    const wanted = pressedTint ? 'down' : 'up';
    if (wanted !== this.state) {
      this.fromAngle = this.pivot.rotation.x;
      this.state = wanted;
      this.elapsed = 0;
    }
    this.elapsed += dt;

    // smoothstep rather than a linear ramp: a key that starts and stops moving
    // abruptly reads as a switch; one that eases at both ends has mass.
    const t = Math.max(0, Math.min(1, this.elapsed / (this.state === 'down' ? 0.055 : 0.12)));
    const eased = t * t * (3 - 2 * t);
    const to = this.state === 'down' ? -TUNING.keyThrow.value : 0;
    const from = this.fromAngle;
    this.pivot.rotation.x = from + (to - from) * eased;

    const tint = pressedTint;
    this.mesh.material.emissive?.set(tint || targetTint || 0x000000);
    this.mesh.material.emissiveIntensity = tint ? 0.14 : targetTint ? 0.06 : 0;
    this.mesh.material.color.copy(tint ? c(tint) : this.base);
  }
}

class RollScene {
  constructor(canvas) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(c(COLORS.bg), 1);
    /**
     * No shadow map, deliberately.
     *
     * The only surface large enough to catch a useful shadow is the lane bed,
     * and the lane bed is unlit by design — it has to stay the same near-black
     * the canvas roll paints, so it is a basic material and cannot receive one.
     * A shadow pass for what would land on the keys alone buys a little realism
     * and a lot of ways to look wrong: acne striped across the key tops, a
     * blocky map stretched over the whole table. Left off.
     */

    this.scene = new Scene();
    this.world = new Group();
    this.scene.add(this.world);
    this.camera = new PerspectiveCamera(FOV, 1, 1, 12000);

    this.scene.add(new AmbientLight(0xffffff, AMBIENT));
    this.light = new DirectionalLight(0xffffff, KEY_LIGHT);
    this.scene.add(this.light);
    this.scene.add(this.light.target);

    this.unit = new BoxGeometry(1, 1, 1);
    this.roundedKey = beveledBox(0.025);
    this.roundedNote = beveledBox(0.045);
    this.plane = new PlaneGeometry(1, 1);
    this.keys = new Map();
    this.notes = null;
    this.scratch = new Object3D();
    this.lastFrame = 0;
    this.statics = [];
    this.gridPool = [];
    this.troublePool = [];
    this.ghostPool = [];
    this.fadeTex = null;

    /** Canvas size in CSS pixels — what `project` turns clip space back into. */
    this.view = { w: 1, h: 1 };
    this.shot = null;
    this.hitDepth = 1;
  }

  refreshPalette() {
    this.renderer.setClearColor(c(COLORS.bg), 1);
    this.fadeTex?.dispose();
    this.fadeTex = null;
  }

  setSize(w, h, dpr = 1) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.view = { w, h };
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Stand the camera in front of the keyboard, looking back along the roll.
   *
   * Where it goes is rollCamera.js's answer; this turns that answer into a
   * transform. The two reflections below are the fiddly part and are why the
   * placement is worth keeping in one short method:
   *
   * This space has y pointing *down* so the numbers match the CSS pixels
   * rollGeometry produces, which makes it left-handed — and `lookAt` with an
   * inverted up vector then flips x, putting the bass end of the keyboard on
   * the right. It did exactly that. Viewing from behind the plane restores the
   * handedness, mirroring the world in z puts the depth ordering back, and the
   * two reflections leave face winding as it was. So `+z` in roll coordinates
   * means "standing up off the table towards the player" everywhere in this
   * file, and the camera sits at negative z.
   *
   * @param {object} layout from rollLayout, whose `w` is the table's width and
   *   need not be the canvas width
   * @param {number} originX where that table starts across the canvas
   */
  frame(layout, originX = 0) {
    const { w: tableW, h: tableL } = layout;
    this.world.scale.z = -1;
    this.world.position.x = originX;
    this.world.updateMatrixWorld(true);

    const shot = stagedCamera(tableW, tableL, this.camera.aspect, PIANO_CAMERA);
    this.camera.fov = shot.fov;
    this.shot = shot;
    this.hitDepth = projectOnto(shot, layout.hitLine).depth;

    const cx = originX + tableW / 2;
    this.camera.position.set(
      cx,
      shot.focusY + shot.dist * Math.cos(shot.pitch),
      -shot.dist * Math.sin(shot.pitch),
    );
    this.camera.up.set(0, -1, 0);
    this.camera.lookAt(cx, shot.focusY, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);

    // Far enough out that the whole table is effectively in one beam.
    const reach = tableL * 2.5;
    this.light.position.set(
      cx + LIGHT_DIR[0] * reach,
      shot.focusY + LIGHT_DIR[1] * reach,
      LIGHT_DIR[2] * reach,
    );
    this.light.target.position.set(cx, shot.focusY, 0);
    this.light.target.updateMatrixWorld();
  }

  /**
   * The far end of the roll, dissolved into the background.
   *
   * A flat table ends in a hard horizontal line across the screen, and notes,
   * which stand off that table and so project higher than the surface beneath
   * them, appear *above* the line — floating clear of the roll they are on.
   * Both read as a mistake. A gradient over the far third hides the edge and
   * lets notes arrive out of the dark rather than switch on at a boundary.
   *
   * Built as a one-pixel-wide ramp rather than laid out with gradient stops so
   * the curve can be a smoothstep: a linear alpha ramp has a visible corner at
   * each end of itself, which is another edge in place of the one being hidden.
   * `flipY = false` so row 0 of the strip is the far end, matching the way this
   * space runs y downwards.
   */
  _fadeTexture() {
    if (this.fadeTex) return this.fadeTex;
    const strip = document.createElement('canvas');
    strip.width = 1;
    strip.height = 128;
    const ctx = strip.getContext('2d');
    const n = parseInt(COLORS.bg.slice(1), 16);
    const rgb = `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`;
    for (let i = 0; i < strip.height; i += 1) {
      const t = i / (strip.height - 1);
      ctx.fillStyle = `rgba(${rgb}, ${1 - t * t * (3 - 2 * t)})`;
      ctx.fillRect(0, i, 1, 1);
    }
    this.fadeTex = new CanvasTexture(strip);
    this.fadeTex.flipY = false;
    // Without this the bytes are taken for linear values and the fade resolves
    // to a grey haze three stops brighter than the background it is supposed to
    // be disappearing into. Measured at #2a303c against a #06080c backdrop.
    this.fadeTex.colorSpace = SRGBColorSpace;
    return this.fadeTex;
  }

  /** A flat quad lying on the surface plane. */
  _quad(color, opacity = 1, order = 0) {
    const mesh = new Mesh(
      this.plane,
      new MeshBasicMaterial({
        color: c(color),
        transparent: true,
        opacity,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.renderOrder = order;
    this.world.add(mesh);
    return mesh;
  }

  /** Everything on the surface is at z = 0; `renderOrder` decides the stack. */
  static _place(mesh, x, y, w, h) {
    mesh.position.set(x + w / 2, y + h / 2, 0);
    mesh.scale.set(Math.max(0.0001, w), Math.max(0.0001, h), 1);
  }

  _pool(list, make) {
    for (const m of list) m.visible = false;
    return (i) => {
      while (list.length <= i) list.push(make());
      const m = list[i];
      m.visible = true;
      return m;
    };
  }

  /** Everything whose position only changes when the geometry does. */
  buildStatic(geometry, layout, lanes) {
    for (const mesh of this.statics) { this.world.remove(mesh); mesh.material.dispose(); }
    for (const key of this.keys.values()) { this.world.remove(key.pivot); key.mesh.material.dispose(); }
    this.keys.clear();
    this.statics = [];

    const { w, rollH, keyboardTop } = layout;

    const bed = this._quad(COLORS.laneWhite, 1, ORDER.lane);
    // Coplanar lane overlays are ordered explicitly. Writing the bed's depth
    // causes precision stripes under perspective, especially on light surfaces.
    bed.material.depthWrite = false;
    RollScene._place(bed, 0, 0, w, rollH);
    this.statics.push(bed);

    for (const lane of lanes.black) {
      const m = this._quad(COLORS.laneBlack, 1, ORDER.laneBlack);
      RollScene._place(m, lane.x, 0, lane.w, rollH);
      this.statics.push(m);
    }
    for (const x of lanes.octaves) {
      const m = this._quad('#ffffff', 0.1, ORDER.octave);
      RollScene._place(m, x, 0, 1, rollH);
      this.statics.push(m);
    }

    // The dark lip the key strip sits in, at the near edge of the surface.
    const shelf = this._quad(COLORS.shelf, 1, ORDER.shelf);
    RollScene._place(shelf, 0, keyboardTop - SHELF_H, w, SHELF_H);
    this.statics.push(shelf);

    const KEYBOARD_H = layout.h - keyboardTop;
    // A slim graphite enclosure leaves the keys and note lighting in focus.
    const casePart = (x, y, z, width, length, depth, color, metalness = 0) => {
      const mesh = new Mesh(this.roundedKey, new MeshPhysicalMaterial({ color, roughness: 0.36, metalness, clearcoat: 0.35 }));
      mesh.position.set(x, y, z); mesh.scale.set(width, length, depth); this.world.add(mesh); this.statics.push(mesh);
    };
    casePart(w / 2, keyboardTop + KEYBOARD_H / 2, -3, w + 4, KEYBOARD_H + 8, 5, '#13101d');
    casePart(w / 2, keyboardTop + KEYBOARD_H + 2, 0, w, 2, 3, '#5c478a', 0.3);
    const keyTop = keyboardTop + SHELF_H;
    const whiteH = KEYBOARD_H - SHELF_H;
    const blackH = KEYBOARD_H * BLACK_H_RATIO;
    for (const k of geometry.keys.values()) {
      const material = new MeshPhysicalMaterial({
        color: c(k.black ? '#14121d' : '#eeebf3'),
        roughness: k.black ? 0.34 : 0.3, clearcoat: 0.3, clearcoatRoughness: 0.32,
        vertexColors: true,
        side: FrontSide,
      });
      this.keys.set(
        k.midi,
        new Key(this.world, this.roundedKey, material, k, keyTop, k.black ? blackH : whiteH),
      );
      if (k.black) {
        const shadow = this._quad('#000000', 0.32, ORDER.shelf);
        RollScene._place(shadow, k.x - 1, keyTop + 2, k.w + 3, blackH + 3);
        shadow.position.z = WHITE_DEPTH + 0.05;
        this.statics.push(shadow);
      }
    }

    this.nowZone = this._quad(COLORS.hitLine, 0.05, ORDER.hitLine - 1);
    this.hitLine = this._quad(COLORS.hitLine, 1, ORDER.hitLine);
    this.statics.push(this.nowZone, this.hitLine);

    // Last, and over the top of the notes rather than behind them, which is
    // why this one ignores the depth buffer.
    const fade = this._quad('#ffffff', 1, ORDER.fade);
    fade.material.map = this._fadeTexture();
    fade.material.depthTest = false;
    fade.material.needsUpdate = true;
    RollScene._place(fade, 0, -FADE_OVERHANG, w, FADE_OVERHANG + rollH * FADE_RATIO);
    this.statics.push(fade);
  }

  _ensureInstanced(n) {
    if (this.notes && this.notes.instanceMatrix.count >= n) return;
    if (this.notes) { this.world.remove(this.notes); this.notes.material.dispose(); }
    const size = Math.max(64, 1 << Math.ceil(Math.log2(n + 1)));
    // Boxes with a material that responds to light. Unlit, every face of a box
    // comes out the same colour and a solid slab renders exactly like a flat
    // rectangle — geometry alone is not depth, the shading difference is.
    const mesh = new InstancedMesh(this.roundedNote, new MeshPhysicalMaterial({
      side: FrontSide, vertexColors: true, roughness: 0.28,
      clearcoat: 0.5, clearcoatRoughness: 0.22,
    }), size);
    mesh.frustumCulled = false;
    this.world.add(mesh);
    this.notes = mesh;
  }

  draw({
    score,
    layout,
    now,
    pps,
    activeInput,
    soundingNow,
    playback = false,
    troubleSpots = [],
    ghost = null,
    combo = 0,
    bestCombo = 0,
    calm = false,
  }) {
    const nowMs = performance.now();
    const dt = this.lastFrame ? Math.min(0.1, (nowMs - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = nowMs;

    const { hitLine, rollH, w } = layout;
    const { yFor, tTop, tBottom } = timeWindow(layout, now, pps);
    const record = bestCombo > 0 && combo > bestCombo;
    const heat = Math.min(
      1,
      Math.max(0, (combo - TUNING.comboThreshold.value) / 12) + (record ? 0.35 : 0),
    );

    this._drawTrouble(troubleSpots, tBottom, tTop, yFor, pps, layout);
    this._drawGrid(score, tBottom, tTop, pps, yFor, layout);
    this._drawTargets(score, now, pps, yFor, tBottom, tTop, hitLine);
    this._drawGhost(score, ghost, now, yFor, tBottom, tTop, rollH);

    const tone = c(record ? COLORS.record : COLORS.hitLine);
    // Above the line only: with the past strip collapsed, everything below it
    // is keyboard, and a glow spilling onto the keys reads as a fault.
    const zoneH = Math.max(28, pps * (TUNING.nowZone.value + 0.06));
    RollScene._place(this.nowZone, 0, hitLine - zoneH, w, zoneH);
    this.nowZone.material.opacity = 0;
    this.nowZone.material.color.copy(tone);
    RollScene._place(this.hitLine, 0, hitLine - 0.5, w, 1);
    this.hitLine.material.color.copy(tone);

    for (const [midi, key] of this.keys) {
      const tint = keyLight(midi, activeInput, soundingNow, playback);
      // Reduced motion gets the end state rather than the travel.
      key.update(
        calm ? 1 : dt,
        tint,
        null,
      );
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** Bars you keep fumbling, washed faintly red across the full width. */
  _drawTrouble(spots, tBottom, tTop, yFor, pps, layout) {
    const take = this._pool(this.troublePool, () => this._quad(COLORS.missed, 0.1, ORDER.trouble));
    if (!spots.length) return;
    const max = Math.max(...spots.map((t) => t.weight), 1);
    let i = 0;
    for (const spot of spots) {
      if (spot.time < tBottom - 1 || spot.time > tTop + 1) continue;
      const m = take(i);
      m.material.opacity = 0.05 + 0.13 * (spot.weight / max);
      RollScene._place(m, 0, yFor(spot.time + 0.25), layout.w, Math.max(6, 0.5 * pps));
      i += 1;
    }
  }

  /**
   * The notes you are being asked to play, coloured by how that went.
   *
   * With the past strip collapsed there is nowhere below the line to draw what
   * you actually played, and nothing is lost by that: the key itself lights up
   * as you hit it, which is where your eye is anyway once a note has arrived.
   */
  _drawTargets(score, now, pps, yFor, tBottom, tTop, hitLine) {
    const visible = (score?.notes ?? []).filter((n) => noteVisible(n, tBottom, tTop));
    this._ensureInstanced(visible.length);

    let i = 0;
    for (const note of visible) {
      const lane = this.geometryKeys?.get(note.midi);
      const box = stageNoteBounds(note, lane, now, pps, hitLine);
      if (!box) continue;

      // Standing on the surface, not buried halfway through it.
      this.scratch.position.set(lane.center, box.top + box.h / 2, NOTE_DEPTH - NOTE_THICKNESS / 2);
      this.scratch.scale.set(box.w, box.h, NOTE_THICKNESS);
      this.scratch.updateMatrix();
      this.notes.setMatrixAt(i, this.scratch.matrix);

      this.notes.setColorAt(i, c(noteColor(note)));
      i += 1;
    }
    this.notes.count = i;
    this.notes.instanceMatrix.needsUpdate = true;
    if (this.notes.instanceColor) this.notes.instanceColor.needsUpdate = true;
  }

  /**
   * Where your best run struck each note — faint and colourless, a reference
   * line rather than a thing to chase into the ground.
   */
  _drawGhost(score, ghost, now, yFor, tBottom, tTop, rollH) {
    const take = this._pool(this.ghostPool, () => this._quad(COLORS.ghost, 0.5, ORDER.ghost));
    if (!ghost?.deltas || !score?.notes) return;

    let i = 0;
    for (const note of score.notes) {
      if (!noteVisible(note, tBottom, tTop)) continue;
      const ms = ghost.deltas[note.id];
      if (!Number.isFinite(ms) || Math.abs(ms) <= 12) continue;
      if (note.time + note.duration < now) continue;
      const lane = this.geometryKeys?.get(note.midi);
      if (!lane) continue;
      const gy = yFor(note.time + ms / 1000);
      if (gy <= 0 || gy >= rollH) continue;
      RollScene._place(take(i), lane.x - 2, gy, lane.w + 4, 1.5);
      i += 1;
    }
  }

  _drawGrid(score, tBottom, tTop, pps, yFor, layout) {
    const take = this._pool(this.gridPool, () => this._quad('#ffffff', 0.06, ORDER.grid));
    let i = 0;
    for (const line of gridLines(score, tBottom, tTop, pps)) {
      const y = Math.round(yFor(line.time));
      if (y < -2 || y > layout.rollH + 2) continue;
      const m = take(i);
      // Brightest at the hit line and falling away, so the grid reads as depth
      // rather than as uniform ruling.
      const near = 1 - Math.min(1, Math.abs(y - layout.hitLine) / layout.rollH);
      const weight = line.weight === 'bar' ? 0.14 : line.weight === 'beat' ? 0.035 : 0.012;
      m.material.opacity = weight * (0.35 + near * 0.65);
      RollScene._place(m, 0, y, layout.w, 1);
      i += 1;
    }
  }

  /**
   * Where a point in the scene lands on screen.
   *
   * The text layer draws in CSS pixels, which is what roll coordinates are —
   * right up until the projection stops being flat. Under perspective the
   * geometry moves and flat-drawn labels do not, so note names float away from
   * the notes they belong to. This puts a point through the same camera.
   *
   * `z` matters: a label belongs on the face of the slab or the surface of the
   * key, not on the lane underneath it. `scale` is the true foreshortening —
   * text at the hit line is full size and everything further off shrinks in
   * proportion to its depth, the way the geometry around it does.
   */
  project(x, y, z = 0) {
    if (!this.shot) return { x, y, scale: 1 };
    const v = new Vector3(x, y, z);
    this.world.localToWorld(v);
    v.project(this.camera);
    const { depth } = projectOnto(this.shot, y, z);
    return {
      x: ((v.x + 1) / 2) * this.view.w,
      y: ((1 - v.y) / 2) * this.view.h,
      scale: Math.max(0.45, Math.min(1.3, this.hitDepth / Math.max(1, depth))),
    };
  }

  /**
   * Which point on the table is under a screen pixel — the inverse of the above.
   *
   * Perspective is precisely the thing that makes "the click was at y = 640, so
   * it landed on the keyboard" false, and that sentence is the canvas roll's
   * entire hit test. Clicking a key to hear it, and clicking the roll to seek,
   * both need the pixel cast back through the same camera and intersected with
   * the table. The ray is in scene space, where the table is still the z = 0
   * plane, so the intersection is one division; `worldToLocal` then undoes the
   * mirror and the centring offset that `frame` applied.
   *
   * @returns {{x: number, y: number}|null} roll coordinates, or null if the
   *   pixel looks past the table altogether.
   */
  pick(px, py) {
    if (!this.shot) return null;
    const far = new Vector3((px / this.view.w) * 2 - 1, 1 - (py / this.view.h) * 2, 0.5);
    far.unproject(this.camera);
    const eye = this.camera.position;
    const dz = far.z - eye.z;
    if (Math.abs(dz) < 1e-6) return null;
    const t = -eye.z / dz;
    if (!(t > 0)) return null;
    const hit = new Vector3(eye.x + (far.x - eye.x) * t, eye.y + (far.y - eye.y) * t, 0);
    this.world.worldToLocal(hit);
    return { x: hit.x, y: hit.y };
  }

  /** Intersect the actual raised/pressed key faces before seeking the flat roll. */
  pickKey(px, py) {
    if (!this.shot) return null;
    this.world.updateMatrixWorld(true);
    const ray = new Raycaster();
    ray.setFromCamera({x: px / this.view.w * 2 - 1, y: 1 - py / this.view.h * 2}, this.camera);
    const hit = ray.intersectObjects([...this.keys.values()].map(key => key.mesh))[0];
    if (!hit) return null;
    const point = this.world.worldToLocal(hit.point.clone());
    return { midi: hit.object.userData.midi, y: point.y };
  }

  /** Labels and focus outlines follow the actual hinged face during a press. */
  projectKey(midi, across = 0.5, along = 0.85) {
    const key = this.keys.get(midi);
    if (!key) return null;
    const point = new Vector3(across - 0.5, along - 0.5, 0.5);
    key.mesh.localToWorld(point);
    point.project(this.camera);
    return { x: (point.x + 1) * this.view.w / 2, y: (1 - point.y) * this.view.h / 2 };
  }

  /**
   * Give the scene back, keeping the context.
   *
   * Not a dispose. A WebGL context is a scarce resource — browsers allow about
   * sixteen — and the original mistake was treating one like a React component:
   * built on mount, thrown away on unmount. StrictMode mounts every effect
   * twice on purpose, so opening the page burned two and each renderer switch
   * burned another, until the browser began killing live contexts underneath a
   * running renderer.
   */
  release() {
    for (const mesh of this.statics) { this.world.remove(mesh); mesh.material.dispose(); }
    for (const key of this.keys.values()) { this.world.remove(key.pivot); key.mesh.material.dispose(); }
    for (const list of [this.gridPool, this.troublePool, this.ghostPool]) {
      for (const m of list) { this.world.remove(m); m.material.dispose(); }
      list.length = 0;
    }
    if (this.notes) { this.world.remove(this.notes); this.notes.material.dispose(); }
    this.statics = [];
    this.keys.clear();
    this.notes = null;
    this.geometryKeys = null;
    this.lastFrame = 0;
    this.shot = null;
  }
}

/**
 * The one WebGL context this app ever creates.
 *
 * Module-level and never torn down, for the reason in `release` above. The
 * canvas is created here too, so it is never an element React owns and can
 * never be reused after a context was taken away from it.
 */
let shared = null;

/** @returns {{scene: RollScene, canvas: HTMLCanvasElement}} */
export function acquireScene() {
  if (!shared) {
    const canvas = document.createElement('canvas');
    shared = { scene: new RollScene(canvas), canvas };
  } else {
    shared.scene.release();
  }
  return shared;
}
