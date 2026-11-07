// Curved original coastal pine limbs carry soft, sculpted green crowns.
// The grove, hero trees and distant headlands share one painted 3D language.
import * as THREE from "three";
import { std } from "./world-build.js";

export const HERO_PINES = [
  { x: -8.6, z: 2.1, radius: 0.48 },
  { x: -27.8, z: -6.0, radius: 0.43 },
  { x: -35.8, z: -5.8, radius: 0.38 },
  { x: -45.5, z: -4.5, radius: 0.42 },
] as const;

interface CanopyPad { position: THREE.Vector3; width: number; depth: number; turn: number; tilt: number }

// Soft sculpted crowns share the original wind-grown trunks and branch
// positions. Every pad has actual volume from every view; no photographic
// cutout or camera-facing tree participates in the new painted language.
let sharedCrownGeometry: THREE.BufferGeometry | undefined;
let sharedFoliage: THREE.MeshStandardMaterial | undefined;
function crownGeometry(): THREE.BufferGeometry {
  if (sharedCrownGeometry) return sharedCrownGeometry;
  const geometry = new THREE.SphereGeometry(1, 9, 6);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const shape = 1 + Math.sin(x * 3.4 + z * 2.2) * 0.055;
    p.setXYZ(i, x * shape, y + Math.sin(x * 2.8) * 0.04, z * shape);
  }
  geometry.computeVertexNormals();
  sharedCrownGeometry = geometry;
  return geometry;
}
function addCanopies(root: THREE.Object3D, pads: CanopyPad[], shadows: boolean): void {
  if (!pads.length) return;
  sharedFoliage ??= std(0xffffff, { roughness: 1, flatShading: false });
  const leaves = new THREE.InstancedMesh(crownGeometry(), sharedFoliage, pads.length);
  const dummy = new THREE.Object3D(), colour = new THREE.Color();
  let seed = 8149;
  const random = (): number => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  pads.forEach((pad, i) => {
    dummy.position.copy(pad.position);
    dummy.rotation.set(pad.tilt, pad.turn, (random() - 0.5) * 0.18);
    dummy.scale.set(pad.width * 0.91, pad.width * (0.46 + random() * 0.18), pad.depth * 0.94);
    dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
    colour.setHSL(0.29 + random() * 0.045, 0.16 + random() * 0.10, 0.34 + random() * 0.10);
    leaves.setColorAt(i, colour);
  });
  leaves.name = "painted-volumetric-pine-crowns";
  leaves.castShadow = shadows; leaves.receiveShadow = true;
  leaves.computeBoundingSphere(); root.add(leaves);
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
    if (foreground) {
      // The root is behind the arrival camera. A long, tapering wind-grown
      // limb reaches forward above it; only its upper-left crown enters view.
      const framing = limb([trunk.getPointAt(0.56),
        new THREE.Vector3(-14.0, 6.0, 3.3), new THREE.Vector3(-19.3, 6.6, 3.8),
        new THREE.Vector3(-25.5, 7.3, 3.0)], 0.17, 0.10);
      for (let twig = 0; twig < 9; twig++) {
        const at = framing.getPointAt(0.35 + twig * 0.07);
        const side = twig % 2 ? -1 : 1;
        const tip = at.clone().add(new THREE.Vector3(-0.7 - random() * 0.8,
          0.18 + random() * 0.4, side * (0.55 + random() * 0.8)));
        limb([at, at.clone().lerp(tip, 0.55), tip], 0.035, 0.10);
        for (let cluster = 0; cluster < 2; cluster++) pads.push({
          position: tip.clone().add(new THREE.Vector3(-cluster * 0.45, cluster * 0.15, side * cluster * 0.3)),
          width: 0.75 + random() * 0.26, depth: 0.7 + random() * 0.2,
          turn: Math.PI + side * 0.6, tilt: 0.08 });
      }
    }
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

// Twenty soft crown lobes sit on the same authored branches. Spatial batches
// keep the forest and distant headlands inexpensive without flat tree cards.
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
