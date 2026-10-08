import { addDays, dayKey, dayCounts } from './streaks.js';

export const FIRST_LESSON = { piano: 'path-01-home-five-right', guitar: 'guitar-open-strings', violin: 'violin-open-strings', cello: 'cello-open-strings', drums: 'drums-meet-the-kit' };
export const COLLECTIONS = {
  piano: [
    { id: 'first', title: 'First melodies', description: 'Familiar tunes, in manageable arrangements.', ids: ['twinkle-mini', 'amazing-grace', 'beethoven-fifth'] },
    { id: 'short', title: 'A small step today', description: 'Build one skill before your next song.', ids: ['path-01-home-five-right', 'five-finger-c', 'path-05-long-and-short'] },
    { id: 'classics', title: 'Something to work towards', description: 'Preview a favourite, then learn it at your pace.', ids: ['ode-to-joy-mini', 'greensleeves', 'fur-elise-mini'] },
  ],
  guitar: [
    { id: 'first', title: 'Your first guitar notes', description: 'Start with open strings and a short original tune.', ids: ['guitar-open-strings', 'guitar-first-frets', 'guitar-first-song'] },
    { id: 'chords', title: 'Two chords, more possibilities', description: 'Learn Em and Am, then bring them together.', ids: ['guitar-first-em', 'guitar-first-am', 'guitar-chord-changes'] },
    { id: 'short', title: 'Make your picking flow', description: 'Explore a scale or a new picking pattern.', ids: ['guitar-c-major', 'guitar-e-minor-pentatonic', 'guitar-a-minor'] },
  ],
  violin: [
    { id: 'first', title: 'Your first violin notes', description: 'Bow the open strings, then place your first fingers.', ids: ['violin-open-strings', 'violin-a-string-fingers', 'violin-e-string'] },
    { id: 'short', title: 'Your first scales', description: 'One finger pattern, two strings, a whole octave.', ids: ['violin-d-major', 'violin-g-major'] },
    { id: 'tune', title: 'A tune to share', description: 'Twinkle, Twinkle on the A and E strings.', ids: ['violin-twinkle'] },
  ],
  cello: [
    { id: 'first', title: 'Your first cello notes', description: 'Bow the open strings, then find your first fingers.', ids: ['cello-open-strings', 'cello-d-string-fingers', 'cello-g-string'] },
    { id: 'short', title: 'Your first scales', description: 'Low and warm: C major and D major.', ids: ['cello-c-major', 'cello-d-major'] },
    { id: 'tune', title: 'A tune to share', description: 'Twinkle, Twinkle on the D and A strings.', ids: ['cello-twinkle'] },
  ],
  drums: [
    { id: 'first', title: 'Your first drum hits', description: 'Find every drum, then keep a steady pulse.', ids: ['drums-meet-the-kit', 'drums-steady-kick', 'drums-backbeat'] },
    { id: 'short', title: 'Hands and foot together', description: 'Hi-hat eighths, then all three drums in one beat.', ids: ['drums-eighth-hats', 'drums-first-beat'] },
    { id: 'tune', title: 'A beat to show off', description: 'A bar of your beat, a fill round the drums, and a crash.', ids: ['drums-beat-and-fill'] },
  ],
};
const SKILLS = {
  'path-01-home-five-right': ['Find five notes with your right hand', 'No experience needed'],
  'path-02-home-five-left': ['Give your left hand a melody', 'Find C through G'],
  'five-finger-c': ['Play evenly across five notes', 'Find C through G'],
  'path-05-long-and-short': ['Feel long and short beats', 'Comfortable with five notes'],
  'twinkle-mini': ['Play a familiar melody', 'Find notes across two octaves'],
  'amazing-grace': ['Shape a flowing melody', 'Single notes and small jumps'],
  'beethoven-fifth': ['Feel a memorable rhythm', 'Repeated notes and short rests'],
  'guitar-open-strings': ['Find all six open strings', 'No experience needed'],
  'guitar-first-frets': ['Turn an open string into a new note', 'Find the open strings'],
  'guitar-first-em': ['Make your first Em chord', 'Open strings and fret 2'],
  'guitar-first-am': ['Make an Am chord', 'Frets 1 and 2'],
  'guitar-chord-changes': ['Move smoothly between Em and Am', 'Know both chord shapes'],
  'guitar-first-song': ['Play Morning steps, an original tune', 'Open strings and frets 1–3'],
  'violin-open-strings': ['Bow all four open strings evenly', 'No experience needed'],
  'violin-a-string-fingers': ['Place fingers 1, 2 and 3 on the A string', 'Bow the open strings'],
  'violin-e-string': ['Reach your fourth finger on the E string', 'Fingers 1–3 on the A string'],
  'violin-d-major': ['Play your first one-octave scale', 'The first-finger pattern'],
  'violin-g-major': ['Carry the pattern to the low strings', 'D major scale'],
  'violin-twinkle': ['Play Twinkle, Twinkle', 'Fingers 1–3 on A and E'],
  'cello-open-strings': ['Bow all four open strings evenly', 'No experience needed'],
  'cello-d-string-fingers': ['Place fingers 1, 3 and 4 on the D string', 'Bow the open strings'],
  'cello-g-string': ['Use the same frame on the G string', 'Fingers on the D string'],
  'cello-c-major': ['Play C major from the lowest string', 'The first-position frame'],
  'cello-d-major': ['Play D major on the upper strings', 'C major scale'],
  'cello-twinkle': ['Play Twinkle, Twinkle', 'Fingers on D and A'],
  'drums-meet-the-kit': ['Find every drum and cymbal', 'No experience needed'],
  'drums-steady-kick': ['Keep an even beat on the kick', 'Find the kick'],
  'drums-backbeat': ['Answer the kick with the snare', 'A steady kick'],
  'drums-eighth-hats': ['Play eighth notes on the hi-hat', 'Count one-and, two-and'],
  'drums-first-beat': ['Put kick, snare and hi-hat together', 'Hi-hat eighths and the backbeat'],
  'drums-beat-and-fill': ['Leave the beat for a fill and land on the crash', 'Your first beat'],
};
export function pieceDetails(entry) {
  if (!entry) return { skill: '', needs: '', level: '', length: '' };
  const [skill, needs] = SKILLS[entry.id] ?? [entry.description, entry.instrument === 'guitar' ? 'Comfortable finding strings and frets' : entry.instrument === 'violin' || entry.instrument === 'cello' ? 'Comfortable bowing the open strings' : entry.instrument === 'drums' ? 'Comfortable finding each drum' : 'Comfortable finding notes on the keyboard'];
  const difficulty = entry.difficulty ?? (['guitar-chord-changes','guitar-a-minor','guitar-chromatic','violin-g-major','violin-twinkle','cello-d-major','cello-twinkle','drums-first-beat','drums-beat-and-fill'].includes(entry.id) ? 2 : 1);
  const seconds = Math.ceil(entry.approxDuration ?? entry.duration ?? 0);
  return { skill, needs, level: difficulty === 1 ? 'First steps' : difficulty === 2 ? 'Building confidence' : 'A new challenge', length: seconds ? `${seconds}s of music` : 'Short study' };
}
export function collectionEntries(entries, instrument, id, favorites = []) {
  const ids = id === 'favorites' ? favorites : COLLECTIONS[instrument]?.find(item => item.id === id)?.ids ?? [];
  return ids.map(key => entries.find(entry => entry.id === key)).filter(Boolean);
}
export function weeklyPractice(days = {}, goal = 3, today = dayKey()) {
  const [y,m,d] = today.split('-').map(Number);
  const weekday = new Date(y,m-1,d).getDay();
  const start = addDays(today, -((weekday + 6) % 7));
  const week = Array.from({length:7}, (_,i) => {
    const date = addDays(start,i);
    return {date, done: date <= today && dayCounts(days[date]), today: date === today, future: date > today};
  });
  return { days: week, count: week.filter(day=>day.done).length, goal: [2,3,5].includes(+goal) ? +goal : 3 };
}
export function sharedLessonUrl(instrument, id, origin = window.location.origin, base = import.meta.env.BASE_URL) {
  const url = new URL(base,origin);
  url.searchParams.set('instrument', ['guitar', 'violin', 'cello', 'drums'].includes(instrument) ? instrument : 'piano');
  url.searchParams.set('lesson',id);
  return url.href;
}
