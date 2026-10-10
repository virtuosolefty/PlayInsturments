import { Color } from 'three';

/**
 * drumModelRig.js — a downloaded drum kit that answers to being hit.
 *
 * scripts/models/prepare.mjs puts each drum of such a kit in a part of its own,
 * named `drum-<id>-<n>` (<id> as in drums.js, <n> counting a drum's pieces
 * where it has more than one, such as two crash cymbals). This finds those
 * parts in the loaded scene and, when a drum is hit, lights it in the colour
 * of its verdict and moves it: a cymbal rocks on its stand, a drum is pressed
 * down. A part's node sits at the middle of its box, so scaling and turning it
 * moves it about its own centre.
 *
 * Materials are cloned for the parts, because the kit's own are shared (every
 * drum's metal is one material) and lighting one would light them all.
 */

const PART = /^drum-(.+)-(\d+)$/;
const CYMBALS = new Set(['crash', 'ride', 'hihat']);
/** How long a drum's light and movement last, in ms: a cymbal rings on. */
const RING_MS = Object.freeze({ cymbal: 900, drum: 300 });
const GLOW = 0.6;
/** The most a cymbal tilts, in radians, and a drum is pressed down, in stage units (the kit is 24 across). */
const TILT = 0.09;
const PRESS = 0.16;
const SWELL = 0.025;

const cloned = material => (Array.isArray(material) ? material.map(each => each.clone()) : material.clone());

/**
 * @param {import('three').Object3D} scene a loaded kit (models.js)
 * @param {{ reducedMotion?: () => boolean }} [options] when true a hit only lights the drum
 * @returns {{ ids: string[], hit: (id: string, color: string, strength: number, now?: number) => void, update: (now: number) => boolean }}
 *   `update` moves what is moving and says whether anything was, so the caller draws a frame
 */
export function buildDrumModelRig(scene, { reducedMotion = () => false } = {}) {
  const members = new Map();
  scene.traverse(node => {
    const found = PART.exec(node.name);
    if (!found) return;
    const [, id] = found;
    const materials = [];
    node.traverse(object => {
      if (!object.isMesh) return;
      object.material = cloned(object.material);
      materials.push(...[object.material].flat());
    });
    const member = { node, id, kind: CYMBALS.has(id) ? 'cymbal' : 'drum', materials, rest: { position: node.position.clone(), rotation: node.rotation.clone(), scale: node.scale.clone() }, strike: null };
    members.set(node, member);
  });
  const byId = new Map();
  for (const member of members.values()) byId.set(member.id, [...(byId.get(member.id) ?? []), member]);

  const settle = member => {
    member.strike = null;
    for (const material of member.materials) material.emissive.set('#000000');
    member.node.position.copy(member.rest.position);
    member.node.rotation.copy(member.rest.rotation);
    member.node.scale.copy(member.rest.scale);
  };

  return {
    ids: [...byId.keys()],
    hit(id, color, strength, now = performance.now()) {
      for (const member of byId.get(id) ?? []) member.strike = { at: now, color: new Color(color), strength: Math.min(1, Math.max(0.3, strength)) };
    },
    update(now) {
      let moving = false;
      const still = !reducedMotion();
      for (const member of members.values()) {
        const { strike, node, rest } = member;
        if (!strike) continue;
        moving = true;
        const age = (now - strike.at) / RING_MS[member.kind];
        if (age >= 1) { settle(member); continue; }
        const fade = (1 - age) * strike.strength, ease = (1 - age) ** 2 * strike.strength;
        for (const material of member.materials) material.emissive.copy(strike.color).multiplyScalar(fade * GLOW);
        if (!still) continue;
        if (member.kind === 'cymbal') {
          node.rotation.x = rest.rotation.x + Math.sin(age * Math.PI * 7) * TILT * ease;
          node.rotation.z = rest.rotation.z + Math.sin(age * Math.PI * 5 + 1) * TILT * 0.6 * ease;
        } else {
          node.position.y = rest.position.y - PRESS * ease;
          node.scale.copy(rest.scale).multiplyScalar(1 + SWELL * ease);
        }
      }
      return moving;
    },
  };
}
