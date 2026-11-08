// A passing ferry is scenery caused by an actual public horn ingredient.
// It never moves that ingredient, creates a player, or adds another sound.
import * as THREE from "three";
import { PLANET_HALF, planetBasis, planetCoordsValid, planetPoint, planetStep } from "../shared/planet.js";
import type { PlacedSound, Position } from "../shared/protocol.js";
import { authorMark } from "../shared/chorus-signature.js";
import { EXAMPLE_BY, EXAMPLE_ID } from "../shared/sound-life.js";
import type { SoundSignal } from "../shared/sound-response.js";

type Point = { x: number; z: number };
export interface SoundVesselOptions {
  shoreline: (x: number) => number;
  // Include the real pier or any future physical water obstruction here.
  isWater?: (x: number, z: number) => boolean;
  waterHeight?: number;
}
export interface HarbourRoute {
  sourceId: string;
  at: number;
  phase: number;
  anchorX: number;
  anchorZ: number;
}
export interface SoundVesselState {
  sourceId: string;
  byId: string;
  by: string;
  soundId: "harbour-boat";
  sourceX: number;
  sourceZ: number;
  color: string;
  visible: boolean;
  origin?: "example";
  reason?: "budget" | "no-water-route";
  anchorX?: number;
  anchorZ?: number;
  x?: number;
  z?: number;
  yaw?: number;
}
interface Vessel {
  source: PlacedSound;
  route: HarbourRoute;
  model: THREE.Group;
  roofMaterial: THREE.MeshStandardMaterial;
  pose: Position;
}
const TAU = Math.PI * 2, MAX_VESSELS = 3, PERIOD_MS = 86_000;
const roofColor = (byId: string): THREE.Color => new THREE.Color(authorMark(byId).color).lerp(new THREE.Color(0xeee3c9), .2);
const wrap = (x: number): number => ((x + PLANET_HALF) % (PLANET_HALF * 2) + PLANET_HALF * 2) % (PLANET_HALF * 2) - PLANET_HALF;
function phaseFor(id: string): number {
  let hash = 2166136261;
  for (const letter of id) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return (hash >>> 0) / 0x100000000 * TAU;
}
function bearing(from: Point, to: Point): number {
  const target = planetPoint(to.x, to.z), basis = planetBasis(from.x, from.z);
  return Math.atan2(target.x * basis.east.x + target.y * basis.east.y + target.z * basis.east.z,
    target.x * basis.south.x + target.y * basis.south.y + target.z * basis.south.z);
}
function routePoint(route: HarbourRoute, phase: number, options: SoundVesselOptions): Point {
  const x = wrap(route.anchorX + Math.sin(phase) * 6);
  return { x, z: options.shoreline(x) + 3.6 + (1 + Math.cos(phase)) * 1.15 };
}
function isWater(point: Point, options: SoundVesselOptions): boolean {
  const shore = options.shoreline(point.x);
  return planetCoordsValid(point.x, point.z) && Number.isFinite(shore)
    && point.z > shore + .15 && point.z < PLANET_HALF / 2 - .8
    && (!options.isWater || options.isWater(point.x, point.z));
}
function footprintIsWater(pose: Position, options: SoundVesselOptions): boolean {
  if (!isWater(pose, options)) return false;
  // Check the bow, sides and longest wake, not just a point at the cabin.
  for (const [forward, right, distance] of [[1, 0, 1.7], [1, -1, 1.4], [1, 1, 1.4], [0, -1, .7], [0, 1, .7], [-1, -1, 1.3], [-1, 1, 1.3], [-1, -.4, 2.7], [-1, .4, 2.7]]) {
    if (!isWater(planetStep(pose, forward, right, distance), options)) return false;
  }
  return true;
}

/** A pure server-time route sample. No viewer position or frame integration. */
export function harbourVesselPose(route: HarbourRoute, serverNow: number, options: SoundVesselOptions, reducedMotion = false): Position | null {
  if (!Number.isFinite(serverNow)) return null;
  const phase = route.phase + (reducedMotion ? 0 : Math.max(0, serverNow - route.at) / PERIOD_MS * TAU);
  const point = routePoint(route, phase, options), ahead = routePoint(route, phase + .001, options);
  const pose = { ...point, yaw: bearing(point, ahead) };
  return [pose.x, pose.z, pose.yaw].every(Number.isFinite) && footprintIsWater(pose, options) ? pose : null;
}

/** Find one closed offshore route; never interpolate straight across land.
 * Fixed alternate lanes avoid the real pier, and failures remain explicit. */
export function findHarbourRoute(source: Pick<PlacedSound, "id" | "x" | "z" | "at">, options: SoundVesselOptions): HarbourRoute | null {
  const at = Date.parse(source.at);
  if (!planetCoordsValid(source.x, source.z) || !Number.isFinite(at)) return null;
  for (const offset of [0, 8, -8, 16, -16, 24, -24]) {
    const anchorX = wrap(source.x + offset), anchorZ = options.shoreline(anchorX) + 4.75;
    const route = { sourceId: source.id, at, phase: phaseFor(source.id), anchorX, anchorZ };
    let safe = true;
    for (let sample = 0; sample < 96; sample++) {
      if (!harbourVesselPose(route, at + sample / 96 * PERIOD_MS, options)) { safe = false; break; }
    }
    if (safe) return route;
  }
  return null;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [];
  for (const part of parts) {
    const geometry = part.index ? part.toNonIndexed() : part;
    const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal");
    for (let i = 0; i < p.count; i++) { positions.push(p.getX(i), p.getY(i), p.getZ(i)); normals.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (geometry !== part) geometry.dispose();
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
function hull(bottom: number, top: number, lowerScale: number): THREE.BufferGeometry {
  const outline = [[-.47, -.95], [-.55, .45], [-.30, 1.14], [0, 1.43], [.30, 1.14], [.55, .45], [.47, -.95]];
  const vertices: number[] = [], indices: number[] = [];
  for (const [x, z] of outline) vertices.push(x * lowerScale, bottom, z * lowerScale);
  for (const [x, z] of outline) vertices.push(x, top, z);
  const count = outline.length;
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    indices.push(i, next, count + i, next, count + next, count + i);
    if (i > 0 && i < count - 1) indices.push(count, count + i, count + i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export class SoundVessels {
  readonly root = new THREE.Group();
  private readonly templates: { name: string; geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }[] = [];
  private readonly materials = new Set<THREE.Material>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly smoke: THREE.InstancedMesh;
  private readonly wake: THREE.InstancedMesh;
  private readonly pose = new THREE.Object3D();
  private readonly basis = new THREE.Matrix4();
  private readonly east = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly south = new THREE.Vector3();
  private readonly yaw = new THREE.Quaternion();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);
  private vessels = new Map<string, Vessel>();
  private sources: PlacedSound[] = [];
  // World examples (ADR 038) come only through setExamples, after every real
  // horn in the budget, and are never counted as withdrawals.
  private examples: PlacedSound[] = [];
  private get placed(): PlacedSound[] { return [...this.sources, ...this.examples]; }
  private rejected = new Map<string, "budget" | "no-water-route">();
  private removed = new Set<string>();
  private disposed = false;
  private lastNow: number | null = null;
  private reducedMotion = false;

  constructor(parent: THREE.Scene | THREE.Group, private readonly options: SoundVesselOptions) {
    this.root.name = "sound-vessels";
    const material = (color: number): THREE.MeshStandardMaterial => {
      const value = new THREE.MeshStandardMaterial({ color, roughness: .88, metalness: 0, flatShading: true });
      this.materials.add(value); return value;
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const cylinder = (r: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, h, 10).translate(x, y, z);
    const add = (name: string, color: number, parts: THREE.BufferGeometry[]): void => {
      const geometry = merge(parts); geometry.userData.soundVesselPart = name; this.geometries.add(geometry);
      this.templates.push({ name, geometry, material: material(color) });
    };
    add("ferry-hull", 0x64887a, [hull(-.25, .04, .72), cylinder(.13, .42, 0, 1.16, -.32)]);
    add("ferry-cream", 0xeee3c9, [hull(.04, .18, 1), box(.82, .64, .92, 0, .54, -.12)]);
    add("ferry-timber-deck", 0xb18a5d, [hull(.18, .205, 1), box(.045, 1.14, .045, 0, .78, .82)]);
    const ring = new THREE.TorusGeometry(.15, .035, 6, 16).rotateY(Math.PI / 2).translate(.56, .29, -.55);
    const pennant = new THREE.BufferGeometry();
    pennant.setAttribute("position", new THREE.Float32BufferAttribute([0, 1.31, .82, .35, 1.25, .82, 0, 1.13, .82], 3));pennant.computeVertexNormals();
    add("ferry-coral-roof", 0xc58c7b, [box(.99, .1, 1.11, 0, .91, -.12), cylinder(.17, .09, 0, 1.4, -.32), ring, pennant]);
    add("ferry-windows", 0x365f67, [box(.61, .25, .025, 0, .63, .355), box(.61, .25, .025, 0, .63, -.595),
      box(.025, .25, .60, -.425, .63, -.12), box(.025, .25, .60, .425, .63, -.12)]);
    this.templates.at(-1)!.material.emissive.setHex(0x365f67);this.templates.at(-1)!.material.emissiveIntensity = .18;
    add("ferry-brass", 0xd8b778, [cylinder(.025, .3, -.48, .35, .55), cylinder(.025, .3, .48, .35, .55),
      box(.025, .035, .8, -.48, .49, .1), box(.025, .035, .8, .48, .49, .1)]);
    const smokeGeometry = new THREE.SphereGeometry(1, 8, 6), wakeGeometry = new THREE.SphereGeometry(1, 8, 5);
    this.geometries.add(smokeGeometry);this.geometries.add(wakeGeometry);
    const mist = material(0xe9e3cf);mist.transparent = true;mist.opacity = .42;mist.depthWrite = false;
    const foam = material(0xf1ecd6);foam.transparent = true;foam.opacity = .75;foam.depthWrite = false;
    this.smoke = new THREE.InstancedMesh(smokeGeometry, mist, MAX_VESSELS * 3);
    this.wake = new THREE.InstancedMesh(wakeGeometry, foam, MAX_VESSELS * 8);
    for (const [mesh, name] of [[this.smoke, "sound-vessel-smoke"], [this.wake, "sound-vessel-wake"]] as const) {
      mesh.name = name;mesh.count = 0;mesh.frustumCulled = false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);
    }
    parent.add(this.root);
  }

  get state(): SoundVesselState[] {
    return this.placed.map(source => {
      const vessel = this.vessels.get(source.id), reason = this.rejected.get(source.id);
      return { sourceId: source.id, byId: source.byId, by: source.by, soundId: "harbour-boat", sourceX: source.x, sourceZ: source.z,
        color: "#" + (vessel?.roofMaterial.color ?? roofColor(source.byId)).getHexString(),
        visible: !!vessel?.model.visible, ...(source.byId === EXAMPLE_ID ? { origin: "example" as const } : {}), ...(reason ? { reason } : {}),
        ...(vessel ? { anchorX: vessel.route.anchorX, anchorZ: vessel.route.anchorZ, ...vessel.pose } : {}) };
    });
  }

  setSources(sources: readonly PlacedSound[]): void {
    if (this.disposed) return;
    for (const source of sources) if (source.removedAt || source.whileIn) this.removed.add(source.id);
    const seen = new Set<string>();
    this.sources = sources.filter(source => {
      if (seen.has(source.id) || this.removed.has(source.id) || source.soundId !== "harbour-boat"
        || (source as PlacedSound & { origin?: string }).origin || !source.byId || typeof source.by !== "string"
        || !planetCoordsValid(source.x, source.z) || !Number.isFinite(Date.parse(source.at))) return false;
      seen.add(source.id);return true;
    }).map(source => ({ ...source })).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
    this.place();
  }

  /** The world examples showing for this visitor, replaced wholesale. */
  setExamples(examples: readonly SoundSignal[]): void {
    if (this.disposed) return;
    const seen = new Set<string>();
    this.examples = examples.filter(source => source.origin === "example" && source.id.startsWith("@world:") && source.soundId === "harbour-boat"
      && planetCoordsValid(source.x, source.z) && Number.isFinite(Date.parse(source.at)) && !seen.has(source.id) && !!seen.add(source.id))
      .map(({ id, soundId, x, z, at }) => ({ id, soundId, x, z, at, by: EXAMPLE_BY, byId: EXAMPLE_ID }) as PlacedSound);
    this.place();
  }

  private place(): void {
    const wanted = new Set<string>();this.rejected.clear();
    for (const source of this.placed) {
      if (wanted.size === MAX_VESSELS) { this.rejected.set(source.id, "budget");continue; }
      const existing = this.vessels.get(source.id);
      const same = existing && existing.source.x === source.x && existing.source.z === source.z && existing.source.at === source.at;
      const route = same ? existing.route : findHarbourRoute(source, this.options);
      if (!route) { this.rejected.set(source.id, "no-water-route");continue; }
      wanted.add(source.id);
      let vessel = existing;
      if (!vessel) {
        const model = new THREE.Group();model.name = "sound-born-ferry";
        // The roof, pennant, ring and chimney cuff share one author tint and
        // one existing draw call. Only this material belongs to the vessel.
        const roofMaterial = this.templates.find(part => part.name === "ferry-coral-roof")!.material.clone();
        for (const part of this.templates) { const mesh = new THREE.Mesh(part.geometry, part.name === "ferry-coral-roof" ? roofMaterial : part.material);mesh.name = part.name;mesh.castShadow = true;mesh.receiveShadow = true;model.add(mesh); }
        vessel = { source, route, model, roofMaterial, pose: { x: route.anchorX, z: route.anchorZ, yaw: 0 } };
        this.vessels.set(source.id, vessel);this.root.add(model);
      }
      vessel.source = source;vessel.route = route;
      vessel.roofMaterial.color.copy(roofColor(source.byId));
      vessel.model.traverse(object => { object.userData.soundVessel = { sourceId: source.id, byId: source.byId, by: source.by, kind: "passing-ferry" }; });
    }
    for (const [id, vessel] of this.vessels) if (!wanted.has(id)) { vessel.roofMaterial.dispose();vessel.model.removeFromParent();this.vessels.delete(id); }
    // Incremental arrivals and a fresh snapshot use the same instance order,
    // including the translucent smoke and wake and their provenance indices.
    const ordered = new Map<string, Vessel>();
    for (const source of this.placed) {
      const vessel = this.vessels.get(source.id);
      if (vessel) { ordered.set(source.id, vessel);this.root.add(vessel.model); }
    }
    this.vessels = ordered;
    this.frame(this.lastNow ?? Date.parse(this.placed[0]?.at ?? "1970-01-01T00:00:00Z"), this.reducedMotion);
  }

  /** A local viewing suggestion, never a new source or rewritten position.
   * The controller still verifies this point against its walking boundaries. */
  viewpoint(sourceId: string): Position | null {
    const vessel = this.vessels.get(sourceId);
    if (!vessel?.model.visible) return null;
    const point = { x: vessel.route.anchorX, z: this.options.shoreline(vessel.route.anchorX) - 1.6 };
    return planetCoordsValid(point.x, point.z) ? { ...point, yaw: bearing(point, vessel.pose) } : null;
  }

  private orient(object: THREE.Object3D, point: Point, height: number, yaw: number): void {
    const p = planetPoint(point.x, point.z, height), basis = planetBasis(point.x, point.z);
    this.east.set(basis.east.x, basis.east.y, basis.east.z);this.up.set(basis.up.x, basis.up.y, basis.up.z);this.south.set(basis.south.x, basis.south.y, basis.south.z);
    this.basis.makeBasis(this.east, this.up, this.south);
    object.position.set(p.x, p.y, p.z);object.quaternion.setFromRotationMatrix(this.basis).multiply(this.yaw.setFromAxisAngle(this.upAxis, yaw));
  }

  frame(serverNow: number, reducedMotion = false): void {
    if (this.disposed || !Number.isFinite(serverNow)) return;
    this.lastNow = serverNow;this.reducedMotion = reducedMotion;
    const time = reducedMotion ? 0 : serverNow / 1000, water = this.options.waterHeight ?? .08;
    let smokeCount = 0, wakeCount = 0;
    for (const vessel of this.vessels.values()) {
      const point = harbourVesselPose(vessel.route, serverNow, this.options, reducedMotion);
      vessel.model.visible = !!point;if (!point) continue;
      vessel.pose = point;
      this.orient(vessel.model, point, water + (reducedMotion ? 0 : Math.sin(time * 1.1 + vessel.route.phase) * .025), point.yaw);
      if (!reducedMotion) vessel.model.rotateZ(Math.sin(time * .85 + vessel.route.phase) * .025);
      vessel.model.updateMatrix();
      for (let puff = 0; puff < 3; puff++) {
        const age = reducedMotion ? puff / 3 : ((time * .35 + puff / 3 + vessel.route.phase) % 1 + 1) % 1;
        this.pose.position.set(-age * .25, 1.48 + age * .8, -.32 - age * .3).applyMatrix4(vessel.model.matrix);
        this.pose.quaternion.copy(vessel.model.quaternion);this.pose.scale.setScalar(.065 + age * .13);this.pose.updateMatrix();this.smoke.setMatrixAt(smokeCount++, this.pose.matrix);
      }
      if (!reducedMotion) for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
        const wake = planetStep(point, -1, side * (.08 + i * .1), 1.25 + i * .38);
        this.orient(this.pose, wake, water + .025, point.yaw);
        const ripple = .9 + Math.sin(time * 2 + i * 1.4) * .1;
        this.pose.scale.set((.055 + i * .022) * ripple, .013, (.24 + i * .045) * ripple);this.pose.updateMatrix();this.wake.setMatrixAt(wakeCount++, this.pose.matrix);
      }
    }
    this.smoke.count = smokeCount;this.wake.count = wakeCount;
    this.smoke.instanceMatrix.needsUpdate = true;this.wake.instanceMatrix.needsUpdate = true;
    this.smoke.userData.sources = [...this.vessels.values()].filter(vessel => vessel.model.visible).flatMap(vessel => Array(3).fill(vessel.source.id));
    this.wake.userData.sources = reducedMotion ? [] : [...this.vessels.values()].filter(vessel => vessel.model.visible).flatMap(vessel => Array(8).fill(vessel.source.id));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;this.sources = [];this.examples = [];
    for (const vessel of this.vessels.values()) vessel.roofMaterial.dispose();
    this.vessels.clear();this.rejected.clear();this.removed.clear();
    this.smoke.dispose();this.wake.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.root.clear();this.root.removeFromParent();
  }
}
