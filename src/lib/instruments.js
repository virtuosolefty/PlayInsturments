import { BOWED, bowedFinger, bowedMidi, bowedStringName } from './bowed.js';
import { GUITAR_COLORS, GUITAR_PATH_STAGES, GUITAR_STUDIES, GUITAR_TUNING, guitarMidi } from './guitar.js';
import { noteName } from './theory.js';

/**
 * One place that knows which instruments exist.
 *
 * Most of the studio only needs to ask "is this a string instrument, and what
 * are its strings?" — the tab, lessons, library and matcher are shared. The
 * piano keeps its own roll and keyboard.
 */
export const INSTRUMENTS = ['piano', 'guitar', 'violin', 'cello'];

const INFO = {
  piano: { label: 'Piano', tagline: 'Falling notes & sheet music', detail: 'On-screen keys and MIDI input' },
  guitar: { label: 'Guitar', tagline: 'Tab, fretboard & chords', detail: 'Standard tuning · E A D G B E' },
  violin: { label: 'Violin', tagline: 'Fingerboard, tapes & bowing', detail: 'Tuned in fifths · G D A E' },
  cello: { label: 'Cello', tagline: 'Deep strings & first scales', detail: 'Tuned in fifths · C G D A' },
};

export const normalizeInstrument = id => (INSTRUMENTS.includes(id) ? id : 'piano');
export const isStringed = id => normalizeInstrument(id) !== 'piano';
export const instrumentInfo = id => ({ id: normalizeInstrument(id), ...INFO[normalizeInstrument(id)] });

const GUITAR_KIT = {
  id: 'guitar', label: 'Guitar', bowed: false, tuning: GUITAR_TUNING, colors: GUITAR_COLORS,
  studies: GUITAR_STUDIES, pathStages: GUITAR_PATH_STAGES, firstLesson: 'guitar-open-strings',
  studyKey: 'guitarStudyId', placeWord: 'fret', midi: guitarMidi,
  stringName: s => ({ note: noteName(GUITAR_TUNING[s]).replace(/\d/g, ''), number: 6 - s }),
  finger: (fret, note) => note?.finger ?? (fret === 0 ? 0 : Math.min(4, fret)),
};

const bowedKit = id => ({
  id, label: INFO[id].label, bowed: true, tuning: BOWED[id].tuning,
  colors: id === 'violin' ? ['#e8b87a', '#d9a0c9', '#8fc2f0', '#b7e39a'] : ['#e79f7c', '#e8c27a', '#9fc8ee', '#a6dcc0'],
  studies: BOWED[id].studies, pathStages: BOWED[id].pathStages, firstLesson: BOWED[id].firstLesson,
  scales: BOWED[id].scales, studyKey: `${id}StudyId`, placeWord: 'finger',
  midi: (string, fret) => bowedMidi(id, string, fret),
  stringName: s => bowedStringName(id, s),
  finger: fret => bowedFinger(id, fret),
});

const KITS = { guitar: GUITAR_KIT, violin: bowedKit('violin'), cello: bowedKit('cello') };

/** Everything the shared string studio needs, or null for the piano. */
export const stringKit = id => KITS[normalizeInstrument(id)] ?? null;

/** The saved study for an instrument, or its first lesson when none is valid. */
export function studyIdFor(settings, id) {
  const kit = stringKit(id);
  if (!kit) return null;
  const saved = settings?.[kit.studyKey];
  return kit.studies.some(s => s.id === saved) ? saved : kit.studies[0].id;
}

/** Which string instrument a study belongs to, or null for a piano piece. */
export function instrumentForStudy(id) {
  return Object.values(KITS).find(kit => kit.studies.some(s => s.id === id))?.id ?? null;
}
