import { addDays, dayKey, dayCounts } from './streaks.js';

export const FIRST_LESSON = { piano: 'path-01-home-five-right', guitar: 'guitar-open-strings' };
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
};
export function pieceDetails(entry) {
  if (!entry) return { skill: '', needs: '', level: '', length: '' };
  const [skill, needs] = SKILLS[entry.id] ?? [entry.description, entry.instrument === 'guitar' ? 'Comfortable finding strings and frets' : 'Comfortable finding notes on the keyboard'];
  const difficulty = entry.difficulty ?? (['guitar-chord-changes','guitar-a-minor','guitar-chromatic'].includes(entry.id) ? 2 : 1);
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
export function sharedLessonUrl(instrument, id, origin = window.location.origin) {
  const url = new URL('/',origin);
  url.searchParams.set('instrument', instrument === 'guitar' ? 'guitar' : 'piano');
  url.searchParams.set('lesson',id);
  return url.href;
}

