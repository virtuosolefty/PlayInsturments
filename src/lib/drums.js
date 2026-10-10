/**
 * Drums: a nine-piece beginner kit.
 *
 * A drum has no pitch, so each piece is identified by its General MIDI
 * percussion note. That is what a pad controller or an electronic kit sends,
 * and it lets the matcher, the grading and the history stay shared with the
 * other instruments: a drum lesson is a score whose "notes" are hits.
 */

/** Top of the kit first: the order of the lanes and of the on-screen pads. */
export const DRUM_PIECES = Object.freeze([
  { id: 'crash', label: 'Crash cymbal', short: 'Crash', midi: 49, key: 'c', limb: 'hand' },
  { id: 'ride', label: 'Ride cymbal', short: 'Ride', midi: 51, key: 'r', limb: 'hand' },
  { id: 'hihat-open', label: 'Open hi-hat', short: 'Open hat', midi: 46, key: 'o', limb: 'hand' },
  { id: 'hihat', label: 'Hi-hat', short: 'Hi-hat', midi: 42, key: 'h', limb: 'hand' },
  { id: 'tom-high', label: 'High tom', short: 'High tom', midi: 50, key: 't', limb: 'hand' },
  { id: 'tom-mid', label: 'Mid tom', short: 'Mid tom', midi: 47, key: 'm', limb: 'hand' },
  { id: 'snare', label: 'Snare drum', short: 'Snare', midi: 38, key: 's', limb: 'hand' },
  { id: 'tom-floor', label: 'Floor tom', short: 'Floor tom', midi: 43, key: 'f', limb: 'hand' },
  { id: 'kick', label: 'Kick drum', short: 'Kick', midi: 36, key: 'k', limb: 'foot' },
].map(Object.freeze));

const BY_ID = new Map(DRUM_PIECES.map(piece => [piece.id, piece]));

// The other General MIDI notes that mean the same drum, so a controller set
// to a neighbouring note still plays the lesson.
const ALIASES = { 35: 'kick', 37: 'snare', 40: 'snare', 41: 'tom-floor', 44: 'hihat', 45: 'tom-mid', 48: 'tom-high', 52: 'crash', 55: 'crash', 57: 'crash', 53: 'ride', 59: 'ride' };
const BY_MIDI = new Map([
  ...Object.entries(ALIASES).map(([midi, id]) => [Number(midi), BY_ID.get(id)]),
  ...DRUM_PIECES.map(piece => [piece.midi, piece]),
]);

/** The computer key that plays each piece: its initial, so the kit can be read off the keyboard. */
export const DRUM_KEYS = Object.freeze(Object.fromEntries(DRUM_PIECES.map(piece => [piece.key, piece.midi])));

/** @returns the piece called `id`, or null */
export const drumPiece = id => BY_ID.get(id) ?? null;

/** @returns the piece a MIDI note plays, or null when the note is not part of the kit */
export const drumForMidi = midi => (Number.isInteger(midi) ? BY_MIDI.get(midi) ?? null : null);

/** @returns the note the lessons are written in for whatever note a controller sent, or null */
export const canonicalDrumMidi = midi => drumForMidi(midi)?.midi ?? null;

/** What to hit and how, for the lesson guide. */
export function drumInstruction(note) {
  const piece = drumForMidi(note?.midi);
  return piece ? `${piece.short} · press ${piece.key.toUpperCase()}` : 'Preparing your first note…';
}

/** The pieces a score uses, top of the kit first; the whole kit when there is no score to go by. */
export function drumLanes(score) {
  const used = new Set((score?.notes ?? []).map(note => drumForMidi(note.midi)?.id));
  const lanes = DRUM_PIECES.filter(piece => used.has(piece.id));
  return lanes.length ? lanes : DRUM_PIECES;
}

// Every study names the whole kit, so a hit on a drum the study does not use is still called by its name.
const NOTE_NAMES = Object.freeze(Object.fromEntries(DRUM_PIECES.map(piece => [piece.midi, piece.short])));

const STEPS_PER_BAR = 16;

/**
 * A study written the way drummers write a beat: one row a drum, sixteen steps
 * a bar, `x` for a hit. Rows of the same bar are played together.
 *
 * @param {string} id
 * @param {string} title
 * @param {string} description
 * @param {Array<Record<string, string>>} bars one object a bar, piece id to its sixteen steps
 * @param {{ bpm?: number }} [options]
 */
function study(id, title, description, bars, { bpm = 76 } = {}) {
  const step = 60 / bpm / 4;
  const hits = bars.flatMap((rows, bar) => Object.entries(rows).flatMap(([pieceId, steps]) => {
    const piece = BY_ID.get(pieceId);
    if (!piece || steps.length !== STEPS_PER_BAR) throw new Error(`Drum study ${id}: bar ${bar + 1} has a bad row for "${pieceId}"`);
    return [...steps].flatMap((mark, index) => (mark === 'x' ? [{ piece, time: (bar * STEPS_PER_BAR + index) * step }] : []));
  }));
  const order = new Map(DRUM_PIECES.map((piece, index) => [piece.id, index]));
  const notes = [...hits]
    .sort((a, b) => a.time - b.time || order.get(a.piece.id) - order.get(b.piece.id))
    .map(({ piece, time }, index) => ({
      id: index, midi: piece.midi, name: piece.short, piece: piece.id,
      // A hit has no length; this is only how long its tile is drawn.
      time, duration: Math.min(0.18, step * 0.9), velocity: 0.8,
      hand: piece.limb === 'foot' ? 'left' : 'right', track: 0,
    }));
  const midis = notes.map(note => note.midi);
  return {
    id: `drums-${id}`, title, description, composer: 'Drum essentials',
    source: 'authored-drums-study', instrument: 'drums', variant: 'drums:kit',
    bpm, timeSignature: [4, 4], key: { tonic: 0, mode: 'major', name: 'drum kit', confidence: 1 },
    notes, noteCount: notes.length, duration: bars.length * STEPS_PER_BAR * step,
    range: [Math.min(...midis), Math.max(...midis)],
    noteNames: NOTE_NAMES,
  };
}

const beats = 'x---x---x---x---';
const eighths = 'x-x-x-x-x-x-x-x-';

export const DRUM_STUDIES = [
  study('meet-the-kit', 'Meet the kit',
    'One hit on each drum, from the kick up to the cymbals. Tap a drum, or press the letter it starts with.',
    [
      { kick: 'x---------------', snare: '--------x-------' },
      { hihat: 'x---------------', 'tom-high': '--------x-------' },
      { 'tom-mid': 'x---------------', 'tom-floor': '--------x-------' },
      { crash: 'x---------------', ride: '--------x-------' },
    ], { bpm: 72 }),
  study('steady-kick', 'Four on the floor',
    'The kick on every beat: one, two, three, four. Keep the gaps the same length.',
    [{ kick: beats }, { kick: beats }], { bpm: 80 }),
  study('backbeat', 'Kick and snare',
    'Kick on one and three, snare on two and four. This back-and-forth is the backbeat under most songs.',
    [{ kick: 'x-------x-------', snare: '----x-------x---' }, { kick: 'x-------x-------', snare: '----x-------x---' }], { bpm: 80 }),
  study('eighth-hats', 'Hi-hat eighths',
    'Two hi-hat hits to every beat: one-and, two-and. Count out loud and let the hand stay loose.',
    [{ hihat: eighths }, { hihat: eighths }], { bpm: 76 }),
  study('first-beat', 'Your first beat',
    'All three together: hi-hat eighths, kick on one and three, snare on two and four. Two keys or two fingers at once.',
    [
      { hihat: eighths, kick: 'x-------x-------', snare: '----x-------x---' },
      { hihat: eighths, kick: 'x-------x-------', snare: '----x-------x---' },
    ], { bpm: 72 }),
  study('beat-and-fill', 'Beat and fill',
    'One bar of your beat, then a fill around the drums, and a crash to land on.',
    [
      { hihat: eighths, kick: 'x-------x-------', snare: '----x-------x---' },
      { snare: 'x-x-------------', 'tom-high': '----x-x---------', 'tom-mid': '--------x-x-----', 'tom-floor': '------------x-x-' },
      { crash: 'x---------------', kick: 'x---------------' },
    ], { bpm: 72 }),
];

const backbeat = '----x-------x---';

/** A beat to play along to: one bar written out, played twice. */
const groove = (id, title, description, rows, bpm, difficulty = 1) => ({ ...study(id, title, description, [rows, rows], { bpm }), difficulty, easy: true });

/**
 * Ten beats from the music people already listen to, easiest first, open from
 * the start. They are the kit's answer to the other instruments' easy songs
 * (easySongs.js) and are not part of the path.
 */
export const DRUM_BEATS = [
  groove('stomp-stomp-clap', 'Stomp, stomp, clap', 'Two kicks and a snare, then a gap. A whole crowd can play this one.',
    { kick: 'x-x-----x-x-----', snare: backbeat }, 80),
  groove('train-beat', 'Train beat', 'The snare keeps the eighths rolling like wheels on a track, with the kick on one and three.',
    { snare: eighths, kick: 'x-------x-------' }, 92),
  groove('four-on-the-snare', 'Four on the snare', 'The snare on every beat, the way an old soul record drives its chorus.',
    { hihat: eighths, kick: 'x-------x-------', snare: beats }, 100),
  groove('pop-rock', 'Pop rock', 'The beat under a thousand songs: the kick comes back early, just before the second snare.',
    { hihat: eighths, kick: 'x-------x-x-----', snare: backbeat }, 84),
  groove('half-time', 'Half-time', 'The same hi-hat, but the snare waits for beat three, so everything feels half as fast.',
    { hihat: eighths, kick: 'x---------x-----', snare: '--------x-------' }, 88),
  groove('one-drop', 'One drop', 'Reggae leaves beat one empty: the kick and the snare land together on three.',
    { hihat: eighths, kick: '--------x-------', snare: '--------x-------' }, 76),
  groove('tom-groove', 'Tom groove', 'The floor tom takes the hi-hat’s place, for a darker, heavier beat.',
    { 'tom-floor': 'x-x---x-x-x---x-', kick: 'x-------x-------', snare: backbeat }, 84, 2),
  groove('disco', 'Disco', 'Kick on every beat, snare on two and four, and the hi-hat opening in between.',
    { kick: beats, snare: backbeat, 'hihat-open': '--x---x---x---x-' }, 104, 2),
  groove('boom-bap', 'Boom bap', 'A hip-hop pattern: the kick leans in just ahead of beat three.',
    { hihat: eighths, kick: 'x-----x---x-----', snare: backbeat }, 86, 2),
  groove('surf-beat', 'Surf beat', 'Two quick snares on beat two and one on four, with the ride cymbal keeping time.',
    { ride: eighths, kick: 'x-------x-------', snare: '----x-x-----x---' }, 100, 2),
];

export const DRUM_PATH_STAGES = [
  { id: 'kit', name: 'Meet the kit', goal: 'Find every drum and cymbal and hear what it does.', exercises: ['drums-meet-the-kit'] },
  { id: 'pulse', name: 'Keep a steady pulse', goal: 'Hold an even beat with the kick, then answer it with the snare.', exercises: ['drums-steady-kick', 'drums-backbeat'] },
  { id: 'hands', name: 'Add the hi-hat', goal: 'Play eighth notes on the hi-hat, then put all three drums together.', exercises: ['drums-eighth-hats', 'drums-first-beat'] },
  { id: 'fill', name: 'Play a beat and a fill', goal: 'Leave the beat for a bar, go round the drums, and land on the crash.', exercises: ['drums-beat-and-fill'] },
];
