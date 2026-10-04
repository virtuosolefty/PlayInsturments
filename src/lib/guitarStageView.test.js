import { describe, expect, it } from 'vitest';
import { GUITAR_CHORDS } from './guitar.js';
import { DRAWN_NECK, fretSpace, modelNeck, NUT_X, OPEN_SPACE, stringZ } from './guitarNeck.js';
import { dotLook, fitColumn, hoverText, spreadApart, stageLabels, stringColumn, STRING_LABEL_INSET } from './guitarStageView.js';

// A stand-in for the camera. Every coordinate moves the result, so a label anchored at the
// wrong place along the neck, at the wrong height or on the wrong string lands somewhere else.
const project = (x, y, z) => ({ x: 500 + x * 40 + z, y: 120 - z * 30 + x * 2 + y * 100 });
const chord = name => GUITAR_CHORDS.find(c => c.name === name);
const labels = (options = {}) => stageLabels({ project, width: 1000, maxFret: 12, ...options });
const of = (list, kind) => list.filter(l => l.kind === kind);

describe('markers on the guitar stage', () => {
  it('hides places with nothing to say', () => {
    expect(dotLook('idle').visible).toBe(false);
    for (const state of ['held', 'target', 'hover', 'possible', 'chord']) expect(dotLook(state).visible).toBe(true);
  });

  it('fills what was played and outlines what is only suggested', () => {
    expect(dotLook('held').ring).toBe(false);
    expect(dotLook('chord').ring).toBe(false);
    for (const state of ['target', 'hover', 'possible']) expect(dotLook(state).ring).toBe(true);
  });

  it('colours a played note by its verdict', () => {
    expect(dotLook('held').color).toBe('#63dbb6');
    expect(dotLook('held', { verdict: 'wrong' }).color).toBe('#c95d74');
    expect(dotLook('held', { verdict: 'timing' }).color).toBe('#c69548');
  });

  it('makes a played note the largest marker and a guessed position the faintest', () => {
    expect(dotLook('held').scale).toBe(1.7);
    for (const state of ['target', 'hover', 'possible', 'chord']) expect(dotLook(state).scale).toBe(1.5);
    expect(dotLook('possible').opacity).toBe(0.38);
    for (const state of ['held', 'target', 'hover', 'chord']) expect(dotLook(state).opacity).toBe(1);
  });

  it('uses one colour for what is pointed at and another for a guessed position', () => {
    expect(dotLook('target').color).toBe('#7160c6');
    expect(dotLook('hover').color).toBe('#7160c6');
    expect(dotLook('possible').color).toBe('#cfb980');
  });

  it('ignores a verdict it does not know, even one named like a built-in property', () => {
    for (const verdict of ['constructor', 'toString', 'hit', undefined]) expect(dotLook('held', { verdict }).color).toBe('#63dbb6');
  });

  it('hands back the same frozen look for the same inputs, so a frame can skip what has not changed', () => {
    expect(dotLook('held', { verdict: 'wrong' })).toBe(dotLook('held', { verdict: 'wrong' }));
    expect(dotLook('chord', { root: true })).toBe(dotLook('chord', { root: true }));
    expect(dotLook('chord', { root: true })).not.toBe(dotLook('chord'));
    expect(Object.isFrozen(dotLook('target'))).toBe(true);
  });

  it('marks a chord root in copper and other chord tones in cream', () => {
    expect(dotLook('chord', { root: true }).color).toBe('#e3ad77');
    expect(dotLook('chord').color).toBe('#f1ebdf');
    // A root that is being played or pointed at shows that state instead.
    expect(dotLook('held', { root: true }).color).toBe('#63dbb6');
    expect(dotLook('target', { root: true }).color).toBe(dotLook('hover').color);
  });
});

describe('labels on the guitar stage', () => {
  it('names and numbers the six strings at the nut, pinned to the near edge', () => {
    const strings = of(labels(), 'string');
    expect(strings.map(l => l.text)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    // Numbered as tablature does, from the high E.
    expect(strings.map(l => l.number)).toEqual([6, 5, 4, 3, 2, 1]);
    strings.forEach((l, s) => {
      expect(l.x).toBe(STRING_LABEL_INSET);
      expect(l.y).toBeCloseTo(project(NUT_X, 0.3, stringZ(s)).y);
    });
  });

  it('moves the string names to the other edge for a left-handed neck', () => {
    of(labels({ leftHanded: true }), 'string').forEach(l => expect(l.x).toBe(1000 - STRING_LABEL_INSET));
  });

  it('numbers each visible fret space at its middle', () => {
    const frets = of(labels({ maxFret: 5 }), 'fret');
    expect(frets.map(l => l.text)).toEqual(['1', '2', '3', '4', '5']);
    // Just beyond the treble edge of the neck, a little above the fretboard.
    frets.forEach((l, i) => {
      const at = project(fretSpace(i + 1).x, 0.14, -2.13);
      expect(l.x).toBeCloseTo(at.x);
      expect(l.y).toBeCloseTo(at.y);
    });
  });

  it('shows no finger labels without a chord', () => {
    const list = labels();
    expect(of(list, 'finger')).toHaveLength(0);
    expect(of(list, 'muted')).toHaveLength(0);
    expect(list).toHaveLength(6 + 12);
  });

  it('labels a chord string by string: fingers, open strings and muted strings', () => {
    const list = labels({ chord: chord('D') });
    expect(of(list, 'muted').map(l => l.text)).toEqual(['×', '×']);
    expect(of(list, 'finger').map(l => l.text)).toEqual(['○', '1', '3', '2']);
    // Muted and open strings are marked behind the nut; fretted ones in their fret space, on their own string.
    of(list, 'muted').forEach((l, s) => expect(l).toMatchObject(project(OPEN_SPACE.x, 0.35, stringZ(s))));
    const [open, first] = of(list, 'finger');
    expect(open).toMatchObject(project(OPEN_SPACE.x, 0.35, stringZ(2)));
    expect(first).toMatchObject(project(fretSpace(2).x, 0.35, stringZ(3)));
  });

  it('switches chord labels between fingers, notes and intervals, flagging the root', () => {
    expect(of(labels({ chord: chord('D'), labelMode: 'notes' }), 'finger').map(l => l.text)).toEqual(['D', 'A', 'D', 'F#']);
    const intervals = of(labels({ chord: chord('D'), labelMode: 'intervals' }), 'finger');
    expect(intervals.map(l => l.text)).toEqual(['R', '5', 'R', '3']);
    expect(intervals.map(l => !!l.root)).toEqual([true, false, true, false]);
  });

  it('leaves out chord tones that sit beyond the visible frets', () => {
    const shape = { ...chord('D'), frets: [null, null, 0, 7, 3, 2] };
    expect(of(labels({ chord: shape, maxFret: 5 }), 'finger')).toHaveLength(3);
    expect(of(labels({ chord: shape, maxFret: 12 }), 'finger')).toHaveLength(4);
  });
});

describe('labels on a downloaded guitar', () => {
  // Strings that fan out from the nut to the saddle and sit lower than the drawn ones.
  const neck = modelNeck({
    nutX: NUT_X,
    strings: [0, 1, 2, 3, 4, 5].map(s => ({ nut: [NUT_X, 0, 0.72 - s * 0.2885], bridge: [18.4, 0.22, 1.12 - s * 0.45] })),
  });
  const onModel = (options = {}) => labels({ neck, stringBand: { top: -1e4, bottom: 1e4 }, ...options });

  it('names each string above where it leaves the nut', () => {
    // Small text, so the names fit between strings that are closer together at the nut than the drawn ones.
    of(onModel({ fontSize: 6 }), 'string').forEach((l, s) => {
      const at = neck.labelAt('string', s, NUT_X);
      expect(l.y).toBeCloseTo(project(NUT_X, at.y, at.z).y);
    });
  });

  it('numbers the frets beside the high string, following the fan of the strings', () => {
    of(onModel({ maxFret: 5 }), 'fret').forEach((l, i) => {
      const x = fretSpace(i + 1).x, at = neck.fretLabelAt(x);
      expect(l).toMatchObject(project(x, at.y, at.z));
    });
  });

  it('leaves the string names out when asked, keeping the fret numbers and chord labels', () => {
    const list = onModel({ chord: chord('D'), stringNames: false });
    expect(of(list, 'string')).toHaveLength(0);
    expect(of(list, 'fret')).toHaveLength(12);
    expect(of(list, 'finger')).toHaveLength(4);
  });

  it('puts chord labels above the strings where they cross each fret space', () => {
    const [open, first] = of(onModel({ chord: chord('D') }), 'finger');
    const above = (s, x) => { const at = neck.labelAt('chord', s, x); return project(x, at.y, at.z); };
    expect(open).toMatchObject(above(2, OPEN_SPACE.x));
    expect(first).toMatchObject(above(3, fretSpace(2).x));
    expect(neck.labelAt('chord', 3, fretSpace(2).x).y).toBeGreaterThan(neck.stringAt(3, fretSpace(2).x).y);
  });
});

describe('labels on a cramped stage', () => {
  // A phone-sized camera: the whole neck squeezed into about 370 px, strings about 6 px apart.
  const tiny = (x, y, z) => ({ x: 190 + x * 9 + z, y: 90 - z * 4.6 + y * 20 });
  const crowded = (options = {}) => stageLabels({ project: tiny, width: 370, maxFret: 12, fontSize: 14, ...options });
  const overlap = (a, b, gap) => Math.abs(a - b) < gap - 1e-9;

  it('spreads the string names apart, in order, keeping the column centred on the strings', () => {
    const strings = of(crowded(), 'string');
    const ys = strings.map(l => l.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(15 - 1e-9);
    const projected = strings.map((_, s) => tiny(NUT_X, 0.3, stringZ(s)).y);
    const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
    expect(mean(ys)).toBeCloseTo(mean(projected));
    expect(strings.map(l => l.text)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  });

  it('drops fret numbers that would overlap, keeping the inlay frets and the first', () => {
    const frets = of(crowded(), 'fret');
    const kept = frets.map(l => l.text);
    for (const must of ['1', '3', '5', '7', '9', '12']) expect(kept).toContain(must);
    expect(kept.length).toBeLessThan(12);
    const sorted = [...frets].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const width = text => text.length * 0.62 * 14 + 4;
      expect(overlap(sorted[i].x, sorted[i - 1].x, (width(sorted[i].text) + width(sorted[i - 1].text)) / 2)).toBe(false);
    }
  });

  it('ties each string name it moved back to its string, where the string leaves the nut', () => {
    for (const leftHanded of [false, true]) {
      of(crowded({ leftHanded }), 'string').forEach((l, s) => {
        const at = DRAWN_NECK.stringAt(s, NUT_X);
        expect(l.leader.to).toEqual(tiny(NUT_X, at.y, at.z));
        expect(l.leader.from.y).toBe(l.y);
        // From beside the name, on the side the strings are.
        if (leftHanded) expect(l.leader.from.x).toBeLessThan(l.x - 12);
        else expect(l.leader.from.x).toBeGreaterThan(l.x + 12);
      });
    }
  });

  it('leaves a roomy stage exactly as it was: every string name on its string, all twelve fret numbers', () => {
    for (const fontSize of [14, 18]) {
      const roomy = stageLabels({ project, width: 1000, maxFret: 12, fontSize, stringBand: { top: 0, bottom: 300 } });
      of(roomy, 'string').forEach((l, s) => {
        expect(l.y).toBe(project(NUT_X, 0.3, stringZ(s)).y);
        // Level with its string, a name needs no leader.
        expect(l.leader).toBeNull();
      });
      expect(of(roomy, 'fret').map(l => l.text)).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
    }
  });

  it('keeps labels apart at the large text size and on a left-handed neck too', () => {
    for (const options of [{ fontSize: 18 }, { leftHanded: true }, { fontSize: 18, leftHanded: true }]) {
      const list = crowded(options);
      const ys = of(list, 'string').map(l => l.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(15 - 1e-9);
      const size = options.fontSize ?? 14, width = text => text.length * 0.62 * size + 4;
      const frets = of(list, 'fret').sort((a, b) => a.x - b.x);
      for (let i = 1; i < frets.length; i++) expect(frets[i].x - frets[i - 1].x).toBeGreaterThanOrEqual((width(frets[i].text) + width(frets[i - 1].text)) / 2 - 1e-9);
      if (options.leftHanded) of(list, 'string').forEach(l => expect(l.x).toBe(370 - STRING_LABEL_INSET));
    }
  });

  it('keeps the string names inside the band between the stage bars', () => {
    const band = { top: 60, bottom: 125 };
    const strings = of(crowded({ stringBand: band }), 'string');
    const half = 15 / 2;
    for (const l of strings) {
      expect(l.y - half).toBeGreaterThanOrEqual(band.top - 1e-9);
      expect(l.y + half).toBeLessThanOrEqual(band.bottom + 1e-9);
    }
    expect(strings.map(l => l.text)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  });

  it('falls back to the standard text size when the stored one is not a number', () => {
    const list = crowded({ fontSize: 'large' });
    expect(list.every(l => Number.isFinite(l.x) && Number.isFinite(l.y))).toBe(true);
    expect(list).toEqual(crowded({ fontSize: 14 }));
  });
});

describe('a column of string names', () => {
  const name = (y, to) => ({ text: 'E4', number: 1, kind: 'string', y, to });
  const column = (names, options = {}) => stringColumn(names, { x: 28, fontSize: 13, ...options });

  it('pins the names to the column and leaves those level with their string without a leader', () => {
    const placed = column([name(100, { x: 300, y: 104 }), name(140, { x: 300, y: 144 })]);
    expect(placed.map(l => [l.x, l.y, l.leader])).toEqual([[28, 100, null], [28, 140, null]]);
  });

  it('ties a name it moved off its string back to the string, the leader starting beside the name', () => {
    const placed = column([name(100, { x: 300, y: 102 }), name(104, { x: 300, y: 106 })]);
    placed.forEach((l, i) => {
      expect(l.leader.from.y).toBe(l.y);
      expect(l.leader.from.x).toBeGreaterThan(l.x + 12);
      expect(l.leader.to).toEqual({ x: 300, y: [102, 106][i] });
    });
    expect(placed[0].leader.from.x).toBe(placed[1].leader.from.x);
  });

  it('runs the leaders the other way when the strings lie to the left of the names', () => {
    const placed = column([name(100, { x: 600, y: 102 }), name(104, { x: 600, y: 106 })], { x: 972, toward: -1 });
    placed.forEach(l => {
      expect(l.leader.from.x).toBeLessThan(l.x - 12);
      expect(l.leader.to.x).toBe(600);
    });
  });

  it('draws no leader back through a name, nor to a string that did not project', () => {
    const placed = column([name(100, { x: 20, y: 102 }), name(104, { x: Number.NaN, y: 106 })]);
    expect(placed.map(l => l.leader)).toEqual([null, null]);
  });

  it('does not change the names it was given', () => {
    const names = [name(100, { x: 300, y: 102 }), name(104, { x: 300, y: 106 })];
    const before = structuredClone(names);
    column(names);
    expect(names).toEqual(before);
  });
});

describe('fitting a column of labels into a band', () => {
  it('leaves a column that already fits alone', () => {
    expect(fitColumn([20, 40, 60], { top: 0, bottom: 100 }, 5)).toEqual([20, 40, 60]);
  });

  it('slides a column that runs out of the band back inside, keeping its spacing', () => {
    expect(fitColumn([70, 90, 110], { top: 0, bottom: 100 }, 5)).toEqual([55, 75, 95]);
    expect(fitColumn([-10, 10, 30], { top: 0, bottom: 100 }, 5)).toEqual([5, 25, 45]);
  });

  it('squeezes a column taller than the band to fill it evenly', () => {
    expect(fitColumn([0, 30, 60, 90], { top: 10, bottom: 70 }, 5)).toEqual([15, 31.666666666666668, 48.333333333333336, 65]);
  });

  it('does not change the list it was given', () => {
    const ys = [70, 90, 110];
    fitColumn(ys, { top: 0, bottom: 100 }, 5);
    expect(ys).toEqual([70, 90, 110]);
  });
});

describe('keeping a column of labels apart', () => {
  it('leaves labels that already have room where they are', () => {
    expect(spreadApart([10, 30, 50], 15)).toEqual([10, 30, 50]);
  });

  it('pushes crowded labels apart around their middle, in order', () => {
    const spread = spreadApart([100, 102, 104, 106], 10);
    expect(spread).toEqual([88, 98, 108, 118]);
  });

  it('only moves the crowded run, not labels that were already clear of it', () => {
    const spread = spreadApart([0, 50, 51, 52, 120], 10);
    expect(spread[0]).toBe(0);
    expect(spread[4]).toBe(120);
    expect(spread.slice(1, 4)).toEqual([41, 51, 61]);
  });

  it('spreads labels that start at the same place evenly around it', () => {
    expect(spreadApart([5, 5, 5], 10)).toEqual([-5, 5, 15]);
  });

  it('merges runs that grow into each other', () => {
    const spread = spreadApart([0, 1, 14, 15], 10);
    for (let i = 1; i < spread.length; i++) expect(spread[i] - spread[i - 1]).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(spread.reduce((a, b) => a + b, 0) / 4).toBeCloseTo(7.5);
  });

  it('does not change the list it was given', () => {
    const ys = [5, 6, 7];
    spreadApart(ys, 10);
    expect(ys).toEqual([5, 6, 7]);
  });
});

describe('hover hint on the guitar stage', () => {
  it('names the string as tablature does, the fret and the pitch', () => {
    expect(hoverText({ string: 0, fret: 0, midi: 40 })).toBe('String 6 · open · E2');
    expect(hoverText({ string: 3, fret: 4, midi: 59 })).toBe('String 3 · fret 4 · B3');
  });

  it('says nothing when nothing is under the pointer', () => {
    expect(hoverText(null)).toBe('');
  });
});
