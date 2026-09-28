/**
 * passages.js — turning a list of mistakes into something you can practise.
 *
 * "You missed twelve notes" is a fact. "Bars 5–6 are where it falls apart" is
 * an instruction. Individual mistakes are collapsed onto bar numbers, adjacent
 * bars are merged into a single passage, and the result is ranked so the worst
 * stretch is the one offered first.
 */

import { NOTE_STATUS } from './matcher.js';

const MAX_NAMES = 4;

export const secondsPerBar = (score) =>
  (60 / (score?.bpm || 100)) * (score?.timeSignature?.[0] ?? 4);

/** 1-based bar number, the way a musician would count it. */
export const barAt = (time, score) => Math.floor(time / secondsPerBar(score)) + 1;

/**
 * @param {object} session a finished PracticeSession
 * @param {object} score the score it was run against
 * @param {object} [options]
 * @param {number} [options.limit] how many passages to return
 * @returns {Array<{
 *   fromBar: number, toBar: number, fromTime: number, toTime: number,
 *   missed: number, wrong: number, late: number, count: number,
 *   names: string[], label: string, detail: string
 * }>}
 */
export function groupProblems(session, score, { limit = 4 } = {}) {
  if (!session || !score) return [];

  const byBar = new Map();
  const bump = (time, field, name) => {
    if (!Number.isFinite(time) || time < 0) return;
    const bar = barAt(time, score);
    const entry = byBar.get(bar) ?? { bar, missed: 0, wrong: 0, late: 0, names: [], firstTime: time };
    byBar.set(bar, {
      ...entry,
      [field]: entry[field] + 1,
      firstTime: Math.min(entry.firstTime, time),
      names: name && !entry.names.includes(name) ? [...entry.names, name] : entry.names,
    });
  };

  const perfectMs = (session.options?.perfectWindow ?? 0.09) * 1000;
  for (const target of session.targets ?? []) {
    if (target.status === NOTE_STATUS.MISSED) bump(target.time, 'missed', target.name);
    else if (target.status === NOTE_STATUS.HIT && Math.abs(target.deltaMs ?? 0) > perfectMs) {
      bump(target.time, 'late', target.name);
    }
  }
  for (const event of session.events ?? []) {
    if (event.type === 'wrong') bump(event.gateTime ?? event.songTime, 'wrong', event.name);
  }

  const bars = [...byBar.values()].sort((a, b) => a.bar - b.bar);
  return mergeAdjacent(bars, score)
    .sort((a, b) => b.count - a.count || a.fromTime - b.fromTime)
    .slice(0, limit);
}

/** Consecutive troubled bars are one passage; a gap starts a new one. */
function mergeAdjacent(bars, score) {
  const barSec = secondsPerBar(score);
  const passages = [];

  for (const bar of bars) {
    const last = passages[passages.length - 1];
    if (last && bar.bar === last.toBar + 1) {
      passages[passages.length - 1] = {
        ...last,
        toBar: bar.bar,
        toTime: bar.bar * barSec,
        missed: last.missed + bar.missed,
        wrong: last.wrong + bar.wrong,
        late: last.late + bar.late,
        names: [...new Set([...last.names, ...bar.names])],
      };
      continue;
    }
    passages.push({
      fromBar: bar.bar,
      toBar: bar.bar,
      fromTime: (bar.bar - 1) * barSec,
      toTime: bar.bar * barSec,
      missed: bar.missed,
      wrong: bar.wrong,
      late: bar.late,
      names: bar.names,
    });
  }

  return passages.map((p) => ({
    ...p,
    count: p.missed + p.wrong + p.late,
    label: labelFor(p),
    detail: detailFor(p),
  }));
}

function labelFor(p) {
  return p.fromBar === p.toBar ? `Bar ${p.fromBar}` : `Bars ${p.fromBar}–${p.toBar}`;
}

function detailFor(p) {
  const parts = [];
  if (p.missed) parts.push(`${p.missed} missed`);
  if (p.wrong) parts.push(`${p.wrong} wrong`);
  if (p.late) parts.push(`${p.late} off-time`);
  const names = p.names.slice(0, MAX_NAMES).join(', ');
  const more = p.names.length > MAX_NAMES ? '…' : '';
  return names ? `${parts.join(' · ')} — ${names}${more}` : parts.join(' · ');
}
