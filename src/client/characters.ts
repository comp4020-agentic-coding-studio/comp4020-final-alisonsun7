// Original sculpted, skinned animal people. The continuous garment surfaces
// are generated from signed distances, not articulated tubes or downloaded art.
import * as THREE from "three";
import type { Avatar } from "../shared/protocol.js";
import type { Pose } from "./figures.js";

export interface AnimalFigureOptions {
  avatar: Avatar;
  seed: string;
  /** Standing height in metres, including the ears. The origin is the soles. */
  height?: number;
  pose?: Pose;
  child?: boolean;
}

const TAU = Math.PI * 2;
const DOWN = new THREE.Vector3(0, -1, 0);
const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<string, THREE.MeshStandardMaterial>();

function geometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    g.name = `Quiet Light / ${key}`;
    geometries.set(key, g);
  }
  return g;
}

function material(colour: number, name: string, roughness = 0.92, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  const key = `${colour}:${roughness}:${side}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0, side });
    m.name = `Quiet Light / ${name}`;
    materials.set(key, m);
  }
  return m;
}

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Each row is an outfit, so seeded variety never becomes random colour noise.
const OUTFITS = [
  { shirt: 0xc8c1a6, trousers: 0x646b53, collar: 0xe4dcc6 },
  { shirt: 0x76816b, trousers: 0xaba28b, collar: 0xdcd6c4 },
  { shirt: 0xa59c86, trousers: 0x525d61, collar: 0xe2d8c1 },
  { shirt: 0x88979a, trousers: 0x686852, collar: 0xe6dec9 },
  { shirt: 0x9e7961, trousers: 0x5d6658, collar: 0xdfd5bc },
  { shirt: 0xcfc8b2, trousers: 0x756955, collar: 0xa7aa91 },
];
const FURS = [
  { coat: 0xd7c9ad, muzzle: 0xeadfc8, ear: 0xb29a85 },
  { coat: 0xb79774, muzzle: 0xddd0b7, ear: 0x98775e },
  { coat: 0x96938a, muzzle: 0xd0cabe, ear: 0x78776e },
  { coat: 0xeee1c8, muzzle: 0xf1e9d6, ear: 0xcbb29d },
  { coat: 0x8a7764, muzzle: 0xc2b29a, ear: 0x756352 },
  { coat: 0xc1ae90, muzzle: 0xe2d7bf, ear: 0xa4917b },
];

const ellipsoid = geometry("soft ellipsoid", () => new THREE.SphereGeometry(1, 12, 8));

type Field = (x: number, y: number, z: number) => number;
interface Volume { field: Field; bone: number }
const smoothMin = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
function oval(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Field {
  return (x, y, z) => {
    const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
    const k0 = Math.hypot(px, py, pz);
    const k1 = Math.hypot(px / rx, py / ry, pz / rz);
    return k0 * (k0 - 1) / Math.max(k1, 0.00001);
  };
}
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, folds = 0): Field {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const ll = dx * dx + dy * dy + dz * dz;
  return (x, y, z) => {
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / ll, 0, 1);
    const px = x - a.x - dx * t, py = y - a.y - dy * t, pz = z - a.z - dz * t;
    const angle = Math.atan2(pz, px);
    const crease = folds * (Math.sin(t * 27 + angle * 2) * Math.exp(-(((t - 0.82) / 0.2) ** 2))
      + 0.45 * Math.sin(t * 15 - angle * 3));
    return Math.hypot(px, py, pz) - (r0 + (r1 - r0) * t + crease);
  };
}

/** Closed marching-tetrahedra surface with smooth normals and blend weights. */
function implicit(key: string, field: Field, volumes: Volume[], low: number[], high: number[], step: number): THREE.BufferGeometry {
  return geometry(key, () => {
    const nx = Math.ceil((high[0] - low[0]) / step) + 1;
    const ny = Math.ceil((high[1] - low[1]) / step) + 1;
    const nz = Math.ceil((high[2] - low[2]) / step) + 1;
    const values = new Float32Array(nx * ny * nz);
    const point = (id: number): number[] => {
      const x = id % nx, yz = (id - x) / nx, y = yz % ny, z = (yz - y) / ny;
      return [low[0] + x * step, low[1] + y * step, low[2] + z * step];
    };
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      values[x + nx * (y + ny * z)] = field(low[0] + x * step, low[1] + y * step, low[2] + z * step);
    }
    const positions: number[] = [], normals: number[] = [], indices: number[] = [], skin: number[] = [], weights: number[] = [], uv: number[] = [];
    const edges = new Map<string, number>();
    const e = 0.0006;
    function vertex(a: number, b: number): number {
      const key = a < b ? `${a}/${b}` : `${b}/${a}`;
      const known = edges.get(key);
      if (known !== undefined) return known;
      const pa = point(a), pb = point(b), t = values[a] / (values[a] - values[b]);
      const x = pa[0] + (pb[0] - pa[0]) * t, y = pa[1] + (pb[1] - pa[1]) * t, z = pa[2] + (pb[2] - pa[2]) * t;
      const n = new THREE.Vector3(field(x + e, y, z) - field(x - e, y, z), field(x, y + e, z) - field(x, y - e, z), field(x, y, z + e) - field(x, y, z - e)).normalize();
      const id = positions.length / 3;
      positions.push(x, y, z); normals.push(n.x, n.y, n.z); uv.push(x * 8, y * 8 + z * 2);
      const ranked = volumes.map((v) => ({ bone: v.bone, distance: v.field(x, y, z) })).sort((a, b) => a.distance - b.distance).slice(0, 4);
      const min = ranked[0].distance;
      const w = ranked.map((v) => Math.exp(-(v.distance - min) / 0.007));
      const sum = w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < 4; i++) { skin.push(ranked[i]?.bone ?? 0); weights.push((w[i] ?? 0) / sum); }
      edges.set(key, id);
      return id;
    }
    function triangle(a: number, b: number, c: number): void {
      const ax = positions[b * 3] - positions[a * 3], ay = positions[b * 3 + 1] - positions[a * 3 + 1], az = positions[b * 3 + 2] - positions[a * 3 + 2];
      const bx = positions[c * 3] - positions[a * 3], by = positions[c * 3 + 1] - positions[a * 3 + 1], bz = positions[c * 3 + 2] - positions[a * 3 + 2];
      const direction = (ay * bz - az * by) * normals[a * 3] + (az * bx - ax * bz) * normals[a * 3 + 1] + (ax * by - ay * bx) * normals[a * 3 + 2];
      if (direction < 0) indices.push(a, c, b); else indices.push(a, b, c);
    }
    const tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
    for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
      const a = x + nx * (y + ny * z);
      const cube = [a, a + 1, a + 1 + nx, a + nx, a + nx * ny, a + nx * ny + 1, a + nx * ny + 1 + nx, a + nx * ny + nx];
      if (cube.every((id) => values[id] >= 0) || cube.every((id) => values[id] < 0)) continue;
      for (const tetra of tetrahedra) {
        const inside = tetra.map((i) => cube[i]).filter((id) => values[id] < 0);
        const outside = tetra.map((i) => cube[i]).filter((id) => values[id] >= 0);
        if (inside.length === 1 || inside.length === 3) {
          const one = inside.length === 1 ? inside[0] : outside[0];
          const rest = inside.length === 1 ? outside : inside;
          triangle(vertex(one, rest[0]), vertex(one, rest[1]), vertex(one, rest[2]));
        } else if (inside.length === 2) {
          const ac = vertex(inside[0], outside[0]), ad = vertex(inside[0], outside[1]);
          const bc = vertex(inside[1], outside[0]), bd = vertex(inside[1], outside[1]);
          triangle(ac, ad, bd); triangle(ac, bd, bc);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(indices);
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skin, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    g.userData.closedGarment = true;
    return g;
  });
}

function garments(avatar: Avatar, thigh: number, shin: number, step: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const body: Field = (x, y, z) => {
    const width = 0.085 + 0.021 * Math.exp(-(((y - 0.19) / 0.075) ** 2)) + 0.01 * Math.exp(-(((y + 0.015) / 0.05) ** 2));
    const depth = 0.055 + 0.016 * Math.exp(-(((y - 0.16) / 0.09) ** 2));
    const folds = 0.0015 * Math.sin(Math.atan2(z, x) * 7 + y * 24) * Math.exp(-(((y - 0.035) / 0.08) ** 2));
    const radial = (Math.hypot(x / width, z / depth) - 1) * depth - folds;
    const shoulders = 0.276 - 0.25 * Math.abs(x);
    return Math.max(radial, y - shoulders, -0.035 - y);
  };
  const upper: Volume[] = [{ field: body, bone: 1 }];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * 0.098, 0.229, 0);
    const elbow = shoulder.clone().add(new THREE.Vector3(side * Math.sin(0.35) * 0.16, -Math.cos(0.35) * 0.16, 0));
    const wrist = elbow.clone().add(new THREE.Vector3(side * Math.sin(0.35) * 0.15, -Math.cos(0.35) * 0.15, 0));
    upper.push({ field: limb(shoulder, elbow, 0.033, 0.026, 0.0008), bone: side < 0 ? 3 : 5 });
    const sleeve = limb(elbow, wrist, 0.027, 0.020, 0.001);
    const axis = wrist.clone().sub(elbow).normalize();
    upper.push({ field: (x, y, z) => Math.max(sleeve(x, y, z), (x - wrist.x) * axis.x + (y - wrist.y) * axis.y + (z - wrist.z) * axis.z - 0.001), bone: side < 0 ? 4 : 6 });
  }
  const upperField: Field = (x, y, z) => {
    let d = upper[0].field(x, y, z);
    for (let i = 1; i < upper.length; i++) d = smoothMin(d, upper[i].field(x, y, z), 0.025);
    // Neck opening; the dog has a genuinely open front over a separate shirt.
    d = Math.max(d, -Math.max(Math.hypot(x, z) - 0.035, 0.244 - y));
    if (avatar === "dog") d = Math.max(d, -Math.max(Math.abs(x) - (0.018 + 0.08 * Math.max(0, y - 0.07)), 0.014 - z));
    if (Math.abs(x) < 0.13) d = Math.max(d, -0.035 - y);
    return d;
  };
  const lower: Volume[] = [{ field: oval(0, -0.01, -0.002, 0.09, 0.075, 0.061), bone: 0 }];
  for (const side of [-1, 1]) {
    const hip = new THREE.Vector3(side * 0.049, -0.012, 0);
    const knee = new THREE.Vector3(side * 0.049, -thigh, 0.002);
    const ankle = new THREE.Vector3(side * 0.049, -thigh - shin + 0.008, 0);
    lower.push({ field: limb(hip, knee, avatar === "cat" ? 0.048 : 0.045, 0.038, 0.0006), bone: side < 0 ? 7 : 10 });
    lower.push({ field: limb(knee, ankle, 0.038, 0.032, 0.0008), bone: side < 0 ? 8 : 11 });
  }
  const lowerField: Field = (x, y, z) => {
    let d = lower[0].field(x, y, z);
    for (let i = 1; i < lower.length; i++) d = smoothMin(d, lower[i].field(x, y, z), 0.018);
    return Math.max(d, -thigh - shin - 0.002 - y);
  };
  const shirt = implicit(`${avatar} continuous shoulder shirt ${step}`, upperField, upper, [-0.265, -0.11, -0.10], [0.265, 0.3, 0.10], step * 0.85);
  if (!shirt.userData.finishedHem) {
    const p = shirt.getAttribute("position"), bones = shirt.getAttribute("skinIndex"), weights = shirt.getAttribute("skinWeight");
    const hem: number[] = [];
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const bottom = Math.abs(x) < 0.125 && y < -0.025;
      const edge = 0.018 + 0.08 * Math.max(0, y - 0.07);
      const facing = avatar === "dog" && z > 0.01 && Math.abs(Math.abs(x) - edge) < step * 0.5;
      if (bottom) { y = -0.035; hem.push(i); }
      if (facing) x = Math.sign(x) * edge;
      p.setXYZ(i, x, y, z);
      // The cut hem and placket belong to the torso, so raising a hand cannot
      // pull their vertices into a sawtooth through an unrelated arm weight.
      if ((Math.abs(x) < 0.125 && y < 0.012) || facing) { bones.setXYZW(i, 1, 0, 0, 0); weights.setXYZW(i, 1, 0, 0, 0); }
    }
    shirt.computeVertexNormals();
    shirt.userData.hemVertices = hem;
    shirt.userData.finishedHem = true;
  }
  return [
    shirt,
    implicit(`${avatar} continuous trousers ${thigh}/${step}`, lowerField, lower, [-0.12, -thigh - shin - 0.025, -0.09], [0.12, 0.08, 0.09], step * 1.15),
  ];
}

function sculptedHead(avatar: Avatar, detail = 40): THREE.BufferGeometry {
  return geometry(`${avatar} sculpted head ${detail}`, () => {
    const g = new THREE.SphereGeometry(1, detail, Math.round(detail * 0.7));
    const p = g.getAttribute("position"), colours: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const sx = p.getX(i), sy = p.getY(i), sz = p.getZ(i);
      let x = sx * (0.059 + 0.006 * Math.exp(-(((sy + 0.25) / 0.35) ** 2)));
      const y = sy * 0.074;
      let z = sz * 0.054;
      const front = Math.max(0, sz) ** 5;
      const muzzle = Math.exp(-((x / (avatar === "dog" ? 0.035 : 0.033)) ** 4) - ((y + 0.025) / 0.025) ** 4);
      const cheek = Math.exp(-(((Math.abs(x) - 0.034) / 0.019) ** 2) - ((y + 0.015) / 0.025) ** 2);
      const sockets = Math.exp(-(((Math.abs(x) - 0.027) / 0.013) ** 2) - ((y - 0.013) / 0.011) ** 2);
      const brow = Math.exp(-(((Math.abs(x) - 0.028) / 0.023) ** 2) - ((y - 0.028) / 0.008) ** 2);
      z += front * ((avatar === "dog" ? 0.064 : 0.039) * muzzle + 0.008 * cheek - 0.007 * sockets + 0.004 * brow);
      x *= 1 + front * 0.1 * cheek;
      p.setXYZ(i, x, y, z);
      const light = 0.88 + 0.28 * muzzle * Math.max(0, sz) + 0.04 * cheek;
      colours.push(light, light * 0.99, light * 0.95);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    g.computeVertexNormals();
    return g;
  });
}

function handGeometry(side: number): THREE.BufferGeometry {
  return geometry(`sculpted hand ${side}`, () => {
    const pieces: THREE.BufferGeometry[] = [new THREE.SphereGeometry(1, 16, 10).scale(0.017, 0.022, 0.010).translate(0, -0.018, 0)];
    for (let finger = 0; finger < 4; finger++) {
      const x = (finger - 1.5) * 0.0075;
      const length = [0.027, 0.034, 0.031, 0.023][finger];
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, -0.03, 0), new THREE.Vector3(x, -0.03 - length * 0.6, 0.004), new THREE.Vector3(x, -0.03 - length, 0.014)]);
      pieces.push(new THREE.TubeGeometry(curve, 7, 0.0043, 6, false));
    }
    pieces.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(side * -0.013, -0.011, 0.003), new THREE.Vector3(side * -0.025, -0.023, 0.012), new THREE.Vector3(side * -0.02, -0.035, 0.018)]), 7, 0.0053, 6, false));
    return merge(pieces);
  });
}

function tapered(key: string, top: number, bottom: number, length: number, segments = 10): THREE.BufferGeometry {
  return geometry(key, () => new THREE.CylinderGeometry(top, bottom, length, segments).translate(0, -length / 2, 0));
}

function clothShape(key: string, profile: number[][], depth = 1): THREE.BufferGeometry {
  return geometry(key, () => {
    const ordered = profile[0][1] > profile[profile.length - 1][1] ? [...profile].reverse() : profile;
    const g = new THREE.LatheGeometry(ordered.map(([r, y]) => new THREE.Vector2(r, y)), 16).scale(1, 1, depth);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i) / depth, p.getX(i));
      const fold = 1 + 0.016 * Math.sin(a * 5 + p.getY(i) * 22) + 0.009 * Math.sin(a * 9 - p.getY(i) * 34);
      p.setXYZ(i, p.getX(i) * fold, p.getY(i), p.getZ(i) * fold);
    }
    g.computeVertexNormals();
    return g;
  });
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const source of parts) {
    const part = source.index ? source.toNonIndexed() : source;
    positions.push(...Array.from(part.getAttribute("position").array));
    normals.push(...Array.from(part.getAttribute("normal").array));
    if (part !== source) part.dispose();
    source.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return g;
}

function catEar(inner: boolean): THREE.BufferGeometry {
  return geometry(inner ? "cat inner ear" : "cat ear", () => {
    const s = new THREE.Shape();
    if (inner) {
      s.moveTo(-0.012, 0.012);
      s.quadraticCurveTo(-0.003, 0.032, 0.006, 0.046);
      s.quadraticCurveTo(0.014, 0.028, 0.015, 0.011);
    } else {
      s.moveTo(-0.022, 0);
      s.quadraticCurveTo(-0.01, 0.038, 0.007, 0.06);
      s.quadraticCurveTo(0.025, 0.033, 0.024, 0);
    }
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: inner ? 0.001 : 0.018, bevelEnabled: false, curveSegments: 3 });
  });
}

function torsoGeometry(): THREE.BufferGeometry {
  return clothShape("linen overshirt", [[0.092, -0.027], [0.096, -0.021], [0.094, 0.018], [0.092, 0.08], [0.105, 0.17], [0.113, 0.213], [0.109, 0.232], [0.091, 0.257], [0.049, 0.276], [0.046, 0.28]], 0.68);
}

function shirtDetails(): THREE.BufferGeometry {
  return geometry("collar and shirt placket", () => {
    const pieces: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const collar = new THREE.BoxGeometry(0.033, 0.047, 0.008);
      collar.rotateZ(side * -0.43).translate(side * 0.026, 0.252, 0.046);
      pieces.push(collar);
    }
    pieces.push(new THREE.BoxGeometry(0.008, 0.185, 0.004).translate(0, 0.136, 0.069));
    // A quiet breast-pocket opening reads as clothing at conversational range.
    pieces.push(new THREE.BoxGeometry(0.04, 0.006, 0.003).translate(-0.047, 0.171, 0.065));
    for (const y of [0.066, 0.12, 0.174, 0.224]) pieces.push(new THREE.SphereGeometry(0.003, 6, 4).scale(1, 1, 0.45).translate(0, y, 0.073));
    return merge(pieces);
  });
}

function shoeGeometry(): THREE.BufferGeometry {
  return geometry("leather shoe with sole and heel", () => {
    const sections = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.001, -0.025, -0.045), new THREE.Vector3(0.028, 0.036, -0.031),
      new THREE.Vector3(0.033, 0.061, -0.012), new THREE.Vector3(0.036, 0.028, 0.015),
      new THREE.Vector3(0.038, 0.003, 0.048), new THREE.Vector3(0.029, -0.012, 0.079),
      new THREE.Vector3(0.001, -0.027, 0.092),
    ]);
    const pos: number[] = [], index: number[] = [];
    for (let j = 0; j <= 32; j++) {
      const s = sections.getPoint(j / 32);
      for (let i = 0; i <= 20; i++) {
        const a = i / 20 * TAU;
        pos.push(Math.cos(a) * Math.max(0.001, s.x), -0.035 + (s.y + 0.035) * (0.5 + 0.5 * Math.sin(a)), s.z);
      }
    }
    for (let j = 0; j < 32; j++) for (let i = 0; i < 20; i++) {
      const a = j * 21 + i, b = a + 21;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(index); g.computeVertexNormals();
    const s = new THREE.Shape();
    s.moveTo(0, 0.092); s.bezierCurveTo(0.033, 0.092, 0.041, 0.062, 0.036, 0.02);
    s.lineTo(0.031, -0.027); s.quadraticCurveTo(0.028, -0.043, 0, -0.043);
    s.quadraticCurveTo(-0.028, -0.043, -0.031, -0.027); s.lineTo(-0.036, 0.02);
    s.bezierCurveTo(-0.041, 0.062, -0.033, 0.092, 0, 0.092);
    const sole = new THREE.ExtrudeGeometry(s, {depth: 0.009, bevelEnabled: false, curveSegments: 8}).rotateX(Math.PI / 2).translate(0, -0.035, 0);
    return merge([g, sole]);
  });
}

interface Arm {
  upper: THREE.Bone;
  fore: THREE.Bone;
  hand: THREE.Mesh;
  side: number;
}

interface Leg {
  thigh: THREE.Bone;
  shin: THREE.Bone;
  foot: THREE.Bone;
}

/**
 * A lit, fully three-dimensional person, facing +Z. Standing geometry is
 * normalised to one unit; the public scale is uniformly set to `height`.
 * `headAnchor` follows sitting, leaning and gait for world-space labels.
 */
export class AnimalFigure extends THREE.Group {
  readonly height: number;
  readonly headAnchor = new THREE.Object3D();
  pose: Pose;
  private readonly rig = new THREE.Group();
  private readonly hips = new THREE.Bone();
  private readonly upperBody = new THREE.Bone();
  private readonly head = new THREE.Bone();
  private skeleton!: THREE.Skeleton;
  private readonly garmentMeshes: THREE.SkinnedMesh[] = [];
  private readonly arms: [Arm, Arm];
  private readonly legs: [Leg, Leg];
  private readonly thighLength: number;
  private readonly shinLength: number;
  private readonly hipHeight: number;
  private readonly phaseOffset: number;
  private guitar: THREE.Group | null = null;
  private umbrella: THREE.Group | null = null;
  private lastPhase = 0;
  private lastWalking = false;
  private ownsMaterials = false;
  private opacity = 1;
  private readonly materialCopies = new Map<THREE.Material, THREE.Material>();

  constructor(options: AnimalFigureOptions) {
    super();
    const { avatar, seed, child = false } = options;
    const h = hash(seed);
    const outfit = avatar === "cat" ? { shirt: 0xcac2aa, trousers: 0x82836a, collar: 0xe1d9c1 } : { shirt: 0x626e54, trousers: 0xb7ad95, collar: 0xe3dcc9 };
    const fur = FURS[h % FURS.length];
    const furMat = material(fur.coat, "soft fur");
    const earMat = material(fur.ear, "ear interior");
    const cloth = material(outfit.shirt, "linen shirt");
    const trousers = material(outfit.trousers, "cotton trousers");
    const collar = material(outfit.collar, "open linen collar");
    const shoes = material(0x68503b, "worn leather shoes", 0.86);
    this.name = `${avatar}-person-${seed}`;
    this.userData.figure = { avatar, seed, child, source: "original procedural geometry" };
    this.pose = options.pose ?? "stand";
    this.height = options.height ?? (child ? 1.15 : 1.75);
    this.thighLength = child ? 0.224 : 0.234;
    this.shinLength = child ? 0.232 : 0.242;
    this.hipHeight = this.thighLength + this.shinLength + 0.044;
    this.phaseOffset = ((h >>> 16) % 997) / 997 * TAU;
    this.scale.setScalar(this.height);
    this.rig.name = "normalised-person";
    this.hips.name = "hip-rig";
    this.upperBody.name = "upper-body-rig";
    this.add(this.rig);
    this.rig.add(this.hips);
    this.hips.add(this.upperBody);

    this.part(this.upperBody, "shirt-collar-and-placket", shirtDetails(), collar, false);
    this.part(this.upperBody, "bound-garment-edges", geometry(`${avatar} bound garment edges`, () => {
      const parts: THREE.BufferGeometry[] = [];
      const hem = new THREE.CatmullRomCurve3(Array.from({length: 49}, (_, i) => new THREE.Vector3(Math.cos(i / 48 * TAU) * 0.095, -0.033, Math.sin(i / 48 * TAU) * 0.055)), true);
      parts.push(new THREE.TubeGeometry(hem, 48, 0.002, 5, true));
      if (avatar === "dog") for (const side of [-1, 1]) {
        parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.018, -0.032, 0.052), new THREE.Vector3(side * 0.018, 0.07, 0.064),
          new THREE.Vector3(side * 0.028, 0.19, 0.067), new THREE.Vector3(side * 0.033, 0.25, 0.054),
        ]), 24, 0.0025, 5, false));
      }
      return merge(parts);
    }), cloth, false);
    if (avatar === "dog") {
      const inset = geometry("white shirt inside front opening only", () => {
        const g = new THREE.PlaneGeometry(0.098, 0.29, 8, 18).translate(0, 0.112, 0.034);
        const p = g.getAttribute("position");
        for (let i = 0; i < p.count; i++) p.setZ(i, 0.034 + 0.006 * Math.sin((p.getY(i) + 0.035) * 7) - 0.006 * (p.getX(i) / 0.049) ** 2);
        g.computeVertexNormals(); return g;
      });
      this.part(this.upperBody, "linen-under-shirt", inset, collar);
    }
    const neck = this.part(this.upperBody, "neck", tapered("neck", 0.024, 0.026, 0.054), furMat);
    neck.position.y = 0.322;
    this.head.name = "head-rig";
    this.head.position.set(0, child ? 0.362 : 0.375, 0);
    this.head.scale.setScalar(child ? 1.1 : 1);
    this.upperBody.add(this.head);
    const faceMat = material(fur.coat, "sculpted fur face", 0.85);
    faceMat.vertexColors = true;
    const headLod = new THREE.LOD();
    headLod.name = "head-detail-levels";
    this.head.add(headLod);
    for (const [detail, distance] of [[40, 0], [24, 10], [12, 24]]) {
      const headMesh = new THREE.Mesh(sculptedHead(avatar, detail), faceMat);
      headMesh.name = detail === 40 ? "head-fur" : `head-fur-${detail}`;
      headMesh.castShadow = true;
      headMesh.receiveShadow = true;
      headLod.addLevel(headMesh, distance);
      headMesh.visible = distance === 0;
    }
    const nose = this.part(this.head, "nose", ellipsoid, material(0x393a34, "nose and eyes", 0.68), false);
    nose.position.set(0, -0.019, avatar === "dog" ? 0.112 : 0.084);
    nose.scale.set(avatar === "dog" ? 0.014 : 0.009, 0.0075, 0.008);
    for (const side of [-1, 1]) {
      const eye = this.part(this.head, side < 0 ? "left-eye" : "right-eye", geometry("almond eye", () => new THREE.SphereGeometry(1, 20, 12)), material(0xc7bda3, "eye whites", 0.45), false);
      eye.position.set(side * 0.028, 0.014, 0.047);
      eye.scale.set(0.011, 0.006, 0.005);
      eye.rotation.z = side * -0.1;
      const iris = this.part(this.head, side < 0 ? "left-iris" : "right-iris", ellipsoid, material(0x514c35, "iris", 0.38), false);
      iris.position.set(side * 0.028, 0.014, 0.052);
      iris.scale.set(0.0047, 0.005, 0.002);
      if (avatar === "cat") {
        const ear = this.part(this.head, side < 0 ? "left-cat-ear" : "right-cat-ear", catEar(false), furMat);
        ear.position.set(side * 0.042, 0.045, -0.012);
        ear.scale.x = side;
        const inner = this.part(this.head, side < 0 ? "left-inner-ear" : "right-inner-ear", catEar(true), earMat, false);
        inner.position.set(side * 0.042, 0.045, 0.007);
        inner.scale.x = side;
      } else {
        const ear = this.part(this.head, side < 0 ? "left-dog-ear" : "right-dog-ear", geometry("folded dog ear", () => {
          const g = new THREE.SphereGeometry(1, 24, 18).scale(0.024, 0.055, 0.012);
          const p = g.getAttribute("position");
          for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + 0.016 * ((0.055 - p.getY(i)) / 0.11) ** 2);
          g.computeVertexNormals(); return g;
        }), earMat);
        ear.position.set(side * 0.065, -0.013, -0.006);
        ear.rotation.z = side * 0.13;
      }
    }
    this.headAnchor.name = "head-label-anchor";
    this.headAnchor.position.set(0, avatar === "cat" ? 0.115 : 0.086, 0);
    this.head.add(this.headAnchor);

    const lids = geometry(`${avatar} sculpted eyelids and mouth`, () => {
      const pieces: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        const x = side * 0.028;
        for (const upper of [false, true]) {
          const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x - 0.012, 0.014, 0.047), new THREE.Vector3(x, upper ? 0.021 : 0.009, 0.05), new THREE.Vector3(x + 0.012, 0.014, 0.047)]);
          pieces.push(new THREE.TubeGeometry(curve, 12, upper ? 0.0021 : 0.0013, 6, false));
        }
      }
      return merge(pieces);
    });
    this.part(this.head, "sculpted-eyelids", lids, earMat, false);
    const mouth = this.part(this.head, "mouth-line", geometry(`${avatar} mouth curve`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.027, -0.031, avatar === "dog" ? 0.084 : 0.06), new THREE.Vector3(0, -0.038, avatar === "dog" ? 0.102 : 0.071), new THREE.Vector3(0.027, -0.031, avatar === "dog" ? 0.084 : 0.06),
    ]), 18, 0.0011, 5, false)), material(0x72634f, "soft mouth line"), false);
    mouth.name = "mouth-line";

    this.arms = [-1, 1].map((side) => this.buildArm(side, cloth, collar, furMat)) as [Arm, Arm];
    this.legs = [-1, 1].map((side) => this.buildLeg(side, trousers, shoes)) as [Leg, Leg];
    if (avatar === "cat") this.buildScarfAndBag();
    const tail = this.part(this.hips, `${avatar}-tail`, geometry(`${avatar} tail`, () => {
      const points = avatar === "cat"
        ? [[0, 0.018, -0.05], [0.025, -0.055, -0.12], [0.06, -0.105, -0.17], [0.095, -0.09, -0.18], [0.107, -0.055, -0.165]]
        : [[0, 0.018, -0.05], [0.03, 0.025, -0.10], [0.057, 0.062, -0.135]];
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))), 10, avatar === "cat" ? 0.0095 : 0.014, 6, false);
    }), furMat);
    tail.name = `${avatar}-tail`;

    // Cats include their ears; dogs include their crown. All feet remain at
    // Y=0 after this scale, including children with their subtly larger head.
    const crown = this.hipHeight + this.head.position.y + (avatar === "cat" ? 0.105 : 0.074) * this.head.scale.y;
    this.rig.scale.setScalar(1 / crown);
    this.hips.position.y = this.hipHeight;
    this.skeleton = new THREE.Skeleton([this.hips, this.upperBody, this.head, this.arms[0].upper, this.arms[0].fore, this.arms[1].upper, this.arms[1].fore,
      this.legs[0].thigh, this.legs[0].shin, this.legs[0].foot, this.legs[1].thigh, this.legs[1].shin, this.legs[1].foot]);
    const levels = [0.0153, 0.028, 0.048];
    const shirtLod = new THREE.LOD(), trousersLod = new THREE.LOD();
    shirtLod.name = "continuous-shirt-levels"; trousersLod.name = "continuous-trouser-levels";
    this.hips.add(shirtLod, trousersLod);
    levels.forEach((step, level) => {
      const [shirtGeometry, trousersGeometry] = garments(avatar, this.thighLength, this.shinLength, step);
      for (const [g, m, name, lod] of [[shirtGeometry, cloth, "linen-shirt", shirtLod], [trousersGeometry, trousers, "continuous-trousers", trousersLod]] as const) {
        const mesh = new THREE.SkinnedMesh(g, m);
        mesh.name = level === 0 ? name : `${name}-lod${level}`;
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        lod.addLevel(mesh, [0, 10, 24][level]);
        mesh.visible = level === 0;
        this.garmentMeshes.push(mesh);
      }
    });
    this.updateMatrixWorld(true);
    for (const mesh of this.garmentMeshes) mesh.bind(this.skeleton);
    this.setPose(this.pose);
  }

  private part(parent: THREE.Object3D, name: string, g: THREE.BufferGeometry, m: THREE.Material, shadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(g, this.ownsMaterials ? this.privateMaterial(m) : m);
    mesh.name = name;
    mesh.userData.figurePart = name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    parent.add(mesh);
    return mesh;
  }

  private buildArm(side: number, cloth: THREE.Material, cuff: THREE.Material, fur: THREE.Material): Arm {
    const label = side < 0 ? "left" : "right";
    const upper = new THREE.Bone();
    upper.name = `${label}-shoulder`;
    upper.position.set(side * 0.098, 0.229, 0);
    upper.rotation.z = side * 0.35;
    this.upperBody.add(upper);
    const fore = new THREE.Bone();
    fore.name = `${label}-elbow`;
    fore.position.y = -0.16;
    upper.add(fore);
    const hand = this.part(fore, `${label}-hand`, handGeometry(side), fur);
    hand.position.y = -0.15;
    return { upper, fore, hand, side };
  }

  private buildLeg(side: number, trousers: THREE.Material, shoes: THREE.Material): Leg {
    const label = side < 0 ? "left" : "right";
    const thigh = new THREE.Bone();
    thigh.name = `${label}-hip`;
    thigh.position.set(side * 0.049, 0, 0);
    this.hips.add(thigh);
    const shin = new THREE.Bone();
    shin.name = `${label}-knee`;
    shin.position.y = -this.thighLength;
    thigh.add(shin);
    const foot = new THREE.Bone();
    foot.name = `${label}-ankle`;
    foot.position.y = -this.shinLength;
    shin.add(foot);
    this.part(foot, `${label}-shoe`, shoeGeometry(), shoes);
    return { thigh, shin, foot };
  }

  private buildScarfAndBag(): void {
    const scarf = geometry("folded woven scarf", () => {
      const p: number[] = [], index: number[] = [];
      const around = 64, rows = 8;
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= around; i++) {
        const a = i / around * TAU, v = j / rows;
        const r = 0.047 + 0.009 * Math.sin(v * Math.PI) + 0.002 * Math.sin(a * 5 + v * 4);
        p.push(Math.cos(a) * r, 0.282 + v * 0.044 - 0.015 * Math.max(0, Math.sin(a)) * (1 - v), Math.sin(a) * r * 0.9);
      }
      for (let j = 0; j < rows; j++) for (let i = 0; i < around; i++) {
        const a = j * (around + 1) + i, b = a + around + 1;
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
      const band = new THREE.BufferGeometry(); band.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); band.setIndex(index); band.computeVertexNormals();
      const tail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.022, 0.282, 0.047), new THREE.Vector3(-0.037, 0.23, 0.075), new THREE.Vector3(-0.023, 0.17, 0.078)]), 20, 0.019, 8, false).scale(1, 1, 0.23);
      // The broad hanging fold lies on the chest, not a torus around the neck.
      tail.translate(0, 0, 0.055);
      return merge([band, tail]);
    });
    this.part(this.upperBody, "folded-olive-scarf", scarf, material(0x65704b, "woven olive scarf", 1, THREE.DoubleSide));
    const leather = geometry("soft shoulder bag and crossbody strap", () => {
      const s = new THREE.Shape();
      s.moveTo(-0.042, -0.048); s.quadraticCurveTo(-0.05, 0, -0.04, 0.048); s.quadraticCurveTo(0, 0.058, 0.04, 0.048);
      s.quadraticCurveTo(0.05, 0, 0.042, -0.048); s.quadraticCurveTo(0, -0.059, -0.042, -0.048);
      const bag = new THREE.ExtrudeGeometry(s, {depth: 0.026, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.006, bevelThickness: 0.004, curveSegments: 8}).translate(-0.125, 0.005, 0.045);
      const flap = new THREE.SphereGeometry(1, 20, 8).scale(0.041, 0.031, 0.003).translate(-0.125, 0.025, 0.077);
      const strap = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.078, 0.265, -0.015), new THREE.Vector3(0.086, 0.249, 0.057), new THREE.Vector3(0.025, 0.17, 0.084), new THREE.Vector3(-0.065, 0.08, 0.09), new THREE.Vector3(-0.125, 0.025, 0.072)]), 44, 0.006, 6, false);
      return merge([bag, flap, strap]);
    });
    this.part(this.upperBody, "leather-shoulder-bag-and-strap", leather, material(0x896041, "worn bag leather", 0.86));
  }

  setFacing(yaw: number): void {
    if (Number.isFinite(yaw)) this.rotation.y = yaw;
  }

  setPose(pose: Pose): void {
    this.pose = pose;
    if ((pose === "guitar" || pose === "strum") && !this.guitar) this.guitar = this.buildGuitar();
    if (pose === "umbrella" && !this.umbrella) this.umbrella = this.buildUmbrella();
    if (this.guitar) this.guitar.visible = pose === "guitar" || pose === "strum";
    if (this.umbrella) this.umbrella.visible = pose === "umbrella";
    this.setMotion(this.lastPhase, this.lastWalking);
  }

  /** Phase is a complete 0..1 stride, independent of refresh rate. */
  setMotion(phase: number, walking: boolean): void {
    this.lastPhase = Number.isFinite(phase) ? phase : 0;
    this.lastWalking = walking;
    const q = this.lastPhase * TAU;
    const seated = this.pose === "sit" || this.pose === "guitar" || this.pose === "strum";
    const strides = walking && !seated;
    this.hips.position.set(0, seated ? this.shinLength + 0.044 : this.hipHeight, 0);
    this.upperBody.rotation.set(0, 0, this.pose === "lean" ? 0.065 : 0);
    this.head.rotation.set(0, this.pose === "talk" ? -0.09 : 0, 0);
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      const a = q + i * Math.PI;
      leg.thigh.rotation.set(seated ? -Math.PI / 2 : strides ? -0.32 * Math.sin(a) : 0, 0, 0);
      leg.shin.rotation.set(seated ? Math.PI / 2 : strides ? 0.025 + 0.55 * Math.max(0, Math.cos(a)) ** 1.5 : 0, 0, 0);
      leg.foot.rotation.set(seated ? 0 : -(leg.thigh.rotation.x + leg.shin.rotation.x), 0, 0);
      const arm = this.arms[i];
      arm.upper.rotation.set(strides ? 0.24 * Math.sin(a) : -0.025, 0, arm.side * 0.075);
      arm.fore.rotation.set(-0.10, 0, 0);
    }
    if (strides) {
      // Solve the planted shoe's height, instead of letting the whole body
      // bounce through the floor as the straight stance leg swings.
      this.hips.position.y = Math.max(...this.legs.map((leg) => this.thighLength * Math.cos(leg.thigh.rotation.x)
        + this.shinLength * Math.cos(leg.thigh.rotation.x + leg.shin.rotation.x))) + 0.044;
      this.upperBody.rotation.z += 0.012 * Math.sin(q);
    }
    if (seated) {
      this.aimArm(this.arms[0], new THREE.Vector3(-0.085, 0.025, 0.188), new THREE.Vector3(-1, -1, 0));
      this.aimArm(this.arms[1], new THREE.Vector3(0.085, 0.025, 0.188), new THREE.Vector3(1, -1, 0));
    }
    if (this.pose === "talk") {
      this.aimArm(this.arms[1], new THREE.Vector3(0.21, 0.20, 0.14), new THREE.Vector3(1, -1, 0));
      this.head.rotation.y = -0.09 + 0.025 * Math.sin(q + this.phaseOffset);
    } else if (this.pose === "arms-up") {
      for (const arm of this.arms) {
        arm.upper.rotation.set(-Math.PI + 0.1, 0, arm.side * -0.24);
        arm.fore.rotation.set(-0.12, 0, 0);
      }
    } else if (this.pose === "lean") {
      this.aimArm(this.arms[0], new THREE.Vector3(-0.195, -0.025, 0.01), new THREE.Vector3(-1, -1, 0));
      this.arms[1].fore.rotation.x = -0.4;
    } else if (this.pose === "umbrella") {
      this.aimArm(this.arms[1], new THREE.Vector3(0.18, 0.16, 0.095), new THREE.Vector3(1, -1, 0));
    } else if (this.pose === "guitar" || this.pose === "strum") {
      this.aimArm(this.arms[0], new THREE.Vector3(-0.205, 0.225, 0.17), new THREE.Vector3(-1, -1, 0));
      const stroke = this.pose === "strum" ? -0.012 : 0.012;
      this.aimArm(this.arms[1], new THREE.Vector3(0.052, 0.085 + stroke + 0.012 * Math.sin(q), 0.177), new THREE.Vector3(1, -0.7, 0.2));
    }
  }

  private aimArm(arm: Arm, target: THREE.Vector3, pole: THREE.Vector3): void {
    const shoulder = arm.upper.position;
    const direction = target.clone().sub(shoulder);
    const distance = THREE.MathUtils.clamp(direction.length(), 0.015, 0.309);
    direction.normalize();
    const along = (0.16 ** 2 - 0.15 ** 2 + distance ** 2) / (2 * distance);
    const normal = pole.clone().addScaledVector(direction, -pole.dot(direction)).normalize();
    const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(normal, Math.sqrt(Math.max(0, 0.16 ** 2 - along ** 2)));
    arm.upper.quaternion.setFromUnitVectors(DOWN, elbow.clone().sub(shoulder).normalize());
    const foreRotation = new THREE.Quaternion().setFromUnitVectors(DOWN, target.clone().sub(elbow).normalize());
    arm.fore.quaternion.copy(arm.upper.quaternion).invert().multiply(foreRotation);
  }

  /** Standard materials already receive the shared sky, sun and room lights. */
  setTint(_hex: number): void {
    // Deliberately no legacy sprite tint: multiplying it here darkens fur twice.
  }

  setOpacity(alpha: number): void {
    const opacity = THREE.MathUtils.clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1);
    this.opacity = opacity;
    if (!this.ownsMaterials && opacity !== 1) {
      this.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.material = this.privateMaterial(object.material as THREE.Material);
      });
      this.ownsMaterials = true;
    }
    if (this.ownsMaterials) this.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const m = object.material as THREE.Material;
      m.opacity = opacity;
      m.transparent = opacity < 1;
      m.depthWrite = opacity >= 1;
    });
  }

  private privateMaterial(source: THREE.Material): THREE.Material {
    let copy = this.materialCopies.get(source);
    if (!copy) {
      copy = source.clone();
      copy.opacity = this.opacity;
      copy.transparent = this.opacity < 1;
      copy.depthWrite = this.opacity >= 1;
      this.materialCopies.set(source, copy);
    }
    return copy;
  }

  /** Shared shapes and opaque materials remain available for the next visitor. */
  dispose(): void {
    for (const m of this.materialCopies.values()) m.dispose();
    this.materialCopies.clear();
    this.skeleton.dispose();
    this.removeFromParent();
  }

  private buildGuitar(): THREE.Group {
    const guitar = new THREE.Group();
    guitar.name = "acoustic-guitar";
    guitar.position.set(0.035, 0.09, 0.132);
    guitar.rotation.z = 0.98;
    this.upperBody.add(guitar);
    const body = geometry("original acoustic guitar body", () => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.117);
      s.bezierCurveTo(-0.1, -0.117, -0.105, -0.032, -0.059, 0.006);
      s.bezierCurveTo(-0.037, 0.028, -0.088, 0.06, -0.049, 0.098);
      s.bezierCurveTo(-0.029, 0.117, 0.029, 0.117, 0.049, 0.098);
      s.bezierCurveTo(0.088, 0.06, 0.037, 0.028, 0.059, 0.006);
      s.bezierCurveTo(0.105, -0.032, 0.1, -0.117, 0, -0.117);
      return new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.004, bevelThickness: 0.004, curveSegments: 5 });
    });
    this.part(guitar, "guitar-wood-body", body, material(0xb58b50, "warm guitar wood", 0.77));
    const neck = this.part(guitar, "guitar-neck-and-headstock", geometry("guitar neck and headstock", () => merge([
      new THREE.BoxGeometry(0.026, 0.213, 0.017).translate(0, 0.201, 0.023),
      new THREE.BoxGeometry(0.038, 0.052, 0.019).translate(0, 0.331, 0.023),
    ])), material(0x61503c, "guitar fingerboard", 0.8));
    neck.name = "guitar-neck-and-headstock";
    const hole = this.part(guitar, "guitar-sound-hole", geometry("guitar sound hole", () => new THREE.CircleGeometry(0.025, 16)), material(0x4b4234, "guitar sound hole"), false);
    hole.position.set(0, 0.025, 0.0396);
    const rosette = this.part(guitar, "guitar-rosette", geometry("guitar rosette", () => new THREE.RingGeometry(0.026, 0.029, 16)), material(0xd6b87a, "guitar rosette"), false);
    rosette.position.set(0, 0.025, 0.0398);
    this.part(guitar, "guitar-bridge-and-strings", geometry("guitar bridge and strings", () => {
      const pieces = [new THREE.BoxGeometry(0.06, 0.012, 0.007).translate(0, -0.053, 0.04)];
      for (let i = 0; i < 6; i++) pieces.push(new THREE.BoxGeometry(0.0007, 0.385, 0.0006).translate((i - 2.5) * 0.0033, 0.137, 0.043));
      return merge(pieces);
    }), material(0xc2b69a, "guitar strings", 0.63), false);
    return guitar;
  }

  private buildUmbrella(): THREE.Group {
    const umbrella = new THREE.Group();
    umbrella.name = "olive-umbrella";
    umbrella.position.set(0.18, 0.16, 0.095);
    this.upperBody.add(umbrella);
    const shaft = this.part(umbrella, "umbrella-shaft", tapered("umbrella shaft", 0.0025, 0.0025, 0.50, 6), material(0x655f4d, "umbrella shaft", 0.67), false);
    shaft.position.y = 0.50;
    const canopy = this.part(umbrella, "umbrella-canopy", geometry("umbrella canopy", () => {
      const points = [[0.245, 0], [0.228, 0.025], [0.179, 0.073], [0.105, 0.105], [0.005, 0.118]];
      return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 12);
    }), material(0x6d7764, "olive umbrella canvas", 0.98, THREE.DoubleSide));
    canopy.position.y = 0.49;
    return umbrella;
  }
}
