// A reply is part of the place: a quiet thread between two live contributions.
// These cues never move a contribution or start a recording.
import * as THREE from "three";
import type { PlacedSound } from "../shared/protocol.js";
import { FAMILIES, HEAR, PLACE_MAX, findSound } from "../shared/sounds.js";

const SEGMENTS = 24;
const MAX_LENGTH = 32;
const NEAR = 18;
const FOOT_Y = 0.06;

interface Connection {
  id: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  lift: number;
  colour: THREE.Color;
  phase: number;
  positions: Float32Array;
  colours: Float32Array;
}

const reduced = (): boolean => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const hidden = (): boolean => typeof document !== "undefined" && document.hidden;

export class SoundConnections {
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new THREE.BufferAttribute(new Float32Array(PLACE_MAX * SEGMENTS * 6), 3).setUsage(THREE.DynamicDrawUsage);
  private readonly colours = new THREE.BufferAttribute(new Float32Array(PLACE_MAX * SEGMENTS * 6), 3).setUsage(THREE.DynamicDrawUsage);
  private readonly material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.43, depthTest: true, depthWrite: false, toneMapped: false });
  private readonly lines = new THREE.LineSegments(this.geometry, this.material);
  private readonly beadGeometry = new THREE.SphereGeometry(0.045, 8, 5);
  private readonly beadMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthTest: true, depthWrite: false, toneMapped: false });
  private readonly beads = new THREE.InstancedMesh(this.beadGeometry, this.beadMaterial, PLACE_MAX);
  private readonly transform = new THREE.Matrix4();
  private readonly point = new THREE.Vector3();
  private sounds: PlacedSound[] = [];
  private connections: Connection[] = [];
  private dirty = false;
  private signature: string | null = null;
  private disposed = false;

  constructor(private root: THREE.Object3D, private surfaceHeight: (x: number, z: number) => number) {
    this.group.name = "sound-connections";
    this.lines.name = "sound-reply-threads";
    this.beads.name = "sound-reply-playing";
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("color", this.colours);
    this.geometry.setDrawRange(0, 0);
    this.lines.frustumCulled = false;
    this.beads.frustumCulled = false;
    this.beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beads.count = 0;
    this.group.add(this.lines, this.beads);
    this.root.add(this.group);
  }

  setAll(sounds: PlacedSound[]): void {
    if (this.disposed) return;
    this.sounds = sounds;
    this.dirty = true;
  }

  private rebuild(): void {
    const live = new Map(this.sounds.filter((sound) => !sound.removedAt && !sound.whileIn && findSound(sound.soundId)).map((sound) => [sound.id, sound]));
    this.connections = [];
    for (const sound of live.values()) {
      const parentId = sound.replyToId ?? sound.replyTo?.id;
      if (!parentId || parentId === sound.id || sound.replyTo?.removedAt) continue;
      const parent = live.get(parentId);
      if (!parent || (sound.replyTo && sound.replyTo.id !== parentId)) continue;
      const distance = Math.hypot(sound.x - parent.x, sound.z - parent.z);
      if (!Number.isFinite(distance) || distance < 0.01 || distance > MAX_LENGTH) continue;
      const from = new THREE.Vector3(parent.x, this.surfaceHeight(parent.x, parent.z) + FOOT_Y, parent.z);
      const to = new THREE.Vector3(sound.x, this.surfaceHeight(sound.x, sound.z) + FOOT_Y, sound.z);
      if (![...from, ...to].every(Number.isFinite)) continue;
      const parentColour = new THREE.Color(FAMILIES[findSound(parent.soundId)!.family].colour).lerp(new THREE.Color("#faf5e9"), 0.35);
      const childColour = new THREE.Color(FAMILIES[findSound(sound.soundId)!.family].colour).lerp(new THREE.Color("#faf5e9"), 0.35);
      const connection: Connection = { id: sound.id, from, to, lift: Math.min(0.6, 0.12 + distance * 0.025), colour: childColour, phase: [...sound.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 997 / 997,
        positions: new Float32Array(SEGMENTS * 6), colours: new Float32Array(SEGMENTS * 6) };
      for (let segment = 0; segment < SEGMENTS; segment++) for (let end = 0; end < 2; end++) {
        const t = (segment + end) / SEGMENTS;
        this.sample(connection, t, this.point).toArray(connection.positions, (segment * 2 + end) * 3);
        parentColour.clone().lerp(childColour, t).toArray(connection.colours, (segment * 2 + end) * 3);
      }
      this.connections.push(connection);
      if (this.connections.length === PLACE_MAX) break;
    }
    // The same ids may have new positions or relation metadata after a snapshot.
    this.signature = null;
    this.dirty = false;
  }

  private sample(connection: Connection, t: number, target: THREE.Vector3): THREE.Vector3 {
    target.lerpVectors(connection.from, connection.to, t);
    target.y += Math.sin(Math.PI * t) * connection.lift;
    return target;
  }

  frame(listener: { x: number; z: number }, on: boolean, playing: ReadonlySet<string>, now = performance.now()): number {
    if (this.disposed) return 0;
    if (this.dirty) this.rebuild();
    const nearby = this.connections.filter(({ from, to }) => {
      if (Math.hypot(from.x - listener.x, from.z - listener.z) > HEAR || Math.hypot(to.x - listener.x, to.z - listener.z) > HEAR) return false;
      const dx = to.x - from.x, dz = to.z - from.z;
      const t = THREE.MathUtils.clamp(((listener.x - from.x) * dx + (listener.z - from.z) * dz) / (dx * dx + dz * dz), 0, 1);
      return Math.hypot(listener.x - from.x - dx * t, listener.z - from.z - dz * t) <= NEAR;
    });
    const signature = nearby.map((connection) => connection.id).join("|");
    if (signature !== this.signature) {
      this.signature = signature;
      for (const [i, connection] of nearby.entries()) {
        this.positions.array.set(connection.positions, i * SEGMENTS * 6);
        this.colours.array.set(connection.colours, i * SEGMENTS * 6);
      }
      this.positions.needsUpdate = true;
      this.colours.needsUpdate = true;
      this.geometry.setDrawRange(0, nearby.length * SEGMENTS * 2);
    }
    // Motion means an actual decoded voice, never just an open sound switch.
    let count = 0;
    if (on && !hidden() && !reduced()) for (const connection of nearby) {
      if (!playing.has(connection.id)) continue;
      this.sample(connection, (now / 4200 + connection.phase) % 1, this.point);
      this.transform.makeTranslation(this.point.x, this.point.y, this.point.z);
      this.beads.setMatrixAt(count, this.transform);
      this.beads.setColorAt(count, connection.colour);
      count++;
    }
    this.beads.count = count;
    if (count) {
      this.beads.instanceMatrix.needsUpdate = true;
      this.beads.instanceColor!.needsUpdate = true;
    }
    this.lines.visible = nearby.length > 0;
    this.beads.visible = count > 0;
    return nearby.length;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
    this.beadGeometry.dispose();
    this.beadMaterial.dispose();
    this.beads.dispose();
    this.connections = [];
    this.sounds = [];
  }
}
