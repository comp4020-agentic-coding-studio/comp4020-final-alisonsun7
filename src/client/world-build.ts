// Building the walkable world: the Chifley bridge, the library front, and
// Marie Reay's ground floor, as simple flat-shaded shapes. Metres throughout:
// x east, y up, z south. The layout follows Wen's sketch (see the WORLD
// scene in shared/catalog.ts); the things in it follow Wen's photos — the
// timber wall with three steel lifts, the orange stair, the cushioned tiers,
// the dark cabinet of microwaves. Sizes are estimates, not a survey.
import * as THREE from "three";
import type { PlaceKit } from "./places.js";

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Built {
  root: THREE.Group;
  // what hides a spot behind it, and what you can click to walk to
  occluders: THREE.Object3D[];
  floors: THREE.Object3D[];
  // where you can stand, and what you can't walk through
  walkable: Rect[];
  solids: Rect[];
  // round things you can't walk through, like tree trunks
  circles?: { x: number; z: number; r: number }[];
  // things the time of day changes
  paving: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  windows: THREE.MeshStandardMaterial;
  ceilingStrips: THREE.MeshStandardMaterial;
  lampHead: THREE.MeshStandardMaterial;
  lamp: THREE.PointLight;
  ceilingLights: THREE.PointLight[];
}

// The building's footprint: inside it, you're indoors.
export const MARIE: Rect = { x0: 0, x1: 36, z0: 0, z1: 30 };

export function isInside(x: number, z: number): boolean {
  return x > 0 && x < 36 && z > 0 && z < 30;
}

// ---- textures, drawn on canvases ---------------------------------------

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const rand = mulberry(7);
function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Vertical timber boards, like the lift wall and stair walls.
function timber(repeat: [number, number]): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (g) => {
      const boards = 8;
      for (let i = 0; i < boards; i++) {
        const tone = 0.9 + rand() * 0.16;
        g.fillStyle = `rgb(${Math.round(205 * tone)},${Math.round(150 * tone)},${Math.round(88 * tone)})`;
        g.fillRect((i * 256) / boards, 0, 256 / boards, 256);
        g.strokeStyle = "rgba(120,70,30,0.12)";
        for (let k = 0; k < 6; k++) {
          const x = (i * 256) / boards + rand() * (256 / boards);
          g.beginPath();
          g.moveTo(x, 0);
          g.bezierCurveTo(x + 3, 80, x - 3, 170, x + 2, 256);
          g.stroke();
        }
        g.fillStyle = "rgba(90,50,20,0.35)";
        g.fillRect((i * 256) / boards, 0, 1.5, 256);
      }
    },
    repeat,
  );
}

// Polished concrete with a terrazzo speckle.
function terrazzo(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (g) => {
      g.fillStyle = "#cfcbc4";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1400; i++) {
        const v = 150 + Math.floor(rand() * 90);
        g.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.35 + rand() * 0.4})`;
        g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2);
      }
    },
    [12, 12],
  );
}

// Square pavers with grout lines.
function pavers(): THREE.CanvasTexture {
  return canvasTexture(
    128,
    128,
    (g) => {
      g.fillStyle = "#4a4440";
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const v = 138 + Math.floor(rand() * 26);
          g.fillStyle = `rgb(${v},${v - 10},${v - 18})`;
          g.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29);
        }
    },
    [24, 10],
  );
}

// The striped mat inside the door.
function grating(): THREE.CanvasTexture {
  return canvasTexture(
    64,
    64,
    (g) => {
      g.fillStyle = "#3b3e43";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#8d9196";
      for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3);
    },
    [4, 10],
  );
}

// ---- building blocks ----------------------------------------------------

type Mat = THREE.Material;

export class Builder {
  root = new THREE.Group();
  occluders: THREE.Object3D[] = [];
  floors: THREE.Object3D[] = [];
  solids: Rect[] = [];

  // A box by its extents, which is how the layout is written.
  box(mat: Mat, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, opts: { occludes?: boolean; solid?: boolean; shadow?: boolean } = {}): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = opts.shadow ?? true;
    m.receiveShadow = true;
    this.root.add(m);
    if (opts.occludes) this.occluders.push(m);
    if (opts.solid) this.solids.push({ x0, x1, z0, z1 });
    return m;
  }

  floor(mat: Mat, x0: number, x1: number, z0: number, z1: number, y = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    this.root.add(m);
    this.floors.push(m);
    return m;
  }

  cylinder(mat: Mat, x: number, z: number, r: number, y0: number, y1: number, segments = 10): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, segments), mat);
    m.position.set(x, (y0 + y1) / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }
}

export const std = (color: number, more: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...more });

export function buildWorld(): Built {
  const b = new Builder();

  const wood = std(0xffffff, { map: timber([3, 1]) });
  const woodTall = std(0xffffff, { map: timber([6, 1.5]) });
  const darkWood = std(0x8a5a32);
  // no environment map to reflect, so steel is a light grey with a sheen
  const steel = std(0xc4c8cc, { metalness: 0.25, roughness: 0.35 });
  const charcoal = std(0x2c2f34);
  const slate = std(0x4a5561, { roughness: 0.7 });
  const concrete = std(0xffffff, { map: terrazzo(), roughness: 0.55 });
  const paving = std(0xffffff, { map: pavers(), roughness: 0.8 });
  const facadeDark = std(0x26282c, { roughness: 0.6 });
  const cream = std(0xd9ccb0);
  const libBase = std(0x6f655b);
  const orange = std(0xe8a114, { roughness: 0.6 });
  const orangeEdge = std(0xb87708);
  const white = std(0xf2f0eb);
  const earth = std(0x3f4a34);
  const shrub = std(0x4f6b3a);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb6c4, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.2, depthWrite: false });
  const windows = std(0x1c2229, { emissive: 0xffd9a0, emissiveIntensity: 0 });
  const ceilingStrips = std(0xffffff, { emissive: 0xfff1dc, emissiveIntensity: 0.4 });
  const lampHead = std(0x222222, { emissive: 0xffcf8a, emissiveIntensity: 0 });

  // ---- outside ----------------------------------------------------------

  // The lower ground the bridge crosses, with shrubs.
  b.floor(earth, -60, 60, -40, 80, -4);
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + rand() * 0.9, 0), shrub);
    s.position.set(-20 + rand() * 17, -3.6, i % 2 ? 29 + rand() * 2 : 38 + rand() * 3);
    s.castShadow = true;
    b.root.add(s);
  }

  // Paving in front of Marie Reay, and the strip along its west glass.
  const plaza = b.box(paving, -2, 40, -4, 0, 30, 46, { shadow: false });
  b.floors.push(plaza);
  const terrace = b.box(paving, -6, 0, -4, 0, -2, 30, { shadow: false });
  b.floors.push(terrace);

  // The bridge to the library: deck, railings of thin bars, top rails.
  const deck = b.box(paving, -22, -2, -0.35, 0, 31.6, 36.4, { shadow: true });
  b.floors.push(deck);
  b.box(charcoal, -22, -2, -1.2, -0.35, 31.8, 36.2);
  const bar = new THREE.BoxGeometry(0.04, 1.05, 0.04);
  const bars = new THREE.InstancedMesh(bar, charcoal, 2 * 134);
  const tmp = new THREE.Object3D();
  let n = 0;
  for (const z of [31.7, 36.3])
    for (let i = 0; i < 134; i++) {
      tmp.position.set(-22 + i * 0.15, 0.52, z);
      tmp.updateMatrix();
      bars.setMatrixAt(n++, tmp.matrix);
    }
  bars.castShadow = true;
  b.root.add(bars);
  b.box(charcoal, -22, -2, 1.04, 1.1, 31.66, 31.74);
  b.box(charcoal, -22, -2, 1.04, 1.1, 36.26, 36.34);
  b.solids.push({ x0: -22, x1: -2, z0: 31.5, z1: 31.85 }, { x0: -22, x1: -2, z0: 36.15, z1: 36.5 });

  // J.B. Chifley Library: a cream block with tall dark window slots, a darker
  // base, and the zig-zag canopy over its glass doors at the end of the bridge.
  b.box(cream, -48, -22, -4, 15, 8, 62, { occludes: true });
  b.box(libBase, -22.3, -22, -4, 3.4, 8, 62, { occludes: true });
  for (let z = 10; z < 61; z += 4.2) {
    if (z > 31 && z < 37) continue;
    b.box(windows, -22.4, -21.9, 4.6, 12.6, z - 0.7, z + 0.7);
    b.box(windows, -22.4, -22.25, 0.6, 2.6, z - 0.9, z + 0.9);
  }
  b.box(windows, -22.4, -22.2, 0.2, 2.9, 32.2, 35.8);
  for (let i = 0; i < 4; i++) {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.7, 4), white);
    peak.rotation.x = Math.PI;
    peak.rotation.y = Math.PI / 4;
    peak.position.set(-21.4, 3.1, 32.3 + i * 1.15);
    peak.castShadow = true;
    b.root.add(peak);
  }
  b.box(white, -22, -20.6, 3.3, 3.45, 31.6, 36.4);
  b.solids.push({ x0: -30, x1: -21.8, z0: 0, z1: 62 });

  // The lamp post at the bridge's near end.
  b.cylinder(charcoal, -1, 31.4, 0.09, 0, 8);
  b.box(lampHead, -1.25, -0.75, 7.8, 8.05, 31.0, 31.8);
  const lamp = new THREE.PointLight(0xffcf8a, 0, 26, 1.6);
  lamp.position.set(-1, 7.6, 31.4);
  b.root.add(lamp);
  b.solids.push({ x0: -1.2, x1: -0.8, z0: 31.2, z1: 31.6 });

  // Orange and white bollards by Marie Reay's door.
  for (const x of [8.2, 9.6]) {
    b.cylinder(std(0xe0571b), x, 31.2, 0.11, 0, 1.1);
    b.cylinder(white, x, 31.2, 0.115, 0.55, 0.7);
    b.solids.push({ x0: x - 0.15, x1: x + 0.15, z0: 31.05, z1: 31.35 });
  }

  // ---- Marie Reay: the shell -------------------------------------------

  const H = 6.2;
  // roof, and a dark facade above the glass
  b.box(facadeDark, -0.2, 36.2, H, H + 0.6, -0.2, 30.2, { occludes: true });
  // the back-of-house block south of the tea point (the sketch leaves it
  // closed): dark outside, timber on the lobby side
  b.box(facadeDark, 9, 36.2, 0, H, 22, 30.2, { occludes: true, solid: true });
  b.box(wood, 9, 36, 0, H, 21.95, 22.02);
  // corridor's inner wall (timber), from the tea point down to the door
  b.box(wood, 8.85, 9, 0, H, 22, 30, { occludes: true });
  // south wall with the door gap at x 3..6, and an awning over the door
  b.box(facadeDark, -0.2, 3, 0, H, 29.85, 30.2, { occludes: true, solid: true });
  b.box(facadeDark, 6, 9, 0, H, 29.85, 30.2, { occludes: true, solid: true });
  b.box(facadeDark, 3, 6, 2.6, H, 29.85, 30.2, { occludes: true });
  b.box(facadeDark, -1, 10.5, 4.1, 4.35, 30.2, 33.2);
  b.box(windows, 6.3, 8.6, 0.3, 2.5, 30.2, 30.26);
  // west wall: glass, with dark mullions every 1.5 m
  b.box(glass, -0.06, 0.06, 0, H, 0, 29.85, { shadow: false });
  for (let z = 0; z <= 29.9; z += 1.5) b.box(charcoal, -0.08, 0.08, 0, H, z - 0.05, z + 0.05);
  b.box(charcoal, -0.08, 0.08, 2.9, 3.0, 0, 29.85);
  b.solids.push({ x0: -0.3, x1: 0.1, z0: 0, z1: 30 });
  // north wall: glass and mullions, where the morning sun comes in
  b.box(glass, 0, 36, 0, H, -0.06, 0.06, { shadow: false });
  for (let x = 0; x <= 36; x += 1.8) b.box(charcoal, x - 0.05, x + 0.05, 0, H, -0.08, 0.08);
  b.box(charcoal, 0, 36, 3.1, 3.2, -0.08, 0.08);
  b.solids.push({ x0: 0, x1: 36, z0: -0.3, z1: 0.1 });
  // east wall: timber inside, dark outside
  b.box(woodTall, 35.85, 36, 0, H, 0, 22, { occludes: true, solid: true });
  b.box(facadeDark, 36, 36.2, 0, H, -0.2, 30.2, { occludes: true });

  // floors: concrete inside, the striped mat inside the door
  b.floor(concrete, 0, 36, 0, 22, 0.01);
  b.floor(concrete, 0, 9, 22, 30, 0.01);
  b.floor(std(0xffffff, { map: grating(), roughness: 0.9 }), 0.4, 8.6, 25.6, 29.8, 0.02);

  // ceiling: dark soffit, exposed timber beams, cable trays, long lights
  const soffit = new THREE.Mesh(new THREE.PlaneGeometry(36, 30), std(0x34363a));
  soffit.rotation.x = Math.PI / 2;
  soffit.position.set(18, H - 0.01, 15);
  b.root.add(soffit);
  for (let x = 1; x < 36; x += 2.2) b.box(darkWood, x - 0.14, x + 0.14, H - 0.55, H - 0.01, 0, 30, { shadow: false });
  for (let z = 3; z < 30; z += 6) b.box(std(0x7d8186, { metalness: 0.5 }), 0, 36, H - 0.85, H - 0.78, z - 0.3, z + 0.3, { shadow: false });
  const ceilingLights: THREE.PointLight[] = [];
  for (const [x0, x1, z] of [
    [1, 34, 4.5],
    [1, 34, 12],
    [1, 34, 19],
    [1, 8, 26],
  ]) {
    b.box(ceilingStrips, x0, x1, H - 1.0, H - 0.96, z - 0.05, z + 0.05, { shadow: false });
  }
  for (const [x, z] of [
    [6, 12],
    [16, 12],
    [27, 12],
    [16, 19],
    [4.5, 26],
  ]) {
    const l = new THREE.PointLight(0xfff1dc, 0, 16, 1.4);
    l.position.set(x, H - 1.3, z);
    b.root.add(l);
    ceilingLights.push(l);
  }

  // ---- Marie Reay: what's inside -------------------------------------

  // Two long high tables on the left, with round stools both sides.
  for (const z of [10.1, 14.3]) {
    b.box(wood, 3, 8.6, 0.96, 1.02, z - 0.45, z + 0.45, { solid: true });
    for (const x of [3.4, 8.2]) b.box(darkWood, x - 0.05, x + 0.05, 0, 0.96, z - 0.3, z + 0.3);
    for (let x = 3.6; x < 8.4; x += 1.2)
      for (const side of [-0.85, 0.85]) {
        b.cylinder(darkWood, x, z + side, 0.03, 0, 0.7, 6);
        b.cylinder(wood, x, z + side, 0.19, 0.7, 0.75, 12);
      }
  }

  // The lift wall: timber, three steel doors facing the tables, floor
  // indicators, a screen and a directory.
  b.box(wood, 15, 16.2, 0, H, 5.5, 15.6, { occludes: true, solid: true });
  for (const z of [7.5, 10.5, 13.5]) {
    b.box(steel, 14.9, 15.0, 0, 2.35, z - 0.68, z + 0.68);
    b.box(charcoal, 14.89, 14.91, 0, 2.35, z - 0.008, z + 0.008, { shadow: false });
    b.box(std(0x101418, { emissive: 0x3b6dd8, emissiveIntensity: 0.9 }), 14.92, 14.98, 2.5, 2.85, z + 0.78, z + 0.9, { shadow: false });
    b.box(steel, 14.92, 14.98, 1.0, 1.25, z + 0.8, z + 0.88, { shadow: false });
  }
  b.box(std(0x1e2a3a, { emissive: 0x4a78b0, emissiveIntensity: 0.6 }), 14.92, 14.98, 1.3, 2.0, 15.0, 15.5, { shadow: false });

  // Recycling bins at the end of the lift wall.
  const lids = [0xe3c13b, 0x4c8a4a, 0xc8473b, 0x2f5e9e];
  lids.forEach((lid, i) => {
    const z = 16.1 + i * 0.48;
    b.box(charcoal, 14.0, 14.8, 0, 0.95, z, z + 0.42);
    b.box(std(lid), 13.98, 14.82, 0.95, 1.02, z, z + 0.42);
  });
  b.solids.push({ x0: 13.9, x1: 14.9, z0: 16.05, z1: 18.1 });

  // The tea point, facing the bins: a dark cabinet with four microwaves in
  // two rows, and a counter with the sink and tap to their left as you face
  // it (IMG_8101). Facing south, your left is east.
  b.box(slate, 11.8, 18.6, 0, 0.9, 21.3, 21.95, { solid: true });
  b.box(slate, 11.8, 15.4, 0.9, 2.9, 21.3, 21.95);
  for (const y of [1.0, 1.65])
    for (const x of [11.95, 13.7]) {
      b.box(std(0x15171a), x, x + 1.55, y, y + 0.5, 21.22, 21.32);
      b.box(std(0x2a2f36, { metalness: 0.4, roughness: 0.2 }), x + 0.4, x + 1.47, y + 0.08, y + 0.42, 21.2, 21.22, { shadow: false });
    }
  b.box(std(0x2e9a4a), 13.5, 13.7, 2.55, 2.75, 21.28, 21.3, { shadow: false });
  for (const x of [12.4, 14.2]) b.box(std(0xd8473c), x, x + 0.5, 0.42, 0.72, 21.28, 21.3, { shadow: false });
  b.box(std(0xb8b2a8), 15.4, 18.6, 0.9, 0.95, 21.25, 21.95);
  b.box(std(0xe8e5df), 15.4, 18.6, 0.95, 2.3, 21.85, 21.95);
  b.box(std(0x6d7279, { metalness: 0.4, roughness: 0.3 }), 16.6, 17.6, 0.86, 0.96, 21.35, 21.8);
  b.cylinder(steel, 17.1, 21.82, 0.025, 0.95, 1.25, 6);
  b.box(steel, 17.07, 17.13, 1.22, 1.26, 21.6, 21.84);

  // The orange stair: sixteen steps rising north to the floor above, timber
  // walls each side, a dark grating at its foot.
  const steps = 16;
  const rise = 5.6 / steps;
  const tread = 0.5;
  for (let i = 0; i < steps; i++) {
    const z1 = 10.6 - i * tread;
    b.box(orange, 22, 25, 0, (i + 1) * rise, z1 - tread, z1, { occludes: i % 3 === 0 });
    b.box(orangeEdge, 22, 25, (i + 1) * rise - 0.03, (i + 1) * rise, z1 - 0.05, z1, { shadow: false });
  }
  b.floor(std(0xffffff, { map: grating() }), 22, 25, 10.6, 11.3, 0.02);
  for (const x of [21.7, 25.0]) {
    for (let i = 0; i < steps; i += 2) {
      const z1 = 10.6 - i * tread;
      b.box(wood, x, x + 0.3, 0, (i + 2) * rise + 0.9, z1 - tread * 2, z1, { occludes: true });
    }
  }
  b.solids.push({ x0: 21.6, x1: 25.4, z0: 2.5, z1: 10.6 });
  // the floor above, from the top of the stair, with a glass edge
  b.box(darkWood, 20, 36, 5.55, 5.75, 0, 2.6, { occludes: true });
  b.box(glass, 20, 36, 5.75, 6.15, 2.55, 2.6, { shadow: false });

  // Tiered timber seats beside the stair, with green and yellow cushions.
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const z1 = 10.4 - i * 1.15;
    b.box(wood, 25.4, 34.6, 0, (i + 1) * 0.47, z1 - 1.15, z1, { occludes: i % 2 === 0 });
    if (i % 2 === 0 || i === 3) {
      const cushion = i % 4 === 0 ? 0x5e8f4c : 0xe2bf49;
      for (let x = 26; x < 34; x += 2.1) b.box(std(cushion), x, x + 1.7, (i + 1) * 0.47, (i + 1) * 0.47 + 0.06, z1 - 0.6, z1 - 0.1);
    }
  }
  b.solids.push({ x0: 25.3, x1: 34.7, z0: 3.4, z1: 10.4 });

  // The hall (Wen's sketch: a room off the lobby). Closed: we have no photo
  // of inside it, so it's drawn as walls with doors.
  b.box(woodTall, 24, 34.8, 0, 4.4, 13.4, 21, { occludes: true, solid: true });
  b.box(std(0x1c2229, { metalness: 0.3, roughness: 0.25 }), 23.94, 24, 0, 2.5, 16.4, 18.2, { shadow: false });
  b.box(steel, 23.92, 23.96, 1.0, 1.1, 17.25, 17.35, { shadow: false });
  b.box(charcoal, 24, 34.8, 4.4, 4.5, 13.4, 21);

  const walkable: Rect[] = [
    { x0: -2, x1: 14, z0: 30.4, z1: 42 }, // paving outside the door
    { x0: -21.6, x1: -1, z0: 31.6, z1: 36.4 }, // the bridge
    { x0: 3.1, x1: 5.9, z0: 29.4, z1: 30.8 }, // the door
    { x0: 0.35, x1: 8.6, z0: 21, z1: 29.7 }, // corridor
    { x0: 0.35, x1: 35.6, z0: 0.35, z1: 21.6 }, // ground floor
  ];

  return {
    root: b.root,
    occluders: b.occluders,
    floors: b.floors,
    walkable,
    solids: b.solids,
    paving,
    glass,
    windows,
    ceilingStrips,
    lampHead,
    lamp,
    ceilingLights,
  };
}

// Can a person of radius r stand at (x, z)?
export function canStand(built: Pick<Built, "walkable" | "solids" | "circles">, x: number, z: number, r = 0.28): boolean {
  if (!built.walkable.some((w) => x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1)) return false;
  if (built.circles?.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2)) return false;
  return !built.solids.some((s) => x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r);
}

// The campus (retired with ADR 005, kept so its memories still replay).
export const campusKit: PlaceKit = {
  build: buildWorld,
  isInside,
  zoneAt(x, z) {
    if (!isInside(x, z)) return "bridge";
    if (x < 9 && z > 21.5) return "entry";
    if (z > 15.5 && x > 10.5 && x < 20.5) return "tea-point";
    if (x >= 20.5) return "stairs";
    return "lobby";
  },
  passerPaths: [
    [[10, 35], [-1, 34.6], [-20.6, 34]],
    [[-20.6, 33.2], [-2, 33.4], [4.5, 31.4], [4.5, 27], [4, 22], [9, 18.5], [20, 13], [23.5, 11.4]],
    [[4.6, 29], [3.5, 21], [10.5, 12.2], [13.2, 9]],
    [[12, 39], [-1.5, 35.4], [-20.6, 35.4]],
    [[30, 12.4], [19, 12], [11, 17.8], [5, 23], [4.5, 29]],
  ],
  // only where there's no roof: the paving, the bridge, the library front
  rainAt(r) {
    const x = -30 + r() * 44;
    return [x, x < 0 ? -2 + r() * 48 : 30.4 + r() * 16];
  },
  sunTarget: [6, 0, 20],
};
