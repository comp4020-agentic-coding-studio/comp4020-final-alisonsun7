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
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
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
    t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  const arm = load("arm");
  return new THREE.MeshStandardMaterial({
    map: load("diffuse", true),
    normalMap: load("nor_gl"),
    aoMap: arm,
    roughnessMap: arm,
    metalnessMap: arm,
    normalScale: new THREE.Vector2(0.2, 0.2),
    roughness: 0.94,
    ...more,
  });
}

// A painted surface keeps a little licensed grain, while its colour and
// lighting belong to this world instead of the photograph's baked shadows.
export function paintedSurface(id: string, repeat: [number, number], colour: number, detail = 0.22): THREE.MeshStandardMaterial {
  const material = surface(id, repeat, { color: colour, roughness: 0.96, metalness: 0 });
  material.normalScale.setScalar(0.075);
  material.userData.dryColour = colour;
  material.aoMap = material.roughnessMap = material.metalnessMap = null;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
      #ifdef USE_MAP
        vec3 paintedSample = texture2D(map, vMapUv).rgb;
        float paintedGrain = dot(paintedSample, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb *= ${1 - detail} + paintedGrain * ${detail * 1.6};
      #endif`);
  };
  material.customProgramCacheKey = () => `painted-coast-grain-v2-${detail}`;
  return material;
}

// A few millimetres of eased edge catch the sun without changing the box's
// extents, collision or occlusion. Timber UVs run along the actual member,
// with the scan's eight boards covering about 2.5 metres across the grain.
function easedBox(b: Builder, material: THREE.Material, bounds: [number, number, number, number, number, number],
  radius = 0.008, grain?: "x" | "y" | "z", options: Parameters<Builder["box"]>[7] = {}): THREE.Mesh {
  const [x0, x1, y0, y1, z0, z1] = bounds;
  const mesh = b.box(material, ...bounds, options);
  mesh.geometry.dispose();
  const geometry = new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 1, radius);
  if (grain) {
    const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const along = grain === "y" ? p.getY(i) : grain === "z" ? p.getZ(i) : p.getX(i);
      const across = grain === "y" ? (Math.abs(n.getZ(i)) > Math.abs(n.getX(i)) ? p.getX(i) : p.getZ(i))
        : grain === "z" ? (Math.abs(n.getY(i)) > Math.abs(n.getX(i)) ? p.getX(i) : p.getY(i))
          : (Math.abs(n.getY(i)) > Math.abs(n.getZ(i)) ? p.getZ(i) : p.getY(i));
      uv.setXY(i, along / 2.5 + 0.31, across / 2.5 + 0.0625);
    }
  }
  mesh.geometry = geometry;
  return mesh;
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
  const planks = paintedSurface("brown_planks_05", [6, 4], 0xc8a77c);
  const brick = paintedSurface("brick_wall_001", [5, 1.6], 0xb57f64);
  const brickOut = paintedSurface("plastered_wall", [3.5, 1.4], 0xeee2c8);
  const plaster = paintedSurface("plastered_wall", [3, 1], 0xeee5d0);
  const wood = paintedSurface("brown_planks_05", [1, 1], 0xc6a478);
  const darkWood = std(0x8a6c50, { roughness: 0.96 });
  const blackMetal = std(0x1d1e20, { metalness: 0.6, roughness: 0.4 });
  const ceiling = std(0xc4bda6);
  const joinery = paintedSurface("brown_planks_05", [1, 1], 0x729584);
  const beamWood = paintedSurface("brown_planks_05", [1, 1], 0x587b6a);
  const limewash = paintedSurface("plastered_wall", [3, 1], 0xeee1c7);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xe2eee9, transparent: true, opacity: 0.18, roughness: 0.12,
    metalness: 0, transmission: 0, clearcoat: 0.3, clearcoatRoughness: 0.16,
    specularIntensity: 0.45, envMapIntensity: 0.55, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true,
  });
  const bulbs = std(0xfff0d1, { emissive: 0xffc079, emissiveIntensity: 0.55, roughness: 0.9, flatShading: false, side: THREE.DoubleSide });

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

  // Thin timber reveals around a single glass surface: a box would apply
  // opacity twice and turn the view into the room a milky grey.
  for (const [x0, x1] of [
    [0, DOOR.x0],
    [DOOR.x1, 14],
  ]) {
    easedBox(b, brickOut, [x0, x1, 0, 0.55, 9.85, 10.15], 0.018, undefined, { solid: true });
    easedBox(b, joinery, [x0, x1, 0.50, 0.59, 9.77, 10.26], 0.012, "x");
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 2.55), glass);
    pane.position.set((x0 + x1) / 2, 1.825, 10.008);
    b.root.add(pane);
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 3) {
      easedBox(b, joinery, [x - 0.05, x + 0.05, 0.55, 3.25, 9.88, 10.12], 0.006, "y");
    }
    easedBox(b, joinery, [x0, x1, 1.54, 1.59, 9.96, 10.06], 0.004, "x", { shadow: false });
    b.solids.push({ x0, x1, z0: 9.8, z1: 10.2 });
  }
  easedBox(b, beamWood, [-0.15, 14.15, 3.08, 3.29, 9.88, 10.16], 0.012, "x");
  easedBox(b, limewash, [-0.15, 14.15, 3.29, 3.40, 9.88, 10.16], 0.012);
  easedBox(b, brickOut, [0, 14, 3.4, H + 0.35, 9.85, 10.15], 0.024, undefined, { occludes: true });
  easedBox(b, joinery, [DOOR.x0 - 0.10, DOOR.x0, 0, 3.29, 9.88, 10.16], 0.008, "y");
  easedBox(b, joinery, [DOOR.x1, DOOR.x1 + 0.10, 0, 3.29, 9.88, 10.16], 0.008, "y");
  // Low olive canvas has a little sag and stitched hems. The doorway and
  // floor are unchanged; all new supports sit above people's heads.
  const awning = canvasTexture(256, 128, (g) => {
    g.fillStyle = "#739588"; g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#eee1bc";
    for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 32, 128);
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
  aw.position.set(7, 3.18, 10.88);
  aw.rotation.x = -Math.PI / 2 + 0.31;
  aw.castShadow = aw.receiveShadow = true;
  b.root.add(aw);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(14.7, 0.23), cloth);
  valance.position.set(7, 2.78, 11.79);
  valance.castShadow = true;
  b.root.add(valance);
  easedBox(b, beamWood, [-0.36, 14.36, 3.88, 4.07, 10.04, 10.48], 0.016, "x");
  for (const x of [0.12, 4.25, 9.75, 13.88]) {
    const start = new THREE.Vector3(x, 2.82, 10.18), end = new THREE.Vector3(x, 3.06, 11.73);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, start.distanceTo(end), 7), darkWood);
    strut.position.copy(start).add(end).multiplyScalar(0.5);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    strut.castShadow = true; b.root.add(strut);
  }

  // the window bar inside the glass, both sides of the door
  for (const [x0, x1] of [
    [0.2, DOOR.x0 - 0.3],
    [DOOR.x1 + 0.3, 13.8],
  ]) {
    easedBox(b, wood, [x0, x1, 1.02, 1.07, 9.35, 9.85], 0.012, "x", { solid: true });
    for (const x of [x0 + 0.2, x1 - 0.2]) b.box(blackMetal, x - 0.03, x + 0.03, 0, 1.02, 9.6, 9.66);
  }

  // the counter, with a dark front and a timber top
  b.box(darkWood, 3.8, 12.2, 0, 1.0, 2.3, 2.95, { solid: true, occludes: true });
  easedBox(b, wood, [3.75, 12.25, 1.0, 1.06, 2.25, 3.05], 0.012, "x");
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
      g.font = "18px Georgia, serif";
      g.fillText("Coffee & tea", 20, 34);
      g.font = "15px sans-serif";
      ["Espresso", "Flat white", "Long black", "Chai", "Pastries"].forEach((t, i) => g.fillText(t, 20, 58 + i * 14));
      ["4.0", "5.0", "4.5", "5.5", "4.5"].forEach((t, i) => g.fillText(t, 200, 58 + i * 14));
    },
    [1, 1],
  );
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), std(0xffffff, { map: menu, roughness: 0.9 }));
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

  // Paper shades replace the conspicuous industrial fittings at the same
  // six ceiling positions. The folded profile and fine hoops have real depth.
  const shadeProfile = [
    [0.075, -0.19], [0.15, -0.17], [0.214, -0.11], [0.245, -0.04],
    [0.247, 0.025], [0.22, 0.105], [0.15, 0.17], [0.075, 0.19],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const shadeGeometry = new THREE.LatheGeometry(shadeProfile, 32);
  const seams: number[] = [];
  for (const [r, y] of [[0.15, -0.17], [0.214, -0.11], [0.245, -0.04], [0.247, 0.025], [0.22, 0.105], [0.15, 0.17]]) {
    for (let i = 0; i < 40; i++) {
      for (const a of [i, i + 1]) seams.push(Math.cos(a / 40 * Math.PI * 2) * (r + 0.001), y, Math.sin(a / 40 * Math.PI * 2) * (r + 0.001));
    }
  }
  const seamGeometry = new THREE.BufferGeometry();
  seamGeometry.setAttribute("position", new THREE.Float32BufferAttribute(seams, 3));
  const seamMaterial = new THREE.LineBasicMaterial({ color: 0x9e7951, transparent: true, opacity: 0.25, depthWrite: false });
  const cordGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.65, 6);
  const ceilingLights: THREE.PointLight[] = [];
  for (const [x, z] of [...TABLES, [6, 2.6], [10, 2.6]] as [number, number][]) {
    const shade = new THREE.Mesh(shadeGeometry, bulbs);
    shade.position.set(x, 2.76, z);
    shade.receiveShadow = true;
    const hoops = new THREE.LineSegments(seamGeometry, seamMaterial);
    hoops.position.copy(shade.position);
    const cord = new THREE.Mesh(cordGeometry, blackMetal);
    cord.position.set(x, 3.275, z);
    b.root.add(shade, hoops, cord);
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
  // Local warm fill behind the glass, separate from the room's general
  // lights so the world can preserve it in daylight and dim it at night.
  for (const x of [2.7, 11.3]) {
    const light = new THREE.PointLight(0xffca8c, 2.2, 4.5, 2);
    light.position.set(x, 2.45, 8.15);
    light.castShadow = false;
    light.userData.cafeAccent = true;
    light.userData.cafeAccentIntensity = 2.2;
    b.root.add(light);
    ceilingLights.push(light);
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
  for (const z of [-0.54, 10.48]) easedBox(b, beamWood, [-0.72, 14.72, 3.90, 4.06, z, z + 0.12], 0.01, "x");
  for (let x = 0.25; x < 14.5; x += 1.2) {
    easedBox(b, joinery, [x - 0.06, x + 0.06, 3.80, 4.00, 9.88, 10.6], 0.006, "z", { shadow: false });
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
  variant?: number;
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
  ]),
  ...[0.9, 2.2, 3.5, 4.8, 9.2, 10.5, 11.8, 13.1].map((x): Prop => ({ id: "bar_chair_round_01", height: 0.75, at: [x, 8.95] })),
  { id: "shrub_04", height: 0.75, at: [0.6, 3.4], y: 0.42 },
  { id: "shrub_04", height: 0.75, at: [13.4, 3.4], y: 0.42, turn: 2 },
  { id: "shrub_04", height: 0.6, at: [-1.0, 11.0], y: 0.42, turn: 1 },
  { id: "shrub_04", height: 0.55, at: [12.8, 10.7], y: 0.40, turn: 0.5 },
  { id: "shrub_04", height: 0.55, at: [3.8, 10.7], y: 0.40, turn: 1.8 },
  // Existing Poly Haven fern variants sit on the already solid window bar;
  // they add no new obstruction or walking boundary.
  { id: "fern_02", height: 0.42, at: [1.45, 9.5], y: 1.30, turn: 0.4, variant: 0 },
  { id: "fern_02", height: 0.47, at: [12.5, 9.5], y: 1.30, turn: 2.1, variant: 1 },
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
    // The fern asset contains four plants laid out in a square for selection,
    // rather than one plant; use a single specimen in each ceramic vessel.
    const m = (p.id === "fern_02" ? src.children[p.variant ?? 0] : src).clone();
    if (p.id === "fern_02") { m.position.set(0, 0, 0); m.updateMatrixWorld(true); }
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
    if (p.id === "shrub_04" || p.id === "fern_02") {
      const onBar = p.id === "fern_02";
      const base = onBar ? 1.07 : 0;
      const c = new THREE.Mesh(potGeometry, pot);
      c.position.set(p.at[0], base, p.at[1]);
      const potScale = ((p.y ?? 0.42) - base) / 0.42; c.scale.setScalar(potScale);
      c.castShadow = c.receiveShadow = true;
      parent.add(c);
      const earth = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.018, 18), soil);
      earth.position.set(p.at[0], base + 0.42 * potScale, p.at[1]);
      earth.scale.set(potScale, 1, potScale);
      parent.add(earth);
      if (!onBar) {
        const at = parent.localToWorld(new THREE.Vector3(p.at[0], 0, p.at[1]));
        solids.push({ x0: at.x - 0.3 * potScale, x1: at.x + 0.3 * potScale, z0: at.z - 0.3 * potScale, z1: at.z + 0.3 * potScale });
      }
    }
    if (p.id === "CoffeeCart_01" || p.id === "steel_frame_shelves_01") {
      const half = new THREE.Box3().setFromObject(holder);
      solids.push({ x0: half.min.x, x1: half.max.x, z0: half.min.z, z1: half.max.z });
    }
  }
  // One small stoneware vase and loose flowering stems on the window bar.
  // It lives above an existing solid, never in the doorway or the promenade.
  const vase = new THREE.Group();
  vase.position.set(4.65, 1.07, 9.52);
  const vaseProfile = [[0, 0], [0.10, 0], [0.125, 0.07], [0.115, 0.20], [0.065, 0.27], [0.062, 0.33], [0.049, 0.33], [0.05, 0.29]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const vessel = new THREE.Mesh(new THREE.LatheGeometry(vaseProfile, 24), std(0xaeb3a0, { roughness: 0.55, flatShading: false }));
  vessel.castShadow = vessel.receiveShadow = true;
  vase.add(vessel);
  const twigMaterial = std(0x777654, { roughness: 0.95 });
  const blossomMaterial = std(0xf0e9d4, { roughness: 0.86, flatShading: false });
  const blossoms = new THREE.InstancedMesh(new THREE.SphereGeometry(0.024, 7, 5), blossomMaterial, 18);
  const blossom = new THREE.Object3D();
  for (let stem = 0; stem < 3; stem++) {
    const a = stem * 2.4 + 0.3, height = 0.62 + stem * 0.065;
    const tip = new THREE.Vector3(Math.cos(a) * 0.23, height, Math.sin(a) * 0.16);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.25, 0), new THREE.Vector3(tip.x * 0.35, 0.47, tip.z * 0.35), tip);
    vase.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.0028, 5, false), twigMaterial));
    for (let j = 0; j < 6; j++) {
      const t = 0.55 + j * 0.08, p = curve.getPoint(t), side = j % 2 ? -1 : 1;
      blossom.position.set(p.x + Math.cos(a + 1.2) * side * 0.025, p.y, p.z + Math.sin(a + 1.2) * side * 0.025);
      blossom.scale.set(1.2, 0.6, 1); blossom.rotation.set(0, a, j * 0.7); blossom.updateMatrix();
      blossoms.setMatrixAt(stem * 6 + j, blossom.matrix);
    }
  }
  blossoms.computeBoundingSphere(); vase.add(blossoms); parent.add(vase);
  const porchPlants = PROPS.filter(p => p.id === "shrub_04" && p.at[1] > 10.5);
  const flowerCount = porchPlants.length * 16;
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.032, 7, 4), std(0xeee5cd, { roughness: 1 }), flowerCount);
  const stalks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0035, 0.0045, 1, 5), std(0x7c8964, { roughness: 1 }), flowerCount);
  const flowerDummy = new THREE.Object3D();
  porchPlants.forEach((p, plant) => {
    for (let j = 0; j < 16; j++) {
      const a = j * 2.399, radius = 0.10 + ((j * 7) % 11) / 11 * 0.25;
      const x = p.at[0] + Math.cos(a) * radius, z = p.at[1] + Math.sin(a) * radius;
      const top = (p.y ?? 0.5) + 0.38 + ((j * 3) % 7) * 0.035;
      const bottom = p.y ?? 0.5, height = top - bottom, i = plant * 16 + j;
      flowerDummy.position.set(x, top, z); flowerDummy.scale.set(1, 0.38, 1); flowerDummy.rotation.set(0, 0, 0); flowerDummy.updateMatrix(); heads.setMatrixAt(i, flowerDummy.matrix);
      flowerDummy.position.set(x, bottom + height / 2, z); flowerDummy.scale.set(1, height, 1); flowerDummy.updateMatrix(); stalks.setMatrixAt(i, flowerDummy.matrix);
    }
  });
  heads.computeBoundingSphere(); stalks.computeBoundingSphere(); parent.add(heads, stalks);
}
