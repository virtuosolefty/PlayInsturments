/**
 * webgl.js — can this machine draw with a GPU?
 *
 * Its own module so App can ask without importing Three.js. If the answer is
 * no, the heavy chunk is never fetched at all: a `lazy()` import that is never
 * rendered is never downloaded, and this is what decides whether it is.
 */

/**
 * Asked once, ever.
 *
 * The answer cannot change while the page is open, and asking costs a real
 * WebGL context — `getContext` on a throwaway canvas is not a free probe. The
 * first version of this was called straight from App's render body, so every
 * re-render made another context, and App re-renders about twelve times a
 * second while a run is playing. Browsers allow roughly sixteen contexts per
 * page before they start killing live ones, which they duly did, underneath the
 * renderer that was drawing the music.
 */
import { pickStageTier } from './stage/quality.js';

let answer = null, gpuName = '';
// What browsers answer when they keep the real name behind the debug extension.
const PLACEHOLDER_NAME = /^(webkit webgl|mozilla)$/i;

/**
 * The GPU's own name from a live context, or '' when the browser will not say.
 *
 * Asks the plain way first: Firefox answers that properly and logs a
 * deprecation warning whenever the debug extension is used instead.
 */
export function rendererNameOf(gl) {
  const plain = String(gl.getParameter(gl.RENDERER) ?? '');
  if (plain && !PLACEHOLDER_NAME.test(plain)) return plain;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '') : '';
}

/** @returns {boolean} true when a WebGL context can actually be created. */
export function webglAvailable() {
  if (answer !== null) return answer;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    gpuName = gl ? rendererNameOf(gl) : '';
    // Hand the probe's own context back rather than leaving it to the garbage
    // collector, which has no urgency about a resource this scarce.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    answer = !!gl;
  } catch {
    // Some privacy modes throw rather than returning null.
    answer = false;
  }
  return answer;
}

/** The GPU's name, as the same single probe saw it; '' when there is no GPU or the browser will not say. */
export function webglRendererName() {
  return webglAvailable() ? gpuName : '';
}

/**
 * The detail a 3D stage would be drawn at here, for a stage that must choose
 * what to show before it creates one: the violin and cello show a 3D model
 * only at full detail, and their 2D fingerboard otherwise.
 *
 * @param {'auto'|'full'|'light'} quality the stored choice
 */
export function stageTierHere(quality) {
  return pickStageTier({
    override: quality,
    rendererName: quality === 'auto' ? webglRendererName() : '',
    cores: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
    deviceMemory: typeof navigator === 'undefined' ? undefined : navigator.deviceMemory,
  });
}

/** Test seam: forget the cached answer. */
export function resetWebglProbe() {
  answer = null;
  gpuName = '';
}
