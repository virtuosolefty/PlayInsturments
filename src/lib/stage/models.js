/**
 * models.js — the downloaded instruments, loaded when a stage needs one.
 *
 * Each instrument is two files in public/models/, written by
 * scripts/models/prepare.mjs: <name>.glb, the model in stage units without
 * its strings, and <name>.json, where its playable parts are (see that script).
 *
 * The bytes are fetched once per page and kept, so rebuilding a stage (a new
 * theme, a new detail level) parses them again rather than downloading them
 * again: a parsed model belongs to the renderer that drew it, and is disposed
 * with it. The loader itself is imported only when a model is first wanted.
 */

const fetched = new Map(); // base + name → Promise<{ fit, glb } | null>

const isPoint = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

/**
 * What is wrong with a model's measurements, or null when the stage can use
 * them: a stage that framed and played a model by broken numbers would fail
 * after its drawn instrument had already gone, so the file is refused instead.
 */
export function fitProblem(fit) {
  // A model that is only shown (stageModels.js) has nothing to play, so it needs only a box to frame.
  if (fit?.showcase) return boundsProblem(fit);
  if (!Array.isArray(fit?.strings) || !fit.strings.length) return 'have no strings';
  if (!fit.strings.every(s => isPoint(s?.nut) && isPoint(s?.bridge) && s.bridge[0] > s.nut[0])) return 'have a string without both ends';
  if (!Number.isFinite(fit.nutX) || !(fit.scaleLength > 0)) return 'have no nut or scale length';
  return boundsProblem(fit);
}

function boundsProblem(fit) {
  const { min, max } = fit.bounds ?? {};
  return !isPoint(min) || !isPoint(max) || ![0, 1, 2].every(k => max[k] > min[k]) ? 'have no bounds' : null;
}

/**
 * How long a model may take to arrive. Past this a stalled download is
 * abandoned, so the stage shows what it can draw instead of waiting for ever.
 */
const DOWNLOAD_LIMIT_MS = 20000;

/**
 * The model's files, or null when they are missing, unreadable or too slow.
 * Only files that arrived are kept: after a failure the next stage to open
 * tries again.
 */
function fetchFiles(name, base, timeoutMs) {
  const key = `${base}${name}`;
  if (!fetched.has(key)) {
    const files = (async () => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const get = file => fetch(`${base}${name}.${file}`, { signal: abort.signal });
        const [fitResponse, glbResponse] = await Promise.all([get('json'), get('glb')]);
        if (!fitResponse.ok || !glbResponse.ok) throw new Error(`the server answered ${fitResponse.ok ? glbResponse.status : fitResponse.status}`);
        const fit = await fitResponse.json();
        const problem = fitProblem(fit);
        if (problem) throw new Error(`its measurements ${problem}`);
        return { fit, glb: await glbResponse.arrayBuffer() };
      } catch (error) {
        const why = abort.signal.aborted ? `it took too long (over ${Math.round(timeoutMs / 1000)} s)` : error.message;
        console.warn(`[stage] the ${name} model could not be loaded, keeping the drawn instrument:`, why);
        fetched.delete(key);
        return null;
      } finally {
        clearTimeout(timer);
      }
    })();
    fetched.set(key, files);
  }
  return fetched.get(key);
}

/**
 * The instrument's model and measurements, ready to add to a scene, or null
 * when there is no model to use: the stage then keeps the instrument it draws.
 *
 * @param {string} name a model's id (stageModels.js): 'guitar', 'violin', 'cello', or one that is only shown
 * @param {{ base?: string, timeoutMs?: number }} [options] where the files are served from, and how long they may take
 * @returns {Promise<{ scene: import('three').Group, fit: object } | null>}
 */
export async function loadInstrumentModel(name, { base = `${import.meta.env?.BASE_URL ?? '/'}models/`, timeoutMs = DOWNLOAD_LIMIT_MS } = {}) {
  const files = await fetchFiles(name, base, timeoutMs);
  if (!files) return null;
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(files.glb.slice(0), '');
    tagParts(gltf.scene);
    return { scene: gltf.scene, fit: files.fit };
  } catch (error) {
    console.warn(`[stage] the ${name} model could not be read, keeping the drawn instrument:`, error.message);
    return null;
  }
}

/**
 * Marks everything in a loaded model with the part it belongs to, as
 * `userData.part`: the prepared file has one node per part ('top', 'neck',
 * 'stringEnds', ...) under a root node named after the instrument.
 */
export function tagParts(scene) {
  const root = scene.children.length === 1 ? scene.children[0] : scene;
  for (const part of root.children) part.traverse(object => { object.userData.part = part.name; });
}

/** Every geometry, material and texture under `root`, so a stage can hand them back when it closes. */
export function collectResources(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}
