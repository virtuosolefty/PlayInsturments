/**
 * modelCredits.js — who made the 3D instruments, as their CC BY 4.0 licence asks us to say.
 *
 * The one list of credits: the Help dialog shows it, CREDITS.md repeats it,
 * and scripts/models/recipes.mjs writes each line into its model's file.
 */

const LICENCE = Object.freeze({ license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' });
/** What we changed, which the licence asks us to say as well. */
const CHANGES = 'the strings between nut and bridge replaced, scaled and re-encoded';

export const MODEL_CREDITS = Object.freeze([
  { instrument: 'guitar', title: 'Guitar', author: 'Ya', authorUrl: 'https://sketchfab.com/Yarik16', source: 'https://sketchfab.com/3d-models/guitar-f8ccd75e8c2648ffbbc9e6208ed919c1' },
  { instrument: 'violin', title: 'Violin', author: 'Voldepreuss', authorUrl: 'https://sketchfab.com/Voldepreuss', source: 'https://sketchfab.com/3d-models/violin-0162dea1b1044cd281c57af5e5fc2046' },
  { instrument: 'cello', title: 'Cello', author: 'VM-Models', authorUrl: 'https://sketchfab.com/vm-models', source: 'https://sketchfab.com/3d-models/cello-ece053225f3a42f1939528b9c9014775' },
].map(credit => Object.freeze({ ...credit, ...LICENCE, changes: CHANGES })));

/** The credit for one instrument's model. */
export const modelCredit = instrument => MODEL_CREDITS.find(credit => credit.instrument === instrument) ?? null;

/** A credit as one line of text, in the form the licence's authors suggest. */
export const creditLine = credit =>
  `"${credit.title}" (${credit.source}) by ${credit.author} (${credit.authorUrl}), licensed under ${credit.license} (${credit.licenseUrl}). Modified: ${credit.changes} for Practice Deck.`;
