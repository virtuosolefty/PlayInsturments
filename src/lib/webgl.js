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
let answer = null;

/** @returns {boolean} true when a WebGL context can actually be created. */
export function webglAvailable() {
  if (answer !== null) return answer;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
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

/** Test seam: forget the cached answer. */
export function resetWebglProbe() {
  answer = null;
}
