import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { publicLibrary } from './public-library.mjs';

const song = (id, extra = {}) => ({ id, title: id, url: `/songs/${id}.mid`, ...extra });

describe('the library the public site carries', () => {
  it('keeps every song that is not marked local only, in its order', () => {
    const { kept } = publicLibrary([song('twinkle'), song('film', { localOnly: true }), song('ode')]);
    expect(kept.map(entry => entry.id)).toEqual(['twinkle', 'ode']);
  });

  it('names every file of a song it leaves out, each keyboard size included, once', () => {
    const film = song('film', { localOnly: true, url: '/songs/film-88key.mid', keyboardVersions: { '25-key': '/songs/film-25key.mid', '88-key': '/songs/film-88key.mid' } });
    const { removed, files } = publicLibrary([song('twinkle'), film]);
    expect(removed.map(entry => entry.id)).toEqual(['film']);
    expect(files.sort()).toEqual(['film-25key.mid', 'film-88key.mid']);
  });

  it('never names a file outside the songs folder', () => {
    const odd = [song('a', { localOnly: true, url: '/songs/../index.html' }), song('b', { localOnly: true, url: 'https://example.com/x.mid' }), song('c', { localOnly: true, url: '/songs/sub/dir.mid' })];
    expect(publicLibrary(odd).files).toEqual([]);
  });

  it('leaves a library with nothing local only exactly as it was', () => {
    const manifest = [song('twinkle'), song('ode')];
    expect(publicLibrary(manifest)).toEqual({ kept: manifest, removed: [], files: [] });
  });
});

/** These read the files the site is built from. */
describe('the files the public site is built from', () => {
  const manifest = JSON.parse(readFileSync('public/songs/songs.json', 'utf8'));
  const app = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

  it('mark every piece of film music local only, since it is still under copyright', () => {
    const film = manifest.filter(entry => entry.tags?.includes('film-music'));
    expect(film.length).toBeGreaterThan(0);
    for (const entry of film) expect(entry.localOnly, entry.id).toBe(true);
  });

  it('mark nothing else local only', () => {
    for (const entry of manifest.filter(each => each.localOnly)) expect(entry.tags, entry.id).toContain('film-music');
  });

  it('have every file a local-only song names, so the build can find it to leave out', () => {
    for (const file of publicLibrary(manifest).files) expect(existsSync(`public/songs/${file}`), file).toBe(true);
  });

  it('install from wherever the site is served: no address in the app manifest starts at the root', () => {
    // GitHub Pages serves the site from /PlayInsturments/, where "/" is somebody else's page.
    for (const address of [app.start_url, app.scope, ...app.icons.map(icon => icon.src)]) expect(address.startsWith('/'), address).toBe(false);
  });

  it('offer the icons a phone asks for, and each is a file', () => {
    const sizes = app.icons.filter(icon => icon.type === 'image/png').map(icon => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(app.icons.some(icon => icon.purpose === 'maskable')).toBe(true);
    for (const icon of app.icons) expect(existsSync(`public/${icon.src}`), icon.src).toBe(true);
  });
});
