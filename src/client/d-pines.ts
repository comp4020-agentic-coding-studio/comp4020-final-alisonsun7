// Original coastal pines: curved woody forks and individual short needles.
// No image cards, downloaded assets or collision are introduced here.
import * as THREE from "three";
import { std } from "./world-build.js";

export const HERO_PINES = [
  { x: -12.4, z: 3.7, radius: 0.48 },
  { x: -27.8, z: -6.0, radius: 0.43 },
  { x: -35.8, z: -5.8, radius: 0.38 },
  { x: -45.5, z: -4.5, radius: 0.42 },
] as const;

export function buildHeroPines(root: THREE.Object3D, bark: THREE.Material): void {
  let seed = 832;
  const random = (): number => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const woodPositions: number[] = [], woodNormals: number[] = [], woodUvs: number[] = [];
  const append = (g: THREE.BufferGeometry): void => {
    const flat = g.index ? g.toNonIndexed() : g;
    woodPositions.push(...Array.from(flat.attributes.position.array));
    woodNormals.push(...Array.from(flat.attributes.normal.array));
    woodUvs.push(...Array.from(flat.attributes.uv.array));
  };
  const limb = (points: THREE.Vector3[], radius: number, tip = 0.10): THREE.CatmullRomCurve3 => {
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, 15, radius, 9, false);
    const p = tube.attributes.position, n = tube.attributes.normal;
    for (let ring = 0; ring <= 15; ring++) {
      const t = ring / 15, centre = curve.getPointAt(t), taper = 1 - t * (1 - tip);
      for (let around = 0; around <= 9; around++) {
        const i = ring * 10 + around;
        p.setXYZ(i, centre.x + n.getX(i) * radius * taper, centre.y + n.getY(i) * radius * taper,
          centre.z + n.getZ(i) * radius * taper);
      }
    }
    tube.computeVertexNormals(); append(tube); return curve;
  };
  // One shared tuft contains 110 narrow, slightly bent needles in three
  // dimensions. Needles are 8–15 cm long, never large green panels.
  const needlePositions: number[] = [], needleColors: number[] = [];
  const colour = new THREE.Color();
  for (let i = 0; i < 110; i++) {
    const a = random() * Math.PI * 2, elevation = (random() - 0.30) * 1.9;
    const direction = new THREE.Vector3(Math.cos(a), elevation, Math.sin(a)).normalize();
    const length = 0.08 + random() * 0.08;
    const base = new THREE.Vector3((random() - 0.5) * 0.045, random() * 0.05, (random() - 0.5) * 0.045);
    const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize().multiplyScalar(0.0028 + random() * 0.002);
    const mid = base.clone().addScaledVector(direction, length * 0.55); mid.y += 0.009;
    const end = base.clone().addScaledVector(direction, length);
    const points = [base.clone().sub(side), base.clone().add(side), mid.clone().add(side),
      base.clone().sub(side), mid.clone().add(side), mid.clone().sub(side), mid.clone().sub(side), mid.clone().add(side), end];
    colour.setHSL(0.19 + random() * 0.035, 0.18 + random() * 0.12, 0.24 + random() * 0.13);
    for (const p of points) { needlePositions.push(p.x, p.y, p.z); needleColors.push(colour.r, colour.g, colour.b); }
  }
  const needleGeometry = new THREE.BufferGeometry();
  needleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(needlePositions, 3));
  needleGeometry.setAttribute("color", new THREE.Float32BufferAttribute(needleColors, 3));
  needleGeometry.computeVertexNormals();
  const clusters: { position: THREE.Vector3; scale: number; angle: number }[] = [];
  HERO_PINES.forEach((tree, treeIndex) => {
    const foreground = treeIndex === 0;
    const height = foreground ? 7.2 : 8.8 + treeIndex * 0.55;
    const bend = foreground ? -4.6 : -0.8 - random() * 1.5;
    const trunk = limb([
      new THREE.Vector3(tree.x, 0, tree.z), new THREE.Vector3(tree.x - 0.45, height * 0.28, tree.z - 0.10),
      new THREE.Vector3(tree.x + bend * 0.60, height * 0.65, tree.z - 0.55),
      new THREE.Vector3(tree.x + bend, height, tree.z - 0.85),
    ], tree.radius, 0.15);
    for (let branch = 0; branch < 9; branch++) {
      const t = 0.38 + branch * 0.066;
      const start = trunk.getPointAt(t);
      const angle = foreground ? Math.PI + (random() - 0.5) * 2.0 : branch * 2.399 + random() * 0.8;
      const length = (foreground ? 3.2 : 3.5) + random() * 2.0;
      const end = start.clone().add(new THREE.Vector3(Math.cos(angle) * length, 0.65 + random() * 1.1, Math.sin(angle) * length));
      const elbow = start.clone().lerp(end, 0.5); elbow.y -= 0.18;
      limb([start, elbow, end], tree.radius * (0.38 - branch * 0.022), 0.07);
      for (let twig = 0; twig < 5; twig++) {
        const twigBase = elbow.clone().lerp(end, 0.25 + twig * 0.15);
        const twigAngle = angle + (twig % 2 ? -0.8 : 0.8);
        const tip = twigBase.clone().add(new THREE.Vector3(Math.cos(twigAngle) * (0.55 + random() * 0.8),
          0.25 + random() * 0.40, Math.sin(twigAngle) * (0.55 + random() * 0.8)));
        limb([twigBase, twigBase.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, -0.08, 0)), tip], 0.025, 0.08);
        // Closely packed tufts trace a flattened, irregular branch-tip cloud.
        for (let tuft = 0; tuft < 18; tuft++) {
          const a = random() * Math.PI * 2, radius = Math.sqrt(random()) * 0.86;
          clusters.push({ position: tip.clone().add(new THREE.Vector3(Math.cos(a) * radius,
            (random() - 0.5) * 0.43, Math.sin(a) * radius)), scale: 0.85 + random() * 0.70, angle: random() * Math.PI * 2 });
        }
      }
    }
  });
  const woodGeometry = new THREE.BufferGeometry();
  woodGeometry.setAttribute("position", new THREE.Float32BufferAttribute(woodPositions, 3));
  woodGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(woodNormals, 3));
  woodGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(woodUvs, 2));
  const wood = new THREE.Mesh(woodGeometry, bark); wood.castShadow = wood.receiveShadow = true; root.add(wood);
  const needleMaterial = std(0xffffff, { vertexColors: true, side: THREE.DoubleSide, roughness: 1, flatShading: false });
  const needles = new THREE.InstancedMesh(needleGeometry, needleMaterial, clusters.length);
  const dummy = new THREE.Object3D();
  clusters.forEach((p, i) => {
    dummy.position.copy(p.position); dummy.rotation.set((random() - 0.5) * 0.6, p.angle, (random() - 0.5) * 0.6);
    dummy.scale.set(p.scale, p.scale * 0.75, p.scale); dummy.updateMatrix(); needles.setMatrixAt(i, dummy.matrix);
  });
  needles.castShadow = needles.receiveShadow = true; needles.computeBoundingSphere(); root.add(needles);
}

export interface GrovePine {
  x: number;
  z: number;
  y?: number;
  h: number;
  turn?: number;
}

// Distant pines retain real branching needles at about 3,000 triangles each.
// All trees in a grove share three instanced draws; there are no image cards.
export function buildPineGrove(root: THREE.Object3D, bark: THREE.Material, trees: GrovePine[]): void {
  if (!trees.length) return;
  let seed = 941;
  const random = (): number => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const trunkGeometry = new THREE.CylinderGeometry(0.035, 0.18, 1, 7, 3);
  trunkGeometry.translate(0, 0.5, 0);
  const p = trunkGeometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + p.getY(i) ** 2 * 0.10);
  trunkGeometry.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(trunkGeometry, bark, trees.length);
  const branchGeometry = new THREE.CylinderGeometry(0.007, 0.047, 1, 5);
  branchGeometry.translate(0, 0.5, 0);
  const boughs = 8, perTree = boughs * 3 + 6;
  const branches = new THREE.InstancedMesh(branchGeometry, bark, trees.length * boughs);
  const positions: number[] = [], colours: number[] = [];
  const colour = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 48; i++) {
    const a = random() * Math.PI * 2;
    const direction = new THREE.Vector3(Math.cos(a), (random() - 0.20) * 1.8, Math.sin(a)).normalize();
    const base = new THREE.Vector3((random() - 0.5) * 0.16, random() * 0.10, (random() - 0.5) * 0.16);
    const end = base.clone().addScaledVector(direction, 0.15 + random() * 0.16);
    const side = new THREE.Vector3().crossVectors(direction, up).normalize().multiplyScalar(0.0055);
    const other = new THREE.Vector3().crossVectors(direction, side).normalize().multiplyScalar(0.0055);
    colour.setHSL(0.20 + random() * 0.025, 0.20 + random() * 0.10, 0.25 + random() * 0.10);
    for (const q of [base.clone().sub(side), base.clone().add(side), end,
      base.clone().sub(other), base.clone().add(other), end]) {
      positions.push(q.x, q.y, q.z); colours.push(colour.r, colour.g, colour.b);
    }
  }
  const tuftGeometry = new THREE.BufferGeometry();
  tuftGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  tuftGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3)); tuftGeometry.computeVertexNormals();
  const needles = new THREE.InstancedMesh(tuftGeometry,
    std(0xffffff, { vertexColors: true, side: THREE.DoubleSide, roughness: 1, flatShading: false }), trees.length * perTree);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  trees.forEach((tree, i) => {
    const turn = tree.turn ?? random() * Math.PI * 2, baseY = tree.y ?? 0;
    rotation.setFromAxisAngle(up, turn);
    matrix.compose(new THREE.Vector3(tree.x, baseY, tree.z), rotation, new THREE.Vector3(1, tree.h, 1)); trunks.setMatrixAt(i, matrix);
    const crownStart = 0.38 + random() * 0.13;
    const tuft = (index: number, at: THREE.Vector3, size: number): void => {
      rotation.setFromEuler(new THREE.Euler((random() - 0.5) * 0.8, random() * Math.PI * 2, (random() - 0.5) * 0.8));
      matrix.compose(at, rotation, new THREE.Vector3(size, size * 0.70, size)); needles.setMatrixAt(i * perTree + index, matrix);
    };
    for (let branch = 0; branch < boughs; branch++) {
      const progress = branch / (boughs - 1), angle = turn + branch * 2.399 + random() * 0.65;
      const length = tree.h * (0.27 - progress * 0.13) * (0.85 + random() * 0.30);
      const at = new THREE.Vector3(tree.x, baseY + tree.h * (crownStart + progress * (0.94 - crownStart)), tree.z);
      const direction = new THREE.Vector3(Math.cos(angle), 0.20 + random() * 0.16, Math.sin(angle)).normalize();
      rotation.setFromUnitVectors(up, direction);
      matrix.compose(at, rotation, new THREE.Vector3(1, length, 1)); branches.setMatrixAt(i * boughs + branch, matrix);
      for (let spray = 0; spray < 3; spray++) {
        const centre = at.clone().addScaledVector(direction, length * (0.42 + spray * 0.31));
        centre.y += (random() - 0.5) * length * 0.12;
        tuft(branch * 3 + spray, centre, length * (0.56 + random() * 0.20));
      }
    }
    for (let cap = 0; cap < 6; cap++) {
      const a = random() * Math.PI * 2, radius = random() * tree.h * 0.06;
      tuft(boughs * 3 + cap, new THREE.Vector3(tree.x + Math.cos(a) * radius,
        baseY + tree.h * (0.91 + random() * 0.10), tree.z + Math.sin(a) * radius), tree.h * 0.13);
    }
  });
  for (const mesh of [trunks, branches, needles]) {
    mesh.receiveShadow = true; mesh.castShadow = false; mesh.computeBoundingSphere(); root.add(mesh);
  }
}
