/**
 * recipes.mjs — what each downloaded instrument is made of, and how it sits on the stage.
 *
 * prepare.mjs does the same work for every instrument; a recipe tells it which
 * pieces are which, which way the model faces, and how big its textures may be.
 * Pieces are told apart by shape, measured against the model's own length, so
 * the rules hold whatever units the artist modelled in.
 *
 * Stage axes, shared with the guitar built in code: x runs along the strings
 * from the head of the instrument toward its body, y points out of the playing
 * surface, z runs across the strings. `axes` gives, for each stage axis, the
 * model axis it comes from (with its sign).
 */

import { creditLine, modelCredit } from '../../src/lib/modelCredits.js';

/** Size of `piece` along `axis` as a share of the model's length. */
const share = (piece, axis, model) => piece.box.size[axis] / model.length;

/** The credit written into the model's file, from the app's one list of credits. */
const credit = model => {
  const { title, author, authorUrl, source, license, licenseUrl } = modelCredit(model);
  return { title, author, authorUrl, source, license, licenseUrl, line: creditLine(modelCredit(model)) };
};

/** Sketchfab's glTF download is y up, whatever the artist worked in. */
const UPRIGHT = [[0, 1], [1, 1], [2, 1]];

/**
 * A model that is only shown (showcase.mjs): `axes` stands it up, and `view`
 * is the angle the viewer first sees it from, in degrees round it and above it.
 */
const shown = (model, { axes = UPRIGHT, view, imageSize = 1024 }) => ({
  showcase: true,
  credit: credit(model),
  axes,
  view,
  imageSize: (image, role) => (typeof imageSize === 'function' ? imageSize(image, role) : imageSize),
});

// The guitar's parts are already separate meshes, named by their materials.
const GUITAR_PARTS = {
  body1: 'top', body2: 'sides', body3: 'back', body_facets_guitar: 'binding', bridge: 'bridge',
  'neck-head': 'neck', neck2: 'fretboard', 'bridge-pins-saddle-nut': 'hardware', frets: 'frets',
  'string5-6': 'string', 'string1-2-3-4': 'string', pattern: 'rosette', tuning: 'tuners',
};

export const RECIPES = {
  guitar: {
    credit: credit('guitar'),
    // Model: neck along z with the headstock toward −z, top facing +y, bass strings toward −x.
    lengthAxis: 2,
    headAt: 'min',
    axes: [[2, 1], [1, 1], [0, -1]],
    strings: 6,
    classify: piece => GUITAR_PARTS[piece.material] ?? 'other',
    /** Frets are measured too: the fret maths has to land on them. */
    frets: piece => piece.material === 'frets',
    imageSize: () => 1024,
  },

  violin: {
    credit: credit('violin'),
    // Model: one mesh along z with the scroll toward −z, top facing +y.
    lengthAxis: 2,
    headAt: 'min',
    axes: [[2, 1], [1, 1], [0, -1]],
    strings: 4,
    classify(piece, model) {
      if (share(piece, 2, model) > 0.6 && share(piece, 0, model) < 0.05) return 'string';
      if (share(piece, 2, model) < 0.01 && share(piece, 0, model) > 0.05 && share(piece, 0, model) < 0.15 && share(piece, 1, model) > 0.03) return 'bridge';
      return piece.largest ? 'body' : 'fittings';
    },
    imageSize: (image, role) => (role === 'baseColor' ? 2048 : 1024),
  },

  cello: {
    credit: credit('cello'),
    // Model: standing on its endpin along +y with the scroll at the top, front facing +z.
    lengthAxis: 1,
    headAt: 'max',
    axes: [[1, -1], [2, 1], [0, -1]],
    strings: 4,
    classify(piece, model) {
      if (piece.material === 'cello_mat01') return 'body';
      if (share(piece, 1, model) > 0.5 && share(piece, 0, model) < 0.03) return 'string';
      if (share(piece, 1, model) < 0.01 && share(piece, 0, model) > 0.04) return 'bridge';
      if (share(piece, 1, model) > 0.3 && share(piece, 0, model) > 0.03) return 'fingerboard';
      return 'fittings';
    },
    imageSize: (image, role) => (image.includes('mat01') && role === 'baseColor' ? 2048 : role === 'metallicRoughness' && image.includes('mat02') ? 512 : 1024),
  },

  // Shown in the whole-instrument view, never played. Each reads models-src/<id>/scene.gltf.
  'guitar-bass': shown('guitar-bass', { view: { azimuthDeg: 20, elevationDeg: 12 } }),
  'violin-electric': shown('violin-electric', { view: { azimuthDeg: 20, elevationDeg: 10 } }),
  'cello-antique': shown('cello-antique', { view: { azimuthDeg: 20, elevationDeg: 10 } }),
  'drums-acoustic': shown('drums-acoustic', { view: { azimuthDeg: 25, elevationDeg: 22 } }),
  'drums-electronic': shown('drums-electronic', { view: { azimuthDeg: 25, elevationDeg: 22 } }),
};
