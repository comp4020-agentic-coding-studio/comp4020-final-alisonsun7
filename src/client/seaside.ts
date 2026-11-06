// From the forest to the sea: one imagined place you walk through. You start
// on a trail in a pine forest, cross a creek on a footbridge, come out of the
// trees onto a boardwalk with the café, a fish and chip kiosk and beach huts
// along it, and go down onto the sand, to the water and out along the pier.
//
// Metres: x east, y up, z south (the sea is south). The trail runs from
// z -130 to the boardwalk at z -4; the waterline is at z 31.
//
// Ground, sand, bark, planks and the props are CC0 from Poly Haven (see
// public/assets-manifest.json). Trees are drawn from simple shapes: Poly
// Haven's scanned trees are 20 MB to 950 MB each.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildCafeRoom, furnishCafe, prepareLampMaterials, surface } from "./cafe.js";
import type { Pose } from "./figures.js";
import { buildHeroPines, buildPineGrove, HERO_PINES, type GrovePine } from "./d-pines.js";
import { buildHuts, inHut, SHOPKEEPER, swingDoors, TILL, type Door } from "./huts.js";
import { hutAt, isPrivate, privateSound } from "../shared/huts.js";
import type { PlaceKit, Regular } from "./places.js";
import { Builder, canvasTexture, std, sway, type Built, type Rect } from "./world-build.js";

// where the café's room sits (its own x 0..14, z 0..10, glass front at z 10)
const CAFE_AT = { x: -24, z: -14 };
const cafeLocal = (x: number, z: number): [number, number] => [x - CAFE_AT.x, z - CAFE_AT.z];
const inCafe = (x: number, z: number): boolean => {
  const [lx, lz] = cafeLocal(x, z);
  return lx > 0 && lx < 14 && lz > 0 && lz < 10;
};

const WATERLINE = 31;
const coastOffset = (x: number): number => Math.sin(x * 0.13) * 0.45 + Math.sin(x * 0.37) * 0.22;
// A narrow western cove brings the sea beside the cafe promenade. The broad
// eastern beach, the ball game, tower and all persisted sound positions stay.
const shoreAt = (x: number): number => 9 + 22 * THREE.MathUtils.smoothstep(x, -10, -1) + coastOffset(x);
// where the lifeguard tower stands
const T_LIFE = { x: 17, z: 15 };
const PIER = { x0: -34, x1: -31, z0: 1.5, z1: 72 };
// The creek runs east-west; its south bank is at z -62.8, and it's 12.4 m
// from bank to bank (the trail before it gave up 6 m to it)
const CREEK_HALF = 6.2;
const CREEK_Z = -62.8 - CREEK_HALF;
const BRIDGE = { x0: -3.7, x1: -0.3 };

// The creek's course within its band: its middle wanders either side of
// CREEK_Z and its width changes, as a stream's does.
const CREEK_LEVEL = -0.28; // the water's surface
const creekMid = (x: number): number => CREEK_Z + 1.5 * Math.sin(x * 0.075 + 0.6) + 0.7 * Math.sin(x * 0.19 + 2.1);
const creekHalfAt = (x: number): number => 2.8 + 0.7 * Math.sin(x * 0.11 + 1.3) + 0.3 * Math.sin(x * 0.29);
// How far across the stream (x, z) is: 0 in the middle, 1 at the water's
// edge, more up the bank.
const acrossCreek = (x: number, z: number): number => Math.abs(z - creekMid(x)) / creekHalfAt(x);
// The ground across the band: a bed 0.75 m down in the middle, rising to the
// water's edge and up the bank to the forest floor, which it meets at the
// band's edges.
function creekBed(x: number, z: number): number {
  const d = acrossCreek(x, z);
  const y = d < 1 ? -0.75 + 0.47 * d * d : CREEK_LEVEL * (1 - THREE.MathUtils.smoothstep(d, 1, 1.7));
  return y * THREE.MathUtils.smoothstep(CREEK_HALF - Math.abs(z - CREEK_Z), 0, 0.8);
}

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

// An original short-needle tuft, drawn at its actual small scale. Separate
// radial sprays make an irregular cloud rather than a long fern-like frond.
function pineNeedles(): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g) => {
    const r = mulberry(47);
    g.clearRect(0, 0, 512, 512);
    g.lineCap = "round";
    const colours = ["#7e8c62", "#97a175", "#72815c", "#a7ad82", "#87956b"];
    for (let spray = 0; spray < 108; spray++) {
      const angle = r() * Math.PI * 2;
      const radius = Math.sqrt(r()) * (130 + 24 * Math.sin(angle * 5));
      const x = 256 + Math.cos(angle) * radius;
      const y = 265 + Math.sin(angle) * radius * 0.85;
      // Short woody tips are mostly hidden inside a spray of needle pairs.
      const direction = angle + (r() - 0.5) * 1.2;
      g.strokeStyle = "#777c58"; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x - Math.cos(direction) * 17, y - Math.sin(direction) * 17);
      g.lineTo(x + Math.cos(direction) * 24, y + Math.sin(direction) * 24); g.stroke();
      for (let needle = 0; needle < 19; needle++) {
        const turn = direction + (r() - 0.5) * 3.8;
        const length = 22 + r() * 37;
        const ox = x + (r() - 0.5) * 20, oy = y + (r() - 0.5) * 20;
        g.strokeStyle = colours[Math.floor(r() * colours.length)];
        g.lineWidth = 1.6 + r() * 1.6;
        g.beginPath(); g.moveTo(ox, oy);
        g.quadraticCurveTo(ox + Math.cos(turn) * length * 0.65,
          oy + Math.sin(turn) * length * 0.65 - 3,
          ox + Math.cos(turn + 0.1) * length, oy + Math.sin(turn + 0.1) * length); g.stroke();
      }
    }
  }, [1, 1]);
}

function buildTrees(b: Builder, trees: Tree[], bark: THREE.Material): void {
  // Every original tree position and trunk collision remains unchanged.
  const trunkGeo = new THREE.CylinderGeometry(0.045, 0.22, 1, 9, 5);
  trunkGeo.translate(0, 0.5, 0);
  const trunkPosition = trunkGeo.attributes.position;
  for (let i = 0; i < trunkPosition.count; i++) {
    const y = trunkPosition.getY(i);
    trunkPosition.setX(i, trunkPosition.getX(i) + y * y * 0.075);
  }
  trunkGeo.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(trunkGeo, bark, trees.length);
  const boughs = 7, spraysPerBough = 8, capSprays = 8;
  const branchGeo = new THREE.CylinderGeometry(0.009, 0.065, 1, 6);
  branchGeo.translate(0, 0.5, 0);
  const branches = new THREE.InstancedMesh(branchGeo, bark, trees.length * boughs);
  // Three cupped, intersecting little cards give each tuft volume. The card
  // centres bow outward; their edges disappear into many individual needles.
  // A 15 m tree now carries small 0.6–1.1 m tufts, never metre-long feathers.
  const positions: number[] = [], uvs: number[] = [];
  for (let card = 0; card < 3; card++) {
    const turn = card * Math.PI / 3, tilt = card === 1 ? -0.58 : 0.42;
    const point = (x: number, y: number): number[] => {
      const z = 0.20 * (1 - x * x);
      const yy = y * Math.cos(tilt) - z * Math.sin(tilt);
      const zz = y * Math.sin(tilt) + z * Math.cos(tilt);
      return [x * Math.cos(turn) + zz * Math.sin(turn), yy,
        -x * Math.sin(turn) + zz * Math.cos(turn)];
    };
    for (let segment = 0; segment < 2; segment++) {
      const x0 = -1 + segment, x1 = x0 + 1;
      for (const [x, y] of [[x0, -0.65], [x1, -0.65], [x1, 0.65], [x0, -0.65], [x1, 0.65], [x0, 0.65]]) {
        positions.push(...point(x, y));
        uvs.push((x + 1) / 2, y / 1.3 + 0.5);
      }
    }
  }
  const crown = new THREE.BufferGeometry();
  crown.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  crown.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  crown.computeVertexNormals();
  const needleMat = std(0xffffff, { map: pineNeedles(), alphaTest: 0.30, side: THREE.DoubleSide,
    roughness: 1, flatShading: false });
  sway(needleMat, 0.00045);
  const perTree = boughs * spraysPerBough + capSprays;
  const needles = new THREE.InstancedMesh(crown, needleMat, trees.length * perTree);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0), r = mulberry(5);
  trees.forEach((t, i) => {
    q.setFromAxisAngle(up, t.turn);
    m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(1.25, t.h, 1.25));
    trunks.setMatrixAt(i, m);
    const crownBase = 0.48 + r() * 0.10;
    const crownWidth = 0.83 + r() * 0.30;
    const putTuft = (at: number, centre: THREE.Vector3, size: number, light: number): void => {
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 1.1, r() * Math.PI * 2, (r() - 0.5) * 1.0));
      m.compose(centre, q, new THREE.Vector3(size, size * (0.85 + r() * 0.25), size));
      needles.setMatrixAt(i * perTree + at, m);
      color.setHSL(0.19 + r() * 0.025, 0.10 + r() * 0.10, light + r() * 0.08);
      needles.setColorAt(i * perTree + at, color);
    };
    for (let k = 0; k < boughs; k++) {
      const progress = k / (boughs - 1);
      const angle = t.turn + k * 2.399 + (r() - 0.5) * 1.05;
      const length = t.h * (0.20 - progress * 0.10) * crownWidth * (0.80 + r() * 0.35);
      const y = t.h * (crownBase + progress * (0.93 - crownBase) + (r() - 0.5) * 0.025);
      const lean = 0.075 * (y / t.h) ** 2;
      const base = new THREE.Vector3(t.x + Math.cos(t.turn) * lean, y, t.z - Math.sin(t.turn) * lean);
      const direction = new THREE.Vector3(Math.cos(angle), 0.10 + r() * 0.20, Math.sin(angle)).normalize();
      const side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      q.setFromUnitVectors(up, direction);
      m.compose(base, q, new THREE.Vector3(1 - progress * 0.45, length, 1 - progress * 0.45));
      branches.setMatrixAt(i * boughs + k, m);
      for (let spray = 0; spray < spraysPerBough; spray++) {
        const along = 0.28 + spray / spraysPerBough * 0.82 + r() * 0.13;
        const centre = base.clone().addScaledVector(direction, length * along)
          .addScaledVector(side, (r() - 0.5) * length * 0.60);
        centre.y += (r() - 0.5) * 0.45;
        const size = (0.31 + r() * 0.20) * (t.h / 12) * (1 - progress * 0.16);
        putTuft(k * spraysPerBough + spray, centre, size, 0.63 + progress * 0.05);
      }
    }
    // A loose cap clothes the trunk's tip and joins the irregular branch ends
    // into a crown; the upper silhouette has no regularly spaced bare spires.
    for (let cap = 0; cap < capSprays; cap++) {
      const a = r() * Math.PI * 2, radius = r() * t.h * 0.047;
      const centre = new THREE.Vector3(t.x + Math.cos(a) * radius,
        t.h * (0.94 + r() * 0.065), t.z + Math.sin(a) * radius);
      putTuft(boughs * spraysPerBough + cap, centre, (0.32 + r() * 0.17) * t.h / 12, 0.68);
    }
  });
  for (const mesh of [trunks, branches, needles]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    b.root.add(mesh);
  }
}

// ---- small shapes -----------------------------------------------------

// Small native-looking tufts break up the hard path edge and frame the
// beach. Decorative only: no new obstacles, assets or extra draw per plant.
function edgeGrass(b: Builder): void {
  const r = mulberry(88);
  const positions: number[] = [];
  // Bent, tapering ribbons catch light as soft leaves rather than hard
  // triangular spikes. One shared tuft replaces hundreds of scanned blades.
  for (let blade = 0; blade < 9; blade++) {
    const a = blade * 2.4;
    const x = Math.cos(a), z = Math.sin(a);
    const h = 0.30 + r() * 0.54, bend = 0.12 + r() * 0.18;
    const at = (t: number, side: number): number[] => {
      const w = 0.019 * (1 - t) + 0.001;
      return [x * (0.07 + t * t * bend) - z * w * side, h * t,
        z * (0.07 + t * t * bend) + x * w * side];
    };
    for (let segment = 0; segment < 3; segment++) {
      const t = segment / 3, next = (segment + 1) / 3;
      positions.push(...at(t, -1), ...at(t, 1), ...at(next, 1),
        ...at(t, -1), ...at(next, 1), ...at(next, -1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  const points: { x: number; z: number; coastal: boolean }[] = [];
  for (let i = 0; i < trailPoints.length - 1; i++) {
    const p = trailPoints[i], next = trailPoints[i + 1];
    if (p.z > -18 || Math.abs(p.z - CREEK_Z) < CREEK_HALF + 1.1) continue;
    const dir = new THREE.Vector3().subVectors(next, p).normalize();
    for (const side of [-1, 1]) {
      const d = 1.5 + r() * 1.3;
      points.push({ x: p.x - dir.z * d * side, z: p.z + dir.x * d * side, coastal: false });
    }
  }
  for (let i = 0; i < 180; i++) points.push({ x: (r() > 0.5 ? 1 : -1) * (39 + r() * 17), z: 5 + r() * 21, coastal: true });
  // Small planted islands frame the open sand; the centre and every route
  // remain clear. These soft tufts never add collision or individual draws.
  for (const [x, z] of [[-25, 16], [-7, 26], [9, 29], [23, 24], [35, 12]]) {
    for (let i = 0; i < 20; i++) {
      const angle = r() * Math.PI * 2, radius = Math.sqrt(r());
      points.push({ x: x + Math.cos(angle) * radius * 2.6, z: z + Math.sin(angle) * radius * 1.2, coastal: true });
    }
  }
  // Cove plants occupy the dry bank, never the newly opened water.
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].coastal && points[i].z > shoreAt(points[i].x) - 1.1) points.splice(i, 1);
  }
  for (let i = 0; i < 210; i++) {
    const x = -52 + r() * 42;
    points.push({ x, z: 3.1 + r() * Math.max(0.5, shoreAt(x) - 4.5), coastal: true });
  }
  const grassMat = std(0xffffff, { side: THREE.DoubleSide, roughness: 1 });
  sway(grassMat, 0.12);
  const mesh = new THREE.InstancedMesh(g, grassMat, points.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  points.forEach((p, i) => {
    dummy.position.set(p.x, 0.025, p.z);
    dummy.rotation.y = r() * Math.PI * 2;
    dummy.scale.setScalar((p.coastal ? 0.65 : 0.45) + r() * 0.55);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(p.coastal ? 0.18 : 0.22, 0.12 + r() * 0.10, 0.26 + r() * 0.12);
    mesh.setColorAt(i, color);
  });
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  b.root.add(mesh);
}

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

// The kiosk sells fish and chips: a sign on its roof, a menu over the
// fryers at the back, a warmer of battered fish, and vinegar, salt, sauce
// and lemon on the counter, and a board out front.
const NAVY = "#1d3557";
const CREAM = "#f6efe0";

function drawFish(g: CanvasRenderingContext2D, x: number, y: number, dir: number, colour: string): void {
  g.save();
  g.translate(x, y);
  g.scale(dir, 1);
  g.fillStyle = colour;
  g.beginPath();
  g.ellipse(0, 0, 24, 13, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(-18, 0);
  g.lineTo(-36, -13);
  g.lineTo(-36, 13);
  g.closePath();
  g.fill();
  g.fillStyle = NAVY;
  g.beginPath();
  g.arc(12, -3, 3, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// a navy board with a cream edge, drawn at 1.5x so small print stays legible
const board = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture =>
  canvasTexture(
    w * 1.5,
    h * 1.5,
    (g) => {
      g.scale(1.5, 1.5);
      g.fillStyle = NAVY;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = CREAM;
      g.lineWidth = 4;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = CREAM;
      draw(g);
    },
    [1, 1],
  );

function fishAndChips(b: Builder, K: Rect, wood: THREE.Material, darkWood: THREE.Material): void {
  const steel = std(0xb9bec4, { metalness: 0.7, roughness: 0.35 });
  const batter = std(0xd99a3a, { roughness: 0.6 });
  const chip = std(0xeec463, { roughness: 0.7 });
  const paper = std(0xf4f1ea);
  const front = K.z1;
  const mid = (K.x0 + K.x1) / 2;
  const top = 1.06; // the counter's top
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    b.root.add(m);
    return m;
  };

  // the sign on the roof, facing the boardwalk
  const sign = board(512, 96, (g) => {
    g.font = "bold 46px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("FISH & CHIPS", 256, 50);
    drawFish(g, 50, 48, 1, "#f2c14e");
    drawFish(g, 462, 48, -1, "#f2c14e");
  });
  b.box(wood, mid - 2.62, mid + 2.62, 3.3, 4.3, front - 0.32, front - 0.2);
  add(new THREE.PlaneGeometry(5.12, 0.96), std(0xffffff, { map: sign }), mid, 3.8, front - 0.19);

  // the menu on the back wall, over the fryers
  const menu = board(512, 128, (g) => {
    g.font = "bold 20px Georgia, serif";
    g.textAlign = "center";
    g.fillText("TODAY'S CATCH", 256, 32);
    g.font = "15px sans-serif";
    const rows: [string, string][][] = [
      [["Fish & chips", "16.50"], ["Flathead & chips", "18.00"], ["Grilled barramundi", "19.00"], ["Calamari rings", "9.00"]],
      [["Chips, small", "6.00"], ["Chips, large", "9.00"], ["Potato scallop", "2.50"], ["Dim sim", "2.50"]],
    ];
    rows.forEach((col, c) =>
      col.forEach(([item, price], i) => {
        g.textAlign = "left";
        g.fillText(item, 28 + c * 244, 58 + i * 18);
        g.textAlign = "right";
        g.fillText(price, 238 + c * 244, 58 + i * 18);
      }),
    );
  });
  add(new THREE.PlaneGeometry(4.4, 1.1), std(0xffffff, { map: menu, roughness: 0.9 }), mid, 1.85, K.z0 + 0.17);

  // fryers along the back: steel, two wells of oil, a basket over each
  const back = K.z0 + 0.15;
  b.box(steel, K.x0 + 0.2, K.x1 - 0.2, 0, 0.92, back, back + 0.65);
  const oil = std(0x6b4a1c, { roughness: 0.15, metalness: 0.2 });
  const basket = std(0xd4d8dc, { metalness: 0.5, roughness: 0.5 });
  for (const x of [K.x0 + 0.5, K.x0 + 1.7]) {
    b.box(oil, x, x + 1.0, 0.92, 0.93, back + 0.1, back + 0.55, { shadow: false });
    b.box(basket, x + 0.2, x + 0.8, 0.93, 1.08, back + 0.15, back + 0.5);
    b.box(darkWood, x + 0.47, x + 0.53, 1.04, 1.07, back + 0.5, back + 0.75);
  }
  // paper to wrap them in, on the bench beside
  b.box(paper, K.x1 - 1.6, K.x1 - 1.0, 0.92, 1.0, back + 0.15, back + 0.5);
  const roll = add(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 14), paper, K.x1 - 0.55, 1.0, back + 0.35);
  roll.rotation.z = Math.PI / 2;

  // a warmer on the counter: steel base and lid, glass, battered fish and
  // chips under a glowing lamp
  const wz0 = front - 0.28;
  const wz1 = front + 0.18;
  const wx0 = K.x1 - 2.4;
  const wx1 = K.x1 - 0.4;
  b.box(steel, wx0, wx1, top, top + 0.06, wz0, wz1);
  b.box(steel, wx0, wx1, top + 0.42, top + 0.46, wz0, wz1);
  b.box(std(0xffb35c, { emissive: 0xff9a3c, emissiveIntensity: 0.9 }), wx0 + 0.1, wx1 - 0.1, top + 0.4, top + 0.42, wz0 + 0.05, wz1 - 0.05, { shadow: false });
  b.box(std(0xdfeff5, { transparent: true, opacity: 0.22, roughness: 0.05, flatShading: false }), wx0, wx1, top + 0.06, top + 0.42, wz0, wz1, { shadow: false });
  for (let i = 0; i < 4; i++) {
    const piece = add(new THREE.SphereGeometry(1, 12, 8), batter, wx0 + 0.3 + i * 0.3, top + 0.11, (wz0 + wz1) / 2 + (i % 2 ? 0.05 : -0.05));
    piece.scale.set(0.13, 0.045, 0.06);
    piece.rotation.y = (i % 2 ? 0.3 : -0.25);
  }
  for (let i = 0; i < 14; i++) {
    const c = b.box(chip, 0, 0.012, 0, 0.012, 0, 0.09, { shadow: false });
    c.position.set(wx1 - 0.55 + (i % 5) * 0.06, top + 0.08 + Math.floor(i / 5) * 0.012, (wz0 + wz1) / 2 + ((i * 37) % 7) * 0.02 - 0.06);
    c.rotation.y = ((i * 53) % 11) * 0.28;
  }

  // vinegar, salt, tomato sauce and lemon at the left of the counter
  const cz = front - 0.02;
  add(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 12), std(0x3b2412, { roughness: 0.2 }), K.x0 + 0.6, top + 0.11, cz);
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.12, 12), std(0xf3f3f3, { roughness: 0.2 }), K.x0 + 0.75, top + 0.06, cz);
  add(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 12), steel, K.x0 + 0.75, top + 0.135, cz);
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 12), std(0xc0281e, { roughness: 0.35 }), K.x0 + 0.9, top + 0.09, cz);
  add(new THREE.ConeGeometry(0.015, 0.05, 8), paper, K.x0 + 0.9, top + 0.2, cz);
  add(new THREE.CylinderGeometry(0.11, 0.08, 0.05, 16), paper, K.x0 + 1.2, top + 0.025, cz);
  const lemon = std(0xf5d33b, { roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const w = add(new THREE.SphereGeometry(1, 8, 6), lemon, K.x0 + 1.15 + (i % 2) * 0.08, top + 0.06, cz - 0.03 + Math.floor(i / 2) * 0.06);
    w.scale.set(0.04, 0.025, 0.025);
  }

  // cones of chips ready to hand over, and two wrapped parcels
  for (let i = 0; i < 3; i++) {
    const x = K.x0 + 1.6 + i * 0.18;
    const cone = add(new THREE.ConeGeometry(0.06, 0.2, 12), paper, x, top + 0.1, cz);
    cone.rotation.x = Math.PI;
    for (let j = 0; j < 5; j++) {
      const c = b.box(chip, 0, 0.012, 0, 0.09, 0, 0.012, { shadow: false });
      c.position.set(x + (j - 2) * 0.012, top + 0.22, cz + ((j * 3) % 5 - 2) * 0.01);
      c.rotation.z = (j - 2) * 0.15;
    }
  }
  b.box(paper, K.x0 + 2.3, K.x0 + 2.62, top, top + 0.08, cz - 0.12, cz + 0.1);
  b.box(paper, K.x0 + 2.33, K.x0 + 2.6, top + 0.08, top + 0.15, cz - 0.1, cz + 0.08);

  // a chalkboard out front, leaning both ways
  const ax = K.x0 - 0.9;
  const az = front + 0.9;
  const sandwich = board(208, 320, (g) => {
    g.textAlign = "center";
    g.font = "bold 40px Georgia, serif";
    g.fillText("FISH", 104, 66);
    g.fillText("&", 104, 110);
    g.fillText("CHIPS", 104, 154);
    drawFish(g, 110, 200, 1, "#f2c14e");
    g.font = "20px sans-serif";
    g.fillText("Hot chips", 104, 256);
    g.fillText("from 6.00", 104, 282);
  });
  for (const side of [1, -1]) {
    const panel = add(new THREE.PlaneGeometry(0.62, 0.95), std(0xffffff, { map: sandwich, side: THREE.DoubleSide }), ax, 0.47, az + side * 0.12);
    panel.rotation.set(-side * 0.22, side === 1 ? 0 : Math.PI, 0);
  }
  b.solids.push({ x0: ax - 0.35, x1: ax + 0.35, z0: az - 0.25, z1: az + 0.25 });
}

// The busker's pitch beside his bench: a chalkboard on an easel saying who
// he is and what he plays (the recording is "El Noi de la Mare"), and his
// guitar case open on the ground for tips.
function buskerPitch(b: Builder, wood: THREE.Material, x: number, z: number): void {
  const chalk = canvasTexture(
    300,
    420,
    (g) => {
      g.fillStyle = "#23282a";
      g.fillRect(0, 0, 300, 420);
      g.strokeStyle = "#8a6a45";
      g.lineWidth = 14;
      g.strokeRect(7, 7, 286, 406);
      g.fillStyle = "#f3ede0";
      g.textAlign = "center";
      g.font = "bold 46px Georgia, serif";
      g.fillText("MATEO", 150, 78);
      g.fillStyle = "#f2c14e";
      g.font = "italic 26px Georgia, serif";
      g.fillText("\u266A on guitar \u266A", 150, 116);
      g.fillStyle = "#f3ede0";
      g.font = "21px sans-serif";
      g.fillText("Catalan & Spanish folk", 150, 168);
      g.fillText("by the sea", 150, 194);
      g.fillStyle = "#9fd3c7";
      g.font = "18px sans-serif";
      g.fillText("Now playing:", 150, 240);
      g.font = "italic 22px Georgia, serif";
      g.fillText("El Noi de la Mare", 150, 268);
      g.fillStyle = "#f3ede0";
      g.font = "19px sans-serif";
      g.fillText("Requests welcome:", 150, 318);
      g.fillText("just ask!", 150, 342);
      g.fillStyle = "#f0a3a8";
      g.font = "italic 20px Georgia, serif";
      g.fillText("Thanks for listening", 150, 390);
    },
    [1, 1],
  );
  // the easel: two legs in front, one behind, a ledge, and the board on it,
  // facing the boardwalk (-z)
  const easel = new THREE.Group();
  easel.position.set(x, 0, z);
  easel.rotation.y = 0;
  const leg = (lx: number, lz: number, tilt: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.45, 0.04), wood);
    m.position.set(lx, 0.7, lz);
    m.rotation.x = tilt;
    m.castShadow = true;
    easel.add(m);
  };
  leg(-0.26, 0.1, 0.12);
  leg(0.26, 0.1, 0.12);
  leg(0, -0.25, -0.3);
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.03, 0.07), wood);
  ledge.position.set(0, 0.62, 0.17);
  easel.add(ledge);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.78), std(0xffffff, { map: chalk, roughness: 0.9 }));
  board.position.set(0, 1.02, 0.2);
  board.rotation.x = -0.12;
  board.castShadow = true;
  easel.add(board);
  b.root.add(easel);
  b.solids.push({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.3, z1: z + 0.3 });

  // The old open case and fallen-looking lid are omitted from this close
  // porch composition. Mateo's upright board remains the readable landmark.
}

function bench(b: Builder, wood: THREE.Material, metal: THREE.Material, x: number, z: number, width = 1.8, south = false): void {
  const half = width / 2, back = south ? -1 : 1;
  for (let slat = 0; slat < 3; slat++) {
    const zz = z - 0.21 + slat * 0.145;
    b.box(wood, x - half, x + half, 0.42, 0.47, zz, zz + 0.125);
  }
  for (const y of [0.57, 0.74]) b.box(wood, x - half, x + half, y, y + 0.125, z + back * 0.21 - 0.03, z + back * 0.21 + 0.03);
  for (const dx of [-half + 0.15, half - 0.15]) for (const dz of [-0.16, 0.16]) {
    b.box(metal, x + dx - 0.025, x + dx + 0.025, 0, 0.42, z + dz - 0.025, z + dz + 0.025);
  }
  b.solids.push({ x0: x - half, x1: x + half, z0: z - 0.25, z1: z + 0.25 });
}

// ---- the sea ---------------------------------------------------------------

let seaTime: { value: number } | null = null;
let doors: Door[] = [];
let doorTime = 0;
let foamMaterial: THREE.MeshStandardMaterial | null = null;
let shoreFoam: THREE.Mesh | null = null;
let swash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null = null;
const breakers: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>[] = [];
const rippleMaps: THREE.Texture[] = [];

// Water: a standard material (so it reflects the sky) with waves added in
// the vertex shader: four swells from different directions, so no single
// line of them repeats. Its small ripples are one normal texture sampled
// twice where the water is, at two sizes and angles, each drifting its own
// way (`flow`, metres a second), so they never show as a tiled pattern and a
// creek's run downstream.
function water(colour: number, amp: number, scale: number, roughness: number, reflect = 0.45, ocean = false, flow: [number, number] = [0.02, 0.013], rippleSize = 3): THREE.MeshStandardMaterial {
  // a bright sky would otherwise turn the water white at a low angle
  const mat = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0, envMapIntensity: reflect });
  seaTime ??= { value: 0 };
  // Small ripples catch the sky between the swells: a normal map from
  // twenty-four waves of random direction and size (whole numbers of them
  // across the tile, so it tiles), irregular enough not to show a pattern.
  const ripple = canvasTexture(256, 256, (g) => {
    const r = mulberry(17);
    const waves = Array.from({ length: 24 }, () => {
      const kx = Math.round((r() - 0.5) * 22);
      const ky = Math.round((r() - 0.5) * 22) || 1;
      return { kx, ky, phase: r() * Math.PI * 2, a: 1 / Math.hypot(kx, ky) };
    });
    const pixels = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        let dx = 0;
        let dy = 0;
        for (const w of waves) {
          const c = Math.cos(((w.kx * x + w.ky * y) / 256) * Math.PI * 2 + w.phase) * w.a;
          dx += c * w.kx;
          dy += c * w.ky;
        }
        const i = (y * 256 + x) * 4;
        pixels.data[i] = 128 - dx * 9;
        pixels.data[i + 1] = 128 - dy * 9;
        pixels.data[i + 2] = 240;
        pixels.data[i + 3] = 255;
      }
    g.putImageData(pixels, 0, 0);
  }, ocean ? [240, 120] : [32, 4]);
  ripple.colorSpace = THREE.NoColorSpace;
  mat.normalMap = ripple;
  rippleMaps.push(ripple);
  mat.normalScale.set(ocean ? 0.24 : 0.22, ocean ? 0.24 : 0.22);
  mat.customProgramCacheKey = () => `coastal-water-${scale}-${amp}-${ocean}-${flow}-${rippleSize}`;
  const k = (n: number): string => (n * scale).toFixed(3);
  const f = (n: number): string => n.toFixed(4);
  // the swells: [direction x, direction z, wavenumber, speed, share]
  const swells: [number, number, number, number, number][] = [
    [0.2, 0.98, 0.18, 0.9, 0.5],
    [-0.42, 0.91, 0.31, 1.3, 0.28],
    [0.71, 0.71, 0.53, 1.7, 0.14],
    [-0.9, 0.44, 0.9, 2.3, 0.08],
  ];
  const height = swells.map(([dx, dz, n, sp, a]) => `${f(a)} * sin(dot(p, vec2(${f(dx)}, ${f(dz)})) * ${k(n)} + uTime * ${f(sp)})`).join(" + ");
  const slopeX = swells.map(([dx, dz, n, sp, a]) => `${f(a * dx * n * scale)} * cos(dot(p, vec2(${f(dx)}, ${f(dz)})) * ${k(n)} + uTime * ${f(sp)})`).join(" + ");
  const slopeZ = swells.map(([dx, dz, n, sp, a]) => `${f(a * dz * n * scale)} * cos(dot(p, vec2(${f(dx)}, ${f(dz)})) * ${k(n)} + uTime * ${f(sp)})`).join(" + ");
  const swellFns = `float swellH(vec2 p) { return ${height}; }
vec2 swellD(vec2 p) { return vec2(${slopeX}, ${slopeZ}); }`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = seaTime!;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;\nvarying vec3 vWaterWorld;\n${swellFns}`)
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
         vec4 wp = modelMatrix * vec4(position, 1.0);
         float shore = ${ocean ? `smoothstep(9.0 + 22.0 * smoothstep(-10.0, -1.0, wp.x), 21.0 + 22.0 * smoothstep(-10.0, -1.0, wp.x), wp.z)` : "1.0"};
         transformed.z += swellH(wp.xz) * ${f(amp * 1.3)} * shore;
         vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `vec4 wpn = modelMatrix * vec4(position, 1.0);
         float shoreN = ${ocean ? `smoothstep(9.0 + 22.0 * smoothstep(-10.0, -1.0, wpn.x), 21.0 + 22.0 * smoothstep(-10.0, -1.0, wpn.x), wpn.z)` : "1.0"};
         vec2 slope = swellD(wpn.xz) * ${f(amp * 1.3)} * shoreN;
         vec3 objectNormal = normalize(vec3(-slope.x, slope.y, 1.0));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vWaterWorld;")
      .replace(
        "#include <normal_fragment_maps>",
        `vec2 wuv = vWaterWorld.xz;
         vec3 nA = texture2D( normalMap, wuv / ${f(rippleSize)} - uTime * vec2(${f(flow[0] / rippleSize)}, ${f(flow[1] / rippleSize)}) ).xyz * 2.0 - 1.0;
         vec3 nB = texture2D( normalMap, mat2(0.8, -0.6, 0.6, 0.8) * wuv / ${f(rippleSize * 2.7)} - uTime * vec2(${f((flow[0] * 0.6) / (rippleSize * 2.7))}, ${f((flow[1] * 1.3 + 0.004) / (rippleSize * 2.7))}) ).xyz * 2.0 - 1.0;
         vec3 mapN = normalize(vec3(nA.xy + nB.xy, nA.z * nB.z));
         // far off, the ripples blur into a smoother sheen, as they do
         mapN.xy *= normalScale * mix(1.0, 0.3, smoothstep(25.0, 220.0, distance(vWaterWorld, cameraPosition)));
         normal = normalize( tbn * mapN );`,
      )
      .replace("#include <color_fragment>", `#include <color_fragment>
        float rippleLight = sin(vWaterWorld.x * 1.3 + vWaterWorld.z * 2.1 + uTime * 0.7)
          * sin(vWaterWorld.x * 0.8 - vWaterWorld.z * 1.5 - uTime * 0.5);
        ${ocean ? `float localShore = 9.0 + 22.0 * smoothstep(-10.0, -1.0, vWaterWorld.x);
        float depth = smoothstep(localShore, localShore + 95.0, vWaterWorld.z);
        vec3 shallow = vec3(0.075, 0.245, 0.235);
        vec3 deep = vec3(0.038, 0.115, 0.155);
        diffuseColor.rgb = mix(shallow, deep, depth);
        diffuseColor.rgb += (1.0 - depth) * pow(max(0.0, rippleLight), 8.0) * 0.022;` : "diffuseColor.rgb *= 1.0 + rippleLight * 0.09;"}`);
  };
  return mat;
}

// Low coastal headlands give the sea a far shore and an open middle. They
// live beyond the walkable place: three tiny meshes, no shadows or collision.
function headlands(b: Builder, bark: THREE.Material): void {
  const mat = surface("forest_leaves_02", [15, 9], { vertexColors: true, roughness: 1, flatShading: false });
  mat.normalScale.setScalar(0.12);
  const coast = new THREE.Color(0x6f7d60);
  const coastalTrees: GrovePine[] = [], stones: { x: number; y: number; z: number; size: number }[] = [];
  const random = mulberry(782);
  // Nested ridges at each end frame an open middle distance. The uneven
  // contour, quiet patch colours and cooler far ridges suggest a coast,
  // instead of the three smooth hemispheres of the previous art pass.
  for (const [x, z, width, depth, height, seed, distance] of [
    [-112, 49, 104, 88, 25, 0.8, 0.04],
    [-164, 83, 142, 116, 36, 1.0, 0.30],
    [-205, 310, 258, 66, 37, 1.2, 0.55],
    [225, 345, 260, 78, 39, 2.8, 0.70],
    [-176, 213, 218, 70, 28, 1.7, 0.05],
    [175, 263, 183, 62, 27, 3.1, 0.25],
    [58, 325, 77, 30, 8, 4.2, 0.75],
  ]) {
    const ridge = new THREE.Color(0x45664f).lerp(new THREE.Color(0x829da3), distance);
    const elevation = (u: number, v: number): number => {
      const footprint = Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v);
      const contour = 0.65 + 0.18 * Math.sin(u * 7 + seed)
        + 0.10 * Math.sin(u * 15 - seed * 2) + 0.045 * Math.sin(u * 31 + v * 4)
        + 0.025 * Math.sin(u * 53 + v * 17);
      return Math.pow(footprint, 0.65) * height * contour;
    };
    const g = new THREE.PlaneGeometry(width, depth, 64, 24);
    const p = g.attributes.position;
    const colours: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / (width / 2), v = p.getY(i) / (depth / 2);
      const h = elevation(u, v);
      p.setXYZ(i, x + p.getX(i), h - 0.65, z - p.getY(i));
      const patch = Math.sin(u * 33 + v * 11 + seed) * Math.sin(u * 17 - v * 19);
      const c = coast.clone().lerp(ridge, Math.min(1, h / height * 2.1));
      c.multiplyScalar(0.94 + patch * 0.14);
      colours.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    g.computeVertexNormals();
    b.root.add(new THREE.Mesh(g, mat));
    if (z < 100) {
      // Real small pines and scrub cover the near headland's lower slopes.
      // Their crowns interrupt the ridge and shore contours instead of leaving
      // a smooth single-colour hill in the hero view.
      for (let i = 0; i < 76; i++) {
        const u = (random() - 0.5) * 1.82, v = (random() - 0.5) * 1.65;
        const h = elevation(u, v) - 0.65;
        coastalTrees.push({ x: x + u * width / 2, z: z - v * depth / 2, y: h,
          h: 2.0 + random() * (v < 0 ? 3.2 : 5.2), turn: random() * Math.PI * 2 });
      }
      for (let i = 0; i < 34; i++) {
        const u = (random() - 0.5) * 1.9, v = (random() - 0.5) * 1.8;
        stones.push({ x: x + u * width / 2, z: z - v * depth / 2,
          y: elevation(u, v) - 0.75, size: 0.4 + random() * 1.4 });
      }
    }
  }
  buildPineGrove(b.root, bark, coastalTrees);
  const stoneGeometry = new THREE.IcosahedronGeometry(1, 1);
  const stonePosition = stoneGeometry.attributes.position;
  for (let i = 0; i < stonePosition.count; i++) {
    const x = stonePosition.getX(i), y = stonePosition.getY(i), z = stonePosition.getZ(i);
    const irregular = 1 + Math.sin(x * 8 + z * 5) * 0.13;
    stonePosition.setXYZ(i, x * irregular, y * 0.63, z * irregular);
  }
  stoneGeometry.computeVertexNormals();
  const rock = new THREE.InstancedMesh(stoneGeometry, std(0x969a85, { roughness: 1, flatShading: false }), stones.length);
  const dummy = new THREE.Object3D();
  stones.forEach((p, i) => { dummy.position.set(p.x, p.y, p.z); dummy.rotation.y = random() * Math.PI * 2;
    dummy.scale.set(p.size, p.size, p.size * (0.8 + random() * 0.4)); dummy.updateMatrix(); rock.setMatrixAt(i, dummy.matrix); });
  rock.receiveShadow = true; rock.computeBoundingSphere(); b.root.add(rock);
}

// ---- the creek ---------------------------------------------------------------

// The ground of the creek's band, shaped by creekBed and darkened towards
// the water where it's wet; then the water over it: clear at the edges,
// where the bed shows, deeper and darker in the middle, its ripples running
// downstream (west). Stones and grass along it come with the furniture.
function buildCreek(b: Builder, forestFloor: THREE.MeshStandardMaterial): void {
  const x0 = -62;
  const x1 = 62;
  const z0 = CREEK_Z - CREEK_HALF;
  const z1 = CREEK_Z + CREEK_HALF;
  const cols = 248;
  const rows = 52;
  const ground = new THREE.PlaneGeometry(x1 - x0, z1 - z0, cols, rows);
  ground.rotateX(-Math.PI / 2);
  ground.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = ground.getAttribute("position");
  const uv = ground.getAttribute("uv");
  const colour = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const wetMud = new THREE.Color(0x5a4c3c);
  const bedSilt = new THREE.Color(0x8a7a5c);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, creekBed(x, z));
    // the same texture scale as the forest floor (3.1 m a tile)
    uv.setXY(i, (x - x0) / 124, -z / 124);
    const d = acrossCreek(x, z);
    if (d < 1) c.copy(bedSilt).lerp(wetMud, d);
    else c.copy(wetMud).lerp(new THREE.Color(0xffffff), THREE.MathUtils.smoothstep(d, 1, 1.6));
    c.toArray(colour, i * 3);
  }
  ground.setAttribute("color", new THREE.BufferAttribute(colour, 3));
  ground.computeVertexNormals();
  const bankMat = forestFloor.clone();
  bankMat.vertexColors = true;
  const banks = new THREE.Mesh(ground, bankMat);
  banks.receiveShadow = true;
  b.root.add(banks);

  // the water, coloured and see-through by depth
  const sheet = new THREE.PlaneGeometry(x1 - x0, z1 - z0, cols / 2, rows);
  // (left upright: water() waves it in its own z, and the mesh lays it flat)
  const wpos = sheet.getAttribute("position");
  const rgba = new Float32Array(wpos.count * 4);
  for (let i = 0; i < wpos.count; i++) {
    const x = wpos.getX(i) + (x0 + x1) / 2;
    const z = -wpos.getY(i) + (z0 + z1) / 2;
    const depth = THREE.MathUtils.clamp((CREEK_LEVEL - creekBed(x, z)) / 0.47, 0, 1);
    c.setRGB(0.5 + 0.35 * (1 - depth), 0.6 + 0.3 * (1 - depth), 0.55 + 0.3 * (1 - depth));
    rgba.set([c.r, c.g, c.b, 0.38 + 0.55 * depth], i * 4);
  }
  sheet.setAttribute("color", new THREE.BufferAttribute(rgba, 4));
  // a forest stream's olive green, reflecting the sky between the trees
  const creekWater = water(0x3f5a45, 0.012, 3, 0.12, 0.7, false, [-0.45, 0.02], 1.1);
  creekWater.vertexColors = true;
  creekWater.transparent = true;
  creekWater.depthWrite = false;
  const stream = new THREE.Mesh(sheet, creekWater);
  stream.rotation.x = -Math.PI / 2;
  stream.position.set((x0 + x1) / 2, CREEK_LEVEL, (z0 + z1) / 2);
  b.root.add(stream);
}

// Stones and grass along the creek, placed with the furniture: boulders in
// and beside the stream, pebbles along the water's edge, grass up the banks.
function creekStones(): Scatter[] {
  const r = mulberry(41);
  const atCreek = (n: number, from: number, to: number, size: [number, number], sink = 0): Scatter["at"] => {
    const out: Scatter["at"] = [];
    while (out.length < n) {
      const x = -58 + r() * 116;
      if (x > BRIDGE.x0 - 1.5 && x < BRIDGE.x1 + 1.5) continue;
      const side = r() > 0.5 ? 1 : -1;
      const z = creekMid(x) + side * creekHalfAt(x) * (from + r() * (to - from));
      if (Math.abs(z - CREEK_Z) > CREEK_HALF - 0.3) continue;
      out.push({ x, z, y: creekBed(x, z) - sink, turn: r() * Math.PI * 2, size: size[0] + r() * (size[1] - size[0]) });
    }
    return out;
  };
  return [
    { id: "boulder_01", height: 0.7, at: atCreek(22, 0, 1.1, [0.5, 1.3], 0.15) },
    { id: "rock_07", height: 0.18, at: atCreek(110, 0.8, 1.3, [0.6, 1.8]) },
    { id: "grass_medium_02", height: 0.5, sway: 0.25, at: atCreek(76, 1.2, 1.9, [0.7, 1.4]) },
  ];
}

// ---- building it -----------------------------------------------------------

function build(): Built {
  seaTime = { value: 0 };
  breakers.length = 0;
  rippleMaps.length = 0;
  const b = new Builder();
  const forestFloor = surface("forest_leaves_02", [40, 40]);
  forestFloor.color.setHex(0xb7b69b);
  forestFloor.normalScale.setScalar(0.18);
  const trailMat = surface("stony_dirt_path", [1, 60]);
  trailMat.color.setHex(0xc8b89b);
  trailMat.normalScale.setScalar(0.15);
  const bark = surface("pine_bark", [1, 3]);
  bark.color.setHex(0xa2987c);
  bark.normalScale.setScalar(0.32);
  const sand = surface("coast_sand_01", [30, 14]);
  const wetSand = surface("damp_beach_sand", [40, 3]);
  const boards = surface("brown_planks_05", [1, 1]);
  boards.color.setHex(0xbca17a);
  boards.normalScale.setScalar(0.20);
  const pierBoards = surface("weathered_planks", [1, 20]);
  pierBoards.color.setHex(0xbba789);
  pierBoards.normalScale.setScalar(0.2);
  const kioskWood = surface("white_planks_clean", [2, 1]);
  const wood = std(0x7a5a3e, { roughness: 0.7 });
  const darkWood = std(0x4a3526, { roughness: 0.7 });
  const metal = std(0x2a2c2f, { metalness: 0.5, roughness: 0.45 });
  const lampHead = std(0x222222, { emissive: 0xffcf8a, emissiveIntensity: 0 });
  // windows of the huts, lit at dusk
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
      const width = 1.3 + Math.sin(i * 0.23) * 0.09 + Math.sin(i * 0.71) * 0.035;
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width);
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
  edgeGrass(b);
  buildHeroPines(b.root, bark);
  // The western promenade disappears into a wooded rock slope beyond the
  // world's walking boundary, rather than ending against a white horizon.
  const westSlope = new THREE.PlaneGeometry(80, 52, 40, 24);
  const slopeVertices = westSlope.attributes.position;
  for (let i = 0; i < slopeVertices.count; i++) {
    const x = -92 + slopeVertices.getX(i), z = -12 - slopeVertices.getY(i);
    const west = THREE.MathUtils.smoothstep(-52 - x, 0, 42);
    const inland = THREE.MathUtils.smoothstep(14 - z, 0, 20);
    const height = west * inland * (5 + 3 * Math.sin(x * 0.07 + z * 0.1) + 1.1 * Math.sin(x * 0.3));
    slopeVertices.setXYZ(i, x, height - 0.06, z);
  }
  westSlope.computeVertexNormals();
  const slope = new THREE.Mesh(westSlope, forestFloor); slope.receiveShadow = true; b.root.add(slope);
  const westRandom = mulberry(490);
  const westGround = (x: number, z: number): number => THREE.MathUtils.smoothstep(-52 - x, 0, 42)
    * THREE.MathUtils.smoothstep(14 - z, 0, 20)
    * (5 + 3 * Math.sin(x * 0.07 + z * 0.1) + 1.1 * Math.sin(x * 0.3)) - 0.06;
  const westTrees: GrovePine[] = Array.from({ length: 74 }, () => {
    const x = -58 - westRandom() * 61, z = -34 + westRandom() * 38;
    return { x, z, y: westGround(x, z), h: 7.5 + westRandom() * 6, turn: westRandom() * Math.PI * 2 };
  });
  for (let i = 0; i < 92; i++) {
    const x = -56 - westRandom() * 68, z = -32 + westRandom() * 39;
    westTrees.push({ x, z, y: westGround(x, z), h: 0.9 + westRandom() * 1.6, turn: westRandom() * Math.PI * 2 });
  }
  buildPineGrove(b.root, bark, westTrees);
  for (const tree of HERO_PINES) b.solids.push({ x0: tree.x - tree.radius, x1: tree.x + tree.radius,
    z0: tree.z - tree.radius, z1: tree.z + tree.radius });

  // the creek: banks sloping down from the forest floor to a stream that
  // winds and widens, with a footbridge where the trail crosses it
  buildCreek(b, forestFloor);
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
  sand.color.setHex(0xe2d4b7);
  sand.normalScale.setScalar(0.14);
  sand.roughness = 0.96;
  wetSand.color.setHex(0xc8c1a7);
  wetSand.normalScale.setScalar(0.12);
  wetSand.roughness = 0.74;
  const beachGeometry = new THREE.PlaneGeometry(124, 1, 124, 20);
  const beachVertices = beachGeometry.attributes.position;
  const beachUv = beachGeometry.attributes.uv;
  for (let i = 0; i < beachVertices.count; i++) {
    const x = beachVertices.getX(i), t = 0.5 - beachVertices.getY(i);
    const z = -17 + t * (shoreAt(x) - 0.9 + 17);
    beachVertices.setXYZ(i, x, -0.10 * THREE.MathUtils.smoothstep(z, shoreAt(x) - 3, shoreAt(x)), z);
    beachUv.setXY(i, (x + 62) / 124, (z + 17) / 48);
  }
  beachGeometry.computeVertexNormals();
  const beachFloor = new THREE.Mesh(beachGeometry, sand); beachFloor.receiveShadow = true;
  b.root.add(beachFloor); b.floors.push(beachFloor);
  // Solid water bounds follow the physical cove. The pier corridor is kept
  // open, and eastern beach access never changes into invisible water walking.
  for (let x = -62; x < -1; x += 0.5) {
    const x0 = x, x1 = x + 0.5;
    const z0 = Math.min(shoreAt(x0), shoreAt(x1)) - 0.35;
    if (z0 >= WATERLINE - 0.3) continue;
    if (x0 < PIER.x0 + 0.30) b.solids.push({ x0, x1: Math.min(x1, PIER.x0 + 0.30), z0, z1: WATERLINE });
    if (x1 > PIER.x1 - 0.30) b.solids.push({ x0: Math.max(x0, PIER.x1 - 0.30), x1, z0, z1: WATERLINE });
  }
  const shoreGeometry = new THREE.PlaneGeometry(124, 2.7, 124, 1);
  const shoreVertices = shoreGeometry.attributes.position;
  for (let i = 0; i < shoreVertices.count; i++) shoreVertices.setY(i, shoreVertices.getY(i) + WATERLINE - shoreAt(shoreVertices.getX(i)));
  const shoreline = new THREE.Mesh(shoreGeometry, wetSand);
  shoreline.rotation.x = -Math.PI / 2;
  shoreline.position.set(0, -0.085, WATERLINE - 1.25);
  shoreline.receiveShadow = true;
  b.root.add(shoreline);
  b.floors.push(shoreline);
  // the sea, out to the horizon
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 800, 640, 120), water(0xffffff, 0.16, 1, 0.28, 0.32, true, [0.02, 0.013], 5.5));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.12, WATERLINE + 400);
  const seaVertices = sea.geometry.attributes.position;
  for (let i = 0; i < seaVertices.count; i++) {
    // Spend most rows near shore, where viewers can actually see the swell.
    const sourceX = seaVertices.getX(i);
    seaVertices.setX(i, Math.sign(sourceX) * (Math.abs(sourceX) / 800) ** 2 * 800);
    const distance = (400 - seaVertices.getY(i)) / 800;
    const y = 400 - distance * distance * 800;
    seaVertices.setY(i, y + (WATERLINE - shoreAt(seaVertices.getX(i))) * Math.exp(-distance * distance * 800 / 90));
  }
  sea.receiveShadow = true;
  b.root.add(sea);
  headlands(b, bark);
  // foam where the waves run up the sand
  const foamTex = canvasTexture(
    512,
    128,
    (g) => {
      const r = mulberry(3);
      g.clearRect(0, 0, 512, 128);
      for (let x = 0; x < 512; x++) {
        const edge = 57 + Math.sin(x / 512 * Math.PI * 8) * 12 + Math.sin(x / 512 * Math.PI * 18) * 5;
        for (let j = 0; j < 12; j++) {
          const broken = 0.45 + 0.55 * Math.sin(x / 512 * Math.PI * 5) ** 2;
          g.fillStyle = `rgba(225,240,230,${(1 - j / 12) * (0.3 + r() * 0.45) * broken})`;
          g.fillRect(x, edge + j * 2 + r() * 5, 1 + r() * 2, 1.5);
        }
      }
    },
    [8, 1],
  );
  foamMaterial = std(0xffffff, { map: foamTex, transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.9 });
  const foamGeometry = new THREE.PlaneGeometry(124, 2.2, 124, 1);
  const foamVertices = foamGeometry.attributes.position;
  for (let i = 0; i < foamVertices.count; i++) foamVertices.setY(i, foamVertices.getY(i) + WATERLINE - shoreAt(foamVertices.getX(i)));
  const foam = new THREE.Mesh(foamGeometry, foamMaterial);
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, -0.075, WATERLINE + 0.6);
  b.root.add(foam);
  shoreFoam = foam;
  // the swash: a thin, clear sheet of sea that runs up the sand behind the
  // foam and slides back, its landward edge fading out in a wavy line
  const swashAlpha = canvasTexture(
    256,
    64,
    (g) => {
      for (let x = 0; x < 256; x++) {
        const edge = 18 + Math.sin((x / 256) * Math.PI * 6) * 6 + Math.sin((x / 256) * Math.PI * 22) * 2;
        const grad = g.createLinearGradient(0, edge, 0, 64);
        grad.addColorStop(0, "#000");
        grad.addColorStop(0.35, "#888");
        grad.addColorStop(1, "#fff");
        g.fillStyle = "#000";
        g.fillRect(x, 0, 1, edge);
        g.fillStyle = grad;
        g.fillRect(x, edge, 1, 64 - edge);
      }
    },
    [8, 1],
  );
  swash = new THREE.Mesh(foamGeometry.clone(), std(0x83bfb1, { alphaMap: swashAlpha, transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.18, flatShading: false }));
  swash.rotation.x = -Math.PI / 2;
  swash.scale.y = 1.3;
  swash.position.set(0, -0.08, WATERLINE);
  b.root.add(swash);
  // Staggered, broken whitewater fronts approach the sand, then dissolve.
  // Sharing the texture and geometry adds only three small draw calls.
  for (let i = 0; i < 3; i++) {
    const front = new THREE.Mesh(foamGeometry, foamMaterial.clone());
    front.rotation.x = -Math.PI / 2;
    front.position.set(0, -0.07 + i * 0.004, WATERLINE + 3);
    front.scale.y = 1.3;
    b.root.add(front);
    breakers.push(front);
  }

  // the boardwalk, with lamps and benches
  const walk = b.box(boards, -52, 52, -0.06, 0.04, -4, 2.6, { shadow: false });
  b.floors.push(walk);
  // Real transverse boards give the promenade a readable walking scale.
  const boardCount = 416;
  const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(0.242, 0.035, 6.52), boards, boardCount);
  const deckMatrix = new THREE.Matrix4(), boardColour = new THREE.Color();
  for (let i = 0; i < boardCount; i++) {
    deckMatrix.makeTranslation(-51.875 + i * 0.25, 0.055 + Math.sin(i * 7.1) * 0.002, -0.7);
    deck.setMatrixAt(i, deckMatrix);
    boardColour.setHSL(0.105, 0.11 + (i % 7) * 0.007, 0.66 + (i % 11) * 0.012); deck.setColorAt(i, boardColour);
  }
  deck.receiveShadow = true; deck.computeBoundingSphere(); b.root.add(deck);
  b.box(darkWood, -52, 52, -0.2, 0.08, 2.6, 2.75, { shadow: false });
  // The western railing frames the cove. Openings preserve the pier and a
  // route down onto the western sand; nothing crosses the cafe doorway.
  const railOpening = (x: number): boolean => (x > -34.5 && x < -30.5) || (x > -23.5 && x < -21.0);
  const railParts: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[] = [];
  for (let x = -51.5; x < -9.5; x += 2.2) {
    if (railOpening(x) || railOpening(x + 1.9)) continue;
    railParts.push({ x, y: 0.53, z: 2.57, sx: 0.17, sy: 1.05, sz: 0.17 });
    b.solids.push({ x0: x - 0.11, x1: x + 0.11, z0: 2.46, z1: 2.68 });
    for (const y of [0.48, 0.94]) railParts.push({ x: x + 1.1, y, z: 2.57, sx: 2.24, sy: 0.13, sz: 0.12 });
    b.solids.push({ x0: x, x1: x + 2.2, z0: 2.51, z1: 2.63 });
  }
  const railing = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wood, railParts.length);
  const railDummy = new THREE.Object3D();
  railParts.forEach((p, i) => { railDummy.position.set(p.x, p.y, p.z); railDummy.scale.set(p.sx, p.sy, p.sz); railDummy.updateMatrix(); railing.setMatrixAt(i, railDummy.matrix); });
  railing.castShadow = railing.receiveShadow = true; railing.computeBoundingSphere(); b.root.add(railing);
  const lamps: THREE.PointLight[] = [];
  for (let x = -40; x <= 40; x += 13) {
    // The same slender pole footprint, now a timber post with a small
    // suspended lantern: warm, human scale furniture along the shore.
    b.cylinder(darkWood, x, 2.25, 0.07, 0, 4.2, 8);
    b.box(wood, x - 0.13, x + 0.53, 3.98, 4.08, 2.18, 2.32);
    b.cylinder(metal, x + 0.36, 2.25, 0.014, 3.82, 4.01, 6);
    b.box(lampHead, x + 0.24, x + 0.48, 3.42, 3.82, 2.13, 2.37, { shadow: false });
    for (const y of [3.40, 3.81]) b.box(metal, x + 0.21, x + 0.51, y, y + 0.055, 2.10, 2.40);
    for (const dx of [0.225, 0.48]) b.box(metal, x + dx, x + dx + 0.02, 3.43, 3.82, 2.12, 2.14, { shadow: false });
    b.solids.push({ x0: x - 0.12, x1: x + 0.12, z0: 2.13, z1: 2.37 });
    if (Math.abs(x - 12) < 7 || Math.abs(x + 14) < 7) {
      const l = new THREE.PointLight(0xffcf8a, 0, 16, 1.6);
      l.userData.outdoorLamp = true;
      l.position.set(x, 3.9, 2.25);
      b.root.add(l);
      lamps.push(l);
    }
  }
  // the one by the café's door is where the guitarist sits
  bench(b, wood, metal, BUSKER_BENCH, BUSKER_Z, 1.0, true);
  for (const x of [-6.5, 13, 36]) bench(b, wood, metal, x, 1.9);
  buskerPitch(b, wood, BUSKER_BENCH + 1.25, -3.0);

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
  const brickSkin = surface("plastered_wall", [3.5, 1.4]);
  brickSkin.color.setHex(0xe8dfc8);
  brickSkin.normalScale.setScalar(0.45);
  const C = { x0: CAFE_AT.x, x1: CAFE_AT.x + 14, z0: CAFE_AT.z, z1: CAFE_AT.z + 10 };
  b.box(brickSkin, C.x0 - 0.45, C.x0 - 0.25, 0, 4.04, C.z0 - 0.45, C.z1 + 0.15, { occludes: true });
  b.box(brickSkin, C.x1 + 0.25, C.x1 + 0.45, 0, 4.04, C.z0 - 0.45, C.z1 + 0.15, { occludes: true });
  b.box(brickSkin, C.x0 - 0.45, C.x1 + 0.45, 0, 4.04, C.z0 - 0.45, C.z0 - 0.25, { occludes: true });
  // Timber cladding, a sheltered gable and deep window surrounds give the
  // trail-facing side the same scale and joinery as the glazed front.
  const wallTimber = std(0xa69473, { roughness: 0.96 });
  const sideTimber = std(0x8c927a, { roughness: 0.98 });
  const battens = new THREE.InstancedMesh(new THREE.BoxGeometry(0.085, 0.22, 10.52), sideTimber, 16);
  const battenMatrix = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) {
    battenMatrix.makeTranslation(C.x1 + 0.48, 0.42 + i * 0.22, (C.z0 + C.z1) / 2 - 0.15);
    battens.setMatrixAt(i, battenMatrix);
  }
  battens.receiveShadow = true;
  battens.computeBoundingSphere();
  b.root.add(battens);
  for (const z of [C.z0 - 0.2, C.z0 + 3.0, C.z0 + 7.1, C.z1 + 0.1]) {
    b.box(wallTimber, C.x1 + 0.43, C.x1 + 0.60, 0.16, 4.03, z - 0.075, z + 0.075);
  }
  for (const y of [0.20, 3.87]) b.box(wallTimber, C.x1 + 0.43, C.x1 + 0.63, y, y + 0.14, C.z0 - 0.45, C.z1 + 0.28);
  const sideGable = new THREE.BufferGeometry();
  sideGable.setAttribute("position", new THREE.Float32BufferAttribute([
    C.x1 + 0.45, 4.0, C.z0 - 0.25, C.x1 + 0.45, 4.0, C.z1 + 0.15,
    C.x1 + 0.45, 5.05, C.z0 + 4.7,
    C.x0 - 0.45, 4.0, C.z0 - 0.25, C.x0 - 0.45, 5.05, C.z0 + 4.7,
    C.x0 - 0.45, 4.0, C.z1 + 0.15,
  ], 3));
  sideGable.computeVertexNormals();
  const gableWall = new THREE.Mesh(sideGable, std(0xc1b89f, { side: THREE.DoubleSide, roughness: 1 }));
  gableWall.castShadow = gableWall.receiveShadow = true;
  b.root.add(gableWall);
  // Closed side lights sit on the original opaque wall; their deep dark
  // reveals and fine muntins read as joinery, without changing the room.
  const sideGlass = std(0x425953, { roughness: 0.28, metalness: 0.08 });
  for (const z of [C.z0 + 1.45, C.z0 + 8.65]) {
    b.box(std(0x3c443b), C.x1 + 0.50, C.x1 + 0.57, 1.38, 3.12, z - 0.72, z + 0.72, { shadow: false });
    b.box(sideGlass, C.x1 + 0.58, C.x1 + 0.60, 1.48, 3.01, z - 0.61, z + 0.61, { shadow: false });
    for (const zz of [z - 0.73, z + 0.73]) b.box(wallTimber, C.x1 + 0.53, C.x1 + 0.75, 1.30, 3.20, zz - 0.06, zz + 0.06);
    for (const y of [1.33, 3.14]) b.box(wallTimber, C.x1 + 0.53, C.x1 + 0.77, y, y + 0.10, z - 0.78, z + 0.78);
    b.box(wallTimber, C.x1 + 0.61, C.x1 + 0.66, 1.45, 3.08, z - 0.025, z + 0.025, { shadow: false });
  }
  b.box(std(0xa7a18b, { roughness: 1 }), C.x1 + 0.44, C.x1 + 0.56, 0, 0.32, C.z0 - 0.1, C.z1 + 0.1, { shadow: false });
  const wallMark = canvasTexture(512, 512, (g) => {
    g.fillStyle = "#e9e0ca";
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "#37594b";
    g.lineWidth = 5;
    g.strokeRect(16, 16, 480, 480);
    g.fillStyle = "#264b41";
    g.textAlign = "center";
    g.font = "24px Georgia, serif";
    g.fillText("THE CORNER", 256, 85);
    // An original, simple pine-and-tide emblem, painted into the texture.
    g.lineWidth = 7;
    g.beginPath();
    g.arc(256, 220, 87, 0, Math.PI * 2);
    g.stroke();
    for (const [x, y, s] of [[239, 228, 1], [281, 243, 0.72]]) {
      g.beginPath();
      g.moveTo(x - 28 * s, y); g.lineTo(x, y - 68 * s); g.lineTo(x + 28 * s, y);
      g.moveTo(x, y - 44 * s); g.lineTo(x, y + 18 * s);
      g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(205, 260 + i * 12);
      g.bezierCurveTo(237, 247 + i * 12, 266, 273 + i * 12, 307, 260 + i * 12); g.stroke();
    }
    g.font = "66px Georgia, serif";
    g.fillText("CAFÉ", 256, 390);
    g.font = "20px Georgia, serif";
    g.fillText("FOREST  ·  SEA", 256, 442);
  }, [1, 1]);
  const wallPlaque = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 1.72), std(0xffffff, { map: wallMark, roughness: 1 }));
  wallPlaque.position.set(C.x1 + 0.64, 2.28, C.z0 + 5.0);
  wallPlaque.rotation.y = Math.PI / 2;
  b.root.add(wallPlaque);
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
  const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.48), std(0xffffff, { map: sign }));
  signBoard.position.set(CAFE_AT.x + 7, 3.30, CAFE_AT.z + 10.31);
  b.root.add(signBoard);

  // the fish and chip kiosk: white boards, a serving window, a red and
  // white awning
  const K = KIOSK;
  b.box(kioskWood, K.x0, K.x1, 0, 1.0, K.z1 - 0.15, K.z1, { solid: true, occludes: true });
  b.box(kioskWood, K.x0, K.x1, 2.4, 3.1, K.z1 - 0.15, K.z1, { occludes: true });
  b.box(kioskWood, K.x0, K.x0 + 0.15, 0, 3.1, K.z0, K.z1, { occludes: true });
  b.box(kioskWood, K.x1 - 0.15, K.x1, 0, 3.1, K.z0, K.z1, { occludes: true });
  b.box(kioskWood, K.x0, K.x1, 0, 3.1, K.z0, K.z0 + 0.15, { occludes: true });
  b.box(wood, K.x0, K.x1, 1.0, 1.06, K.z1 - 0.3, K.z1 + 0.25);
  b.box(darkWood, K.x0 - 0.2, K.x1 + 0.2, 3.1, 3.3, K.z0 - 0.2, K.z1 + 0.2, { occludes: true });
  const kioskAwning = new THREE.Mesh(new THREE.PlaneGeometry(K.x1 - K.x0 + 0.4, 1.4), std(0xffffff, { map: stripes("#e9dfc5", "#ac6c50", 5), side: THREE.DoubleSide }));
  kioskAwning.position.set((K.x0 + K.x1) / 2, 2.85, K.z1 + 0.6);
  kioskAwning.rotation.x = -Math.PI / 2 + 0.5;
  kioskAwning.castShadow = true;
  b.root.add(kioskAwning);
  b.solids.push({ x0: K.x0, x1: K.x1, z0: K.z0, z1: K.z1 });
  fishAndChips(b, K, wood, darkWood);

  // five huts: toilets, showers and a souvenir shop, with doors that open
  doors = buildHuts(b, wood);

  // a lifeguard tower on the sand: four legs, a red hut, a ladder
  const T = T_LIFE;
  const red = std(0xb56950, { roughness: 0.8 });
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
  sway?: number; // how much it moves in the wind (see world-build's sway)
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
  ...creekStones(),
  { id: "fern_02", height: 0.5, sway: 0.2, at: scatterPoints(21, 90, (r) => [-46 + r() * 92, -134 + r() * 112], [0.7, 1.6]).filter((p) => inForest(p.x, p.z)) },
  { id: "grass_medium_02", height: 0.45, sway: 0.25, at: scatterPoints(22, 110, (r) => [-48 + r() * 96, -44 + r() * 40], [0.8, 1.8]).filter((p) => distanceToTrail(p.x, p.z) > 1.6 && !inCafe(p.x, p.z) && (p.z < -14 || p.x < -30)) },
  { id: "shrub_02", height: 1.2, sway: 0.04, at: scatterPoints(23, 40, (r) => [-46 + r() * 92, -133 + r() * 111], [0.6, 1.2]).filter((p) => distanceToTrail(p.x, p.z) > 3.5 && Math.abs(p.z - CREEK_Z) > CREEK_HALF + 1.4), solid: 0.6 },
  { id: "rock_07", height: 0.2, at: scatterPoints(24, 60, (r) => [-46 + r() * 92, -134 + r() * 164], [0.8, 2.5]).filter((p) => distanceToTrail(p.x, p.z) > 1.8 && !inCafe(p.x, p.z) && p.z < shoreAt(p.x) - 1.0 && (p.z < -16 || p.z > 4)) },
  {
    id: "boulder_01",
    height: 1.0,
    at: [
      { x: -12, z: -54, size: 1.4, turn: 1 },
      { x: 8, z: -109, size: 1.1 },
      { x: 26, z: 27, size: 1.3, turn: 2 },
      { x: 30, z: 29, size: 0.8 },
      { x: -18, z: 26, y: -0.28, size: 1.0, turn: 4 },
      { x: -40, z: 22, y: -0.28, size: 1.6 },
      { x: -28, z: 6.8, size: 1.2, turn: 0.3 },
      { x: -26, z: 7.4, size: 0.7, turn: 1.2 },
      { x: -39, z: 7.0, size: 1.6, turn: 2.1 },
      { x: -43, z: 7.5, size: 1.1, turn: 0.6 },
      { x: -13.0, z: 7.2, size: 0.9, turn: 1.8 },
    ],
    solid: 0.8,
  },
  { id: "dead_tree_trunk", height: 0.4, at: [{ x: -9, z: -93.7, turn: 0.3, size: 1.2 }], solid: 0 },
  { id: "tree_stump_01", height: 0.55, at: [{ x: 6, z: -85.2 }, { x: -13, z: -90.6 }, { x: 9, z: -48, turn: 2 }], solid: 0.6 },
  { id: "CashRegister_01", height: 0.22, at: [{ x: TILL.x, z: TILL.z, y: TILL.y, turn: Math.PI }] },
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
    // grass, ferns and shrubs move in the wind
    if (s.sway) sway(mesh.material as THREE.Material, s.sway);
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
          if (s.id === "Lantern_01") prepareLampMaterials(gltf.scene);
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

// The café's regulars, in the room's own metres: a barista behind the
// counter, a queue, people at the tables and the window bar, two chatting by
// the door, and the guitarist outside on the bench by the door.
// A fourth entry is a pose they turn to now and then.
const CAFE_PEOPLE: Record<string, [number, number, Pose, Pose?][]> = {
  barista: [[8.2, 1.5, "stand", "back"]],
  queue: [
    [6.6, 3.7, "back"],
    [7.5, 4.5, "back"],
  ],
  tables: [
    [2.2, 4.85, "sit"],
    [2.2, 6.35, "sit"],
    [4.6, 7.35, "sit"],
    [9.4, 5.85, "sit"],
    [9.4, 7.35, "sit"],
    [11.8, 4.85, "sit"],
  ],
  bar: [
    [2.2, 8.7, "lean"],
    [10.5, 8.7, "lean"],
    [11.8, 8.7, "back"],
  ],
  door: [
    [5.2, 8.1, "talk"],
    [4.5, 8.4, "talk"],
  ],
};
// the fish and chip kiosk on the boardwalk
const KIOSK = { x0: 4.5, x1: 11, z0: -10, z1: -4.4 };
// someone behind its counter, turning now and then to the fryers, and
// someone waiting at it
const CHIPPY: Regular[] = [
  { x: KIOSK.x0 + 2.4, z: KIOSK.z1 - 1.1, pose: "stand", alt: "back", roam: [KIOSK.x0 + 1.4, KIOSK.z0 + 1.15] },
  { x: KIOSK.x1 - 1.6, z: KIOSK.z1 + 0.8, pose: "back" },
  // and someone minding the souvenir shop
  { x: SHOPKEEPER.x, z: SHOPKEEPER.z, pose: "stand", alt: "back", roam: [SHOPKEEPER.x - 1.6, SHOPKEEPER.z - 0.1] },
];
// a bench just west of the café's door, between two lamps
const BUSKER_BENCH = -16.2;
const BUSKER_Z = -2.0;
// Mateo is the one audible NPC, requested separately from people's sounds.
// Both his figure and his spatial recording use this same position.
export const BUSKER_SOUND = { soundId: "guitar", x: BUSKER_BENCH, y: 0.9, z: BUSKER_Z, hear: 18 };
// on the seat, facing the boardwalk: the world draws sitters a little
// towards you, so the bench is behind him, not through him
const BUSKER: Regular = { x: BUSKER_SOUND.x, z: BUSKER_SOUND.z, pose: "guitar", facing: 0.45, avatar: "dog", seed: "mateo-coastal-guitar" };

const regularsOf = (...groups: [string, number[]][]): Regular[] =>
  groups.flatMap(([g, which]) => which.map((i) => CAFE_PEOPLE[g][i]).map(([x, z, pose, alt]) => ({
    x: x + CAFE_AT.x, z: z + CAFE_AT.z, pose, alt,
    ...(g === "tables" ? { facing: z > 6.2 ? Math.PI : 0 }
      : g === "bar" ? { facing: 0 }
      : g === "door" ? { facing: x > 5 ? Math.atan2(-0.7, 0.3) : Math.atan2(0.7, -0.3) } : {}),
  })));

export const seasideKit: PlaceKit = {
  build,
  furnish,
  isInside: (x, z) => inCafe(x, z) || inHut(x, z),
  roomAt(x, z) {
    const h = hutAt(x, z);
    if (!h) return undefined;
    return { id: h.id, name: h.name, private: isPrivate(h), sound: privateSound(h), door: { x: (h.door.x0 + h.door.x1) / 2, z: h.z1 } };
  },
  zoneAt,
  regulars: {
    weekday: [
      // the barista goes along to the other end of the counter now and then
      ...regularsOf(["barista", [0]]).map((r) => ({ ...r, roam: [CAFE_AT.x + 5.2, CAFE_AT.z + 1.4] as [number, number] })),
      { x: -15.3, z: -0.8, pose: "stand", facing: Math.PI / 2, avatar: "cat", seed: "quiet-coastal-cat" },
      ...regularsOf(["queue", [0, 1]], ["tables", [0, 1, 2, 3, 4, 5]], ["bar", [0, 1, 2]], ["door", [0, 1]]), BUSKER, ...CHIPPY],
  },
  // five children with a beach ball on the sand, between the boardwalk and
  // the lifeguard tower
  ballGame: [
    [4, 11],
    [7.4, 12.8],
    [6.8, 16.6],
    [2.6, 17.2],
    [0.8, 13.6],
  ],
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
      [46, 0.8],
      [-46, 0.4],
    ],
    [
      [40, -1.6],
      [-8, -1.4],
      [-17, -3.2],
      [-17, -8],
    ],
    [
      [-30, 6],
      [-12, 6],
      [-8, 9],
      [-5, 19],
      [-2, 26],
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
    for (let attempt = 0; attempt < 32; attempt++) {
      const x = -48 + r() * 96;
      const z = -134 + r() * 170;
      if (!inCafe(x, z) && !inHut(x, z)) return [x, z];
    }
    return [0, 20]; // uncovered sand; also bounds an adversarial random source
  },
  rainCount: 7000,
  sunTarget: [0, 0, -10],
  // Sunny afternoon; long, soft shadows and sea haze separate the headlands.
  sunDirs: { weekday: [0.62, 0.48, 0.58] },
  light: { weekday: { fogNear: 75, fogFar: 440, exposure: 1.0 } },
  skies: { weekday: { url: "/assets/skies/qwantani_noon_puresky.hdr", intensity: 1 } },
  offTrail(x, z) {
    if (z > -18) return null;
    const n = nearestOnTrail(x, z);
    return n.d > STRAY ? { x: n.x, z: n.z, yaw: n.yaw } : null;
  },
  onTrail(x, z) {
    return z > -18 || nearestOnTrail(x, z).d < RETURNED;
  },
  animate(t, people) {
    // doors open for whoever comes up to them, whatever the motion setting
    swingDoors(doors, people, Math.max(0, t - doorTime));
    doorTime = t;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) t = 0;
    if (seaTime) seaTime.value = t;
    for (const map of rippleMaps) map.offset.set(t * 0.008, t * 0.013);
    breakers.forEach((front, i) => {
      const phase = (t / 8 + i / 3) % 1;
      front.position.z = WATERLINE + 7 * (1 - phase);
      front.position.x = Math.sin(t * 0.22 + i * 2) * 0.45;
      front.scale.y = 0.8 + phase * 1.1;
      front.material.opacity = Math.sin(phase * Math.PI) ** 2 * 0.52;
    });
    if (foamMaterial?.map) {
      // the wash running up the sand and back
      const s = Math.sin(t * 0.7);
      if (shoreFoam) shoreFoam.position.z = WATERLINE - 0.4 + s * 0.65;
      if (swash) {
        swash.position.z = WATERLINE + 0.45 + s * 0.65;
        swash.material.opacity = 0.22 + 0.22 * (0.5 + 0.5 * s);
      }
      foamMaterial.map.offset.set(t * 0.01, 0);
      foamMaterial.opacity = 0.32 + 0.28 * (0.5 + 0.5 * s);
    }
  },
};
