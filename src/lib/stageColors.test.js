import { describe, expect, it } from 'vitest';
import { STAGE_COLORS, STAGE_THEME, readStageColors } from './stageColors.js';

describe('stage colours', () => {
  it('reads each colour from its token', () => {
    const tokens = { '--stage': '#000001', '--note-right': '#000002', '--note-left': '#000003', '--hit': '#000004', '--miss': '#000005', '--late': '#000006', '--hit-line': '#000007' };
    expect(readStageColors(name => tokens[name])).toEqual({
      stage: '#000001', noteRight: '#000002', noteLeft: '#000003', hit: '#000004', miss: '#000005', late: '#000006', hitLine: '#000007',
    });
  });

  it('trims the value a stylesheet hands back', () => {
    expect(readStageColors(name => (name === '--hit' ? '  #12ab34 ' : '')).hit).toBe('#12ab34');
  });

  it('falls back to the built-in value when a token is missing or the reader throws', () => {
    const built = readStageColors(() => '');
    expect(built.noteRight).toMatch(/^#[0-9a-f]{6}$/);
    expect(readStageColors(() => { throw new Error('no document'); })).toEqual(built);
    expect(readStageColors(name => (name === '--miss' ? undefined : ''))).toEqual(built);
  });

  it('keeps the two hands and the two verdicts apart', () => {
    expect(STAGE_COLORS.noteRight).not.toBe(STAGE_COLORS.noteLeft);
    expect(STAGE_COLORS.hit).not.toBe(STAGE_COLORS.miss);
    expect(Object.isFrozen(STAGE_COLORS)).toBe(true);
  });

  it('is one dark stage in both interface themes', () => {
    expect(STAGE_THEME).toBe('dark');
  });
});
