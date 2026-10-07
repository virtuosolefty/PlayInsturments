/**
 * The interface colours every stage canvas paints with, read from tokens.css.
 *
 * The stage is one dark room in both interface themes, so these do not change
 * with the theme and are read once. The built-in values are what the tokens
 * hold: tests, and a stylesheet that has not loaded yet, fall back to them.
 */
export const STAGE_THEME = 'dark';

const TOKENS = Object.freeze({
  stage: ['--stage', '#080710'],
  noteRight: ['--note-right', '#5ab8ff'],
  noteLeft: ['--note-left', '#ffb84d'],
  hit: ['--hit', '#5ad79a'],
  miss: ['--miss', '#ff6b82'],
  late: ['--late', '#f5b94f'],
  hitLine: ['--hit-line', '#f8efff'],
});

function cssToken(name) {
  const root = globalThis.document?.documentElement;
  return root ? globalThis.getComputedStyle(root).getPropertyValue(name) : '';
}

/**
 * @param {(token: string) => string | undefined} [read] returns a custom property's value
 * @returns {Readonly<Record<keyof typeof TOKENS, string>>}
 */
export function readStageColors(read = cssToken) {
  return Object.freeze(Object.fromEntries(Object.entries(TOKENS).map(([key, [token, builtIn]]) => {
    let value = '';
    try { value = read(token) ?? ''; } catch { value = ''; }
    return [key, value.trim() || builtIn];
  })));
}

export const STAGE_COLORS = readStageColors();
