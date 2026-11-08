// Small, volumetric visitors belong to actual sound sources, not fabricated
// players. World examples are labelled separately by the discovery UI.
import * as THREE from "three";
import { planetBasis, planetCoordsValid, planetPoint, planetStep } from "../shared/planet.js";
import { wildlifeKind } from "../shared/sound-life.js";
import type { SoundSignal } from "../shared/sound-response.js";

type Kind = "bird" | "gull";
export interface SoundWildlifeState {
  sourceId: string;
  kind: Kind;
  origin: "example" | "player";
  count: number;
  x: number;
  z: number;
}
interface Flock extends SoundWildlifeState { phase: number }
interface Species { body: THREE.InstancedMesh; left: THREE.InstancedMesh; right: THREE.InstancedMesh }
const MAX_BIRDS = 12, MAX_SOURCES = MAX_BIRDS / 2;
const up = new THREE.Vector3(0, 1, 0), flapAxis = new THREE.Vector3(0, 0, 1);

function phaseFor(id: string): number {
  let hash = 2166136261;
  for (const letter of id) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return (hash >>> 0) / 0x100000000 * Math.PI * 2;
}

/** Bake several low-poly solids and their colours into one draw geometry. */
function combine(parts: { geometry: THREE.BufferGeometry; color: number }[]): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  for (const part of parts) {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal"), color = new THREE.Color(part.color);
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(color.r, color.g, color.b);
    }
    if (geometry !== part.geometry) geometry.dispose();
    part.geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function bodyGeometry(kind: Kind): THREE.BufferGeometry {
  const gull = kind === "gull", plumage = gull ? 0xf6f1df : 0x688a78, breast = gull ? 0xf6f1df : 0xc8ba83;
  const solid = (size: [number, number, number], at: [number, number, number]): THREE.BufferGeometry =>
    new THREE.SphereGeometry(1, 8, 5).scale(...size).translate(...at);
  const tail = new THREE.ConeGeometry(gull ? .075 : .055, gull ? .21 : .15, 4)
    .rotateX(-Math.PI / 2).translate(0, -.015, gull ? -.3 : -.2);
  const beak = new THREE.ConeGeometry(gull ? .036 : .026, gull ? .12 : .075, 4)
    .rotateX(Math.PI / 2).translate(0, .063, gull ? .4 : .285);
  return combine([
    { geometry: solid(gull ? [.135, .115, .26] : [.115, .12, .17], [0, 0, 0]), color: plumage },
    { geometry: solid(gull ? [.09, .08, .16] : [.09, .09, .11], [0, -.045, .03]), color: breast },
    { geometry: solid(gull ? [.105, .1, .12] : [.09, .085, .09], [0, .055, gull ? .245 : .17]), color: plumage },
    { geometry: tail, color: gull ? 0xa2aaa5 : 0x435e52 },
    { geometry: beak, color: 0xcb9b50 },
    ...[-1, 1].map(sign => ({ geometry: solid([.013, .016, .014], [sign * (gull ? .089 : .076), .085, gull ? .285 : .2]), color: 0x34463e })),
  ]);
}

/** A thick swept paper-like wing, with a darker outer tip. No flat sprite. */
function wingGeometry(kind: Kind): THREE.BufferGeometry {
  const span = kind === "gull" ? .68 : .34;
  const outline = [[0, .11], [span * .55, .06], [span, -.14], [span * .68, -.17], [0, -.105]];
  const shape = new THREE.Shape();
  outline.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .025, bevelEnabled: false, steps: 1 }).rotateX(Math.PI / 2);
  const p = geometry.getAttribute("position"), colors: number[] = [];
  const feather = new THREE.Color(kind === "gull" ? 0xe3e5d9 : 0x789981), tip = new THREE.Color(kind === "gull" ? 0x637268 : 0x435e52);
  for (let i = 0; i < p.count; i++) {
    const color = p.getX(i) > span * .66 ? tip : feather;
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export class SoundWildlife {
  readonly root = new THREE.Group();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  private readonly species: Record<Kind, Species>;
  private flocks: Flock[] = [];
  private disposed = false;
  private readonly pose = new THREE.Object3D();
  private readonly bodyMatrix = new THREE.Matrix4();
  private readonly wingMatrix = new THREE.Matrix4();
  private readonly basisMatrix = new THREE.Matrix4();
  private readonly heading = new THREE.Quaternion();
  private readonly east = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly south = new THREE.Vector3();

  constructor(parent: THREE.Group | THREE.Scene, private readonly heightAt: (x: number, z: number) => number) {
    this.root.name = "sound-wildlife";
    const create = (kind: Kind): Species => {
      const body = bodyGeometry(kind), wing = wingGeometry(kind);
      const mesh = (name: string, geometry: THREE.BufferGeometry): THREE.InstancedMesh => {
        const mesh = new THREE.InstancedMesh(geometry, this.material, MAX_BIRDS);
        mesh.name = `sound-wildlife-${kind}-${name}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        this.root.add(mesh);
        return mesh;
      };
      return { body: mesh("body", body), left: mesh("left-wing", wing), right: mesh("right-wing", wing) };
    };
    this.species = { bird: create("bird"), gull: create("gull") };
    parent.add(this.root);
  }

  get state(): SoundWildlifeState[] {
    return this.flocks.map(({ phase: _phase, ...state }) => ({ ...state }));
  }

  setSources(sources: readonly SoundSignal[]): void {
    if (this.disposed) return;
    // A stale living duplicate cannot overrule a removal/private endpoint.
    const ended = new Set(sources.filter(source => source.removedAt || source.whileIn).map(source => source.id));
    const live = sources.filter(source => !ended.has(source.id) && wildlifeKind(source.soundId) &&
      planetCoordsValid(source.x, source.z) && Number.isFinite(Date.parse(source.at)))
      .sort((a, b) => Number(a.origin === "example") - Number(b.origin === "example") ||
        Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const seen = new Set<string>();
    this.flocks = [];
    for (const source of live) {
      if (seen.has(source.id)) continue;
      seen.add(source.id);
      this.flocks.push({ sourceId: source.id, kind: wildlifeKind(source.soundId)!, origin: source.origin === "example" ? "example" : "player",
        count: 2, x: source.x, z: source.z, phase: phaseFor(source.id) });
      if (this.flocks.length === MAX_SOURCES) break;
    }
    for (const kind of ["bird", "gull"] as const) {
      const flock = this.flocks.filter(source => source.kind === kind), species = this.species[kind];
      for (const mesh of Object.values(species)) {
        mesh.count = flock.length * 2;
        mesh.userData.sources = flock.flatMap(source => [source.sourceId, source.sourceId]);
      }
    }
    // Removed birds disappear immediately; rendering an old timestamp cannot
    // restore them. Newly added instances get safe poses before the next frame.
    this.frame(0, true);
  }

  frame(serverNow: number, reducedMotion = false): void {
    if (this.disposed || !Number.isFinite(serverNow)) return;
    const time = reducedMotion ? 0 : serverNow / 1000;
    const indices: Record<Kind, number> = { bird: 0, gull: 0 };
    for (const flock of this.flocks) for (let bird = 0; bird < flock.count; bird++) {
      const gull = flock.kind === "gull", phase = flock.phase + bird * Math.PI;
      const angle = phase + time * (gull ? .34 : .56), radius = gull ? 1.5 : .92;
      const point = planetStep({ x: flock.x, z: flock.z, yaw: 0 }, Math.cos(angle), Math.sin(angle), radius);
      const ahead = planetStep({ x: flock.x, z: flock.z, yaw: 0 }, Math.cos(angle + .01), Math.sin(angle + .01), radius);
      const ground = this.heightAt(point.x, point.z);
      const height = (Number.isFinite(ground) ? ground : 0) + (gull ? 2.35 : 1.9) + (reducedMotion ? 0 : .2 * Math.sin(time * .9 + phase));
      const p = planetPoint(point.x, point.z, height), next = planetPoint(ahead.x, ahead.z), current = planetPoint(point.x, point.z);
      const basis = planetBasis(point.x, point.z), delta = { x: next.x - current.x, y: next.y - current.y, z: next.z - current.z };
      const dot = (v: { x: number; y: number; z: number }): number => delta.x * v.x + delta.y * v.y + delta.z * v.z;
      const yaw = Math.atan2(dot(basis.east), dot(basis.south));
      this.east.set(basis.east.x, basis.east.y, basis.east.z);
      this.normal.set(basis.up.x, basis.up.y, basis.up.z);
      this.south.set(basis.south.x, basis.south.y, basis.south.z);
      this.basisMatrix.makeBasis(this.east, this.normal, this.south);
      this.pose.position.set(p.x, p.y, p.z);
      this.pose.quaternion.setFromRotationMatrix(this.basisMatrix).multiply(this.heading.setFromAxisAngle(up, yaw));
      if (!reducedMotion) this.pose.rotateZ(.1 * Math.sin(time * .4 + phase));
      this.pose.scale.set(1, 1, 1);
      this.pose.updateMatrix();
      this.bodyMatrix.copy(this.pose.matrix);
      const species = this.species[flock.kind], index = indices[flock.kind]++;
      species.body.setMatrixAt(index, this.bodyMatrix);
      const flap = reducedMotion ? .14 : (gull ? .15 : .3) + (gull ? .32 : .62) * Math.sin(time * (gull ? 3.5 : 7.5) + phase);
      for (const [sign, mesh] of [[-1, species.left], [1, species.right]] as const) {
        this.pose.position.set(sign * .075, .015, -.025);
        this.pose.quaternion.setFromAxisAngle(flapAxis, sign * flap);
        this.pose.scale.set(sign, 1, 1);
        this.pose.updateMatrix();
        this.wingMatrix.multiplyMatrices(this.bodyMatrix, this.pose.matrix);
        mesh.setMatrixAt(index, this.wingMatrix);
      }
    }
    for (const species of Object.values(this.species)) for (const mesh of Object.values(species)) mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.flocks = [];
    const geometries = new Set<THREE.BufferGeometry>();
    for (const species of Object.values(this.species)) for (const mesh of Object.values(species)) {
      geometries.add(mesh.geometry);
      mesh.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    this.material.dispose();
    this.root.clear();
    this.root.removeFromParent();
  }
}
