/**
 * vault.js — the things too big for localStorage.
 *
 * Practice history is a few kilobytes of numbers and lives happily in
 * localStorage. Score files and piano samples are not: a single sampled note is
 * larger than the whole settings blob, and localStorage is both size-capped and
 * string-only. So anything binary goes in IndexedDB.
 *
 * Two stores:
 *   scores  — the raw bytes of files you imported, so "Your files" survives a
 *             reload. They used to live in React state and vanished on refresh.
 *   samples — one sample pack, so the browser can play your own piano offline.
 */

const DB_NAME = 'piano-practice-coach';
const DB_VERSION = 1;
const SCORES = 'scores';
const SAMPLES = 'samples';
const PACK_KEY = 'pack';

/**
 * Whether there is a vault to talk to at all.
 *
 * Exported because "no IndexedDB in this browser" and "the store failed to
 * open" want different things said about them: the first has lost nothing,
 * because there was never anywhere to keep it.
 */
export const supported = () => typeof indexedDB !== 'undefined';

function open() {
  return new Promise((resolve, reject) => {
    if (!supported()) {
      reject(new Error('This browser has no IndexedDB, so imports cannot be remembered.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SCORES)) db.createObjectStore(SCORES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SAMPLES)) db.createObjectStore(SAMPLES);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run(storeName, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = fn(tx.objectStore(storeName));
        tx.oncomplete = () => {
          db.close();
          resolve(request?.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/* --------------------------------------------------------------- score files */

/**
 * @param {object} entry `{ id, name, kind: 'midi'|'musicxml', data: ArrayBuffer|string }`
 */
export const putScoreFile = (entry) =>
  run(SCORES, 'readwrite', (store) => store.put({ ...entry, addedAt: Date.now() }));

export const listScoreFiles = () => run(SCORES, 'readonly', (store) => store.getAll());

export const deleteScoreFile = (id) => run(SCORES, 'readwrite', (store) => store.delete(id));

/* -------------------------------------------------------------- sample packs */

/**
 * @param {object} pack `{ name, files: { 'C4': Blob, ... } }`
 */
export const putSamplePack = (pack) =>
  run(SAMPLES, 'readwrite', (store) => store.put(pack, PACK_KEY));

export const getSamplePack = () => run(SAMPLES, 'readonly', (store) => store.get(PACK_KEY));

export const clearSamplePack = () => run(SAMPLES, 'readwrite', (store) => store.delete(PACK_KEY));

/* ------------------------------------------------------------------ helpers */

const PITCH = /^([A-Ga-g])\s*([#sb]?)\s*(-?\d)/;
const STEP = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * Work out which note a sample file records from its name: `C4.wav`, `Ds3.mp3`,
 * `F#2.ogg`, `Bb1.wav`, `A0.flac`. This is how sampled libraries are almost
 * always laid out, so it saves anyone hand-writing a manifest.
 *
 * @returns {{midi: number, name: string}|null}
 */
export function pitchFromFilename(filename) {
  const stem = filename.replace(/\.[^.]+$/, '').replace(/^.*[/\\]/, '');
  const match = PITCH.exec(stem);
  if (!match) return null;

  const [, letter, accidental, octave] = match;
  const base = STEP[letter.toLowerCase()];
  if (base === undefined) return null;

  // `s` is the filename-safe sharp that sample libraries use because `#` is
  // awkward in paths.
  const alter = accidental === '#' || accidental === 's' ? 1 : accidental === 'b' ? -1 : 0;
  const midi = (Number(octave) + 1) * 12 + base + alter;
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) return null;

  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return { midi, name: `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}` };
}

/** Build a Tone.Sampler url map from files whose names say their pitch. */
export function packFromFiles(files, name = 'Imported pack') {
  const mapped = {};
  const skipped = [];
  for (const file of files) {
    const pitch = pitchFromFilename(file.name);
    if (!pitch) {
      skipped.push(file.name);
      continue;
    }
    mapped[pitch.name] = file;
  }
  return { name, files: mapped, skipped, count: Object.keys(mapped).length };
}
