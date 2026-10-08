/**
 * modelCredits.js — who made the 3D instruments, as their CC BY 4.0 licence asks us to say.
 *
 * The one list of credits: the Help dialog shows it, CREDITS.md repeats it,
 * and scripts/models/recipes.mjs writes each line into its model's file.
 *
 * `model` is the model's id, which is also its file name in public/models/
 * (see stageModels.js); `instrument` is the instrument it is shown with.
 */

const LICENCE = Object.freeze({ license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' });
/** What we changed, which the licence asks us to say as well. The stage draws the strings of every model it plays. */
const PLAYED = 'the strings between nut and bridge replaced, scaled and re-encoded';
/** A model that is only shown is left as it was made. */
const SHOWN = 'scaled and re-encoded';

const model = (uid, slug) => `https://sketchfab.com/3d-models/${slug}-${uid}`;

export const MODEL_CREDITS = Object.freeze([
  { instrument: 'guitar', model: 'guitar', title: 'Guitar', author: 'Ya', authorUrl: 'https://sketchfab.com/Yarik16', source: model('f8ccd75e8c2648ffbbc9e6208ed919c1', 'guitar'), changes: PLAYED },
  { instrument: 'violin', model: 'violin', title: 'Violin', author: 'Voldepreuss', authorUrl: 'https://sketchfab.com/Voldepreuss', source: model('0162dea1b1044cd281c57af5e5fc2046', 'violin'), changes: PLAYED },
  { instrument: 'cello', model: 'cello', title: 'Cello', author: 'VM-Models', authorUrl: 'https://sketchfab.com/vm-models', source: model('ece053225f3a42f1939528b9c9014775', 'cello'), changes: PLAYED },
  { instrument: 'guitar', model: 'guitar-bass', title: 'Percussion bass guitar', author: 'Kanade_Tatibana', authorUrl: 'https://sketchfab.com/Kanade_Tatibana', source: model('d1f04fc920b8425a9a78b057b532dd89', 'percussion-bass-guitar'), changes: PLAYED },
  { instrument: 'violin', model: 'violin-electric', title: 'Electric Violin', author: 'Belzar Sirus', authorUrl: 'https://sketchfab.com/belzar.sirus', source: model('71813d2dc6414a0c93b1523d329aba23', 'electric-violin'), changes: PLAYED },
  { instrument: 'cello', model: 'cello-antique', title: 'Cello', author: 'slidon', authorUrl: 'https://sketchfab.com/slidon', source: model('a1e5e2a37d6a42299dcd5cec06cd1ddc', 'cello'), changes: PLAYED },
  { instrument: 'drums', model: 'drums-acoustic', title: 'Drum Kit', author: 'art.katja', authorUrl: 'https://sketchfab.com/art.katja', source: model('898f2f4ba1704abe9c784066e2b0f751', 'drum-kit'), changes: SHOWN },
  { instrument: 'drums', model: 'drums-electronic', title: 'Electronic Drum Set', author: 'SINNIK', authorUrl: 'https://sketchfab.com/sinnik', source: model('51b95e62da844b95b6ca871c23b6e858', 'electronic-drum-set'), changes: `its trailing cable left out, ${SHOWN}` },
].map(credit => Object.freeze({ ...credit, ...LICENCE })));

/** The credit for one model, by its id. The model each instrument is played on has the instrument's own name. */
export const modelCredit = id => MODEL_CREDITS.find(credit => credit.model === id) ?? null;

/** A credit as one line of text, in the form the licence's authors suggest. */
export const creditLine = credit =>
  `"${credit.title}" (${credit.source}) by ${credit.author} (${credit.authorUrl}), licensed under ${credit.license} (${credit.licenseUrl}). Modified: ${credit.changes} for Practice Deck.`;
