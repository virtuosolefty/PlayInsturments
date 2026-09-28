/**
 * IndexedDB backup for localStorage data.
 * Stores the same data in IndexedDB as a fallback when localStorage fails or is evicted.
 * Writes happen to both, reads fall back to IndexedDB if localStorage is empty.
 */

const DB_NAME = 'piano-practice-coach-backup';
const STORE_NAME = 'data';
const KEY_NAME = 'data';

let db = null;

async function initDb() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(new Error('IndexedDB open failed'));
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Write data to both localStorage and IndexedDB.
 * If localStorage fails, only write to IndexedDB and warn.
 */
export async function writeToBackup(key, data) {
  try {
    await initDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(data, key);
      tx.oncomplete = () => {
        console.log('[indexedDbBackup] wrote to IndexedDB:', key);
        resolve(true);
      };
      tx.onerror = () => {
        console.warn('[indexedDbBackup] write to IndexedDB failed');
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('[indexedDbBackup] init failed, skipping backup:', err.message);
    return false;
  }
}

/**
 * Read data from IndexedDB.
 * Returns null if not found or IndexedDB unavailable.
 */
export async function readFromBackup(key) {
  try {
    await initDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result !== undefined) {
          console.log('[indexedDbBackup] restored from IndexedDB:', key);
          resolve(request.result);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[indexedDbBackup] read failed:', err.message);
    return null;
  }
}

/**
 * Clear IndexedDB backup.
 */
export async function clearBackup(key) {
  try {
    await initDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('[indexedDbBackup] clear failed:', err.message);
    return false;
  }
}
