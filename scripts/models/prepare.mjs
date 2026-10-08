#!/usr/bin/env node
/**
 * prepare.mjs — turns the downloaded instruments into the files the stage loads.
 *
 *   node scripts/models/prepare.mjs [guitar] [violin] [cello] [guitar-bass] ...
 *
 * Reads models-src/<name>/scene.gltf — Sketchfab's "glTF (Autoconverted)"
 * download, unzipped — and writes, for each instrument:
 *
 *   public/models/<name>.glb   the model without its own strings, turned and
 *                              scaled into stage units, textures as WebP
 *   public/models/<name>.json  where its playable parts are: each string's
 *                              ends at the nut and the bridge (or saddle), the
 *                              frets, part bounds, and the credit CC BY needs
 *
 * Every instrument comes out the same size along its strings: 24.1 stage units
 * from the nut to the bridge, with the nut at x = −6.05, matching the guitar
 * built in code (src/lib/guitarNeck.js). The stage draws the strings between
 * nut and bridge itself, so they can vibrate and be played; of the model's own
 * strings only the ends beyond the nut and the bridge are kept.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGlb, createGltfBuilder, readAccessor, transformNormals, transformPoints, worldMatrices } from './gltfIO.mjs';
import { connectedComponents, describeComponents, weldByPosition } from './meshParts.mjs';
import { crossSectionRadius, fitLine, fitScale, playingSpan, ringCentres } from './fit.mjs';
import { toWebp } from './images.mjs';
import { quantizeFrame, quantizePart } from './quantize.mjs';
import { RECIPES } from './recipes.mjs';
import { asMetalRough, leanPrimitive, showcaseTransform, wholePieces } from './showcase.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const NUT_X = -6.05;
export const SCALE_LENGTH = 24.1;
const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;
const QUALITY = { baseColor: 0.86, normal: 0.92, metallicRoughness: 0.9, occlusion: 0.9, emissive: 0.86 };

/** The source glTF with its buffers, and every mesh primitive moved into the model's world space. */
function loadSource(name) {
  const dir = path.join(ROOT, 'models-src', name);
  const json = JSON.parse(readFileSync(path.join(dir, 'scene.gltf'), 'utf8'));
  const buffers = json.buffers.map(b => new Uint8Array(readFileSync(path.join(dir, b.uri))));
  const primitives = [];
  for (const [nodeIndex, matrix] of worldMatrices(json)) {
    const node = json.nodes[nodeIndex];
    if (node.mesh === undefined) continue;
    for (const prim of json.meshes[node.mesh].primitives) {
      const read = key => (prim.attributes[key] === undefined ? null : readAccessor(json, buffers, prim.attributes[key]));
      const tangents = read('TANGENT');
      primitives.push({
        material: prim.material,
        materialName: json.materials?.[prim.material]?.name ?? '',
        positions: transformPoints(read('POSITION'), matrix),
        normals: read('NORMAL') && transformNormals(read('NORMAL'), matrix),
        uvs: read('TEXCOORD_0'),
        tangents: tangents && transformTangents(tangents, matrix),
        indices: prim.indices === undefined ? Uint32Array.from({ length: read('POSITION').length / 3 }, (_, i) => i) : Uint32Array.from(readAccessor(json, buffers, prim.indices)),
      });
    }
  }
  return { dir, json, primitives };
}

/** Tangents follow the surface like directions; their w (handedness) is kept. */
function transformTangents(tangents, m) {
  const out = new Float32Array(tangents.length);
  for (let i = 0; i < tangents.length; i += 4) {
    const x = tangents[i], y = tangents[i + 1], z = tangents[i + 2];
    const tx = m[0] * x + m[4] * y + m[8] * z, ty = m[1] * x + m[5] * y + m[9] * z, tz = m[2] * x + m[6] * y + m[10] * z;
    const length = Math.hypot(tx, ty, tz) || 1;
    out[i] = tx / length; out[i + 1] = ty / length; out[i + 2] = tz / length; out[i + 3] = tangents[i + 3];
  }
  return out;
}

/** Every disconnected piece of every primitive, with its bounds and the recipe's verdict on what it is. */
function findPieces(source, recipe) {
  const all = source.primitives.flatMap(p => [...p.positions]);
  const box = { min: [0, 1, 2].map(k => Math.min(...source.primitives.map(p => minOf(p.positions, k)))), max: [0, 1, 2].map(k => Math.max(...source.primitives.map(p => maxOf(p.positions, k)))) };
  const model = { box, length: Math.max(...box.max.map((v, k) => v - box.min[k])) };
  void all;
  const pieces = [];
  source.primitives.forEach((prim, primIndex) => {
    const parts = connectedComponents(prim.indices, weldByPosition(prim.positions, model.length * 1e-6));
    const boxes = describeComponents(prim.positions, prim.indices, parts);
    const largest = boxes.reduce((best, b, i) => (b.triangles > boxes[best].triangles ? i : best), 0);
    boxes.forEach((b, i) => {
      const piece = { primIndex, index: i, material: prim.materialName, box: b, triangles: b.triangles, largest: i === largest };
      piece.part = recipe.classify(piece, model);
      piece.isFret = recipe.frets?.(piece) ?? false;
      pieces.push(piece);
    });
    prim.parts = parts;
  });
  return { pieces, model };
}

function minOf(positions, k) { let v = Infinity; for (let i = k; i < positions.length; i += 3) if (positions[i] < v) v = positions[i]; return v; }
function maxOf(positions, k) { let v = -Infinity; for (let i = k; i < positions.length; i += 3) if (positions[i] > v) v = positions[i]; return v; }

/** The vertex positions of one piece, as xyz triples. */
function piecePoints(source, piece) {
  const prim = source.primitives[piece.primIndex], seen = new Set();
  for (let t = 0; t < prim.parts.ofTriangle.length; t++) {
    if (prim.parts.ofTriangle[t] !== piece.index) continue;
    for (let c = 0; c < 3; c++) seen.add(prim.indices[t * 3 + c]);
  }
  return [...seen].map(v => [prim.positions[v * 3], prim.positions[v * 3 + 1], prim.positions[v * 3 + 2]]);
}

/**
 * Where the model's strings run between nut and bridge, in model space, lowest
 * string first. A string bends at the nut and at the bridge, so its longest
 * straight stretch is the part that plays.
 *
 * Strings are ordered by where they sit across the neck. Which end of that
 * order is the bass is read from their thickness: artists rarely model true
 * gauges, but the thick side is still the thick side.
 */
function measureStrings(source, pieces, recipe, model) {
  const along = recipe.lengthAxis, [across, sign] = recipe.axes[2];
  const strings = pieces.filter(p => p.part === 'string').map(piece => {
    const points = piecePoints(source, piece);
    const span = playingSpan(ringCentres(points, along, model.length * 0.0015), 2);
    const [a, b] = [span.from, span.to].sort((p, q) => p[along] - q[along]);
    const [nut, bridge] = recipe.headAt === 'min' ? [a, b] : [b, a];
    const inside = points.filter(p => p[along] > Math.min(nut[along], bridge[along]) && p[along] < Math.max(nut[along], bridge[along]));
    const radius = inside.length >= 3 ? crossSectionRadius(inside, fitLine(inside, along)) : 0;
    return { piece, nut, bridge, radius, side: sign * bridge[across] };
  });
  if (strings.length !== recipe.strings) throw new Error(`Expected ${recipe.strings} strings in the model, found ${strings.length}`);
  strings.sort((p, q) => q.side - p.side);
  const mean = key => strings.reduce((sum, s) => sum + s[key], 0) / strings.length;
  const trend = strings.reduce((sum, s) => sum + (s.side - mean('side')) * (s.radius - mean('radius')), 0);
  return trend >= 0 ? strings : strings.reverse();
}

/** The stage transform: turn the model's axes onto the stage's, scale, and put the nut at x = NUT_X on the strings' centreline. */
function stageTransform(recipe, origin, scale) {
  const apply = point => recipe.axes.map(([axis, sign], k) => sign * (point[axis] - origin[axis]) * scale + (k === 0 ? NUT_X : 0));
  const turn = vector => recipe.axes.map(([axis, sign]) => sign * vector[axis]);
  return { apply, turn, scale };
}

/**
 * The triangles each piece keeps in the GLB: all of them, except that a string
 * keeps only its ends, past the nut and past the bridge, as the part
 * 'stringEnds'. The stage draws the stretch between, which is what plays; the
 * ends still run on to the tuners, pegs or tailpiece.
 */
function keptPieces(source, pieces, strings, along) {
  const spans = new Map(strings.map(s => [s.piece, [Math.min(s.nut[along], s.bridge[along]), Math.max(s.nut[along], s.bridge[along])]]));
  return pieces.map(piece => {
    const prim = source.primitives[piece.primIndex], span = spans.get(piece), triangles = [];
    for (let t = 0; t < prim.parts.ofTriangle.length; t++) {
      if (prim.parts.ofTriangle[t] !== piece.index) continue;
      const centre = span && (prim.positions[prim.indices[t * 3] * 3 + along] + prim.positions[prim.indices[t * 3 + 1] * 3 + along] + prim.positions[prim.indices[t * 3 + 2] * 3 + along]) / 3;
      if (!span || centre < span[0] || centre > span[1]) triangles.push(t);
    }
    return { ...piece, part: span ? 'stringEnds' : piece.part, triangles };
  }).filter(piece => piece.triangles.length);
}

/** Moves the kept triangles into stage space as one compact primitive per part. */
function buildParts(source, pieces, transform) {
  const groups = new Map(); // `${part}|${material}` → { part, material, triangles: [] }
  for (const piece of pieces) {
    const prim = source.primitives[piece.primIndex];
    const key = `${piece.part}|${prim.material}`;
    if (!groups.has(key)) groups.set(key, { part: piece.part, material: prim.material, primIndex: piece.primIndex, triangles: [] });
    const group = groups.get(key);
    if (group.primIndex !== piece.primIndex) throw new Error(`Part ${piece.part} draws on two primitives with one material, which this script does not merge`);
    group.triangles.push(...piece.triangles);
  }
  return [...groups.values()].map(group => {
    const prim = source.primitives[group.primIndex];
    const remap = new Map(), indices = [];
    for (const t of group.triangles.sort((a, b) => a - b)) for (let c = 0; c < 3; c++) {
      const v = prim.indices[t * 3 + c];
      if (!remap.has(v)) remap.set(v, remap.size);
      indices.push(remap.get(v));
    }
    const count = remap.size, order = [...remap.keys()];
    const positions = new Float32Array(count * 3), normals = prim.normals && new Float32Array(count * 3);
    const uvs = prim.uvs && new Float32Array(count * 2), tangents = prim.tangents && new Float32Array(count * 4);
    order.forEach((v, i) => {
      positions.set(transform.apply([prim.positions[v * 3], prim.positions[v * 3 + 1], prim.positions[v * 3 + 2]]), i * 3);
      if (normals) normals.set(transform.turn([prim.normals[v * 3], prim.normals[v * 3 + 1], prim.normals[v * 3 + 2]]), i * 3);
      if (uvs) uvs.set([prim.uvs[v * 2], prim.uvs[v * 2 + 1]], i * 2);
      if (tangents) tangents.set([...transform.turn([prim.tangents[v * 4], prim.tangents[v * 4 + 1], prim.tangents[v * 4 + 2]]), prim.tangents[v * 4 + 3]], i * 4);
    });
    return { part: group.part, material: group.material, positions, normals, uvs, tangents, indices: count > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices) };
  });
}

const boundsOf = positions => ({ min: [0, 1, 2].map(k => +minOf(positions, k).toFixed(4)), max: [0, 1, 2].map(k => +maxOf(positions, k).toFixed(4)) });

/** The textures the kept materials use, re-encoded as WebP, and the materials pointing at them. */
async function encodeMaterials(source, parts, recipe) {
  const { json, dir } = source;
  const used = [...new Set(parts.map(p => p.material))].sort((a, b) => a - b);
  const slots = m => [
    ['baseColor', m.pbrMetallicRoughness?.baseColorTexture], ['metallicRoughness', m.pbrMetallicRoughness?.metallicRoughnessTexture],
    ['normal', m.normalTexture], ['occlusion', m.occlusionTexture], ['emissive', m.emissiveTexture],
  ].filter(([, slot]) => slot);
  const imageJobs = new Map(); // source image index → { role, ... }
  for (const index of used) for (const [role, slot] of slots(json.materials[index])) {
    const image = json.textures[slot.index].source;
    if (!imageJobs.has(image)) imageJobs.set(image, { role, uri: json.images[image].uri });
  }
  const order = [...imageJobs.keys()];
  const encoded = await toWebp(order.map(image => {
    const { role, uri } = imageJobs.get(image);
    return { bytes: new Uint8Array(readFileSync(path.join(dir, uri))), mimeType: /\.jpe?g$/i.test(uri) ? 'image/jpeg' : 'image/png', maxSize: recipe.imageSize(uri, role), quality: QUALITY[role] };
  }));
  const imageIndex = new Map(order.map((image, i) => [image, i]));
  const textureFor = slot => ({ ...slot, index: imageIndex.get(json.textures[slot.index].source) });
  const materials = used.map(index => {
    const m = json.materials[index], pbr = m.pbrMetallicRoughness ?? {};
    const material = { name: m.name, pbrMetallicRoughness: { ...pbr }, doubleSided: m.doubleSided ?? false, alphaMode: m.alphaMode ?? 'OPAQUE' };
    if (pbr.baseColorTexture) material.pbrMetallicRoughness.baseColorTexture = textureFor(pbr.baseColorTexture);
    if (pbr.metallicRoughnessTexture) material.pbrMetallicRoughness.metallicRoughnessTexture = textureFor(pbr.metallicRoughnessTexture);
    for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) if (m[key]) material[key] = textureFor(m[key]);
    if (m.emissiveFactor) material.emissiveFactor = m.emissiveFactor;
    if (m.alphaCutoff !== undefined) material.alphaCutoff = m.alphaCutoff;
    return material;
  });
  return { materials, materialIndex: new Map(used.map((index, i) => [index, i])), images: encoded, report: order.map((image, i) => ({ uri: imageJobs.get(image).uri, from: `${encoded[i].sourceWidth}²`, to: `${encoded[i].width}²`, kb: Math.round(encoded[i].bytes.length / 1024) })) };
}

/**
 * One GLB: a root node named after the instrument, one child per part. Vertex
 * data is quantized (see quantize.mjs); each part's node carries the
 * translation and scale that bring its positions back to stage units.
 */
function writeGlb(name, recipe, parts, encoded) {
  const builder = createGltfBuilder();
  const images = encoded.images.map(image => builder.addImage(image.bytes, 'image/webp'));
  const textures = images.map(source => ({ sampler: 0, extensions: { EXT_texture_webp: { source } } }));
  const names = [...new Set(parts.map(part => part.part))];
  const frames = new Map(names.map(partName => [partName, quantizeFrame(parts.filter(part => part.part === partName).map(part => part.positions))]));
  const byPart = new Map();
  for (const part of parts) {
    const q = quantizePart(part, frames.get(part.part));
    const vertex = (data, type, normalized = true) => builder.addAccessor(data, type, { target: ARRAY_BUFFER, normalized });
    const attributes = { POSITION: vertex(q.positions, 'VEC3') };
    if (q.normals) attributes.NORMAL = vertex(q.normals, 'VEC3');
    if (q.uvs) attributes.TEXCOORD_0 = vertex(q.uvs, 'VEC2', q.uvsNormalized);
    if (q.tangents) attributes.TANGENT = vertex(q.tangents, 'VEC4');
    const primitive = { attributes, indices: builder.addAccessor(part.indices, 'SCALAR', { target: ELEMENT_ARRAY_BUFFER }), material: encoded.materialIndex.get(part.material) };
    if (!byPart.has(part.part)) byPart.set(part.part, []);
    byPart.get(part.part).push(primitive);
  }
  const meshes = [...byPart].map(([part, primitives]) => ({ name: part, primitives }));
  const nodes = [{ name, children: meshes.map((_, i) => i + 1) }, ...meshes.map((mesh, i) => {
    const { translation, scale } = frames.get(mesh.name);
    return { name: mesh.name, mesh: i, translation, scale: [scale, scale, scale] };
  })];
  const { json, bin } = builder.finish({
    asset: { version: '2.0', generator: 'Practice Deck prepare-models', copyright: recipe.credit.line, extras: { ...recipe.credit } },
    extensionsUsed: ['EXT_texture_webp', 'KHR_mesh_quantization'], extensionsRequired: ['EXT_texture_webp', 'KHR_mesh_quantization'],
    scene: 0, scenes: [{ nodes: [0] }], nodes, meshes,
    materials: encoded.materials, textures, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  });
  return buildGlb(json, bin);
}

/**
 * A model that is only shown (showcase.mjs): turned upright, scaled and
 * re-encoded, with every part it came with. Its measurements are just the box
 * the viewer frames and the angle it is first seen from.
 */
async function prepareShowcase(name, recipe) {
  const loaded = loadSource(name);
  const materials = (loaded.json.materials ?? []).map(asMetalRough);
  const source = { ...loaded, json: { ...loaded.json, materials }, primitives: loaded.primitives.filter(prim => !recipe.omit(prim.materialName)).map(prim => leanPrimitive(prim, materials[prim.material])) };
  const box = { min: [0, 1, 2].map(k => Math.min(...source.primitives.map(p => minOf(p.positions, k)))), max: [0, 1, 2].map(k => Math.max(...source.primitives.map(p => maxOf(p.positions, k)))) };
  const parts = buildParts(source, wholePieces(source.primitives), showcaseTransform(box, recipe.axes));
  const encoded = await encodeMaterials(source, parts, recipe);
  const glb = writeGlb(name, recipe, parts, encoded);
  const bounds = parts.map(part => boundsOf(part.positions));
  const fit = {
    name,
    credit: recipe.credit,
    showcase: true,
    view: recipe.view,
    bounds: { min: [0, 1, 2].map(k => Math.min(...bounds.map(b => b.min[k]))), max: [0, 1, 2].map(k => Math.max(...bounds.map(b => b.max[k]))) },
  };
  writeModel(name, glb, fit);
  const triangles = parts.reduce((sum, p) => sum + p.indices.length / 3, 0);
  return { name, kb: Math.round(glb.length / 1024), triangles, parts: parts.length, textures: encoded.report, bounds: fit.bounds };
}

function writeModel(name, glb, fit) {
  const out = path.join(ROOT, 'public', 'models');
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, `${name}.glb`), glb);
  writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify(fit, null, 2)}\n`);
}

async function prepare(name) {
  const recipe = RECIPES[name];
  if (!recipe) throw new Error(`No recipe for "${name}"; known: ${Object.keys(RECIPES).join(', ')}`);
  if (recipe.showcase) return prepareShowcase(name, recipe);
  const source = loadSource(name);
  const { pieces, model } = findPieces(source, recipe);
  const strings = measureStrings(source, pieces, recipe, model);
  const along = recipe.lengthAxis;
  const average = points => [0, 1, 2].map(k => points.reduce((sum, p) => sum + p[k], 0) / points.length);
  const nutPoint = average(strings.map(s => s.nut)), bridgePoint = average(strings.map(s => s.bridge));

  // The guitar's frets fix where its nut and scale really are; the other two go by where the strings bend.
  let nutAt = nutPoint[along], length = bridgePoint[along] - nutPoint[along], fretFit = null, fretsAt = null;
  const fretPieces = pieces.filter(p => p.isFret);
  if (fretPieces.length) {
    fretsAt = fretPieces.map(p => p.box.center[along]).sort((a, b) => Math.abs(a - nutAt) - Math.abs(b - nutAt));
    fretFit = fitScale(fretsAt);
    nutAt = fretFit.nut; length = fretFit.length;
  }
  const origin = [...nutPoint]; origin[along] = nutAt;
  const transform = stageTransform(recipe, origin, SCALE_LENGTH / Math.abs(length));
  const parts = buildParts(source, keptPieces(source, pieces, strings, along), transform);
  const encoded = await encodeMaterials(source, parts, recipe);
  const glb = writeGlb(name, recipe, parts, encoded);

  const round = point => point.map(v => +v.toFixed(4));
  const partBounds = {};
  for (const part of parts) {
    const b = boundsOf(part.positions), had = partBounds[part.part];
    partBounds[part.part] = had ? { min: had.min.map((v, k) => Math.min(v, b.min[k])), max: had.max.map((v, k) => Math.max(v, b.max[k])) } : b;
  }
  const all = Object.values(partBounds);
  const fit = {
    name,
    credit: recipe.credit,
    nutX: NUT_X,
    scaleLength: SCALE_LENGTH,
    strings: strings.map(s => ({ nut: round(transform.apply(s.nut)), bridge: round(transform.apply(s.bridge)), radius: +(s.radius * transform.scale).toFixed(4) })),
    ...(fretsAt && { frets: fretsAt.map(z => +transform.apply(Object.assign([...origin], { [along]: z }))[0].toFixed(4)), fretFitWorst: +(fretFit.worst * transform.scale).toFixed(4) }),
    bounds: { min: [0, 1, 2].map(k => Math.min(...all.map(b => b.min[k]))), max: [0, 1, 2].map(k => Math.max(...all.map(b => b.max[k]))) },
    parts: partBounds,
  };
  writeModel(name, glb, fit);
  const triangles = parts.reduce((sum, p) => sum + p.indices.length / 3, 0);
  return { name, kb: Math.round(glb.length / 1024), triangles, parts: [...new Set(parts.map(p => p.part))], textures: encoded.report, strings: fit.strings, fretFitWorst: fit.fretFitWorst };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(RECIPES);
  for (const name of names) {
    const report = await prepare(name);
    console.log(JSON.stringify(report, null, 1));
  }
}

export { prepare };
