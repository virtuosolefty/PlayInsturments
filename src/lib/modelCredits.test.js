import { describe, expect, it } from 'vitest';
import { creditLine, MODEL_CREDITS, modelCredit } from './modelCredits.js';

describe('credits for the 3D instruments', () => {
  it('credits each downloaded model, its author and its licence', () => {
    expect(MODEL_CREDITS.map(c => c.instrument)).toEqual(['guitar', 'violin', 'cello']);
    for (const credit of MODEL_CREDITS) {
      expect(credit.source).toMatch(/^https:\/\/sketchfab\.com\/3d-models\//);
      expect(credit.authorUrl).toMatch(/^https:\/\/sketchfab\.com\//);
      expect(credit.license).toBe('CC BY 4.0');
      expect(credit.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
    }
  });

  it('says what was changed, as the licence asks', () => {
    const line = creditLine(modelCredit('violin'));
    expect(line).toBe('"Violin" (https://sketchfab.com/3d-models/violin-0162dea1b1044cd281c57af5e5fc2046) by Voldepreuss (https://sketchfab.com/Voldepreuss), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified: the strings between nut and bridge replaced, scaled and re-encoded for Practice Deck.');
  });

  it('has no credit for an instrument without a model', () => {
    expect(modelCredit('piano')).toBeNull();
  });
});
