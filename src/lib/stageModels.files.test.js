import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { creditLine, modelCredit } from './modelCredits.js';
import { fitProblem } from './stage/models.js';
import { STAGE_MODELS, isStaged } from './stageModels.js';

/**
 * The list of instruments and the files in public/ have to agree: a model on
 * the list without its files is never offered, and its picture is a blank
 * card. This reads the files themselves.
 */

const all = Object.values(STAGE_MODELS).flat();
const downloaded = all.filter(model => !model.builtIn);
const file = (id, kind) => `public/models/${id}.${kind}`;
const measurements = id => JSON.parse(readFileSync(file(id, 'json'), 'utf8'));

describe('the files behind the instruments', () => {
  it('include a picture of every one, for the pop-up', () => {
    for (const model of all) expect(existsSync(`public/media/models/${model.id}.webp`), model.id).toBe(true);
  });

  it('include every downloaded model and measurements the stage can use', () => {
    for (const model of downloaded) {
      expect(existsSync(file(model.id, 'glb')), model.id).toBe(true);
      expect(fitProblem(measurements(model.id)), model.id).toBeNull();
    }
  });

  it('mark as shown-only exactly the ones the stage does not play', () => {
    for (const model of downloaded) expect(measurements(model.id).showcase === true, model.id).toBe(!isStaged(model));
  });

  it('measure the strings of every one the stage plays, lowest first on the right-handed side', () => {
    for (const model of downloaded.filter(isStaged)) {
      const { strings } = measurements(model.id);
      expect(strings.length, model.id).toBe(model.instrument === 'guitar' && model.played ? 6 : 4);
      const across = strings.map(string => string.nut[2]);
      expect([...across].sort((a, b) => b - a), model.id).toEqual(across);
    }
  });

  it('carry each maker\'s credit as the app states it', () => {
    for (const model of downloaded) expect(measurements(model.id).credit.line, model.id).toBe(creditLine(modelCredit(model.id)));
  });

  it('keep every model small enough to arrive on a slow connection', () => {
    // 8 MB in the viewer's 60 seconds is about 1 megabit a second.
    for (const model of downloaded) expect(statSync(file(model.id, 'glb')).size, model.id).toBeLessThan(8 * 1024 * 1024);
  });
});
