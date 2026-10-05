/**
 * useAppData — centralized application data state.
 *
 * Replaces scattered useState calls, useEffect subscriptions, and direct storage
 * access. Single hook for all practice history, settings, and practice days.
 *
 * Returns:
 *   - history: song-specific history (filtered by variant)
 *   - settings: user preferences
 *   - days: practice streak calendar
 *   - functions: recordSession, saveSettings, etc.
 */

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, migrateSettings } from '../lib/settings.js';
import {
  getSongHistory,
  getAllBestStars,
  getTroubleSpots,
  getAllSongEntries,
  getPracticeDays,
  getBestCombo,
  getGhost,
  recordSession as storeSession,
  recordCombo as storeCombo,
  recordGhost as storeGhost,
  recordPracticeDay as storePracticeDay,
  clearSongHistory as storeClearSong,
  clearAllHistory as storeClearAll,
  loadSettings,
  saveSettings,
  exportHistory,
  importHistory,
  parseBackup,
  describeBackup,
  onStorageFailure,
} from '../lib/storage.js';

export function useAppData(initialSettings = {}) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...migrateSettings(loadSettings()),
    ...initialSettings,
    loop: null,
  }));
  const [days, setDays] = useState(() => getPracticeDays());
  const [storageFailure, setStorageFailure] = useState(null);

  const refresh = useCallback(() => {
    setRefreshVersion((v) => v + 1);
    setDays(getPracticeDays());
  }, []);

  // Force load data on mount to ensure fresh state
  useEffect(refresh, [refresh]);

  // Every successful write announces itself; re-read history and the day ledger.
  useEffect(() => {
    window.addEventListener('storage-write', refresh);
    return () => window.removeEventListener('storage-write', refresh);
  }, [refresh]);

  // Subscribe before the first write so blocked storage is reported on entry.
  useEffect(() => onStorageFailure(setStorageFailure), []);

  // Persist settings whenever they change
  useEffect(() => {
    const { loop, ...persistable } = settings;
    saveSettings(persistable);
  }, [settings]);

  const recordSession = useCallback((songId, summary, troubleSpots, context) => {
    storeSession(songId, summary, troubleSpots, context);
    refresh();
  }, [refresh]);

  const clearSongHistory = useCallback((songId) => {
    storeClearSong(songId);
    refresh();
  }, [refresh]);

  const clearAllHistory = useCallback(() => {
    storeClearAll();
    refresh();
  }, [refresh]);

  const importData = useCallback((text) => {
    const result = importHistory(text);
    if (result.ok) refresh();
    return result;
  }, [refresh]);

  return {
    // State
    settings,
    setSettings,
    days,
    refreshVersion,
    storageFailure,

    // Data fetching
    getSongHistory: (songId, options) => getSongHistory(songId, options),
    getTroubleSpots: (songId, limit) => getTroubleSpots(songId, limit),
    getAllBestStars: (variant) => getAllBestStars(variant),
    getAllSongEntries: () => getAllSongEntries(),
    getBestCombo,
    getGhost,

    // Recording
    recordSession,
    recordCombo: storeCombo,
    recordGhost: storeGhost,
    recordPracticeDay: storePracticeDay,

    // History management
    clearSongHistory,
    clearAllHistory,

    // Backup/import
    exportData: exportHistory,
    importData,
    parseBackup,
    describeBackup,

    // Storage events
    onStorageFailure,
  };
}
