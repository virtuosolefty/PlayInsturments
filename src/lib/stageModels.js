/**
 * stageModels.js — the instruments the whole-instrument view can show.
 *
 * Each instrument has one model that is played: the downloaded guitar, violin
 * and cello (made playable by their rigs), and the drum kit built in code. The
 * others are a different kind of the same instrument, chosen from pictures
 * when Whole instrument is selected, and seen in that view:
 *
 *   rigged   the stage puts its own rig on the model, so its strings move and
 *            its bow plays as the instrument is played;
 *   neither  the model is only looked at and turned, in the viewer.
 *
 * A model's id is its file name in public/models/ (<id>.glb and <id>.json,
 * written by scripts/models/prepare.mjs), the name of its picture in
 * public/media/models/, and its key in modelCredits.js.
 */

const list = (instrument, models) => Object.freeze(models.map(model => Object.freeze({ instrument, ...model })));

export const STAGE_MODELS = Object.freeze({
  guitar: list('guitar', [
    { id: 'guitar', label: 'Acoustic guitar', about: 'Steel strings. The guitar you play here.', played: true },
    { id: 'guitar-bass', label: 'Bass guitar', about: 'Four strings, an octave below the guitar’s lowest four.', rigged: true },
  ]),
  violin: list('violin', [
    { id: 'violin', label: 'Violin', about: 'The violin you play here.', played: true },
    { id: 'violin-electric', label: 'Electric violin', about: 'The same four strings on a frame with no sound box.', rigged: true },
  ]),
  cello: list('cello', [
    { id: 'cello', label: 'Cello', about: 'The cello you play here.', played: true },
    { id: 'cello-antique', label: 'Antique cello', about: 'Modelled on a cello over a hundred years old.', rigged: true },
  ]),
  drums: list('drums', [
    { id: 'drums', label: 'Practice kit', about: 'The kit you play here, every drum named.', played: true, builtIn: true },
    { id: 'drums-acoustic', label: 'Acoustic kit', about: 'Shells, heads and cymbals: the kit on a stage.' },
    { id: 'drums-electronic', label: 'Electronic kit', about: 'Mesh pads on a rack: the kit for practising at home.' },
  ]),
});

/** Every model of an instrument, the one that is played first. */
export const modelsFor = instrument => (Object.hasOwn(STAGE_MODELS, instrument ?? '') ? STAGE_MODELS[instrument] : Object.freeze([]));

/** The model an instrument is played on, or null when it has none. */
export const playedModel = instrument => modelsFor(instrument).find(model => model.played) ?? null;

/** Whether the stage shows a model itself, on a rig that answers to playing, rather than handing it to the viewer. */
export const isStaged = model => !!(model?.played || model?.rigged);

/** The models an instrument offers beside the one it is played on. */
export const otherModels = instrument => modelsFor(instrument).filter(model => !model.played);

/** A model by its id, or null. */
export const findModel = id => Object.values(STAGE_MODELS).flat().find(model => model.id === id) ?? null;

/** Where a model's picture is served from. */
export const modelImage = (id, base = import.meta.env?.BASE_URL ?? '/') => `${base}media/models/${id}.webp`;
