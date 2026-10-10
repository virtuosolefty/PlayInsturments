import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemTheme, themeFor } from './theme.js';

const deviceIs = scheme => vi.stubGlobal('matchMedia', query => ({ matches: scheme === 'dark' && query.includes('dark') }));
afterEach(() => vi.unstubAllGlobals());

describe('the theme before a choice is made', () => {
  it('follows the device: dark when it asks for dark, light otherwise', () => {
    deviceIs('dark');
    expect(systemTheme()).toBe('dark');
    deviceIs('light');
    expect(systemTheme()).toBe('light');
  });

  it('is light where the browser cannot say', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(systemTheme()).toBe('light');
  });

  it('keeps a theme the visitor chose, whatever the device says', () => {
    deviceIs('dark');
    expect(themeFor('light')).toBe('light');
    deviceIs('light');
    expect(themeFor('dark')).toBe('dark');
  });

  it('falls back to the device for anything else that was saved', () => {
    deviceIs('dark');
    for (const saved of [undefined, null, '', 'sepia', 3]) expect(themeFor(saved)).toBe('dark');
  });
});
