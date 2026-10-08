import { describe, expect, it } from 'vitest';
import { MODEL_CREDITS, modelCredit } from './modelCredits.js';
import { STAGE_MODELS, findModel, modelImage, modelsFor, otherModels, playedModel } from './stageModels.js';

describe('the instruments the whole-instrument view can show', () => {
  it('lists, for each instrument, the one that is played first and then the others', () => {
    expect(modelsFor('guitar').map(model => model.id)).toEqual(['guitar', 'guitar-bass']);
    expect(modelsFor('violin').map(model => model.id)).toEqual(['violin', 'violin-electric']);
    expect(modelsFor('cello').map(model => model.id)).toEqual(['cello', 'cello-antique']);
    expect(modelsFor('drums').map(model => model.id)).toEqual(['drums', 'drums-acoustic', 'drums-electronic']);
  });

  it('has nothing to choose from on the piano, or on an instrument it does not know', () => {
    expect(modelsFor('piano')).toEqual([]);
    expect(modelsFor(undefined)).toEqual([]);
    expect(otherModels('piano')).toEqual([]);
    expect(playedModel('piano')).toBeNull();
  });

  it('marks exactly one of each instrument as the one on the stage that is played', () => {
    for (const [instrument, models] of Object.entries(STAGE_MODELS)) {
      expect(models.filter(model => model.played), instrument).toHaveLength(1);
      expect(playedModel(instrument)).toBe(models[0]);
      expect(otherModels(instrument)).toEqual(models.slice(1));
    }
  });

  it('gives every one a name, a line about it and a picture, each id once', () => {
    const all = Object.values(STAGE_MODELS).flat();
    expect(new Set(all.map(model => model.id)).size).toBe(all.length);
    for (const model of all) {
      expect(model.label, model.id).toBeTruthy();
      expect(model.about, model.id).toBeTruthy();
      expect(modelImage(model.id, '/app/')).toBe(`/app/media/models/${model.id}.webp`);
    }
  });

  it('credits every downloaded one, and only those', () => {
    const downloaded = Object.values(STAGE_MODELS).flat().filter(model => !model.builtIn).map(model => model.id).sort();
    expect(MODEL_CREDITS.map(credit => credit.model).sort()).toEqual(downloaded);
    // The kit built in code has no author to credit.
    expect(findModel('drums').builtIn).toBe(true);
    expect(modelCredit('drums')).toBeNull();
  });

  it('finds one by its id, with the instrument it belongs to', () => {
    expect(findModel('guitar-bass')).toMatchObject({ id: 'guitar-bass', instrument: 'guitar', label: 'Bass guitar' });
    expect(findModel('nothing')).toBeNull();
  });

  it('cannot be changed by the code that reads it', () => {
    expect(Object.isFrozen(STAGE_MODELS)).toBe(true);
    expect(Object.isFrozen(STAGE_MODELS.drums)).toBe(true);
    expect(Object.isFrozen(STAGE_MODELS.drums[0])).toBe(true);
  });
});
