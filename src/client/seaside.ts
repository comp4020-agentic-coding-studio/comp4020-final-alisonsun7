// From the forest to the sea: one imagined place you walk through. You start
// on a trail in a pine forest, cross a creek on a footbridge, come out of the
// trees onto a boardwalk with the café, a kiosk and beach huts along it, and
// go down onto the sand, to the water and out along the pier.
//
// Metres: x east, y up, z south (the sea is south). The trail runs from
// z -130 to the boardwalk at z -4; the waterline is at z 31.
//
// Ground, sand, bark, planks and the props are CC0 from Poly Haven (see
// public/assets-manifest.json). Trees are drawn from simple shapes: Poly
// Haven's scanned trees are 20 MB to 950 MB each.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildCafeRoom, furnishCafe, surface } from "./cafe.js";
import type { PlaceKit } from "./places.js";
import { Builder, canvasTexture, std, type Built, type Rect } from "./world-build.js";

// where the café's room sits (its own x 0..14, z 0..10, glass front at z 10)
const CAFE_AT = { x: -24, z: -14 };
const cafeLocal = (x: number, z: number): [number, number] => [x - CAFE_AT.x, z - CAFE_AT.z];
const inCafe = (x: number, z: number): boolean => {
  const [lx, lz] = cafeLocal(x, z);
  return lx > 0 && lx < 14 && lz > 0 && lz < 10;
};

const WATERLINE = 31;
// where the lifeguard tower stands
const T_LIFE = { x: 17, z: 15 };
const PIER = { x0: -34, x1: -31, z0: 1.5, z1: 72 };
// The creek runs east-west; its south bank is at z -62.8, and it's 12.4 m
// from bank to bank (the trail before it gave up 6 m to it)
const CREEK_HALF = 6.2;
const CREEK_Z = -62.8 - CREEK_HALF;
const BRIDGE = { x0: -3.7, x1: -0.3 };

// The trail, as points it bends through.
const TRAIL: [number, number][] = [
  [0, -133],
  [-5, -119],
  [-9, -104],
  [-5, -91.5],
  [4, -80.5],
  // lined up with the footbridge
  [-1.8, -78],
  [-2, -69],
  [-3, -58],
  [3, -44],
  [1, -30],
  [0, -16],
  [0, -3],
];
const trailCurve = new THREE.CatmullRomCurve3(TRAIL.map(([x, z]) => new THREE.Vector3(x, 0, z)));
const trailPoints = trailCurve.getSpacedPoints(240);

// The nearest point on the trail, and the way along it towards the sea.
function nearestOnTrail(x: number, z: number): { x: number; z: number; yaw: number; d: number } {
  let best = 0;
  let bestD = Infinity;
  trailPoints.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  const p = trailPoints[best];
  const next = trailPoints[Math.min(best + 1, trailPoints.length - 1)];
  const prev = trailPoints[Math.max(best - 1, 0)];
  return { x: p.x, z: p.z, yaw: Math.atan2(-(next.x - prev.x), -(next.z - prev.z)), d: Math.sqrt(bestD) };
}

// In the forest, more than this far from the trail is wandering off it; back
// within the smaller distance is back on it.
const STRAY = 10;
const RETURNED = 5;

function distanceToTrail(x: number, z: number): number {
  let best = Infinity;
  for (const p of trailPoints) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
  return Math.sqrt(best);
}

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the trees -----------------------------------------------------------

const CLEARING = { x: -10, z: -93.2, r: 7 };

interface Tree {
  x: number;
  z: number;
  h: number;
  turn: number;
}

// Pines scattered through the forest, thinning towards the shore, kept off
// the trail, the creek and the clearing. The same every time (seeded).
function plantTrees(): Tree[] {
  const r = mulberry(11);
  const trees: Tree[] = [];
  for (let i = 0; i < 6000 && trees.length < 520; i++) {
    const x = -58 + r() * 116;
    const z = -142 + r() * 126;
    // fewer near the forest's edge
    if (z > -40 && r() < (z + 40) / 26) continue;
    if (distanceToTrail(x, z) < 3.4) continue;
    if (Math.abs(z - CREEK_Z) < CREEK_HALF + 1.6) continue;
    if ((x - CLEARING.x) ** 2 + (z - CLEARING.z) ** 2 < CLEARING.r ** 2) continue;
    if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 6.5)) continue;
    trees.push({ x, z, h: 9 + r() * 8, turn: r() * Math.PI * 2 });
  }
  return trees;
}

function buildTrees(b: Builder, trees: Tree[], bark: THREE.Material): void {
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, bark, trees.length);
  // three tiers of needles, darker at the bottom
  const tiers = [
    { at: 0.32, h: 0.42, w: 0.3 },
    { at: 0.52, h: 0.36, w: 0.23 },
    { at: 0.7, h: 0.32, w: 0.15 },
  ];
  const needles = tiers.map(() => {
    const g = new THREE.ConeGeometry(1, 1, 8);
    g.translate(0, 0.5, 0);
    return new THREE.InstancedMesh(g, std(0xffffff, { roughness: 0.9 }), trees.length);
  });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const r = mulberry(5);
  trees.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.turn);
    m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(1 + t.h / 20, t.h, 1 + t.h / 20));
    trunks.setMatrixAt(i, m);
    tiers.forEach((tier, k) => {
      const w = t.h * tier.w;
      m.compose(new THREE.Vector3(t.x, t.h * tier.at, t.z), q, new THREE.Vector3(w, t.h * tier.h, w));
      needles[k].setMatrixAt(i, m);
      // dark, slightly blue-green needles, lighter towards the top
      c.setHSL(0.31 + r() * 0.06, 0.38 + r() * 0.18, 0.06 + k * 0.025 + r() * 0.035);
      needles[k].setColorAt(i, c);
    });
  });
  for (const mesh of [trunks, ...needles]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    b.root.add(mesh);
  }
}

// ---- small shapes -----------------------------------------------------

// A gabled roof over x0..x1, z0..z1, ridge running along x.
function gable(b: Builder, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, rise: number): void {
  const w = x1 - x0;
  const d = z1 - z0;
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.25, 0);
  shape.lineTo(0, rise);
  shape.lineTo(d / 2 + 0.25, 0);
  shape.lineTo(-d / 2 - 0.25, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w + 0.4, bevelEnabled: false });
  const roof = new THREE.Mesh(g, mat);
  roof.rotation.y = Math.PI / 2;
  roof.position.set(x0 - 0.2, y, (z0 + z1) / 2);
  roof.castShadow = roof.receiveShadow = true;
  b.root.add(roof);
  b.occluders.push(roof);
}

function stripes(a: string, bColour: string, n: number): THREE.CanvasTexture {
  return canvasTexture(
    64,
    8,
    (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? a : bColour;
        g.fillRect(i * 8, 0, 8, 8);
      }
    },
    [n, 1],
  );
}

function bench(b: Builder, wood: THREE.Material, metal: THREE.Material, x: number, z: number): void {
  b.box(wood, x - 0.9, x + 0.9, 0.42, 0.47, z - 0.22, z + 0.22);
  b.box(wood, x - 0.9, x + 0.9, 0.55, 0.85, z + 0.18, z + 0.24);
  for (const dx of [-0.75, 0.75]) b.box(metal, x + dx - 0.03, x + dx + 0.03, 0, 0.42, z - 0.2, z + 0.2);
  b.solids.push({ x0: x - 0.9, x1: x + 0.9, z0: z - 0.25, z1: z + 0.25 });
}

// ---- the sea ---------------------------------------------------------------

let seaTime: { value: number } | null = null;
let foamMaterial: THREE.MeshStandardMaterial | null = null;

// Water: a standard material (so it reflects the sky) with gentle waves
// added in the vertex shader.
function water(colour: number, amp: number, scale: number, roughness: number, reflect = 0.45): THREE.MeshStandardMaterial {
  // a bright sky would otherwise turn the water white at a low angle
  const mat = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0, envMapIntensity: reflect });
  const time = { value: 0 };
  seaTime ??= time;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = seaTime!;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
         vec4 wp = modelMatrix * vec4(position, 1.0);
         float w1 = sin(wp.x * ${(0.18 * scale).toFixed(3)} + uTime * 0.9);
         float w2 = sin(wp.z * ${(0.27 * scale).toFixed(3)} - uTime * 1.3 + wp.x * 0.05);
         transformed.z += (w1 * 0.6 + w2 * 0.4) * ${amp.toFixed(3)};`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `vec4 wpn = modelMatrix * vec4(position, 1.0);
         float dx = cos(wpn.x * ${(0.18 * scale).toFixed(3)} + uTime * 0.9) * ${(0.18 * scale * 0.6 * amp).toFixed(4)};
         float dz = cos(wpn.z * ${(0.27 * scale).toFixed(3)} - uTime * 1.3 + wpn.x * 0.05) * ${(0.27 * scale * 0.4 * amp).toFixed(4)};
         vec3 objectNormal = normalize(vec3(-dx, dz, 1.0));`,
      );
  };
  return mat;
}

// ---- building it -----------------------------------------------------------

function build(): Built {
  const b = new Builder();
  const forestFloor = surface("forest_leaves_02", [40, 40]);
  const trailMat = surface("stony_dirt_path", [1, 60]);
  const bark = surface("pine_bark", [1, 3]);
  const sand = surface("coast_sand_01", [30, 14]);
  const wetSand = surface("damp_beach_sand", [40, 3]);
  const boards = surface("weathered_planks", [30, 2]);
  const pierBoards = surface("weathered_planks", [1, 20]);
  const hutWood = surface("blue_painted_planks", [1, 1]);
  const kioskWood = surface("white_planks_clean", [2, 1]);
  const wood = std(0x7a5a3e, { roughness: 0.7 });
  const darkWood = std(0x4a3526, { roughness: 0.7 });
  const metal = std(0x2a2c2f, { metalness: 0.5, roughness: 0.45 });
  const mud = std(0x3a3226);
  const lampHead = std(0x222222, { emissive: 0xffcf8a, emissiveIntensity: 0 });
  // windows of the huts and kiosk, lit at dusk
  const windows = std(0x2a3038, { emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.3 });

  // ---- the forest ----
  b.floor(forestFloor, -62, 62, -148, CREEK_Z - CREEK_HALF, 0);
  b.floor(forestFloor, -62, 62, CREEK_Z + CREEK_HALF, -17, 0);
  // the trail, a ribbon of stony dirt following the curve
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let along = 0;
    trailPoints.forEach((p, i) => {
      const next = trailPoints[Math.min(i + 1, trailPoints.length - 1)];
      const prev = trailPoints[Math.max(i - 1, 0)];
      const dir = new THREE.Vector3().subVectors(next, prev).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(1.3);
      if (i > 0) along += p.distanceTo(prev);
      pos.push(p.x - side.x, 0.015, p.z - side.z, p.x + side.x, 0.015, p.z + side.z);
      uv.push(0, along / 3, 1, along / 3);
      if (i > 0) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    trailMat.map!.repeat.set(1, 1);
    for (const t of [trailMat.normalMap, trailMat.aoMap]) t?.repeat.set(1, 1);
    const trail = new THREE.Mesh(g, trailMat);
    trail.receiveShadow = true;
    b.root.add(trail);
    b.floors.push(trail);
  }
  const trees = plantTrees();
  buildTrees(b, trees, bark);

  // the creek, below the forest floor, with a footbridge where the trail
  // crosses it
  b.floor(mud, -62, 62, CREEK_Z - CREEK_HALF, CREEK_Z + CREEK_HALF, -0.6);
  const creekWater = water(0x24382f, 0.04, 3, 0.35);
  const creek = new THREE.Mesh(new THREE.PlaneGeometry(124, CREEK_HALF * 2, 120, 6), creekWater);
  creek.rotation.x = -Math.PI / 2;
  creek.position.set(0, -0.32, CREEK_Z);
  b.root.add(creek);
  for (const z of [CREEK_Z - CREEK_HALF, CREEK_Z + CREEK_HALF]) b.box(std(0x4a3e30), -62, 62, -0.6, 0.0, z - 0.05, z + 0.05, { shadow: false });
  const wet = CREEK_HALF + 0.1;
  b.solids.push({ x0: -62, x1: BRIDGE.x0, z0: CREEK_Z - wet, z1: CREEK_Z + wet }, { x0: BRIDGE.x1, x1: 62, z0: CREEK_Z - wet, z1: CREEK_Z + wet });
  // the footbridge reaches a little past each bank
  const span = CREEK_HALF + 0.8;
  const bridge = b.box(wood, BRIDGE.x0, BRIDGE.x1, 0.0, 0.14, CREEK_Z - span, CREEK_Z + span);
  b.floors.push(bridge);
  for (const x of [BRIDGE.x0, BRIDGE.x1]) {
    b.box(darkWood, x - 0.05, x + 0.05, 0.14, 0.95, CREEK_Z - span, CREEK_Z + span, { shadow: true });
    for (let z = CREEK_Z - span + 0.1; z <= CREEK_Z + span; z += (2 * span - 0.2) / 5) b.box(darkWood, x - 0.07, x + 0.07, -0.6, 0.95, z - 0.07, z + 0.07);
  }

  // ---- the shore ----
  b.floor(sand, -62, 62, -17, WATERLINE + 3, 0);
  b.floor(wetSand, -62, 62, WATERLINE - 4, WATERLINE + 3, 0.006);
  // the sea, out to the horizon
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 800, 240, 120), water(0x0d4f63, 0.16, 1, 0.22, 0.28));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.12, WATERLINE + 400);
  sea.receiveShadow = true;
  b.root.add(sea);
  // foam where the waves run up the sand
  const foamTex = canvasTexture(
    256,
    32,
    (g) => {
      const r = mulberry(3);
      g.clearRect(0, 0, 256, 32);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`;
        g.fillRect(r() * 256, 8 + r() * 16 * r(), 2 + r() * 5, 1 + r() * 2);
      }
    },
    [12, 1],
  );
  foamMaterial = std(0xffffff, { map: foamTex, transparent: true, opacity: 0.8, depthWrite: false, roughness: 0.6 });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(124, 2.2), foamMaterial);
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.02, WATERLINE + 0.6);
  b.root.add(foam);

  // the boardwalk, with lamps and benches
  const walk = b.box(boards, -52, 52, -0.06, 0.04, -4, 2.6, { shadow: false });
  b.floors.push(walk);
  b.box(darkWood, -52, 52, -0.2, 0.08, 2.6, 2.75, { shadow: false });
  const lamps: THREE.PointLight[] = [];
  for (let x = -40; x <= 40; x += 13) {
    b.cylinder(metal, x, 2.25, 0.06, 0, 4.2, 8);
    b.box(lampHead, x - 0.22, x + 0.22, 4.1, 4.3, 2.03, 2.47);
    b.solids.push({ x0: x - 0.12, x1: x + 0.12, z0: 2.13, z1: 2.37 });
    if (Math.abs(x - 12) < 7 || Math.abs(x + 14) < 7) {
      const l = new THREE.PointLight(0xffcf8a, 0, 16, 1.6);
      l.position.set(x, 3.9, 2.25);
      b.root.add(l);
      lamps.push(l);
    }
  }
  for (const x of [-6.5, 13, 36]) bench(b, wood, metal, x, 1.9);

  // ---- buildings along the boardwalk ----

  // the café, its glass front on the boardwalk
  const cb = new Builder();
  const room = buildCafeRoom(cb);
  cb.root.position.set(CAFE_AT.x, 0.04, CAFE_AT.z);
  b.root.add(cb.root);
  b.occluders.push(...cb.occluders);
  b.floors.push(...cb.floors);
  const shift = (r: Rect): Rect => ({ x0: r.x0 + CAFE_AT.x, x1: r.x1 + CAFE_AT.x, z0: r.z0 + CAFE_AT.z, z1: r.z1 + CAFE_AT.z });
  b.solids.push(...cb.solids.map(shift));
  cafeRoot = cb.root;
  // brick on the outside of its side and back walls
  const brickSkin = surface("brick_wall_001", [5, 1.6]);
  const C = { x0: CAFE_AT.x, x1: CAFE_AT.x + 14, z0: CAFE_AT.z, z1: CAFE_AT.z + 10 };
  b.box(brickSkin, C.x0 - 0.45, C.x0 - 0.25, 0, 5.0, C.z0 - 0.45, C.z1 + 0.15, { occludes: true });
  b.box(brickSkin, C.x1 + 0.25, C.x1 + 0.45, 0, 5.0, C.z0 - 0.45, C.z1 + 0.15, { occludes: true });
  b.box(brickSkin, C.x0 - 0.45, C.x1 + 0.45, 0, 5.0, C.z0 - 0.45, C.z0 - 0.25, { occludes: true });
  b.solids.push({ x0: C.x0 - 0.45, x1: C.x0, z0: C.z0 - 0.45, z1: C.z1 }, { x0: C.x1, x1: C.x1 + 0.45, z0: C.z0 - 0.45, z1: C.z1 }, { x0: C.x0 - 0.45, x1: C.x1 + 0.45, z0: C.z0 - 0.45, z1: C.z0 });
  // its sign
  const sign = canvasTexture(
    256,
    48,
    (g) => {
      g.fillStyle = "#1f2a24";
      g.fillRect(0, 0, 256, 48);
      g.fillStyle = "#efe6d2";
      g.font = "bold 26px Georgia, serif";
      g.textAlign = "center";
      g.fillText("The Corner Café", 128, 33);
    },
    [1, 1],
  );
  const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.8), std(0xffffff, { map: sign }));
  signBoard.position.set(CAFE_AT.x + 7, 4.55, CAFE_AT.z + 10.17);
  b.root.add(signBoard);

  // the kiosk: white boards, a serving window, a red and white awning
  const K = { x0: 4.5, x1: 11, z0: -10, z1: -4.4 };
  b.box(kioskWood, K.x0, K.x1, 0, 1.0, K.z1 - 0.15, K.z1, { solid: true, occludes: true });
  b.box(kioskWood, K.x0, K.x1, 2.4, 3.1, K.z1 - 0.15, K.z1, { occludes: true });
  b.box(kioskWood, K.x0, K.x0 + 0.15, 0, 3.1, K.z0, K.z1, { occludes: true });
  b.box(kioskWood, K.x1 - 0.15, K.x1, 0, 3.1, K.z0, K.z1, { occludes: true });
  b.box(kioskWood, K.x0, K.x1, 0, 3.1, K.z0, K.z0 + 0.15, { occludes: true });
  b.box(wood, K.x0, K.x1, 1.0, 1.06, K.z1 - 0.3, K.z1 + 0.25);
  b.box(windows, K.x0 + 0.2, K.x1 - 0.2, 1.06, 2.4, K.z0 + 0.4, K.z0 + 0.45, { shadow: false });
  b.box(darkWood, K.x0 - 0.2, K.x1 + 0.2, 3.1, 3.3, K.z0 - 0.2, K.z1 + 0.2, { occludes: true });
  const kioskAwning = new THREE.Mesh(new THREE.PlaneGeometry(K.x1 - K.x0 + 0.4, 1.4), std(0xffffff, { map: stripes("#f4efe6", "#c4423a", 5), side: THREE.DoubleSide }));
  kioskAwning.position.set((K.x0 + K.x1) / 2, 2.85, K.z1 + 0.6);
  kioskAwning.rotation.x = -Math.PI / 2 + 0.5;
  kioskAwning.castShadow = true;
  b.root.add(kioskAwning);
  b.solids.push({ x0: K.x0, x1: K.x1, z0: K.z0, z1: K.z1 });

  // five beach huts in painted boards, each its own colour
  const hutColours = [0x6fa9d6, 0xf2d06b, 0x8fd1b4, 0xf0a3a8, 0xf4f1ea];
  hutColours.forEach((colour, i) => {
    const x0 = 15 + i * 4.2;
    const x1 = x0 + 3.2;
    const z0 = -8.5;
    const z1 = -4.6;
    const paint = hutWood.clone();
    paint.color.setHex(colour);
    b.box(paint, x0, x1, 0, 2.6, z0, z1, { occludes: true, solid: true });
    b.box(darkWood, x0 + 1.0, x1 - 1.0, 0, 2.0, z1, z1 + 0.04, { shadow: false });
    b.box(std(0xe9e3d6), x0 + 1.1, x1 - 1.1, 1.2, 1.5, z1 + 0.04, z1 + 0.06, { shadow: false });
    gable(b, std(0xf4f1ea, { roughness: 0.8 }), x0, x1, z0, z1, 2.6, 1.1);
  });

  // a lifeguard tower on the sand: four legs, a red hut, a ladder
  const T = T_LIFE;
  const red = std(0xc8423a, { roughness: 0.7 });
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    b.box(std(0xf0ece4), T.x + dx * 1.1 - 0.08, T.x + dx * 1.1 + 0.08, 0, 2.5, T.z + dz * 1.1 - 0.08, T.z + dz * 1.1 + 0.08);
    b.solids.push({ x0: T.x + dx * 1.1 - 0.12, x1: T.x + dx * 1.1 + 0.12, z0: T.z + dz * 1.1 - 0.12, z1: T.z + dz * 1.1 + 0.12 });
  }
  b.box(wood, T.x - 1.4, T.x + 1.4, 2.5, 2.62, T.z - 1.4, T.z + 1.4);
  b.box(red, T.x - 1.1, T.x + 1.1, 2.62, 3.0, T.z - 1.1, T.z - 0.2);
  b.box(red, T.x - 1.1, T.x + 1.1, 2.62, 3.9, T.z - 1.1, T.z - 0.95);
  b.box(red, T.x - 1.1, T.x - 0.95, 2.62, 3.9, T.z - 1.1, T.z + 1.1);
  b.box(red, T.x + 0.95, T.x + 1.1, 2.62, 3.9, T.z - 1.1, T.z + 1.1);
  gable(b, std(0xf0ece4), T.x - 1.3, T.x + 1.3, T.z - 1.3, T.z + 1.3, 3.9, 0.7);
  for (let y = 0.3; y < 2.5; y += 0.35) b.box(std(0xf0ece4), T.x - 0.4, T.x + 0.4, y, y + 0.05, T.z + 1.5 + y * 0.35, T.z + 1.6 + y * 0.35);

  // the pier: boards on posts, out over the water
  const pier = b.box(pierBoards, PIER.x0, PIER.x1, -0.06, 0.08, PIER.z0, PIER.z1, { shadow: true });
  b.floors.push(pier);
  for (let z = PIER.z0 + 2; z <= PIER.z1; z += 4)
    for (const x of [PIER.x0 + 0.1, PIER.x1 - 0.1]) {
      b.cylinder(darkWood, x, z, 0.13, -3, 1.05, 8);
      if (z > WATERLINE) b.solids.push({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 });
    }
  b.box(darkWood, PIER.x0, PIER.x0 + 0.1, 0.95, 1.05, WATERLINE, PIER.z1);
  b.box(darkWood, PIER.x1 - 0.1, PIER.x1, 0.95, 1.05, WATERLINE, PIER.z1);

  const walkable: Rect[] = [
    { x0: -50, x1: 50, z0: -134, z1: -15 }, // the forest
    { x0: -50, x1: 50, z0: -16, z1: WATERLINE - 0.3 }, // boardwalk and sand
    { x0: PIER.x0 + 0.35, x1: PIER.x1 - 0.35, z0: PIER.z0, z1: PIER.z1 - 0.4 }, // the pier
    ...room.walkable.map(shift),
  ];

  return {
    root: b.root,
    occluders: b.occluders,
    floors: b.floors,
    walkable,
    solids: b.solids,
    circles: trees.map((t) => ({ x: t.x, z: t.z, r: 0.35 })),
    paving: boards,
    glass: room.glass,
    windows,
    ceilingStrips: room.bulbs,
    lampHead,
    lamp: lamps[0],
    ceilingLights: [...room.ceilingLights, ...lamps.slice(1)],
  };
}

let cafeRoot: THREE.Object3D | null = null;

// ---- furniture and plants ------------------------------------------------

interface Scatter {
  id: string;
  height: number;
  // positions, turns and size changes (1 = the given height)
  at: { x: number; z: number; y?: number; turn?: number; size?: number }[];
  solid?: number; // half-width of the footprint, if you can't walk through it
}

function scatterPoints(seed: number, n: number, pick: (r: () => number) => [number, number] | null, size: [number, number]): Scatter["at"] {
  const r = mulberry(seed);
  const out: Scatter["at"] = [];
  for (let i = 0; i < n * 20 && out.length < n; i++) {
    const p = pick(r);
    if (p) out.push({ x: p[0], z: p[1], turn: r() * 6.3, size: size[0] + r() * (size[1] - size[0]) });
  }
  return out;
}

const inForest = (x: number, z: number): boolean => distanceToTrail(x, z) > 2.2 && Math.abs(z - CREEK_Z) > CREEK_HALF + 0.8;

const SCATTER: Scatter[] = [
  { id: "fern_02", height: 0.5, at: scatterPoints(21, 260, (r) => [-46 + r() * 92, -134 + r() * 112], [0.7, 1.6]).filter((p) => inForest(p.x, p.z)) },
  { id: "grass_medium_02", height: 0.45, at: scatterPoints(22, 220, (r) => [-48 + r() * 96, -44 + r() * 40], [0.8, 1.8]).filter((p) => distanceToTrail(p.x, p.z) > 1.6 && !inCafe(p.x, p.z) && (p.z < -14 || p.x < -30)) },
  { id: "shrub_02", height: 1.2, at: scatterPoints(23, 40, (r) => [-46 + r() * 92, -133 + r() * 111], [0.6, 1.2]).filter((p) => distanceToTrail(p.x, p.z) > 3.5 && Math.abs(p.z - CREEK_Z) > CREEK_HALF + 1.4), solid: 0.6 },
  { id: "rock_07", height: 0.2, at: scatterPoints(24, 60, (r) => [-46 + r() * 92, -134 + r() * 164], [0.8, 2.5]).filter((p) => distanceToTrail(p.x, p.z) > 1.8 && !inCafe(p.x, p.z) && (p.z < -16 || p.z > 4)) },
  {
    id: "boulder_01",
    height: 1.0,
    at: [
      { x: -12, z: -54, size: 1.4, turn: 1 },
      { x: 8, z: -109, size: 1.1 },
      { x: 26, z: 27, size: 1.3, turn: 2 },
      { x: 30, z: 29, size: 0.8 },
      { x: -18, z: 26, size: 1.0, turn: 4 },
      { x: -40, z: 22, size: 1.6 },
    ],
    solid: 0.8,
  },
  { id: "dead_tree_trunk", height: 0.4, at: [{ x: -9, z: -93.7, turn: 0.3, size: 1.2 }], solid: 0 },
  { id: "tree_stump_01", height: 0.55, at: [{ x: 6, z: -85.2 }, { x: -13, z: -90.6 }, { x: 9, z: -48, turn: 2 }], solid: 0.6 },
  { id: "Lantern_01", height: 0.35, at: [{ x: CAFE_AT.x + 5.6, z: CAFE_AT.z + 10.4, y: 0.04 }, { x: CAFE_AT.x + 8.4, z: CAFE_AT.z + 10.4, y: 0.04 }, { x: -32.5, z: 71, y: 0.08 }] },
  { id: "wooden_crate_01", height: 0.4, at: [{ x: 11.6, z: -5.2, y: 0.04 }, { x: 11.7, z: -5.2, y: 0.44, turn: 0.3 }, { x: -33.2, z: 66, y: 0.08, turn: 1 }], solid: 0.45 },
  { id: "lifebuoy", height: 0.8, at: [{ x: PIER.x1 - 0.02, z: 44, y: 0.2, turn: Math.PI / 2 }, { x: T_LIFE.x + 1.15, z: T_LIFE.z - 0.3, y: 2.7, turn: Math.PI / 2 }] },
];

const loader = new GLTFLoader();

// One instanced mesh per part of the model, so 200 ferns cost a few draws.
function placeInstanced(root: THREE.Object3D, model: THREE.Object3D, s: Scatter, solids: Rect[]): void {
  const box = new THREE.Box3().setFromObject(model);
  const k = s.height / Math.max(0.001, box.max.y - box.min.y);
  const centre = box.getCenter(new THREE.Vector3());
  model.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const base = new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (const mesh of meshes) {
    const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, s.at.length);
    s.at.forEach((p, i) => {
      const size = k * (p.size ?? 1);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.turn ?? 0);
      m.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), q, new THREE.Vector3(size, size, size));
      m.multiply(base).multiply(mesh.matrixWorld);
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = s.height > 0.3;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    root.add(inst);
  }
  if (s.solid)
    for (const p of s.at) {
      const r = s.solid * (p.size ?? 1);
      solids.push({ x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r });
    }
}

async function furnish(built: Built, progress: (done: number) => void): Promise<void> {
  let cafeDone = 0;
  let outDone = 0;
  const report = (): void => progress(cafeDone * 0.5 + outDone * 0.5);
  await Promise.all([
    cafeRoot ? furnishCafe(cafeRoot, built.solids, (f) => ((cafeDone = f), report())) : Promise.resolve(),
    (async () => {
      let n = 0;
      await Promise.all(
        SCATTER.map(async (s) => {
          const gltf = await loader.loadAsync(`/assets/models/${s.id}/${s.id}.gltf`);
          placeInstanced(built.root, gltf.scene, s, built.solids);
          outDone = ++n / SCATTER.length;
          report();
        }),
      );
    })(),
  ]);
}

function zoneAt(x: number, z: number): string {
  if (inCafe(x, z)) {
    const lz = cafeLocal(x, z)[1];
    return lz < 4.8 ? "counter" : lz > 8.2 ? "window" : "tables";
  }
  if (z < -84) return "forest";
  if (z < -40) return "creek";
  if (z < -16) return "forest-edge";
  if (x > PIER.x0 - 0.5 && x < PIER.x1 + 0.5 && z > 3) return "pier";
  if (z < 3) return "boardwalk";
  return "beach";
}

export const seasideKit: PlaceKit = {
  build,
  furnish,
  isInside: inCafe,
  zoneAt,
  passerPaths: [
    [
      [0.5, -130],
      [-5, -117.5],
      [-8.5, -104.4],
      [-4.5, -91.6],
      [3.5, -80.5],
      [-1.8, -78],
      [-2, -69],
      [2.5, -44],
      [0.5, -20],
    ],
    [
      [-46, 0.4],
      [46, 0.8],
    ],
    [
      [40, -1.6],
      [-8, -1.4],
      [-17, -3.2],
      [-17, -8],
    ],
    [
      [-30, 20],
      [12, 25],
      [36, 22],
    ],
    [
      [-32.5, 3],
      [-32.5, 68],
    ],
    [
      [2, -1],
      [8, 10],
      [5, 28],
    ],
  ],
  rainAt(r) {
    for (;;) {
      const x = -48 + r() * 96;
      const z = -134 + r() * 170;
      if (!inCafe(x, z)) return [x, z];
    }
  },
  rainCount: 7000,
  sunTarget: [0, 0, -10],
  // a low morning sun from the east, a little north, across the trail and
  // along the shore
  sunDirs: { morning: [0.82, 0.22, -0.3], weekday: [0.3, 0.85, 0.35] },
  // mist that still lets you see the sea and the end of the pier
  light: {
    morning: { fogNear: 45, fogFar: 420 },
    weekday: { fogNear: 90, fogFar: 700 },
    "rainy-dusk": { fogNear: 14, fogFar: 170 },
  },
  skies: {
    morning: { url: "/assets/skies/qwantani_dawn_puresky.hdr", intensity: 1 },
    weekday: { url: "/assets/skies/qwantani_noon_puresky.hdr", intensity: 1 },
    "rainy-dusk": { url: "/assets/skies/kloppenheim_01_puresky.hdr", intensity: 0.3 },
  },
  ambienceAt(x, z, mode) {
    if (inCafe(x, z)) return "cafe";
    if (mode === "rainy-dusk") return "rain";
    return z < -16 ? "forest" : "sea";
  },
  offTrail(x, z) {
    if (z > -18) return null;
    const n = nearestOnTrail(x, z);
    return n.d > STRAY ? { x: n.x, z: n.z, yaw: n.yaw } : null;
  },
  onTrail(x, z) {
    return z > -18 || nearestOnTrail(x, z).d < RETURNED;
  },
  animate(t) {
    if (seaTime) seaTime.value = t;
    if (foamMaterial?.map) {
      // the wash running up the sand and back
      const s = Math.sin(t * 0.7);
      foamMaterial.map.offset.set(t * 0.01, 0);
      foamMaterial.opacity = 0.45 + 0.35 * (0.5 + 0.5 * s);
    }
  },
};
