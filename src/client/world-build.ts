// The toolkit places are built with (client/seaside.ts, client/cafe.ts):
// boxes, floors and cylinders by their extents, canvas textures, flat
// materials, and where a person can stand. Metres: x east, y up, z south.
import * as THREE from "three";

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

// ---- wind ----------------------------------------------------------------

// One clock for the wind, which the world view moves on every frame.
export const wind = { value: 0 };

// Plants lean with the wind: each vertex moves sideways by `strength` times
// the square of its height above the ground (so a tree's top moves, its
// base doesn't), in gusts that pass across the place rather than every
// plant in step.
export function sway(mat: THREE.Material, strength: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float windTime;").replace(
      "#include <project_vertex>",
      `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 swayAt = modelMatrix * mvPosition;
float swayPhase = windTime * 1.1 + swayAt.x * 0.13 + swayAt.z * 0.09;
float swayGust = 0.6 + 0.4 * sin(windTime * 0.23 + swayAt.x * 0.02);
float swayH = max(swayAt.y, 0.0);
swayAt.x += (sin(swayPhase) + 0.35 * sin(swayPhase * 2.7 + 1.3)) * swayGust * ${strength.toFixed(5)} * swayH * swayH;
swayAt.z += 0.5 * cos(swayPhase * 0.83) * swayGust * ${strength.toFixed(5)} * swayH * swayH;
mvPosition = viewMatrix * swayAt;
gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  mat.customProgramCacheKey = () => `sway-${strength}`;
}

export const std = (color: number, more: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...more });

// Can a person of radius r stand at (x, z)?
export function canStand(built: Pick<Built, "walkable" | "solids" | "circles">, x: number, z: number, r = 0.28): boolean {
  if (!built.walkable.some((w) => x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1)) return false;
  if (built.circles?.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2)) return false;
  return !built.solids.some((s) => x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r);
}
