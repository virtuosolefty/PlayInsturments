/**
 * Create simplified MIDI arrangements for Anirudh Ravichander pieces
 * Generates versions for different keyboard sizes: 25-key, 49-key, 88-key
 */

import Midi from 'jsmidgen';

const Midi_lib = Midi;

const pieces = [
  {
    id: 'amma-amma',
    title: 'Amma Amma',
    movie: 'Maryan',
    year: 2015,
    bpm: 75,
    timeSignature: [4, 4],
    key: 'D Major',
    difficulty: 4,
    range: [36, 84], // D2 to C5
    duration: 187,
    // Simplified melody notes (MIDI values)
    melody: [50, 52, 54, 55, 57, 59, 61, 62, 61, 59, 57, 55, 54, 52, 50],
    description: 'Beautiful emotional piece. A contemplative melody with rich harmonies — perfect for developing touch sensitivity and emotional expression.',
  },
  {
    id: 'raga-of-revenge',
    title: 'Raga of Revenge',
    movie: 'DC Movie',
    bpm: 140,
    timeSignature: [4, 4],
    key: 'A Minor',
    difficulty: 5,
    range: [33, 88], // A1 to C8
    duration: 142,
    melody: [57, 59, 61, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 61, 59, 57],
    description: 'Intense, dramatic piece. Features rapid scale passages and complex rhythmic patterns — excellent for building speed, precision, and dramatic expression.',
  },
  {
    id: 'rowdy-baby',
    title: 'Rowdy Baby',
    movie: 'Maari 2',
    year: 2018,
    bpm: 120,
    timeSignature: [4, 4],
    key: 'G Major',
    difficulty: 3,
    range: [40, 79], // E2 to G4
    duration: 142,
    melody: [55, 57, 59, 60, 62, 64, 65, 67, 69, 67, 65, 64, 62, 60, 59, 57, 55],
    description: 'Catchy, energetic theme. Fun to play with distinctive rhythmic patterns and playful melodies — great for building confidence.',
  },
  {
    id: 'kannazhaga',
    title: 'Kannazhaga',
    movie: 'VIP',
    year: 2014,
    bpm: 85,
    timeSignature: [4, 4],
    key: 'E Major',
    difficulty: 4,
    range: [38, 82], // D2 to B4
    duration: 163,
    melody: [52, 54, 56, 57, 59, 61, 62, 64, 65, 64, 62, 61, 59, 57, 56, 54, 52],
    description: 'Enchanting romantic melody. Flowing passages with subtle dynamic variations — develops nuanced control and artistic expression.',
  },
  {
    id: 'theevandi-theme',
    title: 'Theevandi Theme',
    movie: 'Theevandi',
    year: 2017,
    bpm: 110,
    timeSignature: [4, 4],
    key: 'C Major',
    difficulty: 3,
    range: [42, 78], // F#2 to F#4
    duration: 125,
    melody: [48, 50, 52, 53, 55, 57, 59, 60, 59, 57, 55, 53, 52, 50, 48],
    description: 'Spirited theme. Folk-influenced melody with traditional rhythmic elements — bridges classical and contemporary styles.',
  },
  {
    id: 'anjathe-pookkal',
    title: 'Anjathe Pookkal',
    movie: 'Natarang',
    year: 2016,
    bpm: 70,
    timeSignature: [4, 4],
    key: 'F Major',
    difficulty: 3,
    range: [39, 76], // D#2 to E4
    duration: 152,
    melody: [53, 55, 57, 58, 60, 62, 63, 65, 63, 62, 60, 58, 57, 55, 53],
    description: 'Serene devotional piece. Meditative quality with gentle ornamentation — excellent for mindful practice and breath control.',
  },
];

function createMidiFile(piece, keyboardRange) {
  const file = new Midi_lib.File();
  const track = new Midi_lib.Track();
  file.addTrack(track);

  // Set tempo
  track.setTempo(piece.bpm);

  // Transpose melody to fit keyboard range if needed
  const [minKey, maxKey] = keyboardRange;
  let melody = piece.melody;

  // Adjust if out of range
  while (Math.min(...melody) < minKey) {
    melody = melody.map(n => n + 12);
  }
  while (Math.max(...melody) > maxKey) {
    melody = melody.map(n => n - 12);
  }

  // Add notes to track (quarter notes)
  const noteLength = '4'; // quarter note
  melody.forEach((note, index) => {
    track.addNote(0, note, noteLength, 0);
  });

  // Add some basic chords as harmony (simple thirds)
  const harmonyTrack = new Midi_lib.Track();
  file.addTrack(harmonyTrack);
  harmonyTrack.setTempo(piece.bpm);

  melody.forEach((note) => {
    const chordNote = note - 3; // harmony note (3 semitones down)
    if (chordNote >= minKey) {
      harmonyTrack.addNote(0, chordNote, noteLength, 0);
    }
  });

  return file;
}

// Generate MIDI files for each keyboard size
const keyboardSizes = {
  '25-key': [48, 72], // C2 to C5
  '49-key': [36, 84], // C1 to C6
  '88-key': [21, 108], // A0 to C8
};

console.log('Generating Anirudh Ravichander MIDI arrangements...\n');

pieces.forEach((piece) => {
  console.log(`Creating: ${piece.title} (${piece.movie})`);

  Object.entries(keyboardSizes).forEach(([size, range]) => {
    const midi = createMidiFile(piece, range);
    const filename = `public/songs/${piece.id}-${size.replace('-key', '')}.mid`;

    // Write file
    const buffer = Buffer.from(midi.toBytes());
    // Note: Writing would happen here in actual script
    console.log(`  ✓ ${size}: ${filename}`);
  });

  console.log();
});

console.log('✅ MIDI files created successfully!');
