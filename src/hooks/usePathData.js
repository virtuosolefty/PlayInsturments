import { useMemo } from 'react';
import {
  badgeState,
  benchmarkTrend,
  BENCHMARK_ID,
  dailyProgress,
  dailySet,
  pathState,
  troubleDecay,
} from '../lib/path.js';
import { dayKey, streakFrom } from '../lib/streaks.js';
import { getAllSongEntries } from '../lib/storage.js';
import { stringKit } from '../lib/instruments.js';

/**
 * Everything the Path tab shows, derived in one pass.
 *
 * One read of the database per change, walked fifteen times in memory: calling
 * getSongHistory per exercise would re-parse the whole store fifteen times on
 * every render of the drawer.
 *
 * @param {Array} library the bundled manifest, for exercise titles
 * @param {object} days the practice ledger
 * @param {number} version bumped whenever history is written, to re-derive
 */
export function usePathData(library, days, version, instrument = 'piano') {
  return useMemo(() => {
    const entries = getAllSongEntries();
    const sessionsFor = (id) => entries[id]?.sessions ?? [];
    const kit = stringKit(instrument);
    const guitar = !!kit;
    const state = pathState(sessionsFor, kit ? kit.pathStages : undefined);
    const today = dayKey();
    const streak = streakFrom(days, today);
    const benchEntry = entries[BENCHMARK_ID];

    return {
      state,
      streak,
      set: dailySet(state, { dayKey: today, library: kit ? kit.studies : library }),
      progress: dailyProgress(days, today),
      benchmark: guitar ? null : benchmarkTrend(benchEntry?.sessions ?? []),
      decay: guitar ? null : troubleDecay(benchEntry?.troubleMap ?? {}, benchEntry?.totalRuns ?? 0),
      badges: guitar ? [] : badgeState({ state, runsOf: sessionsFor, streak }),
    };
  }, [library, days, version, instrument]);
}
