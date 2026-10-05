/**
 * collections.js — the library as a catalogue rather than a list.
 *
 * Nineteen pieces in one flat column is a list you scroll past. Grouped by who
 * wrote them it becomes something you browse, and a composer with six pieces
 * reads as a body of work rather than six unrelated rows.
 *
 * Only the composers we actually ship get a note. Everything else falls back to
 * the name alone, so adding a piece by someone new never needs a code change
 * here — it simply appears without a blurb.
 */

/** Names that are categories rather than people, kept out of the composer list. */
const NOT_A_PERSON = new Set(['Exercise', 'Traditional']);

const NOTES = {
  'Ludwig van Beethoven': {
    life: '1770–1827',
    blurb:
      'Went deaf across the years these were written and kept composing anyway. The pieces here run from four notes anyone can play to an opening that needs real control.',
  },
  'J. S. Bach': {
    life: '1685–1750',
    blurb: 'Pure voice-leading. Nothing is decoration, which is why it is such good practice.',
  },
  'Johann Pachelbel': {
    life: '1653–1706',
    blurb: 'One ground bass, endlessly reused — the reason the chord progression is inescapable.',
  },
  'Scott Joplin': {
    life: '1868–1917',
    blurb: 'Ragtime, written down precisely at a time when the style was mostly improvised.',
  },
};

/**
 * @param {Array} library entries from songs.json
 * @returns {Array<{name: string, life: string|null, blurb: string|null, songs: Array}>}
 *   people only, most-represented first
 */
export function composersIn(library = []) {
  const byName = new Map();
  for (const song of library) {
    const name = song.composer;
    if (!name || NOT_A_PERSON.has(name)) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(song);
  }

  return [...byName.entries()]
    .map(([name, songs]) => ({ name, ...(NOTES[name] ?? { life: null, blurb: null }), songs }))
    .sort((a, b) => b.songs.length - a.songs.length || a.name.localeCompare(b.name));
}

/** Surname only, for a chip that has to fit in a 292px drawer. */
export const shortName = (name) => name.split(' ').filter(Boolean).pop();
