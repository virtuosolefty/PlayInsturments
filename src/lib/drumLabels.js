/** The names over the 3D drum kit: how wide each is, and keeping them off one another. */

const CHAR = 6.4;     // one letter of an 11px bold name
const PADDING = 12;
const KEY = 24;       // a key badge and the gap before it
const LINE = 18;      // two names closer than this, top to top, share a line
const PASSES = 8;

/** The width a name takes on screen, near enough to keep two apart. */
export const labelWidth = (name, keys = 0) => name.length * CHAR + PADDING + keys * KEY;

/**
 * Nudges names that would sit on top of one another apart, sideways. From the
 * drummer's stool the two rack toms stand side by side, and on a small stage
 * their names collide.
 *
 * @param {{ id: string, x: number, y: number, width: number }[]} labels
 * @param {{ gap?: number }} [options] the space to leave between two names
 * @returns the same names, moved where needed; the list given is left as it was
 */
export function spreadLabels(labels, { gap = 4 } = {}) {
  let placed = labels.map(label => ({ ...label }));
  for (let pass = 0; pass < PASSES; pass += 1) {
    let moved = false;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i], b = placed[j];
        if (Math.abs(a.y - b.y) >= LINE) continue;
        const apart = b.x - a.x, need = (a.width + b.width) / 2 + gap;
        if (Math.abs(apart) >= need) continue;
        const push = (need - Math.abs(apart)) / 2, side = apart >= 0 ? 1 : -1;
        placed = placed.map((label, index) => (index === i ? { ...a, x: a.x - side * push } : index === j ? { ...b, x: b.x + side * push } : label));
        moved = true;
      }
    }
    if (!moved) break;
  }
  return placed;
}
