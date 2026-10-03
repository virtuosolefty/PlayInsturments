import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

/**
 * modelFinish.js — what a downloaded instrument needs before it goes on stage.
 *
 * glTF's metallic-roughness material has no clear coat, so a model arrives
 * with its wood looking oiled rather than lacquered or varnished. These steps
 * give the parts that need it the coat, and let every part cast and catch the
 * studio's shadow.
 */

/** Lets every mesh under `root` cast and receive the studio's shadow. */
export function castShadows(root) {
  root.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

/**
 * Gives the parts named in `finishes` a clear coat over their own colour and
 * grain. Parts are found by `userData.part`, which models.js sets on load.
 * Materials shared between parts are coated once, and the plain materials
 * they replace are disposed; their textures carry over and stay in use.
 *
 * @param {import('three').Object3D} root the model
 * @param {Record<string, { clearcoat: number, clearcoatRoughness: number }>} finishes by part name
 * @returns {Set<import('three').Material>} the coated materials, for the stage to dispose with the model
 */
export function lacquer(root, finishes) {
  const coated = new Map();
  root.traverse(object => {
    const finish = finishes[object.userData.part];
    if (!object.isMesh || !finish || Array.isArray(object.material)) return;
    const plain = object.material;
    if (!coated.has(plain)) coated.set(plain, coat(plain, finish));
    object.material = coated.get(plain);
  });
  coated.forEach((_, plain) => plain.dispose());
  return new Set(coated.values());
}

/** A physical material with everything `plain` has, plus `finish`. */
function coat(plain, finish) {
  const physical = new MeshPhysicalMaterial();
  MeshStandardMaterial.prototype.copy.call(physical, plain);
  // The standard copy resets the shader defines to its own; the clear coat only compiles in with PHYSICAL.
  physical.defines = { STANDARD: '', PHYSICAL: '' };
  return Object.assign(physical, finish);
}
