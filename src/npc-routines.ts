// Server-only restroom state machine. It writes no database rows, invents no
// human presence, and claims a hut only through the room's admission callback.
import type { Hut } from "./shared/huts.js";
import { NPC_ROUTINE_MS, restroomResident, type NpcRoutineDefinition, type NpcRoutineFrame, type NpcRoutinePhase } from "./shared/npc-routines.js";

interface Point { x: number; z: number }
const lerp = (a: Point, b: Point, value: number): Point => {
  const t = Math.max(0, Math.min(1, value));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
};
const facing = (a: Point, b: Point): number => Math.atan2(b.x - a.x, b.z - a.z);
const rounded = (value: number): number => Math.round(value * 1000) / 1000;

export class NpcRestroomRoutines {
  private definition: NpcRoutineDefinition | null;
  private phase: NpcRoutinePhase = "idle";
  private phaseAt: number;
  private nextVisitAt: number;
  private hutId: string;
  private visitId = "";

  constructor(sceneId: string, private huts: readonly Hut[], now: number) {
    this.definition = restroomResident(sceneId, huts);
    this.phaseAt = now;
    this.nextVisitAt = now + NPC_ROUTINE_MS.interval;
    this.hutId = this.definition?.hutId ?? "";
  }

  get active(): boolean { return this.phase !== "idle"; }

  invite(now: number, hutId = this.definition?.hutId): boolean {
    if (!this.definition || !Number.isFinite(now) || this.active
      || !this.huts.some(hut => hut.id === hutId && hut.kind.endsWith("toilet"))) return false;
    this.hutId = hutId!;
    this.phase = "walking";
    this.phaseAt = now;
    this.visitId = `${this.definition.id}:${now}`;
    return true;
  }

  // The same callback used by human moves checks live humans and other NPCs.
  // No await occurs between checking an available hut and claiming it.
  advance(now: number, canEnter: (hutId: string, npcId: string) => boolean): boolean {
    if (!this.definition || !Number.isFinite(now) || now < this.phaseAt) return false;
    let changed = false;
    for (let transition = 0; transition < 8; transition++) {
      if (this.phase === "idle") {
        if (now >= this.nextVisitAt) { changed = this.invite(now) || changed; }
        break;
      }
      if (this.phase === "waiting") {
        if (canEnter(this.hutId, this.definition.id)) {
          this.phase = "entering"; this.phaseAt = now; changed = true;
        }
        break;
      }
      const duration = NPC_ROUTINE_MS[this.phase];
      if (now - this.phaseAt < duration) break;
      this.phaseAt += duration;
      this.phase = this.phase === "walking" ? "waiting"
        : this.phase === "entering" ? "occupied"
          : this.phase === "occupied" ? "flushing"
            : this.phase === "flushing" ? "leaving" : "idle";
      changed = true;
      if (this.phase === "idle") this.nextVisitAt = now + NPC_ROUTINE_MS.interval;
    }
    return changed;
  }

  occupies(hutId: string, now: number, exceptNpcId?: string): boolean {
    if (this.definition?.id === exceptNpcId || hutId !== this.hutId) return false;
    return this.phase === "entering" || this.phase === "occupied" || this.phase === "flushing"
      || (this.phase === "leaving" && now - this.phaseAt < NPC_ROUTINE_MS.exitDoorway);
  }

  frames(now: number): NpcRoutineFrame[] {
    const definition = this.definition;
    const hut = this.huts.find(item => item.id === this.hutId);
    if (!definition || !hut || !Number.isFinite(now)) return [];
    const door = { x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 + 0.8 };
    const inside = { x: door.x, z: hut.z1 - Math.min(1.3, (hut.z1 - hut.z0) / 2) };
    const age = Math.max(0, now - this.phaseAt);
    let point: Point = definition.home;
    let yaw = definition.home.yaw;
    if (this.phase === "walking") {
      point = lerp(definition.home, door, age / NPC_ROUTINE_MS.walking);
      yaw = facing(definition.home, door);
    } else if (this.phase === "waiting") { point = door; yaw = Math.PI; }
    else if (this.phase === "entering") {
      point = lerp(door, inside, age / NPC_ROUTINE_MS.entering); yaw = Math.PI;
    } else if (this.phase === "occupied" || this.phase === "flushing") { point = inside; yaw = Math.PI; }
    else if (this.phase === "leaving") {
      if (age < NPC_ROUTINE_MS.exitDoorway) { point = lerp(inside, door, age / NPC_ROUTINE_MS.exitDoorway); yaw = 0; }
      else {
        point = lerp(door, definition.home, (age - NPC_ROUTINE_MS.exitDoorway) / (NPC_ROUTINE_MS.leaving - NPC_ROUTINE_MS.exitDoorway));
        yaw = facing(door, definition.home);
      }
    }
    return [{
      id: definition.id, label: definition.label, avatar: definition.avatar,
      x: rounded(point.x), z: rounded(point.z), yaw,
      phase: this.phase, hutId: this.hutId, phaseStartedAt: new Date(this.phaseAt).toISOString(),
      occupying: this.occupies(this.hutId, now),
      ...(this.phase === "flushing" ? { flushId: this.visitId } : {}),
    }];
  }
}
