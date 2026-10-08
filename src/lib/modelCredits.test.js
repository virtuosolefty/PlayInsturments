import { describe, expect, it } from 'vitest';
import { creditLine, MODEL_CREDITS, modelCredit } from './modelCredits.js';

describe('credits for the 3D instruments', () => {
  it('credits each downloaded model, its author and its licence', () => {
    expect(MODEL_CREDITS.map(c => c.model)).toEqual(['guitar', 'violin', 'cello', 'guitar-bass', 'violin-electric', 'cello-antique', 'drums-acoustic', 'drums-electronic']);
    for (const credit of MODEL_CREDITS) {
      expect(credit.source).toMatch(/^https:\/\/sketchfab\.com\/3d-models\/[a-z0-9-]+-[0-9a-f]{32}$/);
      expect(credit.authorUrl).toMatch(/^https:\/\/sketchfab\.com\//);
      expect(credit.license).toBe('CC BY 4.0');
      expect(credit.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
      expect(credit.title).toBeTruthy();
      expect(credit.author).toBeTruthy();
    }
  });

  it('files each model under the instrument it is shown with', () => {
    expect(MODEL_CREDITS.filter(c => c.instrument === 'drums').map(c => c.model)).toEqual(['drums-acoustic', 'drums-electronic']);
    expect(modelCredit('guitar-bass').instrument).toBe('guitar');
  });

  it('says what was changed, as the licence asks', () => {
    const line = creditLine(modelCredit('violin'));
    expect(line).toBe('"Violin" (https://sketchfab.com/3d-models/violin-0162dea1b1044cd281c57af5e5fc2046) by Voldepreuss (https://sketchfab.com/Voldepreuss), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified: the strings between nut and bridge replaced, scaled and re-encoded for Practice Deck.');
  });

  it('does not claim to have replaced the strings of a model that is only shown', () => {
    expect(modelCredit('violin-electric').changes).toBe('scaled and re-encoded');
    expect(creditLine(modelCredit('drums-acoustic'))).toMatch(/Modified: scaled and re-encoded for Practice Deck\.$/);
  });

  it('says so where a part of a model was left out', () => {
    expect(modelCredit('drums-electronic').changes).toBe('its trailing cable left out, scaled and re-encoded');
  });

  it('has no credit for an instrument without a model', () => {
    expect(modelCredit('piano')).toBeNull();
  });
});
