/**
 * storage.js — persistent practice history (localStorage + IndexedDB backup).
 *
 * Two things are remembered per song:
 *   sessions[]   — one record per run, so you can see progress over time
 *   troubleMap   — cumulative miss/wrong counts keyed by score position, so the
 *                  piano roll can pre-highlight the bars you always fumble.
 *
 * Data is written to localStorage first, then backed up to IndexedDB. If localStorage
 * is evicted or unavailable, reads fall back to IndexedDB.
 */

import { recordDay } from './streaks.js';
import { writeToBackup, readFromBackup, clearBackup } from './indexedDbBackup.js';

const KEY = 'piano-practice-coach:v1';
const MAX_SESSIONS_PER_SONG = 60;

/**
 * Sessions recorded before arrangements existed have no `variant` field. They
 * were all runs of the piece as written, so that is what they are treated as —
 * old history stays visible instead of silently vanishing behind a filter.
 */
const DEFAULT_VARIANT = 'full';
const variantOfSession = (session) => session.variant ?? DEFAULT_VARIANT;

const emptyDb = () => ({ version: 1, songs: {}, settings: {}, days: {} });

/**
 * Read from localStorage, fall back to IndexedDB if needed.
 * Note: This is sync for localStorage compatibility, but IndexedDB fallback happens
 * lazily (only on next write if localStorage is truly gone).
 */
function read() {
  if (typeof localStorage === 'undefined') return emptyDb();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw);
    return parsed?.songs ? parsed : emptyDb();
  } catch {
    console.warn('[storage] failed to parse localStorage, returning empty');
    return emptyDb();
  }
}

/**
 * Read from IndexedDB as fallback (async).
 * Called when localStorage appears to be unavailable.
 */
export async function readFromBackupAsync() {
  const backed = await readFromBackup(KEY);
  if (backed?.songs) return backed;
  return emptyDb();
}

/**
 * Listeners for a failed write.
 *
 * This used to be a `console.warn` and nothing else, which is the worst
 * possible handling for it: when the quota fills — or Safari evicts the origin,
 * or the tab is in private mode — practice silently stops being recorded. The
 * player sees their streak reset and their Path forget a passed exercise, and
 * has no way to know the app is the thing that broke. Anything that fails this
 * expensively has to say so.
 */
const failureListeners = new Set();

export function onStorageFailure(fn) {
  failureListeners.add(fn);
  return () => failureListeners.delete(fn);
}

function write(db) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    const songCount = Object.keys(db.songs || {}).length;
    const sessionCount = Object.values(db.songs || {}).reduce((sum, s) => sum + (s.sessions?.length ?? 0), 0);
    console.log('[storage] persisted data:', { songs: songCount, sessions: sessionCount });

    // Backup to IndexedDB (async, non-blocking)
    writeToBackup(KEY, db).catch((err) => {
      console.warn('[storage] IndexedDB backup failed:', err.message);
    });

    // Notify listeners (same-tab components) that storage was written
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage-write'));
    }
    return true;
  } catch (err) {
    const quota = err?.name === 'QuotaExceededError' || err?.code === 22;
    console.warn('[storage] could not persist practice history:', err.message);
    // Still try IndexedDB if localStorage fails
    writeToBackup(KEY, db).catch(() => {
      // Already logged in writeToBackup
    });
    for (const fn of failureListeners) fn({ quota, message: err.message });
    return false;
  }
}

const songEntry = (db, songId) => {
  if (!db.songs[songId]) db.songs[songId] = { sessions: [], troubleMap: {}, totalRuns: 0 };
  return db.songs[songId];
};

/**
 * @param {string} songId
 * @param {object} summary from PracticeSession.summary
 * @param {Array} troubleSpots from PracticeSession.troubleSpots
 * @param {object} context {mode, rate, sectionLabel}
 */
export function recordSession(songId, summary, troubleSpots, context = {}) {
  console.log('[recordSession] recording session for', songId, 'score:', summary.score);
  const db = read();
  const entry = songEntry(db, songId);

  entry.totalRuns += 1;
  entry.sessions.push({
    at: new Date().toISOString(),
    score: Number(summary.score.toFixed(4)),
    noteAccuracy: Number(summary.noteAccuracy.toFixed(4)),
    timingAccuracy: summary.timingAccuracy === null ? null : Number(summary.timingAccuracy.toFixed(4)),
    dynamicsAccuracy: Number((summary.dynamicsAccuracy ?? 0).toFixed(4)),
    velocitySpread: summary.velocitySpread ?? 0,
    hit: summary.hit,
    missed: summary.missed,
    wrongNotes: summary.wrongNotes,
    total: summary.total,
    meanAbsDeviationMs: summary.meanAbsDeviationMs,
    meanSignedDeviationMs: summary.meanSignedDeviationMs,
    wrongNoteKinds: summary.wrongNoteKinds,
    mode: context.mode ?? 'timed',
    rate: context.rate ?? 1,
    /* Whether the touch was corrected for this controller when the run was
       scored. Nothing reads it yet, and that is the point: dynamics is graded
       differently before and after a calibration, and a year from now the only
       way to tell which runs are comparable will be that this was written
       down at the time. */
    calibrated: !!context.calibrated,
    section: context.sectionLabel ?? 'full',
    /** Which arrangement was practised — see FULL_VARIANT in score.js. */
    variant: context.variant ?? DEFAULT_VARIANT,
    coverage: Number((context.coverage ?? 1).toFixed(3)),
    stars: context.stars ?? null,
    overall: context.overall ?? null,
  });
  if (entry.sessions.length > MAX_SESSIONS_PER_SONG) {
    entry.sessions = entry.sessions.slice(-MAX_SESSIONS_PER_SONG);
  }

  for (const spot of troubleSpots) {
    const bucket = spot.time.toFixed(2);
    const cur = entry.troubleMap[bucket] ?? { time: spot.time, missed: 0, wrong: 0, late: 0, names: [] };
    cur.missed += spot.missed;
    cur.wrong += spot.wrong;
    cur.late += spot.late;
    // Which run this spot last went wrong on. Without it the trouble map only
    // ever grows and can never show a place you have since fixed — see
    // troubleDecay in path.js.
    cur.lastRun = entry.totalRuns;
    if (spot.name && !cur.names.includes(spot.name)) cur.names = [...cur.names, spot.name].slice(0, 6);
    entry.troubleMap[bucket] = cur;
  }

  const writeSuccess = write(db);
  console.log('[recordSession] write', writeSuccess ? 'succeeded' : 'FAILED');
  return entry;
}

/* ------------------------------------------------------------ best streak */

const comboKey = (songId, variant) => `${songId}::${variant ?? DEFAULT_VARIANT}`;

/**
 * The longest run of clean notes you have ever managed on this arrangement.
 *
 * The engine has always tracked `combo.best` for the current run and nothing
 * has ever read it — written every session, stored nowhere, shown never. Kept
 * here so the roll can tell you the moment you pass it, while you are still
 * playing, which is the only time that news is worth anything. A record you
 * find out about on a results screen is a statistic.
 *
 * Keyed by arrangement like the ghost and the star badges: a streak on a
 * folded 25-key version is not a streak on the full piece.
 *
 * @returns {number} the record after this run
 */
export function recordCombo({ songId, variant }, best) {
  if (!Number.isFinite(best) || best <= 0) return getBestCombo(songId, variant);
  const db = read();
  db.combos = db.combos ?? {};
  const key = comboKey(songId, variant);
  if ((db.combos[key] ?? 0) >= best) return db.combos[key];
  db.combos[key] = best;
  write(db);
  return best;
}

/** @returns {number} 0 when there is no record yet */
export function getBestCombo(songId, variant) {
  return read().combos?.[comboKey(songId, variant)] ?? 0;
}

/* ----------------------------------------------------------------- the ghost */

const ghostKey = (songId, variant) => `${songId}::${variant ?? DEFAULT_VARIANT}`;

/**
 * Where your best run struck each note, so the roll can race you against
 * yourself. Only the best run of an arrangement is kept — a per-note record of
 * every attempt would be tens of thousands of numbers in localStorage, and
 * every one of them except the best is something you have already beaten.
 *
 * @param {object} context {songId, variant, overall}
 * @param {Array} targets from PracticeSession — each carries `id` and `deltaMs`
 */
export function recordGhost({ songId, variant, overall }, targets = []) {
  if (!Number.isFinite(overall)) return null;
  const db = read();
  db.ghosts = db.ghosts ?? {};
  const key = ghostKey(songId, variant);
  const existing = db.ghosts[key];
  if (existing && existing.overall >= overall) return existing;

  const deltas = {};
  for (const target of targets) {
    if (Number.isFinite(target.deltaMs)) deltas[target.id] = Math.round(target.deltaMs);
  }
  // A run with no measured timing — wait mode — has nothing to race against.
  if (!Object.keys(deltas).length) return existing ?? null;

  db.ghosts[key] = { overall, at: new Date().toISOString(), deltas };
  write(db);
  return db.ghosts[key];
}

/** @returns {{overall: number, deltas: object}|null} */
export function getGhost(songId, variant) {
  return read().ghosts?.[ghostKey(songId, variant)] ?? null;
}

/**
 * @param {string} songId
 * @param {object} [options]
 * @param {string} [options.variant] when given, only runs of that arrangement
 *   are returned — comparing a folded 25-key run against a full 88-key one
 *   would make "your best" meaningless.
 */
export function getSongHistory(songId, { variant } = {}) {
  const db = read();
  const entry = db.songs[songId] ?? { sessions: [], troubleMap: {}, totalRuns: 0 };
  if (!variant) return entry;
  const sessions = entry.sessions.filter((s) => variantOfSession(s) === variant);
  return { ...entry, sessions, totalRuns: sessions.length };
}

/**
 * The best run's stars *and the speed it was played at*.
 *
 * Five stars at 60% is not five stars. `path.js` has always known that — it
 * gates passing and mastery on `atTempo` — but the badges next to a piece in
 * the library took a plain maximum over every run, so a slow, clean attempt
 * put five gold stars beside Moonlight Sonata and the app quietly disagreed
 * with itself about the only thing it exists to be honest about.
 *
 * The rating is not withheld: slowing a piece down until it is clean is the
 * method this app teaches, and scoring it zero would punish following the
 * advice. It is qualified instead — the stars stand, with the tempo attached.
 *
 * Ties on stars break towards the faster run, so the badge always reports the
 * most impressive true version of what happened.
 */
const bestOf = (sessions) => {
  let best = null;
  for (const s of sessions) {
    if (!Number.isFinite(s.stars)) continue; // only complete runs carry stars
    const rate = Number.isFinite(s.rate) ? s.rate : 1;
    if (!best || s.stars > best.stars || (s.stars === best.stars && rate > best.rate)) {
      best = { stars: s.stars, rate };
    }
  }
  return best ?? { stars: 0, rate: 1 };
};

/** @returns {{stars: number, rate: number}} */
export function getBestStars(songId, variant) {
  return bestOf(getSongHistory(songId, { variant }).sessions);
}

/**
 * Every song's record in one read. The Path walks fifteen exercises at once,
 * and calling getSongHistory for each would re-parse the whole database
 * fifteen times per render.
 */
export function getAllSongEntries() {
  return read().songs ?? {};
}

/**
 * Best stars for every piece at once, so the library renders in one pass.
 *
 * Two maps rather than one of pairs: `stars` is read as a bare number by the
 * suggestion engine, the progress list and the path, and none of those care
 * how fast it was played. Only the badges that sit beside a title do, and they
 * take `rates` alongside.
 *
 * @returns {{stars: Object<string, number>, rates: Object<string, number>}}
 */
export function getAllBestStars(variant) {
  const db = read();
  const stars = {};
  const rates = {};
  for (const [songId, entry] of Object.entries(db.songs)) {
    const best = bestOf(
      entry.sessions.filter((s) => !variant || variantOfSession(s) === variant),
    );
    if (best.stars > 0) {
      stars[songId] = best.stars;
      rates[songId] = best.rate;
    }
  }
  return { stars, rates };
}

/** Trouble spots sorted worst-first, for the "practice these" list. */
export function getTroubleSpots(songId, limit = 8) {
  const { troubleMap } = getSongHistory(songId);
  return Object.values(troubleMap)
    .map((t) => ({ ...t, weight: t.missed * 2 + t.wrong * 1.5 + t.late }))
    .filter((t) => t.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/** Dense array of trouble weights for canvas overlay lookups. */
export function getTroubleLookup(songId) {
  const { troubleMap } = getSongHistory(songId);
  return Object.values(troubleMap).map((t) => ({
    time: t.time,
    weight: t.missed * 2 + t.wrong * 1.5 + t.late,
  }));
}

export function clearSongHistory(songId) {
  const db = read();
  delete db.songs[songId];
  write(db);
}

export function clearAllHistory() {
  write(emptyDb());
  clearBackup(KEY).catch(() => {
    // Already logged in clearBackup
  });
}

/* --------------------------------------------------------- practice habit */

export function getPracticeDays() {
  return read().days ?? {};
}

/**
 * Fold a finished run into the daily ledger.
 * @param {object} run `{ seconds, complete, stars }`
 */
export function recordPracticeDay(run) {
  const db = read();
  db.days = recordDay(db.days ?? {}, run);
  write(db);
  return db.days;
}

export function loadSettings(defaults = {}) {
  const db = read();
  return { ...defaults, ...db.settings };
}

export function saveSettings(patch) {
  const db = read();
  db.settings = { ...db.settings, ...patch };
  write(db);
  return db.settings;
}

/* ------------------------------------------------------------ backup */

/**
 * Everything the app knows about you lives in one localStorage key, and a
 * browser is entitled to evict that without asking. Months of streaks, a
 * Path worked through exercise by exercise, and benchmark runs going back to
 * your first week are all in there — and until now `exportHistory` existed but
 * nothing ever called it, so there was no way to get any of it out.
 */
export const BACKUP_FORMAT = 'piano-practice-coach/backup';
export const BACKUP_VERSION = 1;

export function exportHistory() {
  return JSON.stringify(
    { format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: read() },
    null,
    2,
  );
}

/** Counts for the confirmation prompt, so nobody overwrites blind. */
export function describeBackup(data) {
  const songs = Object.keys(data?.songs ?? {}).length;
  const sessions = Object.values(data?.songs ?? {}).reduce(
    (n, entry) => n + (entry?.sessions?.length ?? 0),
    0,
  );
  return { songs, sessions, days: Object.keys(data?.days ?? {}).length };
}

/**
 * Read a backup file. Never trusts it: a file picker is a system boundary, and
 * the thing on the other side of it may be any JSON at all.
 *
 * @returns {{ok: true, data: object, summary: object} | {ok: false, error: string}}
 */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  // A bare database is accepted as well as a wrapped backup — the export
  // format changed once, and refusing an older file would be refusing exactly
  // the backup somebody made because they were worried about losing it.
  const data = parsed?.format === BACKUP_FORMAT ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || typeof data.songs !== 'object' || data.songs === null) {
    return { ok: false, error: 'That does not look like a practice backup.' };
  }
  if (Array.isArray(data.songs)) {
    return { ok: false, error: 'That backup is malformed — its song record is a list, not a map.' };
  }

  // Keep only the shapes the app reads, so a hand-edited or truncated file
  // cannot put something unreadable where a session array should be.
  const songs = {};
  for (const [songId, entry] of Object.entries(data.songs)) {
    if (!entry || typeof entry !== 'object') continue;
    songs[songId] = {
      sessions: Array.isArray(entry.sessions) ? entry.sessions.filter((s) => s && typeof s === 'object') : [],
      troubleMap: entry.troubleMap && typeof entry.troubleMap === 'object' ? entry.troubleMap : {},
      totalRuns: Number.isFinite(entry.totalRuns) ? entry.totalRuns : 0,
    };
  }

  const clean = {
    version: 1,
    songs,
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
    days: data.days && typeof data.days === 'object' && !Array.isArray(data.days) ? data.days : {},
    ghosts: data.ghosts && typeof data.ghosts === 'object' ? data.ghosts : {},
  };
  return { ok: true, data: clean, summary: describeBackup(clean) };
}

/**
 * Replace everything with a parsed backup. Replace rather than merge: merging
 * two histories would invent a practice record that never happened, and the
 * streak is supposed to be evidence.
 *
 * @returns {{ok: boolean, error?: string}}
 */
export function importHistory(text) {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  return write(parsed.data)
    ? { ok: true, summary: parsed.summary }
    : { ok: false, error: 'The backup was readable but could not be saved — storage may be full.' };
}
