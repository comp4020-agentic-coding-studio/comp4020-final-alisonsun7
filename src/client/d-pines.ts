// Original coastal pines: curved woody forks and volumetric needle boughs.
// Each crown consists of overlapping, irregular flattened branch pads with
// individual short needles over their surface. There are no image cards.
import * as THREE from "three";
import { std } from "./world-build.js";

export const HERO_PINES = [
  { x: -12.4, z: 3.7, radius: 0.48 },
  { x: -27.8, z: -6.0, radius: 0.43 },
  { x: -35.8, z: -5.8, radius: 0.38 },
  { x: -45.5, z: -4.5, radius: 0.42 },
] as const;

interface CanopyPad { position: THREE.Vector3; width: number; depth: number; turn: number; tilt: number }
let sharedCanopy: { body: THREE.BufferGeometry; needles: THREE.BufferGeometry } | undefined;

function canopyGeometry(): { body: THREE.BufferGeometry; needles: THREE.BufferGeometry } {
  if (sharedCanopy) return sharedCanopy;
  let seed = 4821;
  const random = (): number => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const outline = (a: number): number => 1 + 0.105 * Math.sin(a * 5 + 0.7)
    + 0.055 * Math.sin(a * 11 - 1.1) + 0.027 * Math.sin(a * 23);
  const top = (r: number, a: number): number => 0.12 + 0.27 * (1 - r * r)
    + r * (0.045 * Math.sin(a * 7) + 0.025 * Math.cos(a * 13));
  const segments = 28;
  // Radial rings describe an irregular shallow umbrella, with a scalloped
  // perimeter and a narrow underside. This is neither a sphere nor a cone.
  const rings = [
    { r: 0, underside: false }, { r: 0.46, underside: false },
    { r: 0.80, underside: false }, { r: 1, underside: false },
    { r: 0.96, underside: true }, { r: 0.55, underside: true }, { r: 0, underside: true },
  ];
  const positions: number[] = [], colours: number[] = [], normals: number[] = [];
  const colour = new THREE.Color();
  const vertex = (ring: number, step: number): void => {
    const { r, underside } = rings[ring], a = step / segments * Math.PI * 2;
    const radius = r * outline(a);
    const y = underside ? -0.14 - 0.07 * (1 - r) + Math.sin(a * 9) * r * 0.025 : top(r, a);
    positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    const normal = new THREE.Vector3(Math.cos(a) * r * 0.70, underside ? -0.9 : 1.0, Math.sin(a) * r * 0.70).normalize();
    normals.push(normal.x, normal.y, normal.z);
    const noise = Math.sin(a * 17 + r * 31) * Math.sin(a * 9 - r * 27);
    colour.setHSL(0.245 + noise * 0.012, 0.25 + r * 0.035, (underside ? 0.205 : 0.295) + noise * 0.035 + r * 0.020);
    colours.push(colour.r, colour.g, colour.b);
  };
  for (let ring = 0; ring < rings.length - 1; ring++) for (let step = 0; step < segments; step++) {
    vertex(ring, step); vertex(ring, step + 1); vertex(ring + 1, step);
    vertex(ring + 1, step); vertex(ring, step + 1); vertex(ring + 1, step + 1);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  body.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  body.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  // Fine geometry breaks the pad's surface and its outer contour. Its real
  // needle scale is 8–18 cm, while the body supplies continuous crown cover.
  const needlePositions: number[] = [], needleColours: number[] = [];
  for (let i = 0; i < 128; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 1.04;
    const origin = new THREE.Vector3(Math.cos(a) * r * outline(a), top(Math.min(r, 1), a), Math.sin(a) * r * outline(a));
    const direction = new THREE.Vector3(Math.cos(a + (random() - 0.5)), 0.12 + random() * 0.8,
      Math.sin(a + (random() - 0.5))).normalize();
    const end = origin.clone().addScaledVector(direction, 0.08 + random() * 0.10);
    const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize().multiplyScalar(0.004 + random() * 0.003);
    const other = new THREE.Vector3().crossVectors(direction, side).normalize().multiplyScalar(0.004);
    colour.setHSL(0.225 + random() * 0.035, 0.23 + random() * 0.11, 0.27 + random() * 0.12);
    for (const p of [origin.clone().sub(side), origin.clone().add(side), end,
      origin.clone().sub(other), origin.clone().add(other), end]) {
      needlePositions.push(p.x, p.y, p.z); needleColours.push(colour.r, colour.g, colour.b);
    }
  }
  const needles = new THREE.BufferGeometry();
  needles.setAttribute("position", new THREE.Float32BufferAttribute(needlePositions, 3));
  needles.setAttribute("color", new THREE.Float32BufferAttribute(needleColours, 3)); needles.computeVertexNormals();
  sharedCanopy = { body, needles }; return sharedCanopy;
}

function addCanopies(root: THREE.Object3D, pads: CanopyPad[], shadows: boolean): void {
  if (!pads.length) return;
  const geometry = canopyGeometry();
  const material = std(0xffffff, { vertexColors: true, side: THREE.DoubleSide, roughness: 1, flatShading: false });
  const body = new THREE.InstancedMesh(geometry.body, material, pads.length);
  const needles = new THREE.InstancedMesh(geometry.needles, material, pads.length);
  const dummy = new THREE.Object3D(), colour = new THREE.Color();
  pads.forEach((p, i) => {
    dummy.position.copy(p.position); dummy.rotation.set(p.tilt, p.turn, p.tilt * 0.45);
    dummy.scale.set(p.width, p.width * 1.65, p.depth); dummy.updateMatrix();
    body.setMatrixAt(i, dummy.matrix); needles.setMatrixAt(i, dummy.matrix);
    colour.setHSL(0.24 + Math.sin(i * 3.7) * 0.015, 0.06, 0.70 + (i % 7) * 0.022);
    body.setColorAt(i, colour); needles.setColorAt(i, colour);
  });
  body.name = "solid-pine-branch-pads"; needles.name = "short-pine-surface-needles";
  for (const mesh of [body, needles]) { mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.computeBoundingSphere(); root.add(mesh); }
}

export function buildHeroPines(root: THREE.Object3D, bark: THREE.Material): void {
  let seed = 832;
  const random = (): number => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const woodPositions: number[] = [], woodNormals: number[] = [], woodUvs: number[] = [];
  const pads: CanopyPad[] = [];
  const limb = (points: THREE.Vector3[], radius: number, tip = 0.10): THREE.CatmullRomCurve3 => {
    const curve = new THREE.CatmullRomCurve3(points), tube = new THREE.TubeGeometry(curve, 15, radius, 9, false);
    const p = tube.attributes.position, n = tube.attributes.normal;
    for (let ring = 0; ring <= 15; ring++) {
      const t = ring / 15, centre = curve.getPointAt(t), taper = 1 - t * (1 - tip);
      for (let around = 0; around <= 9; around++) {
        const i = ring * 10 + around;
        p.setXYZ(i, centre.x + n.getX(i) * radius * taper, centre.y + n.getY(i) * radius * taper, centre.z + n.getZ(i) * radius * taper);
      }
    }
    tube.computeVertexNormals(); const flat = tube.toNonIndexed();
    woodPositions.push(...Array.from(flat.attributes.position.array)); woodNormals.push(...Array.from(flat.attributes.normal.array)); woodUvs.push(...Array.from(flat.attributes.uv.array)); return curve;
  };
  HERO_PINES.forEach((tree, treeIndex) => {
    const foreground = treeIndex === 0, height = foreground ? 7.2 : 8.8 + treeIndex * 0.55;
    const bend = foreground ? -4.6 : -0.8 - random() * 1.5;
    const trunk = limb([new THREE.Vector3(tree.x, 0, tree.z), new THREE.Vector3(tree.x - 0.45, height * 0.28, tree.z - 0.1),
      new THREE.Vector3(tree.x + bend * 0.60, height * 0.65, tree.z - 0.55), new THREE.Vector3(tree.x + bend, height, tree.z - 0.85)], tree.radius, 0.15);
    for (let branch = 0; branch < 9; branch++) {
      const start = trunk.getPointAt(0.38 + branch * 0.066), angle = foreground ? Math.PI + (random() - 0.5) * 2 : branch * 2.399 + random() * 0.8;
      const length = (foreground ? 3.2 : 3.5) + random() * 2;
      const end = start.clone().add(new THREE.Vector3(Math.cos(angle) * length, 0.65 + random() * 1.1, Math.sin(angle) * length));
      const elbow = start.clone().lerp(end, 0.5); elbow.y -= 0.18;
      limb([start, elbow, end], tree.radius * (0.38 - branch * 0.022), 0.07);
      for (let twig = 0; twig < 5; twig++) {
        const twigBase = elbow.clone().lerp(end, 0.25 + twig * 0.15), twigAngle = angle + (twig % 2 ? -0.8 : 0.8);
        const tip = twigBase.clone().add(new THREE.Vector3(Math.cos(twigAngle) * (0.55 + random() * 0.8), 0.25 + random() * 0.4, Math.sin(twigAngle) * (0.55 + random() * 0.8)));
        limb([twigBase, twigBase.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, -0.08, 0)), tip], 0.025, 0.08);
        for (let pad = 0; pad < 2; pad++) {
          pads.push({ position: tip.clone().add(new THREE.Vector3((random() - 0.5) * 0.75, (random() - 0.5) * 0.28, (random() - 0.5) * 0.75)),
            width: 0.65 + random() * 0.50, depth: 0.60 + random() * 0.45, turn: twigAngle + random(), tilt: (random() - 0.5) * 0.26 });
        }
      }
    }
  });
  const woodGeometry = new THREE.BufferGeometry();
  woodGeometry.setAttribute("position", new THREE.Float32BufferAttribute(woodPositions, 3)); woodGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(woodNormals, 3)); woodGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(woodUvs, 2));
  const wood = new THREE.Mesh(woodGeometry, bark); wood.castShadow = wood.receiveShadow = true; root.add(wood); addCanopies(root, pads, true);
}

export interface GrovePine { x: number; z: number; y?: number; h: number; turn?: number }

// Twenty overlapping branch pads form each crown, rather than disconnected
// tiny sprays. At 28 radial segments + short needles this is ~12K tris/tree.
export function buildPineGrove(root: THREE.Object3D, bark: THREE.Material, trees: GrovePine[], castShadows = false, spatialBatch = true): void {
  if (!trees.length) return;
  // Instanced bounds are per 24 m cell, so a close forest view does not submit
  // every crown across the entire 120 m woodland and both distant headlands.
  if (spatialBatch && trees.length > 32) {
    const cells = new Map<string, GrovePine[]>();
    for (const tree of trees) {
      const key = `${Math.floor(tree.x / 24)},${Math.floor(tree.z / 24)}`;
      const cell = cells.get(key) ?? []; cell.push(tree); cells.set(key, cell);
    }
    for (const cell of cells.values()) buildPineGrove(root, bark, cell, castShadows, false);
    return;
  }
  let seed = 941;
  const random = (): number => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const trunkGeometry = new THREE.CylinderGeometry(0.035, 0.18, 1, 7, 3); trunkGeometry.translate(0, 0.5, 0);
  const p = trunkGeometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + p.getY(i) ** 2 * 0.10);
  trunkGeometry.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(trunkGeometry, bark, trees.length);
  const branchGeometry = new THREE.CylinderGeometry(0.007, 0.047, 1, 5); branchGeometry.translate(0, 0.5, 0);
  const boughs = 8, branches = new THREE.InstancedMesh(branchGeometry, bark, trees.length * boughs);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pads: CanopyPad[] = [];
  trees.forEach((tree, i) => {
    const turn = tree.turn ?? random() * Math.PI * 2, baseY = tree.y ?? 0;
    rotation.setFromAxisAngle(up, turn); matrix.compose(new THREE.Vector3(tree.x, baseY, tree.z), rotation, new THREE.Vector3(1, tree.h, 1)); trunks.setMatrixAt(i, matrix);
    const crownStart = 0.60 + random() * 0.035, width = Math.min(1.35, tree.h * 0.070 + 0.15);
    for (let branch = 0; branch < boughs; branch++) {
      const progress = branch / (boughs - 1), layer = Math.floor(branch / 3), angle = turn + (branch % 3) * 2.094 + layer * 0.9 + random() * 0.25;
      const length = tree.h * (0.135 - progress * 0.04) * (0.94 + random() * 0.12);
      const at = new THREE.Vector3(tree.x, baseY + tree.h * (crownStart + layer * 0.09 + (random() - 0.5) * 0.025), tree.z);
      const direction = new THREE.Vector3(Math.cos(angle), 0.17 + random() * 0.10, Math.sin(angle)).normalize();
      rotation.setFromUnitVectors(up, direction); matrix.compose(at, rotation, new THREE.Vector3(1, length, 1)); branches.setMatrixAt(i * boughs + branch, matrix);
      for (let pad = 0; pad < 2; pad++) {
        const centre = at.clone().addScaledVector(direction, length * (pad ? 0.88 : 0.39)); centre.y += (random() - 0.5) * 0.18;
        pads.push({ position: centre, width: width * (0.88 + random() * 0.24), depth: width * (0.70 + random() * 0.30), turn: angle + (random() - 0.5) * 0.7, tilt: (random() - 0.5) * 0.28 });
      }
    }
    for (let cap = 0; cap < 4; cap++) {
      const a = cap * 2.399 + turn, radius = cap ? width * 0.55 : 0;
      pads.push({ position: new THREE.Vector3(tree.x + Math.cos(a) * radius, baseY + tree.h * (0.89 + random() * 0.055), tree.z + Math.sin(a) * radius),
        width: width * (0.90 + random() * 0.15), depth: width * 0.82, turn: a, tilt: (random() - 0.5) * 0.24 });
    }
  });
  for (const mesh of [trunks, branches]) { mesh.castShadow = castShadows; mesh.receiveShadow = true; mesh.computeBoundingSphere(); root.add(mesh); }
  addCanopies(root, pads, castShadows);
}
