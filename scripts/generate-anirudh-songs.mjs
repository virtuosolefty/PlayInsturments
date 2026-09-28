/**
 * Generate Anirudh Ravichander MIDI arrangements
 * Creates simplified versions for 25-key, 49-key, and 88-key keyboards
 */

import MidiModule from '@tonejs/midi';
import fs from 'fs';
import path from 'path';

const { Midi } = MidiModule;

const pieces = [
  {
    id: 'amma-amma',
    title: 'Amma Amma',
    movie: 'Maryan',
    year: 2015,
    bpm: 75,
    key: 'D Major',
    difficulty: 4,
    range: [36, 84],
    duration: 187,
    description: 'Beautiful emotional piece. A contemplative melody with rich harmonies — perfect for developing touch sensitivity and emotional expression.',
    // Simplified 8-bar melody in D Major
    notes: [
      { pitch: 62, duration: 0.5 }, // D4
      { pitch: 64, duration: 0.5 }, // E4
      { pitch: 66, duration: 1.0 }, // F#4
      { pitch: 64, duration: 0.5 }, // E4
      { pitch: 62, duration: 0.5 }, // D4
      { pitch: 61, duration: 1.0 }, // C#4
      { pitch: 62, duration: 2.0 }, // D4
      { pitch: 59, duration: 1.0 }, // B3
      { pitch: 61, duration: 1.0 }, // C#4
      { pitch: 62, duration: 1.0 }, // D4
      { pitch: 64, duration: 2.0 }, // E4
    ]
  },
  {
    id: 'raga-of-revenge',
    title: 'Raga of Revenge',
    movie: 'DC Movie',
    bpm: 140,
    key: 'A Minor',
    difficulty: 5,
    range: [33, 88],
    duration: 142,
    description: 'Intense, dramatic piece. Features rapid scale passages and complex rhythmic patterns — excellent for building speed and precision.',
    notes: [
      { pitch: 69, duration: 0.25 }, // A4
      { pitch: 71, duration: 0.25 }, // B4
      { pitch: 72, duration: 0.25 }, // C5
      { pitch: 73, duration: 0.25 }, // C#5
      { pitch: 74, duration: 0.25 }, // D5
      { pitch: 76, duration: 0.25 }, // E5
      { pitch: 77, duration: 0.25 }, // F5
      { pitch: 79, duration: 1.0 }, // G5
      { pitch: 77, duration: 0.5 }, // F5
      { pitch: 76, duration: 0.5 }, // E5
      { pitch: 74, duration: 1.0 }, // D5
    ]
  },
  {
    id: 'rowdy-baby',
    title: 'Rowdy Baby',
    movie: 'Maari 2',
    year: 2018,
    bpm: 120,
    key: 'G Major',
    difficulty: 3,
    range: [40, 79],
    duration: 142,
    description: 'Catchy, energetic theme. Fun to play with distinctive rhythmic patterns and playful melodies — great for building confidence.',
    notes: [
      { pitch: 67, duration: 0.5 }, // G4
      { pitch: 69, duration: 0.5 }, // A4
      { pitch: 71, duration: 1.0 }, // B4
      { pitch: 67, duration: 0.5 }, // G4
      { pitch: 69, duration: 0.5 }, // A4
      { pitch: 71, duration: 1.0 }, // B4
      { pitch: 72, duration: 2.0 }, // C5
      { pitch: 71, duration: 1.0 }, // B4
      { pitch: 69, duration: 1.0 }, // A4
      { pitch: 67, duration: 1.0 }, // G4
    ]
  },
  {
    id: 'kannazhaga',
    title: 'Kannazhaga',
    movie: 'VIP',
    year: 2014,
    bpm: 85,
    key: 'E Major',
    difficulty: 4,
    range: [38, 82],
    duration: 163,
    description: 'Enchanting romantic melody. Flowing passages with subtle dynamic variations — develops nuanced control and artistic expression.',
    notes: [
      { pitch: 64, duration: 0.5 }, // E4
      { pitch: 66, duration: 0.5 }, // F#4
      { pitch: 68, duration: 1.0 }, // G#4
      { pitch: 66, duration: 0.5 }, // F#4
      { pitch: 64, duration: 0.5 }, // E4
      { pitch: 63, duration: 1.0 }, // D#4
      { pitch: 64, duration: 2.0 }, // E4
      { pitch: 61, duration: 1.0 }, // C#4
      { pitch: 63, duration: 1.0 }, // D#4
      { pitch: 64, duration: 1.0 }, // E4
    ]
  },
  {
    id: 'theevandi-theme',
    title: 'Theevandi Theme',
    movie: 'Theevandi',
    year: 2017,
    bpm: 110,
    key: 'C Major',
    difficulty: 3,
    range: [42, 78],
    duration: 125,
    description: 'Spirited theme. Folk-influenced melody with traditional rhythmic elements — bridges classical and contemporary styles.',
    notes: [
      { pitch: 60, duration: 0.5 }, // C4
      { pitch: 62, duration: 0.5 }, // D4
      { pitch: 64, duration: 1.0 }, // E4
      { pitch: 65, duration: 0.5 }, // F4
      { pitch: 67, duration: 0.5 }, // G4
      { pitch: 69, duration: 1.0 }, // A4
      { pitch: 71, duration: 2.0 }, // B4
      { pitch: 69, duration: 1.0 }, // A4
      { pitch: 67, duration: 1.0 }, // G4
      { pitch: 65, duration: 1.0 }, // F4
    ]
  },
  {
    id: 'anjathe-pookkal',
    title: 'Anjathe Pookkal',
    movie: 'Natarang',
    year: 2016,
    bpm: 70,
    key: 'F Major',
    difficulty: 3,
    range: [39, 76],
    duration: 152,
    description: 'Serene devotional piece. Meditative quality with gentle ornamentation — excellent for mindful practice and breath control.',
    notes: [
      { pitch: 65, duration: 1.0 }, // F4
      { pitch: 67, duration: 0.5 }, // G4
      { pitch: 69, duration: 0.5 }, // A4
      { pitch: 70, duration: 1.0 }, // A#4
      { pitch: 72, duration: 1.0 }, // C5
      { pitch: 70, duration: 1.0 }, // A#4
      { pitch: 69, duration: 1.0 }, // A4
      { pitch: 67, duration: 1.0 }, // G4
      { pitch: 65, duration: 2.0 }, // F4
    ]
  },
];

function createMidiFile(piece, keyboardRange) {
  const midi = new Midi();
  midi.header.setTempo(piece.bpm);

  const track = midi.addTrack();

  // Transpose notes to fit keyboard
  const [minKey, maxKey] = keyboardRange;
  const notes = piece.notes.map(n => {
    let pitch = n.pitch;
    while (pitch < minKey) pitch += 12;
    while (pitch > maxKey) pitch -= 12;
    return { ...n, pitch };
  });

  // Add melody
  let currentTime = 0;
  notes.forEach(note => {
    track.addNote({
      midi: note.pitch,
      time: currentTime,
      duration: note.duration,
      velocity: 0.8,
    });
    currentTime += note.duration;
  });

  return midi;
}

const keyboardSizes = {
  '25': [48, 72], // C2 to C5
  '49': [36, 84], // C1 to C6
  '88': [21, 108], // A0 to C8
};

console.log('🎵 Generating Anirudh Ravichander MIDI arrangements...\n');

pieces.forEach((piece) => {
  console.log(`📝 ${piece.title} (${piece.movie}, ${piece.year || 'TBA'})`);

  Object.entries(keyboardSizes).forEach(([size, range]) => {
    try {
      const midi = createMidiFile(piece, range);
      const filename = `public/songs/${piece.id}-${size}key.mid`;

      // Create songs directory if it doesn't exist
      const dir = path.dirname(filename);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filename, Buffer.from(midi.toArray()));
      console.log(`   ✓ ${size}-key version created`);
    } catch (error) {
      console.error(`   ✗ ${size}-key version failed:`, error.message);
    }
  });

  console.log();
});

console.log('✅ MIDI generation complete!');
console.log('\nNext: Update songs.json with keyboard-dependent entries');
