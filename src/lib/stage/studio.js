import { DirectionalLight, HemisphereLight, Mesh, NeutralToneMapping, OrthographicCamera, PCFShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, ShadowMaterial, Vector2, Vector3, WebGLRenderer } from 'three';
import { rendererNameOf } from '../webgl.js';
import { createStudioEnvironment } from './environment.js';
import { frameBox, frameSpan } from './framing.js';
import { pickStageTier, STAGE_TIERS } from './quality.js';
import { blendPoses, fitLimits, NO_TURN, orbit } from './turntable.js';
import { STAGE_VIEWS } from './views.js';

/**
 * studio.js — the room a 3D string instrument is shown in.
 *
 * Owns everything that is the same whichever instrument is on stage: the
 * WebGL renderer, the lights, the floor that catches the shadow, the camera,
 * and the bookkeeping to hand all of it back when the stage closes. The
 * instrument itself, and what a click on it means, belong to the caller.
 *
 * The light tier is the stage exactly as it was before tiers existed. The full
 * tier adds a studio for metal and lacquer to reflect (see environment.js),
 * and eases the sky light back by about what that studio contributes.
 *
 * Tone mapping is Khronos PBR Neutral rather than ACES: ACES shifts hue and
 * desaturates bright colours, which turned spruce grey-beige and the copper
 * root markers pale; Neutral keeps wood, pearl and marker colours as authored.
 */
const LOOKS = {
  [STAGE_TIERS.FULL]: { pixelRatio: 2, shadowMap: 2048, environment: 1, hemisphere: 1.0, key: 2.4, rim: 0.7 },
  [STAGE_TIERS.LIGHT]: { pixelRatio: 1.75, shadowMap: 1024, environment: 0, hemisphere: 1.2, key: 2.4, rim: 0.7 },
};
const FLOOR_Y = -0.58;
const FLOOR_SIZE = Object.freeze({ width: 36, depth: 12 });
const KEY_FROM = Object.freeze([-3, 9, 4]);
const FOV = STAGE_VIEWS.lesson.fovDeg;
/** The camera sees at least this far, and further when it stands further back. */
const FAR = 100;

/** The tier to draw, and the studio to reflect if that tier has one. Reflections that fail to build cost the tier, not the stage. */
function chooseTier(renderer, quality, daylight) {
  const tier = pickStageTier({
    override: quality,
    rendererName: quality === 'auto' ? rendererNameOf(renderer.getContext()) : '',
    cores: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
  });
  if (!LOOKS[tier].environment) return { tier, environment: null };
  try {
    return { tier, environment: createStudioEnvironment(renderer, { daylight }) };
  } catch (error) {
    console.warn('[stage] studio reflections are unavailable, drawing the light stage instead:', error.message);
    return { tier: STAGE_TIERS.LIGHT, environment: null };
  }
}

function configure(renderer, look) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, look.pixelRatio));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // The instrument does not move, so the shadow is redrawn only when the frame changes.
  renderer.shadowMap.autoUpdate = false;
}

function addLights(scene, look, daylight) {
  scene.add(new HemisphereLight(daylight ? '#fff9ee' : '#e9e6ff', '#352a23', look.hemisphere));
  const key = new DirectionalLight('#fff4e6', look.key);
  key.position.set(...KEY_FROM);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -13, right: 14, top: 6, bottom: -6, near: 0.1, far: 30 });
  key.shadow.mapSize.set(look.shadowMap, look.shadowMap);
  key.shadow.normalBias = 0.035;
  key.shadow.bias = -0.0003;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  const rim = new DirectionalLight('#e5e3fa', look.rim);
  rim.position.set(3, 4, -6);
  scene.add(rim);
  return key;
}

function addFloor(scene, owned, daylight) {
  const geometry = new PlaneGeometry(FLOOR_SIZE.width, FLOOR_SIZE.depth);
  const material = new ShadowMaterial({ opacity: daylight ? 0.2 : 0.4 });
  owned.geometries.add(geometry);
  owned.materials.add(material);
  const floor = new Mesh(geometry, material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);
  return floor;
}

/**
 * Lays the floor under `box` and fits the key light's shadow around it: the
 * floor wide enough to catch the shadow the light throws from that height,
 * and the shadow camera only as large as the box, so its detail is not spread
 * over empty floor. The light keeps its direction.
 */
function fitGround({ floor, key }, { min, max }) {
  const centre = new Vector3(...min.map((v, k) => (v + max[k]) / 2));
  const height = max[1] - min[1], reach = height * 1.5 + 2;
  floor.position.set(centre.x, min[1], centre.z);
  floor.scale.set((max[0] - min[0] + 2 * reach) / FLOOR_SIZE.width, (max[2] - min[2] + 2 * reach) / FLOOR_SIZE.depth, 1);

  const size = Math.hypot(...max.map((v, k) => v - min[k]));
  key.position.copy(centre).addScaledVector(new Vector3(...KEY_FROM).normalize(), size);
  key.target.position.copy(centre);
  key.target.updateMatrixWorld();
  // Where the box's corners fall as the light sees them, so the shadow camera covers them and no more.
  const probe = new OrthographicCamera();
  probe.position.copy(key.position);
  probe.lookAt(centre);
  probe.updateMatrixWorld(true);
  const seen = [min[0], max[0]].flatMap(x => [min[1], max[1]].flatMap(y => [min[2], max[2]].map(z => new Vector3(x, y, z).applyMatrix4(probe.matrixWorldInverse))));
  const pad = size * 0.04, along = axis => seen.map(p => p[axis]);
  Object.assign(key.shadow.camera, {
    left: Math.min(...along('x')) - pad, right: Math.max(...along('x')) + pad,
    bottom: Math.min(...along('y')) - pad, top: Math.max(...along('y')) + pad,
    near: Math.max(0.1, -Math.max(...along('z')) - pad), far: -Math.min(...along('z')) + pad,
  });
  key.shadow.camera.updateProjectionMatrix();
}

/** Disposes every geometry, material and texture in `owned`, and empties it. */
export function disposeResources(owned) {
  owned.geometries.forEach(g => g.dispose());
  owned.materials.forEach(m => m.dispose());
  owned.textures.forEach(t => t.dispose());
  Object.values(owned).forEach(set => set.clear());
}

function closeRenderer(renderer) {
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement.remove();
}

/** Lights, floor and camera around a renderer that already exists, and the handle the caller drives them with. */
function furnish(el, renderer, { daylight, quality }) {
  const { tier, environment } = chooseTier(renderer, quality, daylight);
  const look = LOOKS[tier];
  configure(renderer, look);
  el.prepend(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, FAR);
  const owned = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const key = addLights(scene, look, daylight);
  if (environment) { scene.environment = environment.texture; scene.environmentIntensity = look.environment; }
  const floor = addFloor(scene, owned, daylight);
  const ray = new Raycaster(), pointer = new Vector2(), point = new Vector3();

  // A whole-model shot is solved iteratively, so its pose is kept per shot until the stage's shape, bars or hand change.
  const solved = new WeakMap();
  const boxPose = (shot, { flip, view, bounds }, aspect) => {
    const key = `${aspect}|${flip}|${view.fovDeg}|${bounds ? `${bounds.x}|${bounds.top}|${bounds.bottom}` : ''}`;
    const kept = solved.get(shot);
    if (kept?.key === key) return kept.pose;
    const pose = frameBox({ ...shot.box, keep: shot.keep, azimuthDeg: shot.azimuthDeg, elevationDeg: shot.elevationDeg, aspect, fovDeg: view.fovDeg, flip, bounds });
    solved.set(shot, { key, pose });
    return pose;
  };
  /** Where the camera stands for `shot` (see `unturned`) on a stage of `aspect`. */
  const poseFor = (shot, options, aspect) => {
    if (shot.pose) return { ...shot.pose, distance: Math.hypot(...shot.pose.position.map((v, i) => v - shot.pose.target[i])) };
    if (shot.blend) return blendPoses(poseFor(shot.blend.from, options, aspect), poseFor(shot.blend.to, options, aspect), shot.blend.progress);
    return shot.box ? boxPose(shot, options, aspect) : frameSpan({ ...shot, aspect, fovDeg: options.view.fovDeg, elevation: options.view.elevation, flip: options.flip });
  };
  /** Where the camera was last stood, turn and all; null until it has been. */
  let lastPose = null;

  /**
   * The camera `view` would use for `shot` on the stage as sized now, before
   * any turn; null while it has no size. A shot is a stretch of the instrument
   * to show across the stage, `{ left, right }`; a whole model to show from
   * one direction, `{ box: { min, max }, keep?, azimuthDeg, elevationDeg }`,
   * fitted inside `bounds` (see framing.js); a fixed camera, `{ pose }`, such
   * as `currentPose()` gave; or part of the way from one shot to another,
   * `{ blend: { from, to, progress } }`.
   */
  const unturned = (shot, options = {}) => {
    // Before options existed the second argument was the flip; a number here would silently lose the mirroring.
    if (typeof options !== 'object' || options === null) throw new TypeError('Stage framing takes an options object: { flip, view, turn }');
    const { flip = 1, view = STAGE_VIEWS.lesson, bounds } = options;
    const width = el.clientWidth, height = el.clientHeight;
    if (!width || !height) return null;
    const aspect = width / height;
    return { pose: poseFor(shot, { flip, view, bounds }, aspect), fovDeg: view.fovDeg, aspect };
  };

  /**
   * Stands the camera to show `shot` through `view`, turned by `turn`. Moves
   * only the camera, so it is cheap enough to call on every frame of a drag.
   * False while the stage has no size.
   *
   * @param {{ left: number, right: number } | { box: object, azimuthDeg: number, elevationDeg: number }} shot
   * @param {{ flip?: 1|-1, view?: object, turn?: { yaw: number, pitch: number }, bounds?: object }} [options] `view` from views.js
   */
  const aim = (shot, options = {}) => {
    const lens = unturned(shot, options);
    if (!lens) return false;
    const { position, target } = orbit(lens.pose, options.turn ?? NO_TURN);
    camera.aspect = lens.aspect;
    camera.fov = lens.fovDeg;
    camera.far = Math.max(FAR, lens.pose.distance * 3);
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
    lastPose = Object.freeze({ position: [...position], target: [...target] });
    return true;
  };

  return {
    renderer, scene, camera, tier, owned, aim,

    /** Where the camera stands now, turn and all, as a `{ position, target }` pose; null before it has been aimed. */
    currentPose: () => lastPose,

    /**
     * How far the view may turn on this stage: `view.turn`, shrunk so every
     * point of `keep` stays on screen and within `bounds`. Null where the view
     * cannot be turned, or while the stage has no size.
     *
     * @param {object} shot as `aim` takes it
     * @param {{ flip?: 1|-1, view?: object, keep: number[][], bounds?: { x: number, top: number, bottom: number } }} options
     */
    turnLimits(shot, { keep, ...options }) {
      const lens = unturned(shot, options);
      const view = options.view ?? STAGE_VIEWS.lesson;
      return lens && view.turn ? fitLimits(lens, keep, view.turn, options.bounds) : null;
    },

    /** Lays the floor and fits the shadow under an instrument whose bounds are `box`; until called, they suit the guitar built in code. */
    fitGround(box) {
      fitGround({ floor, key }, box);
      renderer.shadowMap.needsUpdate = true;
    },

    /** Redraws the shadow with the next frame, for when the instrument itself moved; turning the view never needs it. */
    refreshShadow() { renderer.shadowMap.needsUpdate = true; },

    get pixelRatio() { return renderer.getPixelRatio(); },
    /** Changes the drawing resolution in place; the stage keeps its size on the page. */
    setPixelRatio(ratio) { renderer.setPixelRatio(ratio); },

    /** Sizes the canvas to the stage, then aims the camera as `aim` does. False while the stage has no size. */
    frame(span, options) {
      const width = el.clientWidth, height = el.clientHeight;
      if (!width || !height) return false;
      renderer.setSize(width, height);
      // The shadow depends on the instrument and the light, not the camera, so turning never redraws it.
      renderer.shadowMap.needsUpdate = true;
      return aim(span, options);
    },

    /** A function from points in `object`'s own units to pixels from the stage's top-left corner, as things stand now. */
    projector(object) {
      object.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const width = el.clientWidth, height = el.clientHeight;
      return (x, y, z) => {
        point.set(x, y, z).applyMatrix4(object.matrixWorld).project(camera);
        return { x: ((point.x + 1) * width) / 2, y: ((1 - point.y) * height) / 2 };
      };
    },

    /** The nearest of `targets` under a pointer event, or null. */
    pick(event, targets) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      return ray.intersectObjects(targets)[0]?.object ?? null;
    },

    render() { renderer.render(scene, camera); },

    dispose() {
      disposeResources(owned);
      key.shadow.dispose();
      environment?.dispose();
      closeRenderer(renderer);
    },
  };
}

/**
 * @param {HTMLElement} el the stage element; the canvas is inserted as its first child
 * @param {{ theme?: 'light'|'dark', quality?: 'auto'|'full'|'light' }} [options]
 * @throws when a WebGL context cannot be created, or the stage cannot be set up in it; nothing is left behind
 */
export function createStudio(el, { theme = 'light', quality = 'auto' } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  try {
    return furnish(el, renderer, { daylight: theme !== 'dark', quality });
  } catch (error) {
    closeRenderer(renderer);
    throw error;
  }
}
