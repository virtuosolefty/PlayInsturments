/**
 * Browser-side accessors used from Playwright's `page.evaluate`.
 *
 * Every export here runs *inside* the page, not in Node — Playwright ships a
 * function to the browser by serializing its own source text, so each one
 * must be fully self-contained (only browser globals, no calls to sibling
 * helpers in this file) or the call silently breaks with a
 * "not defined" ReferenceError inside the page.
 */

export const STORAGE_KEY = 'piano-practice-coach:v1';
export const IDB_NAME = 'piano-practice-coach';
export const IDB_BACKUP_STORE = 'backup';

/** Parsed contents of the localStorage practice database, or null. */
export function readLocalStorageDb() {
  const raw = window.localStorage.getItem('piano-practice-coach:v1');
  return raw ? JSON.parse(raw) : null;
}

/**
 * `{ version, stores }` for whatever the shared `piano-practice-coach`
 * IndexedDB schema currently is. Opened without a version argument so this
 * is a pure read — it never triggers `onupgradeneeded` itself.
 */
export async function readIndexedDbSchema() {
  const db = await new Promise((resolve, reject) => {
    const req = window.indexedDB.open('piano-practice-coach');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const stores = Array.from(db.objectStoreNames);
  db.close();
  return { version: db.version, stores };
}

/**
 * The practice-history backup written by `indexedDbBackup.js`, keyed the
 * same as the localStorage entry. Returns `{ ok:false, reason }` instead of
 * throwing when the `backup` object store does not exist, so a caller can
 * assert on the failure mode directly.
 */
export async function readIndexedDbBackup() {
  const db = await new Promise((resolve, reject) => {
    const req = window.indexedDB.open('piano-practice-coach');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!db.objectStoreNames.contains('backup')) {
    db.close();
    return { ok: false, reason: 'no "backup" object store', data: null };
  }
  try {
    const data = await new Promise((resolve, reject) => {
      const tx = db.transaction('backup', 'readonly');
      const req = tx.objectStore('backup').get('piano-practice-coach:v1');
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return { ok: true, reason: null, data };
  } catch (err) {
    db.close();
    return { ok: false, reason: err.message, data: null };
  }
}

/** Clears both persistence layers so a test starts from a blank slate. */
export async function clearAllPersistence() {
  window.localStorage.clear();
  await new Promise((resolve) => {
    const req = window.indexedDB.deleteDatabase('piano-practice-coach');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve(); // best-effort — a fresh context may not have one yet
    req.onblocked = () => resolve();
  });
}
