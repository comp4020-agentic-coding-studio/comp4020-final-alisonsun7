// Original NPCs visibly answer the shared soundscape. Their choices and phase
// come from shared contributions/server time, never from one visitor's hearing.
import * as THREE from "three";
import type { PlacedSound } from "../shared/protocol.js";
import { chooseResidentResponse, residentPhase, RESIDENT_SETTLE_MS, type ResidentHome, type ResidentResponse, type SoundBehavior, type SoundSignal } from "../shared/sound-response.js";
import type { AnimalFigure } from "./characters.js";

export interface ResidentDefinition extends ResidentHome {
  label: string;
  facing: number;
}

export interface ResidentResponseSummary {
  residentId: string;
  label: string;
  sourceId: string;
  soundId: string;
  behavior: SoundBehavior;
  origin?: "example";
  x: number;
  z: number;
}

interface Resident {
  definition: ResidentDefinition;
  sprite: AnimalFigure;
  owned: boolean;
  home: THREE.Vector3;
  goal: THREE.Vector3;
  response: ResidentResponse | null;
  release: { from: THREE.Vector3; at: number } | null;
  hips?: THREE.Object3D;
  body?: THREE.Object3D;
  head?: THREE.Object3D;
  arm?: THREE.Object3D;
  elbow?: THREE.Object3D;
  knee?: THREE.Object3D;
}

interface Options {
  surfaceHeight: (x: number, z: number) => number;
  // Includes authored solids, occupied private huts and floor boundaries.
  canStand: (x: number, z: number) => boolean;
  distanceBetween?: (a: {x:number;z:number}, b: {x:number;z:number}) => number;
}

const TAU = Math.PI * 2;
const MAX_WALK = 1.1;
const difference = (to: number, from: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const ease = (t: number): number => { const p = Math.max(0, Math.min(1, t)); return p * p * (3 - 2 * p); };

export class SoundResidents {
  private residents: Resident[] = [];
  private sounds: SoundSignal[] = [];
  private disposed = false;
  private selectedAt = -Infinity;

  constructor(private options: Options) {}

  add(definition: ResidentDefinition, sprite: AnimalFigure, owned = false): void {
    if (this.disposed || this.owns(sprite)) return;
    const home = new THREE.Vector3(definition.x, this.options.surfaceHeight(definition.x, definition.z), definition.z);
    sprite.position.copy(home);
    sprite.setFacing(definition.facing);
    sprite.userData.soundResident = { id: definition.id, label: definition.label, npc: true, behavior: "idle", sourceId: null };
    this.residents.push({ definition, sprite, owned, home, goal: home.clone(), response: null, release: null,
      hips: sprite.getObjectByName("hip-rig"), body: sprite.getObjectByName("upper-body-rig"), head: sprite.getObjectByName("head-rig"),
      arm: sprite.getObjectByName("right-shoulder"), elbow: sprite.getObjectByName("right-elbow"), knee: sprite.getObjectByName("right-knee") });
  }

  owns(sprite: AnimalFigure): boolean {
    return this.residents.some((resident) => resident.sprite === sprite);
  }

  get figures(): readonly AnimalFigure[] {
    return this.residents.map((resident) => resident.sprite);
  }

  get responses(): readonly ResidentResponseSummary[] {
    return this.residents.flatMap(({ definition, response, sprite }) => response ? [{
      residentId: definition.id, label: definition.label, sourceId: response.sourceId, soundId: response.soundId,
      behavior: response.profile.behavior, x: sprite.position.x, z: sprite.position.z, ...(response.origin ? {origin:response.origin} : {}),
    }] : []);
  }

  setContributions(sounds: readonly SoundSignal[]): void {
    if (this.disposed) return;
    // Take a value snapshot; subsequent ACK bookkeeping cannot change a choice
    // behind this controller's back. The shared selector rejects private stays.
    this.sounds = sounds.map((sound) => ({ ...sound }));
    this.selectedAt = -Infinity;
  }

  frame(serverNowMs: number, dt: number, reducedMotion = false): void {
    if (this.disposed || !Number.isFinite(serverNowMs)) return;
    // dt is accepted for the view's frame API; shared-time interpolation keeps
    // the same source at the same position regardless of frame rate/tab age.
    void dt;
    const sample = Math.floor(serverNowMs / 250) * 250;
    const select = sample !== this.selectedAt;
    this.selectedAt = sample;
    for (const resident of this.residents) {
      const { definition, sprite, home } = resident;
      const response = select ? chooseResidentResponse(definition, this.sounds, sample, this.options.distanceBetween) : resident.response;
      if (response?.sourceId !== resident.response?.sourceId) {
        resident.release = !response && resident.response ? { from: sprite.position.clone(), at: sample } : null;
        resident.response = response;
        resident.goal.copy(home);
        if (response) {
          const direction = new THREE.Vector3(response.x - home.x, 0, response.z - home.z);
          const distance = direction.length();
          // A small approach inside an authored home circle; never a route
          // toward somebody's sound through walls, furniture or private huts.
          const approach = ["sway", "chat", "play"].includes(response.profile.behavior) ? MAX_WALK : 0.35;
          if (distance > 0.8) resident.goal.add(direction.multiplyScalar(Math.min(approach, Math.max(0, distance - 2.2)) / distance));
          if (!this.safePath(home, resident.goal)) resident.goal.copy(home);
          resident.goal.y = this.options.surfaceHeight(resident.goal.x, resident.goal.z);
        }
      }
      const age = response ? Math.max(0, serverNowMs - response.at - RESIDENT_SETTLE_MS) : 0;
      const progress = reducedMotion ? 0 : ease(age / 3000);
      const target = home.clone().lerp(resident.goal, progress);
      if (!response && resident.release && !reducedMotion) {
        target.copy(resident.release.from).lerp(home, ease((serverNowMs - resident.release.at) / 1600));
        if (serverNowMs - resident.release.at >= 1600) resident.release = null;
      }
      const from = sprite.position.clone();
      // Solids may arrive after the initial shell (furniture and hut doors).
      if (target.distanceToSquared(from) > 0 && this.safePath(from, target)) sprite.position.set(target.x, this.options.surfaceHeight(target.x, target.z), target.z);
      const walking = !reducedMotion && (response ? age > 0 && age < 3000 && resident.goal.distanceToSquared(home) > 0.0001 : !!resident.release);
      const phase = reducedMotion || !Number.isFinite(serverNowMs) ? 0 : residentPhase(definition.id, serverNowMs, response?.profile.behavior === "sway" ? 1.6 : 3.2);
      const toward = response ? Math.atan2(response.x - sprite.position.x, response.z - sprite.position.z) : definition.facing;
      const facing = walking && target.distanceToSquared(from) > 0.000001 ? Math.atan2(target.x - from.x, target.z - from.z) : toward;
      sprite.setFacing(response ? definition.facing + difference(facing, definition.facing) * ease(age / 600) : facing);
      sprite.setPose(walking ? "walk" : response?.profile.behavior === "chat" ? "talk" : "stand");
      sprite.setMotion(phase, walking);
      if (resident.hips) resident.hips.rotation.set(0, 0, 0);
      if (!walking && response) this.gesture(resident, response.profile.behavior, phase, reducedMotion);
      sprite.userData.soundResident.behavior = response?.profile.behavior ?? "idle";
      sprite.userData.soundResident.sourceId = response?.sourceId ?? null;
      sprite.userData.soundResident.soundId = response?.soundId ?? null;
    }
  }

  private safePath(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    if (distance < 0.00001) return true;
    const steps = Math.max(1, Math.ceil(distance / 0.1));
    let lastHeight = this.options.surfaceHeight(from.x, from.z);
    for (let i = 1; i <= steps; i++) {
      const x = from.x + (to.x - from.x) * i / steps;
      const z = from.z + (to.z - from.z) * i / steps;
      const height = this.options.surfaceHeight(x, z);
      if (!this.options.canStand(x, z) || !Number.isFinite(height) || Math.abs(height - lastHeight) > 0.16) return false;
      lastHeight = height;
    }
    return true;
  }

  private gesture(resident: Resident, behavior: SoundBehavior, phase: number, reducedMotion: boolean): void {
    const q = phase * TAU;
    const motion = reducedMotion ? 0 : 1;
    if (behavior === "sway") {
      if (resident.body) resident.body.rotation.z += Math.sin(q) * 0.085 * motion;
      if (resident.head) resident.head.rotation.z = -Math.sin(q) * 0.07 * motion;
      if (resident.knee) resident.knee.rotation.x += Math.max(0, Math.sin(q)) * 0.16 * motion;
      if (resident.elbow) resident.elbow.rotation.x = -0.65 + Math.sin(q) * 0.12 * motion;
    } else if (behavior === "play") {
      if (resident.body) resident.body.rotation.y += Math.sin(q) * 0.18 * motion;
      if (resident.head) resident.head.rotation.z = 0.09;
      if (resident.arm) resident.arm.rotation.set(-2.1, 0, 0.52 + Math.sin(q * 2) * 0.17 * motion);
      if (resident.elbow) resident.elbow.rotation.x = -0.35;
    } else if (behavior === "wave") {
      if (resident.head) resident.head.rotation.x = -0.13;
      if (resident.arm) resident.arm.rotation.set(-2.3, 0, 0.65 + Math.sin(q * 2) * 0.2 * motion);
      if (resident.elbow) resident.elbow.rotation.x = -0.45;
    } else if (behavior === "watch") {
      if (resident.head) resident.head.rotation.set(-0.12, Math.sin(q) * 0.26 * motion, 0.13);
      if (resident.body) resident.body.rotation.y += Math.sin(q) * 0.05 * motion;
    } else if (behavior === "listen") {
      if (resident.head) resident.head.rotation.set(0.08, 0, -0.12);
      if (resident.elbow) resident.elbow.rotation.x = -0.35;
      if (resident.body) resident.body.rotation.z += Math.sin(q) * 0.012 * motion;
    }
    // Chat uses the figure's authored talk gesture; nothing is said or stored.
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const resident of this.residents) {
      delete resident.sprite.userData.soundResident;
      if (resident.owned) resident.sprite.dispose();
      else {
        resident.sprite.position.copy(resident.home);
        resident.sprite.setPose("stand");
        resident.sprite.setMotion(0, false);
        resident.sprite.setFacing(resident.definition.facing);
      }
    }
    this.residents = [];
    this.sounds = [];
  }
}
