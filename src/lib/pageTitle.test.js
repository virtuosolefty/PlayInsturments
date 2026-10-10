import { describe, expect, it } from 'vitest';
import { pageTitle } from './pageTitle.js';

describe('the tab title', () => {
  it('names the piece and the instrument, then the app', () => {
    expect(pageTitle({ piece: 'Meet the four strings', instrument: 'Bass' })).toBe('Meet the four strings · Bass — Practice Deck');
  });
  it('says free play or the learning path where there is no piece', () => {
    expect(pageTitle({ piece: 'Ignored', instrument: 'Drums', freePlay: true })).toBe('Free play · Drums — Practice Deck');
    expect(pageTitle({ instrument: 'Piano', home: true })).toBe('Learning path · Piano — Practice Deck');
  });
  it('is just the app when there is nothing else to say', () => {
    expect(pageTitle()).toBe('Practice Deck');
    expect(pageTitle({ instrument: 'Cello' })).toBe('Cello — Practice Deck');
  });
});
