/**
 * Where everything on the drawn violin / cello goes, in SVG view units.
 *
 * The neck is drawn "zoomed": finger stops keep their true proportions to one
 * another (each semitone is 2^(-1/12) of the string left), but the whole set
 * is stretched to fill the neck so a first-position place is a comfortable
 * target. The bowing area and bridge sit to the right, over the body.
 */
export const VIEW = { width: 1200, height: 300, cy: 150 };

const NUT_X = 196;
const PLAY_WIDTH = 610;
const BRIDGE_X = 1112;

export function bowedLayout({ strings = 4, maxFret = 7, spacing = 30, spread = 44 } = {}) {
  const scale = Math.min(PLAY_WIDTH, maxFret * 118) / (1 - 2 ** (-maxFret / 12));
  const posX = n => NUT_X + scale * (1 - 2 ** (-n / 12));
  const fingerboardEnd = Math.max(posX(maxFret) + 70, 860);
  const bow = { x0: fingerboardEnd + 24, x1: BRIDGE_X - 26 };
  const gap = x => spacing + (spread - spacing) * Math.min(1, Math.max(0, (x - NUT_X) / (BRIDGE_X - NUT_X)));
  const stringY = (s, x) => VIEW.cy + ((strings - 1) / 2 - s) * gap(x);
  const halfWidth = x => gap(x) * (strings / 2) + 10;

  const zones = [];
  const bounds = n => [n === 0 ? NUT_X : (posX(n - 1) + posX(n)) / 2, n === maxFret ? (posX(n) + fingerboardEnd) / 2 : (posX(n) + posX(n + 1)) / 2];
  for (let s = 0; s < strings; s++) {
    for (let fret = 0; fret <= maxFret; fret++) {
      const [x0, x1] = bounds(fret);
      zones.push({ string: s, fret, x0, x1, x: fret === 0 ? NUT_X + 14 : posX(fret), bow: false });
    }
    zones.push({ string: s, fret: 0, x0: bow.x0, x1: bow.x1, x: (bow.x0 + bow.x1) / 2, bow: true });
  }
  return { nutX: NUT_X, bridgeX: BRIDGE_X, fingerboardEnd, bow, posX, stringY, halfWidth, gap, zones, strings, maxFret };
}
