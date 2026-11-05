// The five huts on the boardwalk, beside the fish and chip kiosk: men's and
// women's toilets, men's and women's showers, and a seaside souvenir shop.
// Painted weatherboards with white trim and a corrugated roof, a sign over
// each door, and a door that swings open as someone comes up to it, so you
// can walk in. Drawn from shapes and canvas textures, like the kiosk.
//
// Metres: x east, y up, z south. Each hut is 3.2 m wide and 3.9 m deep, its
// door on the boardwalk side (+z).
import * as THREE from "three";
import { Builder, canvasTexture, std, type Rect } from "./world-build.js";

export type HutKind = "mens-toilet" | "womens-toilet" | "mens-shower" | "womens-shower" | "shop";

export interface Hut extends Rect {
  kind: HutKind;
  // where its door is, along x
  door: { x0: number; x1: number };
  // a window in the front wall, if it has one
  window?: { x0: number; x1: number; y0: number; y1: number };
}

const W = 3.2;
const D = 3.9;
const H = 2.6; // walls
const RISE = 1.0; // the roof's ridge above the walls
const T = 0.1; // walls
const DOOR_H = 2.05;

const KINDS: { kind: HutKind; paint: string; door: number }[] = [
  { kind: "mens-toilet", paint: "#5b93c9", door: 1.1 },
  { kind: "womens-toilet", paint: "#ee8f8f", door: 1.1 },
  { kind: "mens-shower", paint: "#6cc0ad", door: 1.1 },
  { kind: "womens-shower", paint: "#efcf63", door: 1.1 },
  { kind: "shop", paint: "#f6f1e7", door: 0.4 },
];

export const HUTS: Hut[] = KINDS.map((k, i) => {
  const x0 = 15 + i * 4.2;
  const door = { x0: x0 + k.door, x1: x0 + k.door + 1.0 };
  const window = k.kind === "shop" ? { x0: door.x1 + 0.4, x1: x0 + W - 0.3, y0: 0.9, y1: 1.95 } : undefined;
  return { kind: k.kind, x0, x1: x0 + W, z0: -8.5, z1: -4.6, door, window };
});

// Inside a hut's walls (sounds left in a hut are heard through its walls).
export const inHut = (x: number, z: number): boolean => HUTS.some((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);

// A door turning on its hinge, and how far open it is (0 shut, 1 open).
export interface Door {
  pivot: THREE.Object3D;
  x: number;
  z: number;
  open: number;
}

// ---- textures, drawn on canvases ---------------------------------------

// Painted weatherboards: each board lit on top and shadowed below, with a
// little grain. One texture covers 1.44 m of wall.
function weatherboard(paint: string): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (g) => {
      g.fillStyle = paint;
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 8; i++) {
        const y = i * 32;
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.fillRect(0, y, 256, 3);
        g.fillStyle = "rgba(0,0,0,0.22)";
        g.fillRect(0, y + 28, 256, 4);
        g.fillStyle = "rgba(0,0,0,0.05)";
        for (let k = 0; k < 6; k++) g.fillRect((i * 97 + k * 53) % 256, y + 6 + ((k * 7) % 18), 40 + ((i + k) % 3) * 20, 1);
      }
    },
    [1, 1],
  );
}

// Corrugated roofing: ridges running down the slope, 7.5 cm apart.
function corrugated(base: string): THREE.CanvasTexture {
  return canvasTexture(
    64,
    8,
    (g) => {
      const grad = g.createLinearGradient(0, 0, 64, 0);
      for (let i = 0; i <= 8; i++) grad.addColorStop(i / 8, i % 2 ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.22)");
      g.fillStyle = base;
      g.fillRect(0, 0, 64, 8);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 8);
    },
    [1, 1],
  );
}

// Square tiles with grout lines; `n` across one texture.
function tiles(face: string, grout: string, n: number): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (g) => {
      g.fillStyle = grout;
      g.fillRect(0, 0, 256, 256);
      const s = 256 / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          g.fillStyle = face;
          g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
          g.fillStyle = "rgba(255,255,255,0.25)";
          g.fillRect(i * s + 2, j * s + 2, s - 6, 2);
        }
    },
    [1, 1],
  );
}

// A panelled door: four sunk panels in its colour, lighter edges.
function doorFace(paint: string): THREE.CanvasTexture {
  return canvasTexture(
    96,
    192,
    (g) => {
      g.fillStyle = paint;
      g.fillRect(0, 0, 96, 192);
      for (const [x, y, w, h] of [
        [12, 12, 30, 70],
        [54, 12, 30, 70],
        [12, 98, 30, 82],
        [54, 98, 30, 82],
      ]) {
        g.fillStyle = "rgba(0,0,0,0.16)";
        g.fillRect(x, y, w, h);
        g.fillStyle = "rgba(255,255,255,0.22)";
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
        g.fillStyle = paint;
        g.fillRect(x + 4, y + 4, w - 8, h - 8);
      }
    },
    [1, 1],
  );
}

const NAVY = "#1d3557";

// The pictogram people on the signs: a head, shoulders, and trousers or a
// dress, as on any public toilet door.
function pictoPerson(g: CanvasRenderingContext2D, x: number, y: number, s: number, dress: boolean): void {
  g.beginPath();
  g.arc(x, y - s * 0.78, s * 0.13, 0, Math.PI * 2);
  g.fill();
  if (dress) {
    g.beginPath();
    g.moveTo(x - s * 0.14, y - s * 0.6);
    g.lineTo(x + s * 0.14, y - s * 0.6);
    g.lineTo(x + s * 0.32, y - s * 0.05);
    g.lineTo(x - s * 0.32, y - s * 0.05);
    g.closePath();
    g.fill();
    g.fillRect(x - s * 0.13, y - s * 0.08, s * 0.08, s * 0.38);
    g.fillRect(x + s * 0.05, y - s * 0.08, s * 0.08, s * 0.38);
  } else {
    g.fillRect(x - s * 0.2, y - s * 0.6, s * 0.4, s * 0.48);
    g.fillRect(x - s * 0.19, y - s * 0.14, s * 0.16, s * 0.44);
    g.fillRect(x + s * 0.03, y - s * 0.14, s * 0.16, s * 0.44);
  }
  // arms
  g.fillRect(x - s * 0.3, y - s * 0.58, s * 0.08, s * 0.38);
  g.fillRect(x + s * 0.22, y - s * 0.58, s * 0.08, s * 0.38);
}

// A shower head with water falling from it.
function pictoShower(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.lineWidth = s * 0.07;
  g.strokeStyle = NAVY;
  g.beginPath();
  g.moveTo(x - s * 0.35, y);
  g.lineTo(x - s * 0.35, y - s * 0.75);
  g.lineTo(x, y - s * 0.75);
  g.stroke();
  g.beginPath();
  g.arc(x + s * 0.1, y - s * 0.62, s * 0.18, Math.PI, 0);
  g.fill();
  for (let i = 0; i < 5; i++) {
    const dx = x - s * 0.02 + i * s * 0.06;
    g.fillRect(dx, y - s * 0.5 + (i % 2) * s * 0.08, s * 0.03, s * 0.12);
    g.fillRect(dx + s * 0.02, y - s * 0.28 + ((i + 1) % 2) * s * 0.08, s * 0.03, s * 0.12);
  }
}

// A starfish, for the shop.
function pictoStar(g: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string): void {
  g.fillStyle = colour;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function signFor(kind: HutKind): THREE.CanvasTexture {
  return canvasTexture(
    480,
    150,
    (g) => {
      const round = (x: number, y: number, w: number, h: number, r: number): void => {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
      };
      g.fillStyle = kind === "shop" ? "#c4423a" : "#fbf8f1";
      round(4, 4, 472, 142, 26);
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = kind === "shop" ? "#fbf8f1" : NAVY;
      round(14, 14, 452, 122, 18);
      g.stroke();
      g.fillStyle = NAVY;
      g.textBaseline = "middle";
      if (kind === "shop") {
        g.fillStyle = "#fbf8f1";
        g.textAlign = "center";
        g.font = "bold 46px Georgia, serif";
        g.fillText("SEASIDE", 240, 56);
        g.font = "bold 34px Georgia, serif";
        g.fillText("SOUVENIRS", 240, 100);
        pictoStar(g, 62, 76, 30, "#f2c14e");
        pictoStar(g, 418, 76, 30, "#f2c14e");
        return;
      }
      const woman = kind.startsWith("womens");
      if (kind.endsWith("toilet")) pictoPerson(g, 80, 110, 90, woman);
      else {
        pictoShower(g, 70, 112, 90);
        pictoPerson(g, 125, 116, 64, woman);
      }
      g.fillStyle = NAVY;
      g.textAlign = "left";
      g.font = "bold 44px sans-serif";
      g.fillText(woman ? "WOMEN" : "MEN", 175, 56);
      g.font = "30px sans-serif";
      g.fillText(kind.endsWith("toilet") ? "Toilets" : "Showers", 177, 102);
    },
    [1, 1],
  );
}

// A T-shirt's outline, white on clear, for any colour of shirt.
function tshirt(): THREE.CanvasTexture {
  return canvasTexture(
    128,
    128,
    (g) => {
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(44, 10);
      g.quadraticCurveTo(64, 26, 84, 10);
      g.lineTo(122, 30);
      g.lineTo(108, 54);
      g.lineTo(96, 48);
      g.lineTo(96, 122);
      g.lineTo(32, 122);
      g.lineTo(32, 48);
      g.lineTo(20, 54);
      g.lineTo(6, 30);
      g.closePath();
      g.fill();
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(32, 60, 64, 3);
    },
    [1, 1],
  );
}

// A beach ball: six coloured panels round it, white caps at the poles.
export function beachBallTexture(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    128,
    (g) => {
      const colours = ["#e63946", "#fbf8f1", "#f4a261", "#2a9d8f", "#fbf8f1", "#457be0"];
      colours.forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 128);
      });
      g.fillStyle = "#fbf8f1";
      g.fillRect(0, 0, 256, 12);
      g.fillRect(0, 116, 256, 12);
    },
    [1, 1],
  );
}

// ---- building -------------------------------------------------------------

// Texture coordinates from position, so a pattern keeps its size whatever
// the size of the box it's on: `size` metres per repeat.
function worldUV(mesh: THREE.Mesh, size: number): void {
  const g = mesh.geometry;
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  const o = mesh.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + o.x;
    const y = pos.getY(i) + o.y;
    const z = pos.getZ(i) + o.z;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const [u, v] = nx > 0.5 ? [z, y] : ny > 0.5 ? [x, z] : [x, y];
    uv.setXY(i, u / size, v / size);
  }
  uv.needsUpdate = true;
}

interface Kit {
  b: Builder;
  white: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  porcelain: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
}

// A box whose pattern keeps its size.
function tiled(b: Builder, mat: THREE.Material, size: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, opts: { occludes?: boolean; solid?: boolean; shadow?: boolean } = {}): THREE.Mesh {
  const m = b.box(mat, x0, x1, y0, y1, z0, z1, opts);
  worldUV(m, size);
  return m;
}

function add(k: Kit, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  k.b.root.add(m);
  return m;
}

// The shell: walls with a door gap, lined inside, a floor, a ceiling with
// a light, a corrugated roof with white trim, gable ends, a step, a sign.
function shell(k: Kit, h: Hut, paint: string, lining: THREE.Material, liningSize: number, floor: THREE.Material): Door {
  const { b, white } = k;
  const boards = std(0xffffff, { map: weatherboard(paint), roughness: 0.8 });
  const zm = (h.z0 + h.z1) / 2;
  const { x0: dx0, x1: dx1 } = h.door;

  // The front: either side of the door and over it, round a window if
  // there is one.
  const win = h.window;
  type Opts = { occludes?: boolean; solid?: boolean; shadow?: boolean };
  const front = (mat: THREE.Material, size: number, xa: number, xb: number, z0: number, z1: number, o: Opts): void => {
    const above = { ...o, solid: false };
    tiled(b, mat, size, xa, dx0, 0, H, z0, z1, o);
    tiled(b, mat, size, dx0, dx1, DOOR_H, H, z0, z1, above);
    if (!win) {
      tiled(b, mat, size, dx1, xb, 0, H, z0, z1, o);
      return;
    }
    tiled(b, mat, size, dx1, xb, 0, win.y0, z0, z1, o);
    tiled(b, mat, size, dx1, xb, win.y1, H, z0, z1, above);
    tiled(b, mat, size, dx1, win.x0, win.y0, win.y1, z0, z1, o);
    tiled(b, mat, size, win.x1, xb, win.y0, win.y1, z0, z1, o);
  };
  // walls: back, sides, front
  const wall = { occludes: true, solid: true };
  tiled(b, boards, 1.44, h.x0, h.x1, 0, H, h.z0, h.z0 + T, wall);
  tiled(b, boards, 1.44, h.x0, h.x0 + T, 0, H, h.z0, h.z1, wall);
  tiled(b, boards, 1.44, h.x1 - T, h.x1, 0, H, h.z0, h.z1, wall);
  front(boards, 1.44, h.x0, h.x1, h.z1 - T, h.z1, wall);
  // lined inside
  const L = 0.012;
  const lined = { shadow: false };
  tiled(b, lining, liningSize, h.x0 + T, h.x1 - T, 0, H, h.z0 + T, h.z0 + T + L, lined);
  tiled(b, lining, liningSize, h.x0 + T, h.x0 + T + L, 0, H, h.z0 + T, h.z1 - T, lined);
  tiled(b, lining, liningSize, h.x1 - T - L, h.x1 - T, 0, H, h.z0 + T, h.z1 - T, lined);
  front(lining, liningSize, h.x0 + T, h.x1 - T, h.z1 - T - L, h.z1 - T, lined);
  // floor and ceiling, with a light panel
  const f = b.floor(floor, h.x0 + T, h.x1 - T, h.z0 + T, h.z1 - T, 0.012);
  worldUV(f, 1.2);
  // lit by its own panel, so it isn't the dark underside of a roof
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T, D - 2 * T), std(0xf4f1ea, { emissive: 0xf4f1ea, emissiveIntensity: 0.5 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((h.x0 + h.x1) / 2, H - 0.01, zm);
  b.root.add(ceiling);
  b.box(std(0xffffff, { emissive: 0xfff4dc, emissiveIntensity: 0.9 }), (h.x0 + h.x1) / 2 - 0.5, (h.x0 + h.x1) / 2 + 0.5, H - 0.04, H - 0.02, zm - 0.15, zm + 0.15, { shadow: false });

  // white corner boards, skirting, and a frame round the door
  for (const x of [h.x0 - 0.02, h.x1 - 0.1]) {
    b.box(white, x, x + 0.12, 0, H, h.z1 - 0.02, h.z1 + 0.02);
    b.box(white, x, x + 0.12, 0, H, h.z0 - 0.02, h.z0 + 0.02);
  }
  b.box(white, h.x0 - 0.03, h.x1 + 0.03, 0, 0.14, h.z1 - 0.01, h.z1 + 0.03);
  b.box(white, dx0 - 0.08, dx0, 0, DOOR_H + 0.08, h.z1 - 0.01, h.z1 + 0.04);
  b.box(white, dx1, dx1 + 0.08, 0, DOOR_H + 0.08, h.z1 - 0.01, h.z1 + 0.04);
  b.box(white, dx0 - 0.08, dx1 + 0.08, DOOR_H, DOOR_H + 0.08, h.z1 - 0.01, h.z1 + 0.04);
  // a timber step
  const step = b.box(k.wood, h.x0 - 0.05, h.x1 + 0.05, 0, 0.06, h.z1, h.z1 + 0.55);
  b.floors.push(step);

  // the roof: two slopes of corrugated iron, white fascia and bargeboards
  const roofMat = std(0xffffff, { map: corrugated("#8a949c"), metalness: 0.35, roughness: 0.55, side: THREE.DoubleSide });
  const run = D / 2 + 0.3;
  const len = Math.hypot(run, RISE);
  const angle = Math.atan2(RISE, run);
  for (const side of [1, -1]) {
    const slope = add(k, new THREE.BoxGeometry(W + 0.4, 0.04, len), roofMat, (h.x0 + h.x1) / 2, H + RISE / 2 + 0.03, zm + (side * run) / 2);
    slope.rotation.x = side * angle;
    worldUV(slope, 0.6);
    k.b.occluders.push(slope);
    // the fascia along its eave
    b.box(white, h.x0 - 0.2, h.x1 + 0.2, H - 0.12, H + 0.02, zm + side * run - 0.03, zm + side * run + 0.03);
    // bargeboards up the gable ends
    for (const x of [h.x0 - 0.21, h.x1 + 0.19]) {
      const barge = add(k, new THREE.BoxGeometry(0.02, 0.16, len), white, x + 0.01, H + RISE / 2 - 0.02, zm + (side * run) / 2);
      barge.rotation.x = side * angle;
    }
  }
  // gable ends: triangles of weatherboard
  const tri = new THREE.Shape();
  tri.moveTo(-D / 2, 0);
  tri.lineTo(D / 2, 0);
  tri.lineTo(0, RISE * (D / 2 / run));
  tri.closePath();
  for (const x of [h.x0, h.x1]) {
    const geo = new THREE.ShapeGeometry(tri);
    const uv = geo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.44, (uv.getY(i) + H) / 1.44);
    const gable = new THREE.Mesh(geo, boards);
    (gable.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    gable.rotation.y = Math.PI / 2;
    gable.position.set(x, H, zm);
    gable.castShadow = gable.receiveShadow = true;
    b.root.add(gable);
  }

  // the sign over the door
  const sign = add(k, new THREE.PlaneGeometry(1.25, 0.39), std(0xffffff, { map: signFor(h.kind), roughness: 0.6 }), (dx0 + dx1) / 2, DOOR_H + 0.3, h.z1 + 0.025);
  sign.castShadow = false;

  // the door, hinged at its left: its leaf turns inwards (towards -z)
  const pivot = new THREE.Group();
  pivot.position.set(dx0, 0, h.z1 - T / 2);
  const leafMat = std(0xffffff, { map: doorFace(h.kind === "shop" ? "#c4423a" : "#f7f4ee"), roughness: 0.6 });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(dx1 - dx0 - 0.02, DOOR_H - 0.02, 0.05), leafMat);
  leaf.position.set((dx1 - dx0) / 2, DOOR_H / 2, 0);
  leaf.castShadow = leaf.receiveShadow = true;
  pivot.add(leaf);
  for (const side of [1, -1]) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), k.steel);
    handle.position.set(dx1 - dx0 - 0.12, 1.0, side * 0.05);
    pivot.add(handle);
  }
  b.root.add(pivot);
  return { pivot, x: (dx0 + dx1) / 2, z: h.z1, open: 0 };
}

// ---- what's inside ----------------------------------------------------------

function toilet(k: Kit, x: number, z: number): void {
  const bowl = add(k, new THREE.CylinderGeometry(0.19, 0.14, 0.4, 16), k.porcelain, x, 0.2, z + 0.12);
  bowl.scale.z = 1.25;
  const seat = add(k, new THREE.TorusGeometry(0.16, 0.035, 8, 20), std(0xf2efe8, { roughness: 0.4 }), x, 0.42, z + 0.13);
  seat.rotation.x = Math.PI / 2;
  seat.scale.y = 1.2;
  k.b.box(k.porcelain, x - 0.2, x + 0.2, 0.42, 0.82, z - 0.2, z - 0.04);
  k.b.box(k.steel, x - 0.05, x + 0.05, 0.82, 0.84, z - 0.15, z - 0.09);
}

// Cubicles along the back wall: partitions raised off the floor, each with
// a door left ajar, and a toilet at the back.
function cubicles(k: Kit, h: Hut, n: number, partition: THREE.Material): void {
  const x0 = h.x0 + T;
  const x1 = h.x1 - T;
  const back = h.z0 + T;
  const front = back + 1.45;
  const w = (x1 - x0) / n;
  for (let i = 1; i < n; i++) k.b.box(partition, x0 + i * w - 0.02, x0 + i * w + 0.02, 0.15, 1.95, back, front);
  for (let i = 0; i < n; i++) {
    const cx0 = x0 + i * w;
    k.b.box(partition, cx0, cx0 + 0.12, 0.15, 1.95, front - 0.02, front + 0.02);
    k.b.box(partition, cx0 + w - 0.12, cx0 + w, 0.15, 1.95, front - 0.02, front + 0.02);
    // the cubicle door, ajar
    const door = add(k, new THREE.BoxGeometry(w - 0.26, 1.8, 0.03), partition, 0, 1.05, 0);
    door.geometry.translate((w - 0.26) / 2, 0, 0);
    door.position.set(cx0 + 0.13, 1.05, front);
    door.rotation.y = -0.6 - (i % 2) * 0.3;
    toilet(k, cx0 + w / 2, back + 0.3);
  }
  k.b.solids.push({ x0, x1, z0: back, z1: front + 0.05 });
}

function basin(k: Kit, z: number, wallX: number, facing: 1 | -1): void {
  // a vanity against a side wall, a basin, a tap, a mirror over it
  const depth = 0.5;
  const vx0 = facing === 1 ? wallX : wallX - depth;
  const vx1 = facing === 1 ? wallX + depth : wallX;
  k.b.box(std(0x40474f, { roughness: 0.5 }), vx0, vx1, 0, 0.82, z - 0.4, z + 0.4, { solid: true });
  k.b.box(std(0xd9d5cc, { roughness: 0.3 }), vx0, vx1, 0.82, 0.86, z - 0.42, z + 0.42);
  const sink = add(k, new THREE.CylinderGeometry(0.17, 0.12, 0.08, 16), k.porcelain, wallX + facing * 0.26, 0.88, z);
  sink.scale.x = 0.8;
  k.b.box(k.steel, wallX + facing * 0.06, wallX + facing * 0.09, 0.86, 1.02, z - 0.02, z + 0.02);
  k.b.box(k.steel, wallX + facing * 0.06, wallX + facing * 0.17, 0.99, 1.02, z - 0.015, z + 0.015);
  // a mirror: pale and glossy rather than a true reflection, which would
  // show the sky
  k.b.box(k.steel, wallX + facing * 0.005, wallX + facing * 0.02, 1.08, 1.92, z - 0.38, z + 0.38, { shadow: false });
  const mirror = add(k, new THREE.PlaneGeometry(0.7, 0.8), std(0xdfe7ea, { metalness: 0.1, roughness: 0.12, emissive: 0x9fb0b8, emissiveIntensity: 0.35 }), wallX + facing * 0.025, 1.5, z);
  mirror.rotation.y = (facing * Math.PI) / 2;
  mirror.castShadow = false;
}

function urinal(k: Kit, x: number, z: number): void {
  k.b.box(k.porcelain, x, x + 0.3, 0.45, 1.1, z - 0.2, z + 0.2);
  k.b.box(std(0xd8e0e4, { roughness: 0.2 }), x + 0.02, x + 0.28, 0.6, 1.0, z - 0.16, z + 0.16, { shadow: false });
  k.b.box(k.steel, x, x + 0.05, 1.1, 1.3, z - 0.02, z + 0.02);
}

// Two showers along the back, each with a curtain, a riser, a head, a tap
// and a drain; a bench and towels on hooks for drying.
function showers(k: Kit, h: Hut, curtains: [number, number]): void {
  const x0 = h.x0 + T;
  const x1 = h.x1 - T;
  const back = h.z0 + T;
  const front = back + 1.25;
  const w = (x1 - x0) / 2;
  const partition = std(0xe7ecef, { roughness: 0.35 });
  k.b.box(partition, x0 + w - 0.02, x0 + w + 0.02, 0, 2.0, back, front);
  for (let i = 0; i < 2; i++) {
    const cx = x0 + w * i + w / 2;
    // riser and head
    k.b.box(k.steel, cx - 0.015, cx + 0.015, 0.9, 1.95, back + 0.02, back + 0.05);
    const head = add(k, new THREE.CylinderGeometry(0.1, 0.06, 0.04, 16), k.steel, cx, 1.95, back + 0.14);
    head.rotation.x = 0.6;
    k.b.box(k.steel, cx - 0.015, cx + 0.015, 1.94, 1.97, back + 0.02, back + 0.12);
    add(k, new THREE.CylinderGeometry(0.035, 0.035, 0.04, 12), k.steel, cx + 0.25, 1.05, back + 0.04).rotation.x = Math.PI / 2;
    // the drain
    const drain = add(k, new THREE.CylinderGeometry(0.06, 0.06, 0.005, 16), k.steel, cx, 0.016, back + 0.6);
    drain.receiveShadow = true;
    // a rail and a curtain, half drawn
    k.b.box(k.steel, x0 + w * i + 0.05, x0 + w * (i + 1) - 0.05, 2.0, 2.02, front - 0.01, front + 0.01);
    const curtain = add(k, new THREE.PlaneGeometry(w * 0.55, 1.75), std(curtains[i], { side: THREE.DoubleSide, roughness: 0.9 }), x0 + w * i + w * 0.3, 1.1, front);
    curtain.castShadow = false;
  }
  k.b.solids.push({ x0, x1, z0: back, z1: front });
  // a slatted bench along the left wall
  for (let s = 0; s < 3; s++) k.b.box(k.wood, h.x0 + T + 0.02, h.x0 + T + 0.4, 0.44, 0.47, h.z0 + 2.0 + s * 0.4, h.z0 + 2.34 + s * 0.4);
  for (const z of [h.z0 + 2.05, h.z0 + 3.0]) k.b.box(k.steel, h.x0 + T + 0.05, h.x0 + T + 0.35, 0, 0.44, z, z + 0.04);
  k.b.solids.push({ x0: h.x0 + T, x1: h.x0 + T + 0.42, z0: h.z0 + 2.0, z1: h.z0 + 3.2 });
  // towels on hooks on the right wall
  const towelColours = [0xf4f1ea, 0x6aa9d8, 0xf0a3a8];
  towelColours.forEach((c, i) => {
    const z = h.z0 + 1.9 + i * 0.5;
    k.b.box(k.steel, h.x1 - T - 0.08, h.x1 - T, 1.6, 1.63, z - 0.01, z + 0.01);
    k.b.box(std(c, { roughness: 1 }), h.x1 - T - 0.07, h.x1 - T - 0.03, 0.95, 1.62, z - 0.18, z + 0.18);
  });
  // a mat on the floor
  k.b.box(std(0x7aa6b8, { roughness: 1 }), (h.x0 + h.x1) / 2 - 0.4, (h.x0 + h.x1) / 2 + 0.4, 0.012, 0.022, back + 1.45, back + 1.95, { shadow: false });
}

// The souvenir shop: shelves of buckets and spades, shells, snow globes and
// sun hats; T-shirts on the wall; a postcard stand; a counter for the till;
// a display window; beach balls and buckets out front.
function shop(k: Kit, h: Hut): void {
  const { b } = k;
  const ball = std(0xffffff, { map: beachBallTexture(), roughness: 0.45 });
  const bright = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457be0, 0xf2c14e, 0x9b5de5];

  // glass in the display window, in a white frame
  const win = h.window!;
  b.box(std(0xdfeff5, { transparent: true, opacity: 0.25, roughness: 0.05, flatShading: false }), win.x0, win.x1, win.y0, win.y1, h.z1 - T / 2 - 0.01, h.z1 - T / 2 + 0.01, { shadow: false });
  for (const x of [win.x0 - 0.06, win.x1]) b.box(k.white, x, x + 0.06, win.y0 - 0.06, win.y1 + 0.06, h.z1 - 0.01, h.z1 + 0.04);
  for (const y of [win.y0 - 0.06, win.y1]) b.box(k.white, win.x0 - 0.06, win.x1 + 0.06, y, y + 0.06, h.z1 - 0.01, h.z1 + 0.05);

  // shelves along the back wall
  const shelfX0 = h.x0 + 0.3;
  const shelfX1 = h.x1 - 1.2;
  const back = h.z0 + T;
  for (const y of [0.05, 0.55, 1.05, 1.55]) b.box(k.wood, shelfX0, shelfX1, y, y + 0.04, back, back + 0.38);
  for (const x of [shelfX0, shelfX1 - 0.04]) b.box(k.wood, x, x + 0.04, 0, 1.6, back, back + 0.38);
  b.solids.push({ x0: shelfX0, x1: shelfX1, z0: back, z1: back + 0.4 });
  const n = Math.floor((shelfX1 - shelfX0 - 0.1) / 0.24);
  for (let i = 0; i < n; i++) {
    const x = shelfX0 + 0.16 + i * 0.24;
    const c = bright[i % bright.length];
    // bottom: beach balls; then buckets with a spade; shells; snow globes
    add(k, new THREE.SphereGeometry(0.11, 16, 12), ball, x, 0.2, back + 0.2).rotation.set(0.4 * i, i, 0.3);
    add(k, new THREE.CylinderGeometry(0.08, 0.06, 0.15, 12), std(c, { roughness: 0.5 }), x, 0.67, back + 0.18);
    b.box(std(bright[(i + 2) % bright.length]), x + 0.02, x + 0.04, 0.68, 0.9, back + 0.16, back + 0.2);
    const shell = add(k, new THREE.ConeGeometry(0.05, 0.1, 9), std([0xf3e1cf, 0xe8c3a8, 0xfbf3e6][i % 3], { roughness: 0.6 }), x, 1.13, back + 0.2);
    shell.rotation.z = Math.PI / 2;
    add(k, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), k.wood, x, 1.61, back + 0.2);
    add(k, new THREE.SphereGeometry(0.06, 14, 10), std(0xe6f3fa, { transparent: true, opacity: 0.55, roughness: 0.05, flatShading: false }), x, 1.68, back + 0.2);
  }
  // sun hats stacked on the top
  for (let i = 0; i < 3; i++) {
    const x = shelfX0 + 0.3 + i * 0.4;
    const straw = std(0xe3c88f, { roughness: 0.9 });
    add(k, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), straw, x, 1.63, back + 0.2);
    add(k, new THREE.CylinderGeometry(0.09, 0.1, 0.1, 16), straw, x, 1.69, back + 0.2);
    b.box(std(bright[i]), x - 0.1, x + 0.1, 1.66, 1.68, back + 0.1, back + 0.3, { shadow: false });
  }
  // T-shirts on the left wall
  const shirtShape = tshirt();
  for (let i = 0; i < 4; i++) {
    const z = h.z0 + 0.9 + i * 0.6;
    const shirt = add(k, new THREE.PlaneGeometry(0.5, 0.5), std(bright[(i + 3) % bright.length], { map: shirtShape, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }), h.x0 + T + 0.02, 1.55, z);
    shirt.rotation.y = Math.PI / 2;
    shirt.castShadow = false;
    b.box(k.steel, h.x0 + T, h.x0 + T + 0.06, 1.82, 1.84, z - 0.01, z + 0.01);
  }
  // a counter for the till, on the right, and stock behind it
  const cx0 = h.x1 - 1.05;
  b.box(std(0x2f6f8f, { roughness: 0.6 }), cx0, h.x1 - T, 0, 0.95, h.z0 + 1.4, h.z0 + 1.9, { solid: true, occludes: true });
  b.box(k.wood, cx0 - 0.03, h.x1 - T, 0.95, 0.99, h.z0 + 1.37, h.z0 + 1.93);
  // a postcard stand: a pole and racks of cards
  const px = h.x0 + 1.6;
  const pz = h.z0 + 2.4;
  b.cylinder(k.steel, px, pz, 0.02, 0, 1.6, 8);
  b.cylinder(k.steel, px, pz, 0.2, 0, 0.03, 16);
  for (let r = 0; r < 4; r++)
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      const card = add(k, new THREE.PlaneGeometry(0.15, 0.1), std(bright[(r + side) % bright.length], { side: THREE.DoubleSide }), px + Math.sin(a) * 0.09, 0.6 + r * 0.25, pz + Math.cos(a) * 0.09);
      card.rotation.y = a;
      card.castShadow = false;
    }
  b.solids.push({ x0: px - 0.22, x1: px + 0.22, z0: pz - 0.22, z1: pz + 0.22 });
  // out front: a crate of beach balls and a stand of buckets
  b.box(k.wood, h.door.x1 + 0.45, h.door.x1 + 1.15, 0, 0.42, h.z1 + 0.6, h.z1 + 1.1, { solid: true });
  for (let i = 0; i < 5; i++) add(k, new THREE.SphereGeometry(0.14, 16, 12), ball, h.door.x1 + 0.6 + (i % 3) * 0.2, 0.52 + Math.floor(i / 3) * 0.17, h.z1 + 0.75 + (i % 2) * 0.2).rotation.set(i, i * 2, 0);
  for (let i = 0; i < 4; i++) add(k, new THREE.CylinderGeometry(0.11, 0.08, 0.2, 12), std(bright[i], { roughness: 0.5 }), h.x0 - 0.35, 0.1 + i * 0.2, h.z1 + 0.5).scale.setScalar(1 - i * 0.08);
}

// The till's place on the shop counter, for the furniture loaded later.
export const TILL = (() => {
  const h = HUTS[4];
  return { x: h.x1 - 0.55, z: h.z0 + 1.65, y: 0.99 };
})();
// where the shopkeeper stands, behind the counter
export const SHOPKEEPER = (() => {
  const h = HUTS[4];
  return { x: h.x1 - 0.55, z: h.z0 + 1.0 };
})();

export function buildHuts(b: Builder, wood: THREE.MeshStandardMaterial): Door[] {
  const k: Kit = {
    b,
    white: std(0xf8f6f0, { roughness: 0.6 }),
    steel: std(0xc3c9ce, { metalness: 0.75, roughness: 0.3 }),
    porcelain: std(0xfbfbf9, { roughness: 0.15, flatShading: false }),
    wood,
  };
  // inside, lit a little by the ceiling panel, not only through the door
  const lit = (map: THREE.Texture, roughness: number): THREE.MeshStandardMaterial => std(0xffffff, { map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.22, roughness });
  const wallTiles = lit(tiles("#f3f5f4", "#cfd5d4", 8), 0.25);
  const floorTiles = lit(tiles("#8fa3ad", "#6d7f88", 12), 0.5);
  const shopWalls = lit(weatherboard("#fbf7ee"), 0.8);
  const shopFloor = lit(tiles("#c9a77a", "#a4845c", 4), 0.7);
  return HUTS.map((h, i) => {
    const paint = KINDS[i].paint;
    const door = h.kind === "shop" ? shell(k, h, paint, shopWalls, 1.44, shopFloor) : shell(k, h, paint, wallTiles, 1.2, floorTiles);
    if (h.kind === "mens-toilet") {
      cubicles(k, h, 2, std(0x3d6f99, { roughness: 0.4 }));
      urinal(k, h.x0 + T, h.z0 + 2.2);
      urinal(k, h.x0 + T, h.z0 + 2.85);
      basin(k, h.z0 + 2.6, h.x1 - T, -1);
    } else if (h.kind === "womens-toilet") {
      cubicles(k, h, 3, std(0xb5566a, { roughness: 0.4 }));
      basin(k, h.z0 + 2.2, h.x1 - T, -1);
      basin(k, h.z0 + 3.1, h.x1 - T, -1);
      // a hand dryer and a bin on the left wall
      k.b.box(std(0xeeeeee, { roughness: 0.3 }), h.x0 + T, h.x0 + T + 0.2, 1.1, 1.4, h.z0 + 2.4, h.z0 + 2.7);
      add(k, new THREE.CylinderGeometry(0.15, 0.13, 0.45, 14), k.steel, h.x0 + T + 0.2, 0.225, h.z0 + 3.1);
    } else if (h.kind === "mens-shower") showers(k, h, [0x3d6f99, 0x6cc0ad]);
    else if (h.kind === "womens-shower") showers(k, h, [0xee8f8f, 0xefcf63]);
    else shop(k, h);
    return door;
  });
}

// Each door opens as anyone comes within 2 m of it, and closes behind them.
export function swingDoors(doors: Door[], people: { x: number; z: number }[], dt: number): void {
  for (const d of doors) {
    const near = people.some((p) => Math.hypot(p.x - d.x, p.z - d.z) < 2);
    d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 5);
    d.pivot.rotation.y = d.open * 1.5;
  }
}
