/**
 * quality.js — how much of the 3D stage this machine should be asked to draw.
 *
 * Two tiers. `full` adds image-based lighting, lacquer and (later) loaded
 * models and post-processing. `light` is the stage as it was before any of
 * that existed, and is also what software renderers get: they draw every
 * pixel on the CPU, where a clearcoat over half the screen costs real frames.
 *
 * Pure on purpose. The stage reads the GPU's name off a live WebGL context and
 * passes it in, so this can be tested without one.
 */

export const STAGE_TIERS = Object.freeze({ FULL: 'full', LIGHT: 'light' });

/** What a settings control can offer: let the app guess, or force a tier. */
export const STAGE_QUALITIES = Object.freeze(['auto', STAGE_TIERS.FULL, STAGE_TIERS.LIGHT]);

/** A stored choice as one of `STAGE_QUALITIES`; anything unrecognised means automatic. */
export const normalizeStageQuality = value => (STAGE_QUALITIES.includes(value) ? value : 'auto');

// SwiftShader (headless Chrome, blocklisted drivers), Mesa's llvmpipe and
// softpipe, and Windows' Basic Render Driver (remote desktop, no GPU driver).
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const MIN_CORES = 4;
const MIN_MEMORY_GB = 4;
/** A count the browser reported, and it is too small. Unreported counts are null or undefined and never short. */
const short = (count, minimum) => count != null && count < minimum;

/**
 * @param {object} [facts]
 * @param {string} [facts.override] 'full' or 'light' to force a tier; anything else means automatic
 * @param {string} [facts.rendererName] the unmasked WebGL renderer string, '' when the browser hides it
 * @param {number} [facts.cores] navigator.hardwareConcurrency, when the browser reports it
 * @param {number} [facts.deviceMemory] navigator.deviceMemory in GB, when the browser reports it
 * @returns {'full' | 'light'}
 */
/**
 * One sentence for the settings panel: what the 3D detail in use shows, and,
 * when it is Light, why and how to get the downloaded models instead.
 *
 * @param {{ quality: string, tier: string, rendererName?: string }} state the stored choice, the tier it gives here, and the GPU's name
 */
export function explainStageDetail({ quality, tier, rendererName = '' }) {
  if (tier === STAGE_TIERS.FULL) return 'Showing the 3D models of the guitar, violin and cello.';
  if (quality === STAGE_TIERS.LIGHT) return 'Light shows the simpler built-in guitar and the 2D violin and cello. Choose Full or Auto for the 3D models.';
  if (rendererName && SOFTWARE_RENDERER.test(rendererName)) {
    return 'Auto chose Light: this browser is drawing 3D without the graphics card. Turn on graphics acceleration in its settings, or choose Full for the 3D models.';
  }
  return 'Auto chose Light for this device. Choose Full to see the 3D models anyway.';
}

export function pickStageTier({ override, rendererName, cores, deviceMemory } = {}) {
  if (override === STAGE_TIERS.FULL || override === STAGE_TIERS.LIGHT) return override;
  if (rendererName && SOFTWARE_RENDERER.test(rendererName)) return STAGE_TIERS.LIGHT;
  if (short(cores, MIN_CORES) || short(deviceMemory, MIN_MEMORY_GB)) return STAGE_TIERS.LIGHT;
  // A hidden name is usually a privacy setting on a real GPU, but it is also
  // what a locked-down virtual machine reports. Only the core count can tell.
  if (!rendererName && !(cores >= MIN_CORES)) return STAGE_TIERS.LIGHT;
  return STAGE_TIERS.FULL;
}
