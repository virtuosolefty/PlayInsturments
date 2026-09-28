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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStorageService } from '../lib/StorageService.js';
import { DEFAULT_SETTINGS, migrateSettings } from '../lib/settings.js';
import { getSongHistory, getAllBestStars, getTroubleSpots, getAllSongEntries, getPracticeDays } from '../lib/storage.js';

export function useAppData(initialSettings = {}) {
  const storage = getStorageService();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...migrateSettings(storage.loadSettings()),
    ...initialSettings,
    loop: null,
  }));
  const [days, setDays] = useState(() => getPracticeDays());
  const [storageFailure, setStorageFailure] = useState(null);

  const unsubscribeRef = useRef(null);

  // Force load data on mount to ensure fresh state
  useEffect(() => {
    console.log('[useAppData.mount] loading data from storage');
    setDays(getPracticeDays());
    setRefreshVersion((v) => v + 1);
  }, []);

  // Subscribe to storage changes
  useEffect(() => {
    unsubscribeRef.current = storage.onChange(() => {
      console.log('[useAppData] storage changed, refreshing');
      setRefreshVersion((v) => v + 1);
      setDays(getPracticeDays());
    });
    return () => unsubscribeRef.current?.();
  }, [storage]);

  // Subscribe before the first write so blocked storage is reported on entry.
  useEffect(() => storage.onStorageFailure(setStorageFailure), [storage]);

  // Persist settings whenever they change
  useEffect(() => {
    const { loop, ...persistable } = settings;
    storage.saveSettings(persistable);
  }, [settings, storage]);

  // Memoized functions
  const recordSession = useCallback(
    (songId, summary, troubleSpots, context) => {
      console.log('[useAppData.recordSession]', songId);
      storage.recordSession(songId, summary, troubleSpots, context);
      setRefreshVersion((v) => v + 1);
      setDays(getPracticeDays());
    },
    [storage],
  );

  const getSongData = useCallback(
    (songId, variant) => {
      const history = getSongHistory(songId, { variant });
      const troubleSpots = getTroubleSpots(songId);
      const bestStars = getAllBestStars(variant);
      return { history, troubleSpots, bestStars };
    },
    [],
  );

  const clearSongHistory = useCallback(
    (songId) => {
      storage.clearSongHistory(songId);
      setRefreshVersion((v) => v + 1);
    },
    [storage],
  );

  const clearAllHistory = useCallback(() => {
    storage.clearAllHistory();
    setRefreshVersion((v) => v + 1);
  }, [storage]);

  const recordCombo = useCallback(
    (context, best) => storage.recordCombo(context, best),
    [storage],
  );

  const recordGhost = useCallback(
    (context, targets) => storage.recordGhost(context, targets),
    [storage],
  );

  const recordPracticeDay = useCallback(
    (run) => storage.recordPracticeDay(run),
    [storage],
  );

  const exportData = useCallback(() => storage.exportHistory(), [storage]);

  const importData = useCallback(
    (text) => {
      const result = storage.importHistory(text);
      if (result.ok) {
        setRefreshVersion((v) => v + 1);
        setDays(getPracticeDays());
      }
      return result;
    },
    [storage],
  );

  return {
    // State
    settings,
    setSettings,
    days,
    refreshVersion,
    storageFailure,

    // Data fetching
    getSongData,
    getSongHistory: (songId, options) => getSongHistory(songId, options),
    getTroubleSpots: (songId, limit) => getTroubleSpots(songId, limit),
    getAllBestStars: (variant) => getAllBestStars(variant),
    getAllSongEntries: () => getAllSongEntries(),

    // Recording
    recordSession,
    recordCombo,
    recordGhost,
    recordPracticeDay,

    // History management
    clearSongHistory,
    clearAllHistory,

    // Backup/import
    exportData,
    importData,
    parseBackup: (text) => storage.parseBackup(text),
    describeBackup: (data) => storage.describeBackup(data),

    // Storage events
    onStorageFailure: (cb) => storage.onStorageFailure(cb),
  };
}
