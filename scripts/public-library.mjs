/**
 * public-library.mjs — which bundled songs the public site may carry.
 *
 * A song marked `localOnly` in public/songs/songs.json is there for whoever
 * runs the app on their own computer: film music still under copyright, which
 * a public site would need a licence to publish. The public build
 * (build-public-pages.mjs) leaves those songs and their files out; a local
 * `npm run dev` or `npm run build` keeps them.
 */

const SONGS = '/songs/';

/** The file a song address names inside the songs folder, or null when it names anything else. */
function songFile(url) {
  if (typeof url !== 'string' || !url.startsWith(SONGS)) return null;
  const file = url.slice(SONGS.length);
  return /^[\w.-]+$/.test(file) && !file.includes('..') ? file : null;
}

/**
 * @param {Array<{ id: string, url: string, localOnly?: boolean, keyboardVersions?: Record<string, string> }>} manifest songs.json
 * @returns {{ kept: Array, removed: Array, files: string[] }} `files` are the removed songs' files, by name within the songs folder
 */
export function publicLibrary(manifest) {
  const kept = manifest.filter(entry => !entry.localOnly);
  const removed = manifest.filter(entry => entry.localOnly);
  const files = [...new Set(removed.flatMap(entry => [entry.url, ...Object.values(entry.keyboardVersions ?? {})]).map(songFile).filter(Boolean))];
  return { kept, removed, files };
}
