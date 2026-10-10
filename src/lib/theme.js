/**
 * theme.js — which theme a visitor sees before they have chosen one.
 *
 * Someone whose device is set to dark should not meet a bright page first, and
 * then have to find the switch. A theme they have chosen (and saved) always
 * wins; until then the device's own setting decides. It is a tiny module so
 * the welcome page can use it without loading the studio.
 */

/** 'dark' where the device asks for it, otherwise 'light'. */
export const systemTheme = () => (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/** The theme to show: the one saved, if it is one of ours, else the device's. */
export const themeFor = saved => (saved === 'dark' || saved === 'light' ? saved : systemTheme());
