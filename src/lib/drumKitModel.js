import { BoxGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, TorusGeometry, Vector2, Vector3 } from 'three';

/**
 * The drum kit on the 3D stage, built in code: shells, heads, hoops, cymbals
 * and stands from simple solids. Built rather than downloaded so that each
 * drum is its own object to hit, light up and move, and so the stage needs no
 * file from the network.
 *
 * The kit is seen from the drummer's stool: the player sits at +z and looks
 * toward -z, hi-hat on the left, ride on the right. Lengths are in metres.
 */

/** Where each piece stands. `position` is the centre of a drum's shell, or of a cymbal. `tilt` leans its top toward the player. */
export const KIT_LAYOUT = Object.freeze([
  { id: 'kick', kind: 'kick', radius: 0.28, depth: 0.4, position: [0, 0.295, -0.3] },
  { id: 'snare', kind: 'drum', radius: 0.18, depth: 0.14, position: [-0.44, 0.6, 0.22], tilt: [0.08, 0], stand: true },
  { id: 'hihat', kind: 'hihat', radius: 0.18, position: [-0.84, 0.86, 0.1] },
  { id: 'tom-high', kind: 'drum', radius: 0.14, depth: 0.19, position: [-0.21, 0.84, -0.3], tilt: [0.44, 0.08], mount: true },
  { id: 'tom-mid', kind: 'drum', radius: 0.16, depth: 0.21, position: [0.21, 0.84, -0.3], tilt: [0.44, -0.08], mount: true },
  { id: 'tom-floor', kind: 'drum', radius: 0.21, depth: 0.38, position: [0.64, 0.46, 0.24], legs: true },
  { id: 'crash', kind: 'cymbal', radius: 0.25, position: [-0.58, 1.24, -0.54], tilt: [0.3, 0.12] },
  { id: 'ride', kind: 'cymbal', radius: 0.29, position: [0.78, 1.04, -0.38], tilt: [0.34, -0.14] },
].map(Object.freeze));

/** The piece on the model that a kit piece is played on: the open hi-hat is the same pair of cymbals as the closed one. */
export const modelPieceFor = id => (id === 'hihat-open' ? 'hihat' : id);

const COLORS = Object.freeze({ shell: '#4a3aa0', head: '#efe9dc', chrome: '#c8ccd4', brass: '#c9a348', rubber: '#16141c', rug: '#191522' });
const SEGMENTS = 48;

/**
 * @param {object} [options]
 * @param {string} [options.highlight] the colour of the ring that marks the next drum to hit
 * @returns {{ group: Group, pieces: Map<string, object>, targets: Mesh[], box: { min: number[], max: number[] }, resources: { geometries: Set, materials: Set } }}
 *   `pieces` holds, by id: `root` (the object to move when hit), `surface` (the mesh that flashes), `ring` (the next-hit marker),
 *   `anchor` (where its name goes, in the kit's own units) and `kind`.
 */
export function buildDrumKit({ highlight = '#5ab8ff' } = {}) {
  const resources = { geometries: new Set(), materials: new Set() };
  const geometry = made => { resources.geometries.add(made); return made; };
  const material = made => { resources.materials.add(made); return made; };
  const standard = (color, props = {}) => material(new MeshStandardMaterial({ color, ...props }));
  const shell = standard(COLORS.shell, { metalness: 0.35, roughness: 0.32 });
  const chrome = standard(COLORS.chrome, { metalness: 0.95, roughness: 0.28 });
  const rubber = standard(COLORS.rubber, { metalness: 0.1, roughness: 0.85 });
  const mesh = (shape, skin, { shadow = true } = {}) => {
    const made = new Mesh(shape, skin);
    made.castShadow = shadow;
    made.receiveShadow = true;
    return made;
  };
  const rod = (from, to, radius = 0.011, skin = chrome) => {
    const a = new Vector3(...from), b = new Vector3(...to);
    const made = mesh(geometry(new CylinderGeometry(radius, radius, a.distanceTo(b), 10)), skin);
    made.position.copy(a).add(b).multiplyScalar(0.5);
    made.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return made;
  };
  const ringFor = radius => {
    const made = new Mesh(geometry(new TorusGeometry(radius, 0.012, 8, SEGMENTS)), material(new MeshBasicMaterial({ color: highlight, transparent: true, opacity: 0.95, depthTest: false })));
    made.rotation.x = Math.PI / 2;
    made.visible = false;
    made.renderOrder = 2;
    return made;
  };

  const group = new Group();
  const pieces = new Map();
  const targets = [];
  const claim = (id, ...meshes) => meshes.forEach(made => { made.userData.piece = id; targets.push(made); });

  /** A shell with a head at each end and a hoop round each head, its axis along y. */
  const drumBody = ({ radius, depth }) => {
    const body = new Group();
    body.add(mesh(geometry(new CylinderGeometry(radius, radius, depth, SEGMENTS, 1, true)), shell));
    const head = mesh(geometry(new CylinderGeometry(radius * 0.985, radius * 0.985, 0.008, SEGMENTS)), standard(COLORS.head, { roughness: 0.9, emissive: '#000000' }));
    head.position.y = depth / 2;
    const under = mesh(geometry(new CylinderGeometry(radius * 0.985, radius * 0.985, 0.008, SEGMENTS)), standard(COLORS.head, { roughness: 0.9 }));
    under.position.y = -depth / 2;
    body.add(head, under);
    for (const y of [depth / 2 + 0.006, -depth / 2 - 0.006]) {
      const hoop = mesh(geometry(new TorusGeometry(radius + 0.004, 0.009, 8, SEGMENTS)), chrome);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = y;
      body.add(hoop);
    }
    const lugs = Math.max(6, Math.round(radius * 36));
    const lug = geometry(new BoxGeometry(0.018, Math.min(0.07, depth * 0.45), 0.012));
    for (let i = 0; i < lugs; i += 1) {
      const angle = (i / lugs) * Math.PI * 2, made = mesh(lug, chrome, { shadow: false });
      made.position.set(Math.cos(angle) * (radius + 0.006), 0, Math.sin(angle) * (radius + 0.006));
      made.rotation.y = -angle + Math.PI / 2;
      body.add(made);
    }
    const ring = ringFor(radius * 0.7);
    ring.position.y = depth / 2 + 0.02;
    body.add(ring);
    return { body, head, ring };
  };

  /** A cymbal: a bell and a bow turned on a lathe, top up. */
  const cymbalDisc = radius => {
    const profile = [[0.006, 0.03], [0.03, 0.03], [0.055, 0.014], [radius * 0.6, 0.007], [radius, 0]].map(([x, y]) => new Vector2(x, y));
    return mesh(geometry(new LatheGeometry(profile, SEGMENTS)), standard(COLORS.brass, { metalness: 0.9, roughness: 0.34, side: DoubleSide, emissive: '#000000' }));
  };

  const tripod = ([x, , z], height) => {
    const stand = new Group();
    stand.add(rod([x, 0.02, z], [x, height, z], 0.012));
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
      stand.add(rod([x, 0.3, z], [x + Math.cos(angle) * 0.22, 0.012, z + Math.sin(angle) * 0.22], 0.008));
    }
    return stand;
  };

  for (const spec of KIT_LAYOUT) {
    const root = new Group();
    const [x, y, z] = spec.position;
    root.position.set(x, y, z);
    if (spec.tilt) root.rotation.set(spec.tilt[0], 0, spec.tilt[1]);
    let surface, ring;
    const anchor = new Vector3(x, y, z);

    if (spec.kind === 'cymbal') {
      surface = cymbalDisc(spec.radius);
      ring = ringFor(spec.radius * 0.78);
      ring.position.y = 0.03;
      root.add(surface, ring);
      claim(spec.id, surface);
      group.add(tripod(spec.position, y - 0.02));
      anchor.y += 0.17;
    } else if (spec.kind === 'hihat') {
      const top = cymbalDisc(spec.radius), bottom = cymbalDisc(spec.radius);
      bottom.rotation.x = Math.PI;
      bottom.position.y = -0.022;
      surface = top;
      ring = ringFor(spec.radius * 0.78);
      ring.position.y = 0.03;
      root.add(top, bottom, ring);
      claim(spec.id, top, bottom);
      group.add(tripod(spec.position, y + 0.12));
      // The pedal that closes them.
      const pedal = mesh(geometry(new BoxGeometry(0.09, 0.016, 0.24)), rubber);
      pedal.position.set(x, 0.03, z + 0.2);
      pedal.rotation.x = -0.18;
      group.add(pedal);
      anchor.y += 0.17;
    } else {
      const kick = spec.kind === 'kick';
      const built = drumBody(spec);
      surface = built.head;
      ring = built.ring;
      // The kick lies on its side, its batter head toward the player.
      if (kick) built.body.rotation.x = Math.PI / 2;
      root.add(built.body);
      claim(spec.id, ...built.body.children.filter(child => child.isMesh && child !== ring));
      if (kick) {
        for (const side of [-1, 1]) group.add(rod([side * spec.radius * 0.8, y, z - spec.depth * 0.3], [side * (spec.radius + 0.16), 0.01, z - spec.depth * 0.42], 0.009));
        const pedal = mesh(geometry(new BoxGeometry(0.1, 0.016, 0.26)), rubber);
        pedal.position.set(x, 0.035, z + spec.depth / 2 + 0.16);
        pedal.rotation.x = -0.2;
        group.add(pedal, rod([x, 0.05, z + spec.depth / 2 + 0.05], [x, y - 0.02, z + spec.depth / 2 + 0.03], 0.007));
        const beater = mesh(geometry(new CylinderGeometry(0.03, 0.03, 0.04, 16)), standard(COLORS.head, { roughness: 0.95 }), { shadow: false });
        beater.rotation.x = Math.PI / 2;
        beater.position.set(x, y - 0.02, z + spec.depth / 2 + 0.03);
        group.add(beater);
        anchor.set(x, y + 0.02, z + spec.depth / 2);
      } else {
        anchor.y += spec.depth / 2 + 0.15;
      }
      if (spec.stand) group.add(tripod(spec.position, y - spec.depth / 2));
      if (spec.mount) group.add(rod([x * 0.45, 0.56, -0.3], [x, y - spec.depth * 0.35, z], 0.012));
      if (spec.legs) {
        for (let i = 0; i < 3; i += 1) {
          const angle = (i / 3) * Math.PI * 2 + 0.5, reach = spec.radius + 0.02;
          group.add(rod([x + Math.cos(angle) * reach, y, z + Math.sin(angle) * reach], [x + Math.cos(angle) * (reach + 0.05), 0.01, z + Math.sin(angle) * (reach + 0.05)], 0.008));
        }
      }
    }
    group.add(root);
    pieces.set(spec.id, { id: spec.id, kind: spec.kind, root, surface, ring, anchor, rest: root.rotation.clone() });
  }

  // A rug, so the kit stands on something and its shadow has somewhere to fall.
  const rug = mesh(geometry(new CircleGeometry(1.25, 64)), standard(COLORS.rug, { roughness: 1 }), { shadow: false });
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, -0.05);
  // The rug runs past the box the camera frames; that box is the instruments alone.
  rug.userData.ground = true;
  group.add(rug);

  return { group, pieces, targets, resources, box: { min: [-1.1, 0, -0.84], max: [1.1, 1.36, 0.6] } };
}
