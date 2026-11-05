// The corner café: an imagined place, not a real one. A brick and plaster
// room with a timber floor, a counter with an espresso cart and the till,
// round tables, a bar along the shop window, and the street outside. The
// furniture, food, plants, surfaces and skies are CC0 models and textures
// from Poly Haven (public/assets-manifest.json lists each one); walls,
// windows and tables are simple shapes.
//
// Metres: x east, y up, z south. The room is x 0..14, z 0..10; its glass
// front faces the street at z = 10.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { PlaceKit } from "./places.js";
import { Builder, canvasTexture, std, type Built, type Rect } from "./world-build.js";

const ROOM: Rect = { x0: 0, x1: 14, z0: 0, z1: 10 };
const H = 3.6;
const DOOR = { x0: 6.1, x1: 7.9 };

function inside(x: number, z: number): boolean {
  return x > ROOM.x0 && x < ROOM.x1 && z > ROOM.z0 && z < ROOM.z1;
}

const textureLoader = new THREE.TextureLoader();

// A Poly Haven surface: colour, normal and AO/roughness/metal maps.
function surface(id: string, repeat: [number, number], more: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const load = (map: string, colour = false): THREE.Texture => {
    const t = textureLoader.load(`/assets/textures/${id}/${map}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
    t.anisotropy = 8;
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load("arm");
  return new THREE.MeshStandardMaterial({
    map: load("diffuse", true),
    normalMap: load("nor_gl"),
    aoMap: arm,
    roughnessMap: arm,
    metalnessMap: arm,
    ...more,
  });
}

function build(): Built {
  const b = new Builder();
  const planks = surface("brown_planks_05", [6, 4]);
  const brick = surface("brick_wall_001", [5, 1.6]);
  const brickOut = surface("brick_wall_001", [5, 1.6]);
  const plaster = surface("plastered_wall", [3, 1]);
  const pavement = surface("brick_pavement_02", [10, 3]);
  const asphalt = surface("asphalt_02", [8, 3]);
  const wood = std(0x6b4630, { roughness: 0.6 });
  const darkWood = std(0x3b281c, { roughness: 0.55 });
  const blackMetal = std(0x1d1e20, { metalness: 0.6, roughness: 0.4 });
  const ceiling = std(0x2a2826);
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfd2dc, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false });
  // windows across the street: some lit at dusk (the time of day sets how
  // much), the rest dark glass
  const windows = std(0x2a3038, { emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.3 });
  const darkPanes = std(0x222830, { roughness: 0.25, metalness: 0.2 });
  const bulbs = std(0xfff1dc, { emissive: 0xffc98a, emissiveIntensity: 0.4 });
  const lampHead = std(0x222222, { emissive: 0xffcf8a, emissiveIntensity: 0 });

  // ---- inside --------------------------------------------------------------

  b.floor(planks, 0, 14, 0, 10, 0.005);
  const soffit = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), ceiling);
  soffit.rotation.x = Math.PI / 2;
  soffit.position.set(7, H, 5);
  b.root.add(soffit);
  for (let x = 1.2; x < 14; x += 2.4) b.box(darkWood, x - 0.09, x + 0.09, H - 0.25, H, 0, 10, { shadow: false });

  // back wall in exposed brick, side walls plastered
  b.box(brick, 0, 14, 0, H, -0.25, 0, { occludes: true, solid: true });
  b.box(plaster, -0.25, 0, 0, H, 0, 10, { occludes: true, solid: true });
  b.box(plaster, 14, 14.25, 0, H, 0, 10, { occludes: true, solid: true });
  b.box(darkWood, 0, 14, 0, 0.12, 0.0, 0.03, { shadow: false });

  // the shop front: a low brick sill, big panes, black frames, the door
  for (const [x0, x1] of [
    [0, DOOR.x0],
    [DOOR.x1, 14],
  ]) {
    b.box(brickOut, x0, x1, 0, 0.55, 9.85, 10.15, { solid: true });
    b.box(glass, x0, x1, 0.55, 3.1, 9.97, 10.03, { shadow: false });
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 3) b.box(blackMetal, x - 0.04, x + 0.04, 0.55, 3.1, 9.95, 10.05);
    b.solids.push({ x0, x1, z0: 9.8, z1: 10.2 });
  }
  b.box(blackMetal, 0, 14, 3.1, 3.2, 9.94, 10.06);
  b.box(brickOut, 0, 14, 3.2, H + 0.6, 9.85, 10.15, { occludes: true });
  b.box(blackMetal, DOOR.x0 - 0.06, DOOR.x0, 0, 3.1, 9.9, 10.1);
  b.box(blackMetal, DOOR.x1, DOOR.x1 + 0.06, 0, 3.1, 9.9, 10.1);
  // a striped awning over the front
  const awning = canvasTexture(
    64,
    8,
    (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? "#f1ebe0" : "#2f5d4a";
        g.fillRect(i * 8, 0, 8, 8);
      }
    },
    [6, 1],
  );
  const aw = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 1.7), std(0xffffff, { map: awning, side: THREE.DoubleSide }));
  aw.position.set(7, H + 0.05, 10.75);
  aw.rotation.x = -Math.PI / 2 + 0.45;
  aw.castShadow = true;
  b.root.add(aw);

  // the window bar inside the glass, both sides of the door
  for (const [x0, x1] of [
    [0.2, DOOR.x0 - 0.3],
    [DOOR.x1 + 0.3, 13.8],
  ]) {
    b.box(wood, x0, x1, 1.02, 1.07, 9.35, 9.85, { solid: true });
    for (const x of [x0 + 0.2, x1 - 0.2]) b.box(blackMetal, x - 0.03, x + 0.03, 0, 1.02, 9.6, 9.66);
  }

  // the counter, with a dark front and a timber top
  b.box(darkWood, 3.8, 12.2, 0, 1.0, 2.3, 2.95, { solid: true, occludes: true });
  b.box(wood, 3.75, 12.25, 1.0, 1.06, 2.25, 3.05);
  // the back bar under the shelves
  b.box(darkWood, 3.8, 12.2, 0, 0.9, 0.0, 0.65, { solid: true });
  b.box(wood, 3.8, 12.2, 0.9, 0.95, 0.0, 0.7);
  // a chalk menu on the brick
  const menu = canvasTexture(
    256,
    128,
    (g) => {
      g.fillStyle = "#1f2321";
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = "#e8e2d4";
      g.font = "bold 22px sans-serif";
      g.fillText("COFFEE", 20, 34);
      g.font = "15px sans-serif";
      ["Espresso", "Flat white", "Long black", "Chai", "Pastries"].forEach((t, i) => g.fillText(t, 20, 58 + i * 14));
      ["4.0", "5.0", "4.5", "5.5", "4.5"].forEach((t, i) => g.fillText(t, 200, 58 + i * 14));
    },
    [1, 1],
  );
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), std(0xffffff, { map: menu, roughness: 0.9 }));
  board.position.set(8, 2.4, 0.02);
  b.root.add(board);

  // round café tables (top, stem, foot)
  for (const [x, z] of TABLES) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 28), wood);
    top.position.set(x, 0.74, z);
    top.castShadow = top.receiveShadow = true;
    b.root.add(top);
    b.cylinder(blackMetal, x, z, 0.035, 0.02, 0.72, 8);
    b.cylinder(blackMetal, x, z, 0.24, 0, 0.03, 16);
    b.solids.push({ x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45 });
  }

  const ceilingLights: THREE.PointLight[] = [];
  for (const [x, z] of [...TABLES, [6, 2.6], [10, 2.6]] as [number, number][]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), bulbs);
    bulb.position.set(x, H - 1.1, z);
    b.root.add(bulb);
  }
  for (const [x, z] of [
    [3.6, 6],
    [10.4, 6],
    [7, 2.4],
  ]) {
    const l = new THREE.PointLight(0xffc98a, 0, 9, 1.5);
    l.position.set(x, H - 1.5, z);
    b.root.add(l);
    ceilingLights.push(l);
  }

  // ---- outside -------------------------------------------------------------

  // the café's own front, above and around the glass, in brick
  b.box(brickOut, -0.25, 14.25, H + 0.6, H + 1.4, 9.85, 10.15, { occludes: true });
  b.box(std(0x2a2826), -0.25, 14.25, H + 0.02, H + 0.3, -0.25, 9.85, { occludes: true });
  b.box(brickOut, -6, -0.25, 0, 7, -2, 10.15, { occludes: true, solid: true });
  b.box(plaster, 14.25, 22, 0, 6, -2, 10.15, { occludes: true, solid: true });
  // footpath and road
  const path = b.floor(pavement, -12, 26, 10.15, 14, 0.0);
  path.receiveShadow = true;
  b.box(std(0x8c8a86), -12, 26, 0, 0.14, 13.9, 14.05);
  b.floor(asphalt, -12, 26, 14.05, 24, -0.14);
  for (let x = -10; x < 26; x += 4) b.box(std(0xe8e4da), x, x + 2, -0.135, -0.13, 18.9, 19.1, { shadow: false });
  // buildings across the street, their windows lit at dusk
  for (const [x0, x1, h, colour] of [
    [-12, -2, 10, 0x8d6e5a],
    [-2, 9, 13, 0xb9a891],
    [9, 17, 9, 0x6f7d84],
    [17, 26, 12, 0xa58a6c],
  ] as [number, number, number, number][]) {
    b.box(std(colour, { roughness: 0.9 }), x0, x1, -0.14, h, 25, 31, { occludes: true });
    for (let y = 1.5; y < h - 1; y += 3)
      for (let x = x0 + 0.8; x < x1 - 1.4; x += 2.4)
        b.box(Math.floor(x * 7 + y * 3) % 5 < 3 ? windows : darkPanes, x, x + 1.4, y, y + 1.8, 24.95, 25.0, { shadow: false });
  }
  // a street lamp by the kerb
  b.cylinder(blackMetal, 3, 13.6, 0.07, 0, 4.6, 8);
  b.box(lampHead, 2.75, 3.25, 4.5, 4.7, 13.35, 13.85);
  const lamp = new THREE.PointLight(0xffcf8a, 0, 18, 1.6);
  lamp.position.set(3, 4.3, 13.6);
  b.root.add(lamp);
  b.solids.push({ x0: 2.85, x1: 3.15, z0: 13.45, z1: 13.75 });

  return {
    root: b.root,
    occluders: b.occluders,
    floors: b.floors,
    walkable: [
      { x0: 0.3, x1: 13.7, z0: 0.3, z1: 9.75 }, // the room
      { x0: DOOR.x0 + 0.1, x1: DOOR.x1 - 0.1, z0: 9.5, z1: 10.6 }, // the door
      { x0: -5.5, x1: 21.5, z0: 10.4, z1: 13.7 }, // the footpath
    ],
    solids: b.solids,
    paving: pavement,
    glass,
    windows,
    ceilingStrips: bulbs,
    lampHead,
    lamp,
    ceilingLights,
  };
}

const TABLES: [number, number][] = [
  [2.2, 5.6],
  [4.6, 6.6],
  [9.4, 6.6],
  [11.8, 5.6],
];

// Each model is scaled so its height is what's given, then turned and put
// down at (x, z), sitting on y.
interface Prop {
  id: string;
  height: number;
  at: [number, number];
  y?: number;
  turn?: number;
}

const PROPS: Prop[] = [
  { id: "CoffeeCart_01", height: 1.65, at: [2.0, 1.5], turn: 0 },
  { id: "CashRegister_01", height: 0.42, at: [10.6, 2.6], y: 1.06, turn: Math.PI },
  { id: "croissant", height: 0.06, at: [7.2, 2.62], y: 1.06 },
  { id: "croissant", height: 0.06, at: [7.45, 2.7], y: 1.06, turn: 0.8 },
  { id: "carrot_cake", height: 0.1, at: [6.6, 2.62], y: 1.06 },
  { id: "tea_set_01", height: 0.16, at: [8.4, 2.6], y: 1.06 },
  { id: "tea_set_01", height: 0.16, at: [4.6, 6.6], y: 0.76, turn: 1.2 },
  { id: "steel_frame_shelves_01", height: 2.1, at: [5.0, 0.3] },
  { id: "steel_frame_shelves_01", height: 2.1, at: [11.0, 0.3] },
  ...TABLES.flatMap(([x, z]): Prop[] => [
    { id: "WoodenChair_01", height: 0.92, at: [x, z - 0.75], turn: 0 },
    { id: "WoodenChair_01", height: 0.92, at: [x, z + 0.75], turn: Math.PI },
    { id: "hanging_industrial_lamp", height: 1.0, at: [x, z], y: H - 1.0 },
  ]),
  { id: "hanging_industrial_lamp", height: 1.0, at: [6, 2.6], y: H - 1.0 },
  { id: "hanging_industrial_lamp", height: 1.0, at: [10, 2.6], y: H - 1.0 },
  ...[0.9, 2.2, 3.5, 4.8, 9.2, 10.5, 11.8, 13.1].map((x): Prop => ({ id: "bar_chair_round_01", height: 0.75, at: [x, 8.95] })),
  { id: "shrub_04", height: 0.75, at: [0.6, 3.4], y: 0.42 },
  { id: "shrub_04", height: 0.75, at: [13.4, 3.4], y: 0.42, turn: 2 },
  { id: "shrub_04", height: 0.6, at: [-1.0, 11.0], y: 0.42, turn: 1 },
];

async function furnish(built: Built, progress: (done: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  const ids = [...new Set(PROPS.map((p) => p.id))];
  const models = new Map<string, THREE.Object3D>();
  let done = 0;
  await Promise.all(
    ids.map(async (id) => {
      const gltf = await loader.loadAsync(`/assets/models/${id}/${id}.gltf`);
      const model = gltf.scene;
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
      });
      models.set(id, model);
      progress(++done / ids.length);
    }),
  );
  // plant pots, drawn
  const pot = std(0xa8583a, { roughness: 0.8 });
  for (const p of PROPS) {
    const src = models.get(p.id);
    if (!src) continue;
    const m = src.clone();
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const k = p.height / size.y;
    m.scale.setScalar(k);
    const centre = box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    m.position.set(-centre.x * k, -box.min.y * k, -centre.z * k);
    holder.add(m);
    holder.rotation.y = p.turn ?? 0;
    holder.position.set(p.at[0], p.y ?? 0, p.at[1]);
    built.root.add(holder);
    if (p.id === "shrub_04") {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.19, 0.42, 16), pot);
      c.position.set(p.at[0], 0.21, p.at[1]);
      c.castShadow = c.receiveShadow = true;
      built.root.add(c);
      built.solids.push({ x0: p.at[0] - 0.3, x1: p.at[0] + 0.3, z0: p.at[1] - 0.3, z1: p.at[1] + 0.3 });
    }
    if (p.id === "CoffeeCart_01" || p.id === "steel_frame_shelves_01") {
      const half = new THREE.Box3().setFromObject(holder);
      built.solids.push({ x0: half.min.x, x1: half.max.x, z0: half.min.z, z1: half.max.z });
    }
  }
}

export const cafeKit: PlaceKit = {
  build,
  furnish,
  isInside: inside,
  zoneAt(x, z) {
    if (!inside(x, z)) return "street";
    if (z < 4.8) return "counter";
    if (z > 8.2) return "window";
    return "tables";
  },
  passerPaths: [
    [
      [-5, 12.2],
      [21, 12.4],
    ],
    [
      [20, 11.4],
      [7, 11.6],
      [7, 9.4],
      [7, 4.2],
      [9.6, 3.6],
    ],
    [
      [-4, 13.1],
      [21, 13.0],
    ],
    [
      [7.4, 9.2],
      [7.4, 4.0],
      [5.6, 3.6],
    ],
  ],
  rainAt(r) {
    return [-12 + r() * 38, 10.6 + r() * 14];
  },
  sunTarget: [7, 0, 10],
  // the shop front faces the street to the south: a low morning sun comes in
  // through the glass and across the floor
  sunDirs: { morning: [0.62, 0.24, 0.75], weekday: [0.25, 0.88, 0.42] },
  skies: {
    morning: { url: "/assets/skies/qwantani_dawn_puresky.hdr", intensity: 1 },
    weekday: { url: "/assets/skies/qwantani_noon_puresky.hdr", intensity: 1 },
    "rainy-dusk": { url: "/assets/skies/kloppenheim_01_puresky.hdr", intensity: 0.28 },
  },
};
