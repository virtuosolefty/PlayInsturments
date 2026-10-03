import { BackSide, BoxGeometry, Color, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene } from 'three';

/**
 * environment.js — what lacquer and metal on the stage have to reflect.
 *
 * A photographer's studio rather than a lit room: dim walls and a few soft
 * boxes. A bright room reflects as an even haze over every glossy surface; a
 * dark one with soft boxes reflects as defined highlights, which is what makes
 * a finish read as polished. Built from a handful of flat panels and rendered
 * once into a prefiltered map, so it costs nothing per frame and downloads
 * nothing.
 *
 * The camera looks down from above and in front, so an upward-facing surface
 * reflects what is above and behind the instrument; a surface toward the body
 * end reflects further right, the headstock further left. The boxes are placed
 * for that: each lights part of a surface and falls off across the rest.
 */
const SOFTBOXES = [
  { at: [7.5, 9, -6], size: [2.2, 9], color: '#fff1dc', radiance: 3.6 }, // key strip: a streak across the body's shoulder
  { at: [-9, 8, -4.5], size: [1, 6], color: '#ffffff', radiance: 3.2 }, // narrow strip: a streak across the headstock
  { at: [0, 4.5, 11], size: [18, 2], color: '#ffffff', radiance: 2.2 }, // front strip: fret crowns and strings
  { at: [13, 3.5, 3], size: [3, 7], color: '#dcd9ff', radiance: 2.4 }, // cool rim from the body end
];
const WALLS = { daylight: 0.34, night: 0.12 };
const FLOOR = { daylight: 0.2, night: 0.05 };

const glow = (color, radiance) => new MeshBasicMaterial({ color: new Color(color).multiplyScalar(radiance) });

function buildStudioScene(daylight) {
  const scene = new Scene();
  const walls = new Mesh(new BoxGeometry(44, 30, 44), new MeshBasicMaterial({ color: new Color().setScalar(daylight ? WALLS.daylight : WALLS.night), side: BackSide }));
  walls.position.y = 9;
  const floor = new Mesh(new PlaneGeometry(44, 44), glow('#ffffff', daylight ? FLOOR.daylight : FLOOR.night));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -5.9;
  scene.add(walls, floor);
  for (const box of SOFTBOXES) {
    const panel = new Mesh(new PlaneGeometry(...box.size), glow(box.color, box.radiance));
    panel.position.set(...box.at);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  }
  return scene;
}

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {{ daylight: boolean }} options lighter walls for the light theme
 * @returns {import('three').WebGLRenderTarget} assign `.texture` to `scene.environment`; dispose when the stage closes
 */
export function createStudioEnvironment(renderer, { daylight }) {
  const studio = buildStudioScene(daylight);
  const prefilter = new PMREMGenerator(renderer);
  try {
    return prefilter.fromScene(studio, 0.03);
  } finally {
    // The prefiltered map is all that is kept; the panels and the generator's scratch targets go either way.
    prefilter.dispose();
    studio.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}
