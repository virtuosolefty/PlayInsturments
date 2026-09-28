/**
 * StorageService — centralized persistence layer.
 *
 * Encapsulates all storage operations (localStorage + IndexedDB). Components never
 * touch storage directly—they go through this service. This enables:
 * - Single source of truth for all persistence logic
 * - Easy swapping of backends (localStorage ↔ IndexedDB ↔ cloud)
 * - Testability (mock this service, not the browser APIs)
 * - Consistent error handling
 */

import {
  recordSession as storageRecordSession,
  recordCombo,
  recordGhost,
  recordPracticeDay,
  getSongHistory,
  getTroubleSpots,
  getBestCombo,
  getGhost,
  getAllBestStars,
  getAllSongEntries,
  getPracticeDays,
  clearSongHistory,
  clearAllHistory,
  loadSettings,
  saveSettings,
  exportHistory,
  importHistory,
  parseBackup,
  describeBackup,
  onStorageFailure,
} from './storage.js';

class StorageService {
  constructor() {
    this.listeners = new Set();
    // Listen for storage writes and notify
    if (typeof window !== 'undefined') {
      window.addEventListener('storage-write', () => this.notifyListeners());
    }
  }

  /**
   * Register a callback to be called whenever storage changes.
   * Useful for components that need to re-fetch data.
   */
  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    for (const cb of this.listeners) {
      try {
        cb();
      } catch (err) {
        console.error('[StorageService] listener error:', err);
      }
    }
  }

  /* ================================================================ Sessions */

  recordSession(songId, summary, troubleSpots, context) {
    console.log('[StorageService.recordSession]', songId);
    return storageRecordSession(songId, summary, troubleSpots, context);
  }

  getSongHistory(songId, options) {
    return getSongHistory(songId, options);
  }

  getTroubleSpots(songId, limit) {
    return getTroubleSpots(songId, limit);
  }

  clearSongHistory(songId) {
    console.log('[StorageService.clearSongHistory]', songId);
    clearSongHistory(songId);
    this.notifyListeners();
  }

  /* ================================================================= Streaks */

  recordCombo(context, best) {
    return recordCombo(context, best);
  }

  getBestCombo(songId, variant) {
    return getBestCombo(songId, variant);
  }

  recordGhost(context, targets) {
    return recordGhost(context, targets);
  }

  getGhost(songId, variant) {
    return getGhost(songId, variant);
  }

  recordPracticeDay(run) {
    recordPracticeDay(run);
    this.notifyListeners();
  }

  getPracticeDays() {
    return getPracticeDays();
  }

  /* ================================================================= Library */

  getAllSongEntries() {
    return getAllSongEntries();
  }

  getAllBestStars(variant) {
    return getAllBestStars(variant);
  }

  /* ================================================================ Settings */

  loadSettings(defaults) {
    return loadSettings(defaults);
  }

  saveSettings(patch) {
    console.log('[StorageService.saveSettings]');
    return saveSettings(patch);
  }

  /* ================================================================= Backup */

  exportHistory() {
    return exportHistory();
  }

  importHistory(text) {
    const result = importHistory(text);
    if (result.ok) {
      this.notifyListeners();
    }
    return result;
  }

  parseBackup(text) {
    return parseBackup(text);
  }

  describeBackup(data) {
    return describeBackup(data);
  }

  /* ================================================================== Errors */

  onStorageFailure(callback) {
    return onStorageFailure(callback);
  }

  clearAllHistory() {
    console.log('[StorageService.clearAllHistory]');
    clearAllHistory();
    this.notifyListeners();
  }
}

// Singleton instance
let instance = null;

export function getStorageService() {
  if (!instance) {
    instance = new StorageService();
  }
  return instance;
}

export default StorageService;
