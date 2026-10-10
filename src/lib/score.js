/**
 * score.js — turn a MIDI or MusicXML file into one normalised Score object.
 *
 * A Score is the single source of truth for "the correct performance":
 *   {
 *     id, title, source, duration, bpm, timeSignature,
 *     key: { tonic, mode, name, confidence },
 *     notes: [{ id, midi, name, time, duration, velocity, track, hand }]
 *   }
 *
 * `time`/`duration` are seconds at the score's own tempo. Playback rate is
 * applied later by the transport, never baked in here.
 */

import { Midi } from '@tonejs/midi';
import { estimateKey, noteName } from './theory.js';

const HAND_SPLIT = 60; // C4 — fallback when the file has no staff/track hints

/**
 * Identifies a score that is the piece exactly as written. Arrangements fitted
 * to a smaller keyboard carry their own signature instead (see arrange.js), so
 * that practice records for different adaptations never share a personal best.
 */
export const FULL_VARIANT = 'full';

function finalise({ id, title, source, notes, bpm, timeSignature, key = null, fingering = null, meta = {} }) {
  const sorted = [...notes]
    .filter((n) => Number.isFinite(n.midi) && n.midi >= 0 && n.midi <= 127 && n.duration > 0)
    .sort((a, b) => a.time - b.time || a.midi - b.midi)
    .map((n, i) => ({
      ...n,
      id: i,
      name: noteName(n.midi),
      time: Number(n.time.toFixed(5)),
      duration: Number(n.duration.toFixed(5)),
      // Positional: the build emits one entry per note in this exact sorted
      // order and asserts the count matches, so a mismatch cannot ship.
      ...(fingering?.[i] ? { finger: fingering[i] } : {}),
    }));

  const duration = sorted.reduce((max, n) => Math.max(max, n.time + n.duration), 0);

  return {
    id,
    title,
    source,
    notes: sorted,
    duration,
    bpm: bpm || 100,
    timeSignature: timeSignature || [4, 4],
    key: key ?? estimateKey(sorted),
    variant: FULL_VARIANT,
    noteCount: sorted.length,
    range: sorted.length
      ? [Math.min(...sorted.map((n) => n.midi)), Math.max(...sorted.map((n) => n.midi))]
      : [60, 72],
    ...meta,
  };
}

/**
 * Rebuild a score around a new note list, recomputing everything derived from
 * the notes (ids, names, range, key, duration) while keeping the identity and
 * metadata of the original. Used when a score is transposed or refitted to a
 * smaller keyboard.
 */
export function renotate(score, notes) {
  const rebuilt = finalise({
    id: score.id,
    title: score.title,
    source: score.source,
    notes,
    bpm: score.bpm,
    timeSignature: score.timeSignature,
  });
  return { ...score, ...rebuilt };
}

/* ------------------------------------------------------------------- MIDI */

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

/**
 * A key stated outright rather than inferred from the notes.
 *
 * Estimation is good, but it can only work from what sounds: a piece that never
 * plays its own tonic — the opening of Beethoven's Fifth is four notes and no C
 * — gives it almost nothing, and it lands on the wrong answer while honestly
 * reporting low confidence. Where we generate the music we know the key, so we
 * say so; everything imported still gets estimated.
 *
 * This travels in the manifest rather than in the MIDI file: `@tonejs/midi`
 * writes a key-signature event but loses the key name on the way back in, so
 * the round-trip cannot be relied on.
 *
 * @param {[string, string]|null} declared e.g. `['C', 'minor']`
 */
function keyFromName(declared) {
  if (!declared) return null;
  const [root, mode] = declared;
  const name = FLAT_TO_SHARP[root] ?? root;
  const tonic = KEY_NAMES.indexOf(name);
  if (tonic < 0) return null;
  const scale = mode === 'minor' ? 'minor' : 'major';
  return { tonic, mode: scale, name: `${name} ${scale}`, confidence: 1, declared: true };
}

export function scoreFromMidiBuffer(arrayBuffer, { id, title, key = null, timeSignature = null, fingering = null }) {
  const midi = new Midi(arrayBuffer);
  const notes = [];

  // Tracks that contain notes; used to guess hands for 2-track piano files.
  const noteTracks = midi.tracks.filter((t) => t.notes.length > 0);
  const twoStaff = noteTracks.length === 2;

  noteTracks.forEach((track, trackIndex) => {
    for (const n of track.notes) {
      let hand;
      if (twoStaff) hand = trackIndex === 0 ? 'right' : 'left';
      else hand = n.midi >= HAND_SPLIT ? 'right' : 'left';
      notes.push({
        midi: n.midi,
        time: n.time,
        duration: Math.max(n.duration, 0.05),
        velocity: n.velocity ?? 0.8,
        track: trackIndex,
        hand,
      });
    }
  });

  return finalise({
    id,
    title: title || midi.name || id,
    source: 'midi',
    notes,
    bpm: midi.header.tempos[0]?.bpm ?? 100,
    // The manifest is authoritative: the generator clears the header's time
    // signatures, so reading them back always answered 4/4 — and bar numbers
    // in the report and the drills are derived from this.
    timeSignature: timeSignature ?? midi.header.timeSignatures[0]?.timeSignature ?? [4, 4],
    key: keyFromName(key),
    fingering,
  });
}

/* --------------------------------------------------------------- MusicXML */

const STEP_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const num = (el, tag, fallback = 0) => {
  const node = el?.querySelector(tag);
  const v = node ? Number(node.textContent) : NaN;
  return Number.isFinite(v) ? v : fallback;
};

/**
 * Minimal but correct-enough MusicXML reader: handles divisions, chords,
 * backup/forward, ties, multiple staves, and tempo from <sound tempo>.
 * Requires DOMParser (browser). For headless use, pass a preparsed Document.
 */
export function scoreFromMusicXml(xmlText, { id, title }, doc = null) {
  const dom = doc ?? new DOMParser().parseFromString(xmlText, 'application/xml');
  if (dom.querySelector('parsererror')) throw new Error('This MusicXML file could not be parsed.');

  const workTitle =
    dom.querySelector('work > work-title')?.textContent?.trim() ||
    dom.querySelector('movement-title')?.textContent?.trim() ||
    title ||
    id;

  let bpm = Number(dom.querySelector('sound[tempo]')?.getAttribute('tempo')) || 100;
  let timeSignature = [4, 4];
  const firstTime = dom.querySelector('time');
  if (firstTime) timeSignature = [num(firstTime, 'beats', 4), num(firstTime, 'beat-type', 4)];

  const rawNotes = [];
  const parts = [...dom.querySelectorAll('part')];

  parts.forEach((part, partIndex) => {
    let divisions = 1;
    let cursor = 0; // in divisions
    let lastStart = 0;
    const openTies = new Map(); // key -> note object awaiting tie-stop

    for (const measure of part.querySelectorAll('measure')) {
      for (const el of [...measure.children]) {
        if (el.tagName === 'attributes') {
          const d = num(el, 'divisions', 0);
          if (d > 0) divisions = d;
          const t = el.querySelector('time');
          if (t) timeSignature = [num(t, 'beats', 4), num(t, 'beat-type', 4)];
        } else if (el.tagName === 'direction') {
          const tempo = el.querySelector('sound[tempo]')?.getAttribute('tempo');
          if (tempo) bpm = Number(tempo);
        } else if (el.tagName === 'backup') {
          cursor -= num(el, 'duration', 0);
        } else if (el.tagName === 'forward') {
          cursor += num(el, 'duration', 0);
        } else if (el.tagName === 'note') {
          const dur = num(el, 'duration', 0);
          const isChord = !!el.querySelector('chord');
          const isRest = !!el.querySelector('rest');
          const start = isChord ? lastStart : cursor;

          if (!isRest) {
            const pitchEl = el.querySelector('pitch');
            if (pitchEl) {
              const step = pitchEl.querySelector('step')?.textContent ?? 'C';
              const octave = num(pitchEl, 'octave', 4);
              const alter = num(pitchEl, 'alter', 0);
              const midi = (octave + 1) * 12 + STEP_TO_SEMITONE[step] + alter;
              const staff = num(el, 'staff', 1);
              const tieStop = [...el.querySelectorAll('tie')].some((t) => t.getAttribute('type') === 'stop');
              const tieStart = [...el.querySelectorAll('tie')].some((t) => t.getAttribute('type') === 'start');
              const tieKey = `${partIndex}:${staff}:${midi}`;

              if (tieStop && openTies.has(tieKey)) {
                // extend the held note instead of creating a new one
                const held = openTies.get(tieKey);
                held.divDuration += dur;
                if (!tieStart) openTies.delete(tieKey);
              } else {
                const note = {
                  midi,
                  divStart: start,
                  divDuration: dur,
                  velocity: 0.8,
                  track: partIndex,
                  hand: staff === 1 ? 'right' : 'left',
                  divisions,
                };
                rawNotes.push(note);
                if (tieStart) openTies.set(tieKey, note);
              }
            }
          }
          if (!isChord) {
            lastStart = cursor;
            cursor += dur;
          }
        }
      }
    }
  });

  const secondsPerDivision = (divisions) => 60 / bpm / divisions;
  const notes = rawNotes.map((n) => ({
    midi: n.midi,
    time: n.divStart * secondsPerDivision(n.divisions),
    duration: Math.max(n.divDuration * secondsPerDivision(n.divisions), 0.05),
    velocity: n.velocity,
    track: n.track,
    hand: n.hand,
  }));

  return finalise({ id, title: workTitle, source: 'musicxml', notes, bpm, timeSignature });
}

/* ------------------------------------------------------------ entry point */

const extOf = (name) => name.toLowerCase().split('.').pop();

/** Load a Score from a File/Blob picked by the user. */
export async function loadScoreFromFile(file) {
  const ext = extOf(file.name);
  const id = `local:${file.name}`;
  const title = file.name.replace(/\.[^.]+$/, '');

  if (ext === 'mid' || ext === 'midi') {
    return scoreFromMidiBuffer(await file.arrayBuffer(), { id, title });
  }
  if (ext === 'xml' || ext === 'musicxml') {
    return scoreFromMusicXml(await file.text(), { id, title });
  }
  if (ext === 'mxl') {
    throw new Error('Compressed MusicXML (.mxl) is not supported — unzip it and load the .musicxml inside.');
  }
  throw new Error(`Unsupported file type ".${ext}". Use .mid, .midi, .xml or .musicxml.`);
}

/** Load a Score from a URL (used for the bundled library). */
export async function loadScoreFromUrl(url, { id, title, key = null, timeSignature = null, fingering = null }) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const ext = extOf(url);
  if (ext === 'mid' || ext === 'midi') {
    return scoreFromMidiBuffer(await res.arrayBuffer(), { id, title, key, timeSignature, fingering });
  }
  return scoreFromMusicXml(await res.text(), { id, title });
}

/** Slice a score down to a practice section, rebasing times to zero. */
export function sliceScore(score, startTime, endTime) {
  const notes = score.notes
    .filter((n) => n.time >= startTime - 1e-6 && n.time < endTime)
    .map((n) => ({ ...n, time: n.time - startTime }));
  return { ...score, notes, duration: Math.max(0, endTime - startTime), sliced: [startTime, endTime] };
}

/** Group notes that start within `window` seconds of each other into chords. */
export function groupIntoChords(notes, window = 0.045) {
  const groups = [];
  for (const n of notes) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(n.time - last.time) <= window) {
      last.notes.push(n);
      last.time = Math.min(last.time, n.time);
    } else {
      groups.push({ time: n.time, notes: [n] });
    }
  }
  return groups;
}
