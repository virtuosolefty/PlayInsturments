import { BOWED, bowedFinger, bowedMidi, bowedStringName } from './bowed.js';
import { DRUM_BEATS, DRUM_PATH_STAGES, DRUM_STUDIES } from './drums.js';
import { FRETTED, frettedMidi } from './fretted.js';
import { GUITAR_CHORDS, GUITAR_COLORS, GUITAR_PATH_STAGES, GUITAR_SONGS, GUITAR_STUDIES, GUITAR_TUNING, guitarMidi } from './guitar.js';
import { noteName } from './theory.js';

/**
 * One place that knows which instruments exist.
 *
 * Most of the studio only needs to ask "does this instrument bring a kit of
 * its own studies?" — the lessons, library, path and matcher are shared by
 * every kit. The string kits also share the tab; the drums have their own
 * lanes and stage; the piano keeps its own roll and keyboard.
 *
 * A string kit is either `fretted` (guitar, bass: plucked, played in
 * GuitarWorkspace.jsx) or `bowed` (violin, cello: BowedWorkspace.jsx).
 * The pickers list the instruments in this order, families side by side.
 *
 * A kit's `studies` are everything it can put on the stage: its `lessons`,
 * which the path is made of, then its `songs`, the ten easy tunes (or, on the
 * drums, beats) that are open from the start and belong to no stage.
 */
export const INSTRUMENTS = ['piano', 'guitar', 'bass', 'violin', 'cello', 'drums'];

/**
 * What the pickers list: five instruments. The bass is a kind of guitar, so it
 * sits behind the guitar's button, chosen with a small switch beside the
 * studio's controls (`TypeSwitch.jsx`). Underneath it stays an instrument of
 * its own, with its own tuning, lessons, path and saved place, so everything
 * keyed by an instrument id still works.
 */
export const PICKER = ['piano', 'guitar', 'violin', 'cello', 'drums'];
const FAMILIES = Object.freeze({ guitar: Object.freeze(['guitar', 'bass']) });

/** The picker button an instrument sits behind: the bass's is the guitar's. */
export const familyOf = id => Object.keys(FAMILIES).find(family => FAMILIES[family].includes(id)) ?? normalizeInstrument(id);
/** The kinds an instrument's family has, or null when it has only the one. */
export const variantsOf = id => FAMILIES[familyOf(id)] ?? null;
/**
 * The instrument a picker button opens: the kind the player used last, so that
 * someone who plays bass is not sent back to the guitar every time.
 *
 * @param {Record<string, string> | undefined} remembered the saved choice for each family
 * @param {string} family a picker id
 */
export const chooseVariant = (remembered, family) => (FAMILIES[family]?.includes(remembered?.[family]) ? remembered[family] : family);

const INFO = {
  piano: { label: 'Piano', tagline: 'Falling notes & sheet music', detail: 'On-screen keys and MIDI input' },
  guitar: { label: 'Guitar', tagline: 'Tab, fretboard & chords', detail: 'Standard tuning · E A D G B E' },
  bass: { label: 'Bass', tagline: 'Low notes & bass lines', detail: 'Standard tuning · E A D G' },
  violin: { label: 'Violin', tagline: 'Fingerboard, tapes & bowing', detail: 'Tuned in fifths · G D A E' },
  cello: { label: 'Cello', tagline: 'Deep strings & first scales', detail: 'Tuned in fifths · C G D A' },
  drums: { label: 'Drums', tagline: 'Beats, fills & a 3D kit', detail: 'Nine pieces · pads, keys and MIDI' },
};

export const normalizeInstrument = id => (INSTRUMENTS.includes(id) ? id : 'piano');
/** Every instrument but the piano: its pieces are its own authored studies, played in its own workspace. */
export const usesKit = id => normalizeInstrument(id) !== 'piano';
export const instrumentInfo = id => ({ id: normalizeInstrument(id), ...INFO[normalizeInstrument(id)] });

const stringNamer = tuning => s => ({ note: noteName(tuning[s]).replace(/\d/g, ''), number: tuning.length - s });

/**
 * What the fretted kits share. `stage` says what the 3D stage has for the
 * instrument: 'drawn' (the guitar built in code, with its model for the whole
 * view) or 'model' (a downloaded model that is played directly). `wound(s)`
 * is whether string s is a wound one.
 */
const fretted = (id, kit) => ({
  id, label: INFO[id].label, fretted: true, bowed: false, frets: 12, songsLabel: 'Songs you know',
  studyKey: `${id}StudyId`, placeWord: 'fret', stringName: stringNamer(kit.tuning), ...kit,
});

const GUITAR_KIT = fretted('guitar', {
  tuning: GUITAR_TUNING, colors: GUITAR_COLORS, chords: GUITAR_CHORDS,
  lessons: GUITAR_STUDIES, songs: GUITAR_SONGS, studies: [...GUITAR_STUDIES, ...GUITAR_SONGS],
  pathStages: GUITAR_PATH_STAGES, firstLesson: 'guitar-open-strings', midi: guitarMidi,
  finger: (fret, note) => note?.finger ?? (fret === 0 ? 0 : Math.min(4, fret)),
  stage: 'drawn', wound: s => s < 3,
});

const BASS_KIT = fretted('bass', {
  ...FRETTED.bass, midi: (string, fret) => frettedMidi('bass', string, fret),
  // Played on the downloaded bass guitar (stageModels.js), which the guitar's whole view also shows.
  stage: 'model', model: 'guitar-bass', wound: () => true,
});

const BOWED_COLORS = {
  violin: ['#e8b87a', '#d9a0c9', '#8fc2f0', '#b7e39a'],
  cello: ['#e79f7c', '#e8c27a', '#9fc8ee', '#a6dcc0'],
};

/** `model` is the downloaded model the 3D stage plays the instrument on. */
const bowedKit = id => ({
  id, label: INFO[id].label, bowed: true, fretted: false, tuning: BOWED[id].tuning, colors: BOWED_COLORS[id], model: id,
  lessons: BOWED[id].lessons, songs: BOWED[id].songs, songsLabel: 'Songs you know', studies: BOWED[id].studies,
  pathStages: BOWED[id].pathStages, firstLesson: BOWED[id].firstLesson,
  scales: BOWED[id].scales, studyKey: `${id}StudyId`, placeWord: 'finger',
  midi: (string, fret) => bowedMidi(id, string, fret),
  stringName: s => bowedStringName(id, s),
  finger: fret => bowedFinger(id, fret),
});

const DRUM_KIT = {
  id: 'drums', label: 'Drums', drums: true, bowed: false, fretted: false,
  lessons: DRUM_STUDIES, songs: DRUM_BEATS, songsLabel: 'Beats to play along to', studies: [...DRUM_STUDIES, ...DRUM_BEATS],
  pathStages: DRUM_PATH_STAGES, firstLesson: 'drums-meet-the-kit',
  studyKey: 'drumsStudyId', placeWord: 'drum',
};

const STRING_KITS = {
  guitar: GUITAR_KIT, bass: BASS_KIT,
  violin: bowedKit('violin'), cello: bowedKit('cello'),
};
const KITS = { ...STRING_KITS, drums: DRUM_KIT };

export const isStringed = id => normalizeInstrument(id) in STRING_KITS;

/** Everything the shared string studio needs, or null for the piano and the drums. */
export const stringKit = id => STRING_KITS[normalizeInstrument(id)] ?? null;

/** The studies, path and saved-study key of any instrument that has a kit, or null for the piano. */
export const instrumentKit = id => KITS[normalizeInstrument(id)] ?? null;

/** The saved study for an instrument, or its first lesson when none is valid. */
export function studyIdFor(settings, id) {
  const kit = instrumentKit(id);
  if (!kit) return null;
  const saved = settings?.[kit.studyKey];
  return kit.studies.some(s => s.id === saved) ? saved : kit.lessons[0].id;
}

/** Which string instrument a study belongs to, or null for a piano piece. */
export function instrumentForStudy(id) {
  return Object.values(KITS).find(kit => kit.studies.some(s => s.id === id))?.id ?? null;
}
