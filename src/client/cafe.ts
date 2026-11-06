// The café's room, which the seaside puts on its boardwalk: an imagined
// place, not a real one. A brick and plaster room with a timber floor, a
// counter with an espresso cart and the till, round tables, and a bar along
// the glass front. The furniture, food, plants and surfaces are CC0 models
// and textures from Poly Haven (public/assets-manifest.json lists each one);
// walls, windows and tables are simple shapes.
//
// Metres: x east, y up, z south. The room is x 0..14, z 0..10; its glass
// front is at z = 10.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Builder, canvasTexture, std, type Rect } from "./world-build.js";

const H = 3.6;
const DOOR = { x0: 6.1, x1: 7.9 };

const textureLoader = new THREE.TextureLoader();

// A Poly Haven surface: colour, normal and AO/roughness/metal maps.
export function surface(id: string, repeat: [number, number], more: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const load = (map: string, colour = false): THREE.Texture => {
    const t = textureLoader.load(`/assets/textures/${id}/${map}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
    t.anisotropy = 8;
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load("arm");
  const material = new THREE.MeshStandardMaterial({
    map: load("diffuse", true),
    normalMap: load("nor_gl"),
    aoMap: arm,
    roughnessMap: arm,
    metalnessMap: arm,
    normalScale: new THREE.Vector2(0.2, 0.2),
    roughness: 0.94,
    ...more,
  });
  // The licensed scans supply quiet grain and wear. A broad pigment colour
  // keeps sand, timber, plaster and bark in the same restrained art language.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      float surfaceValue = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(vec3(surfaceValue), diffuseColor.rgb, 0.70);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * 0.60, 0.30);`);
  };
  material.customProgramCacheKey = () => "quiet-light-surface-v1";
  return material;
}

// The CC0 lamps use physical transmission for tiny glass pieces (one lantern
// even tags its brass shell as transmissive). That requests a second complete
// opaque-scene render. Keep the metal's colour/maps/metalness, and give only
// named glass pieces a quiet, single-pass alpha surface instead.
export function prepareLampMaterials(model: THREE.Object3D): void {
  const copies = new Map<THREE.Material, THREE.Material>();
  const prepare = (original: THREE.Material): THREE.Material => {
    const physical = original as THREE.MeshPhysicalMaterial;
    const glass = original.name.endsWith("_glass");
    if (!glass && !(physical.transmission > 0)) return original;
    const existing = copies.get(original);
    if (existing) return existing;
    const material = original.clone() as THREE.MeshPhysicalMaterial;
    if (material.isMeshPhysicalMaterial) material.transmission = 0;
    if (glass) {
      material.transparent = true;
      material.opacity = 0.20;
      material.depthWrite = false;
      material.forceSinglePass = true;
      material.roughness = Math.max(0.2, material.roughness);
    }
    copies.set(original, material);
    return material;
  };
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(prepare) : prepare(mesh.material);
  });
}

// The room itself, its shop front facing +z: everything but the street. A
// place puts it wherever it likes by moving the Builder's root.
export interface CafeRoom {
  glass: THREE.MeshStandardMaterial;
  bulbs: THREE.MeshStandardMaterial;
  ceilingLights: THREE.PointLight[];
  walkable: Rect[];
}

export function buildCafeRoom(b: Builder): CafeRoom {
  const planks = surface("brown_planks_05", [6, 4]);
  const brick = surface("brick_wall_001", [5, 1.6]);
  const brickOut = surface("plastered_wall", [3.5, 1.4]);
  brickOut.color.setHex(0xe8dfc8);
  brickOut.normalScale.setScalar(0.45);
  const plaster = surface("plastered_wall", [3, 1]);
  const wood = std(0x8c7150, { roughness: 0.88 });
  const darkWood = std(0x554a38, { roughness: 0.9 });
  const blackMetal = std(0x1d1e20, { metalness: 0.6, roughness: 0.4 });
  const ceiling = std(0x575347);
  const joinery = std(0x9c8460, { roughness: 0.92 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xb7c9bd, transparent: true, opacity: 0.12, roughness: 0.16, metalness: 0.02, depthWrite: false });
  const bulbs = std(0xfff1dc, { emissive: 0xffc98a, emissiveIntensity: 0.4 });

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
    b.box(joinery, x0, x1, 0.50, 0.59, 9.77, 10.26);
    b.box(glass, x0, x1, 0.55, 3.1, 9.97, 10.03, { shadow: false });
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 3) b.box(joinery, x - 0.075, x + 0.075, 0.55, 3.25, 9.78, 10.23);
    b.solids.push({ x0, x1, z0: 9.8, z1: 10.2 });
  }
  b.box(darkWood, -0.15, 14.15, 3.08, 3.29, 9.76, 10.28);
  b.box(joinery, -0.15, 14.15, 3.29, 3.40, 9.76, 10.24);
  b.box(brickOut, 0, 14, 3.4, H + 0.35, 9.85, 10.15, { occludes: true });
  b.box(joinery, DOOR.x0 - 0.10, DOOR.x0, 0, 3.29, 9.76, 10.25);
  b.box(joinery, DOOR.x1, DOOR.x1 + 0.10, 0, 3.29, 9.76, 10.25);
  // Low olive canvas has a little sag and stitched hems. The doorway and
  // floor are unchanged; all new supports sit above people's heads.
  const awning = canvasTexture(256, 128, (g) => {
    g.fillStyle = "#747b5d"; g.fillRect(0, 0, 256, 128);
    const r = (n: number): number => Math.sin(n * 13.7) * 0.5 + 0.5;
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(224,219,179,${0.02 + r(i) * 0.035})`;
      g.fillRect(r(i + 1) * 256, r(i + 3) * 128, 1, 1);
    }
    g.strokeStyle = "#aaa88a"; g.lineWidth = 1;
    for (const y of [6, 120]) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  }, [4, 1]);
  const cloth = std(0xffffff, { map: awning, side: THREE.DoubleSide, roughness: 1 });
  const awGeometry = new THREE.PlaneGeometry(14.7, 1.92, 28, 4);
  const ap = awGeometry.attributes.position;
  for (let i = 0; i < ap.count; i++) {
    ap.setZ(i, -0.055 * Math.sin((ap.getY(i) / 1.92 + 0.5) * Math.PI)
      - 0.025 * Math.sin(ap.getX(i) * 2.3));
  }
  awGeometry.computeVertexNormals();
  const aw = new THREE.Mesh(awGeometry, cloth);
  aw.position.set(7, 3.48, 10.88);
  aw.rotation.x = -Math.PI / 2 + 0.31;
  aw.castShadow = aw.receiveShadow = true;
  b.root.add(aw);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(14.7, 0.23), cloth);
  valance.position.set(7, 3.08, 11.79);
  valance.castShadow = true;
  b.root.add(valance);
  b.box(darkWood, -0.36, 14.36, 3.88, 4.07, 10.04, 10.48);
  for (const x of [0.12, 4.25, 9.75, 13.88]) {
    const bracket = b.box(darkWood, x - 0.035, x + 0.035, 3.05, 3.75, 10.17, 11.44, { shadow: false });
    // A shallow diagonal, tucked beneath the cloth, reads as visible joinery.
    bracket.rotation.x = -0.18;
  }

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

  // A shallow pitched roof, deep eaves and exposed rafter ends replace the
  // old tall parapet. The interior ceiling and every room footprint stay put.
  const roofMat = std(0x596356, { roughness: 0.98, side: THREE.DoubleSide });
  const roof = new THREE.BufferGeometry();
  roof.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.72, 4.02, -0.62, 14.72, 4.02, -0.62, 14.72, 5.10, 4.7,
    -0.72, 4.02, -0.62, 14.72, 5.10, 4.7, -0.72, 5.10, 4.7,
    -0.72, 5.10, 4.7, 14.72, 5.10, 4.7, 14.72, 4.02, 10.62,
    -0.72, 5.10, 4.7, 14.72, 4.02, 10.62, -0.72, 4.02, 10.62,
  ], 3));
  roof.computeVertexNormals();
  const roofMesh = new THREE.Mesh(roof, roofMat);
  roofMesh.castShadow = roofMesh.receiveShadow = true;
  b.root.add(roofMesh);
  b.occluders.push(roofMesh);
  for (const z of [-0.54, 10.48]) b.box(darkWood, -0.72, 14.72, 3.90, 4.06, z, z + 0.12);
  for (let x = 0.25; x < 14.5; x += 1.2) {
    b.box(joinery, x - 0.06, x + 0.06, 3.80, 4.00, 9.88, 10.6, { shadow: false });
  }
  b.box(std(0x3f453c), -0.25, 14.25, H + 0.02, H + 0.3, -0.25, 9.85, { occludes: true });

  return {
    glass,
    bulbs,
    ceilingLights,
    walkable: [
      { x0: 0.3, x1: 13.7, z0: 0.3, z1: 9.75 }, // the room
      { x0: DOOR.x0 + 0.1, x1: DOOR.x1 - 0.1, z0: 9.5, z1: 10.6 }, // the door
    ],
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

// Loads the café's furniture into `parent` (the room's root, wherever it has
// been put), adding what can't be walked through to `solids`.
export async function furnishCafe(parent: THREE.Object3D, solids: Rect[], progress: (done: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  const ids = [...new Set(PROPS.map((p) => p.id))];
  const models = new Map<string, THREE.Object3D>();
  let done = 0;
  await Promise.all(
    ids.map(async (id) => {
      const gltf = await loader.loadAsync(`/assets/models/${id}/${id}.gltf`);
      const model = gltf.scene;
      if (id === "hanging_industrial_lamp") prepareLampMaterials(model);
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
      });
      models.set(id, model);
      progress(++done / ids.length);
    }),
  );
  // plant pots, drawn
  const potTexture = canvasTexture(256, 128, (g) => {
    g.fillStyle = "#c0b39a"; g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#bab09b";
    for (let i = 0; i < 90; i++) g.fillRect((i * 73) % 256, (i * 37) % 128, 2, 1);
    g.strokeStyle = "#818c70"; g.lineWidth = 3;
    for (let x = 16; x < 256; x += 32) {
      g.beginPath(); g.moveTo(x, 100); g.quadraticCurveTo(x + 9, 82, x + 2, 61); g.stroke();
      for (let y = 68; y < 98; y += 12) {
        g.beginPath(); g.ellipse(x + 2, y, 7, 2, -0.55, 0, Math.PI * 2); g.stroke();
      }
    }
  }, [1, 1]);
  const pot = std(0xffffff, { map: potTexture, roughness: 1, flatShading: false });
  const profile = [[0, 0], [0.17, 0], [0.20, 0.04], [0.27, 0.27], [0.26, 0.40],
    [0.28, 0.42], [0.28, 0.46], [0.245, 0.46], [0.24, 0.41]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const potGeometry = new THREE.LatheGeometry(profile, 18);
  const soil = std(0x4e4c3b, { roughness: 1 });
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
    parent.add(holder);
    parent.updateMatrixWorld(true);
    if (p.id === "shrub_04") {
      const c = new THREE.Mesh(potGeometry, pot);
      c.position.set(p.at[0], 0, p.at[1]);
      c.castShadow = c.receiveShadow = true;
      parent.add(c);
      const earth = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.018, 18), soil);
      earth.position.set(p.at[0], 0.42, p.at[1]);
      parent.add(earth);
      const at = parent.localToWorld(new THREE.Vector3(p.at[0], 0, p.at[1]));
      solids.push({ x0: at.x - 0.3, x1: at.x + 0.3, z0: at.z - 0.3, z1: at.z + 0.3 });
    }
    if (p.id === "CoffeeCart_01" || p.id === "steel_frame_shelves_01") {
      const half = new THREE.Box3().setFromObject(holder);
      solids.push({ x0: half.min.x, x1: half.max.x, z0: half.min.z, z1: half.max.z });
    }
  }
}
