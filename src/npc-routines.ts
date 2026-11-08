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
const length = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.z - a.z);

// Distance-weighted waypoints keep the turn at an authored path corner. A
// late snapshot samples the same route; there is no client-speed simulation.
function along(points: readonly Point[], progress: number): Point & { yaw: number } {
  const first = points[0]!, last = points[points.length - 1]!;
  const total = points.slice(1).reduce((sum, point, i) => sum + length(points[i]!, point), 0);
  let distance = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!, to = points[i]!, segment = length(from, to);
    if (distance <= segment && segment > .00001) return { ...lerp(from, to, distance / segment), yaw: facing(from, to) };
    distance -= segment;
  }
  return { ...last, yaw: total > .00001 ? facing(points[points.length - 2]!, last) : 0 };
}

export class NpcRestroomRoutines {
  private definition: NpcRoutineDefinition | null;
  private phase: NpcRoutinePhase = "idle";
  private phaseAt: number;
  private nextVisitAt: number;
  private hutId: string;
  private visitId = "";
  private idleAt: number;
  private pausedIdleElapsed = 0;
  private visitRoute: Point[] = [];
  private admitted = false;
  private lastOrdinaryPoint: Point | null;

  constructor(sceneId: string, private huts: readonly Hut[], now: number) {
    this.definition = restroomResident(sceneId, huts);
    this.phaseAt = now;
    this.idleAt = now;
    this.nextVisitAt = now + NPC_ROUTINE_MS.interval;
    this.hutId = this.definition?.hutId ?? "";
    this.lastOrdinaryPoint = this.definition ? this.ordinaryPosition(now) : null;
  }

  get active(): boolean { return this.phase !== "idle"; }

  invite(now: number, hutId = this.definition?.hutId): boolean {
    if (!this.definition || !Number.isFinite(now) || this.active
      || !this.huts.some(hut => hut.id === hutId && hut.kind.endsWith("toilet"))) return false;
    this.hutId = hutId!;
    const hut = this.huts.find(item => item.id === this.hutId)!;
    const door = { x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 + .8 };
    const origin = this.ordinaryPosition(now);
    this.pausedIdleElapsed = Math.max(0, now - this.idleAt);
    this.visitRoute = [origin, ...(this.definition.approach ?? []), door];
    this.admitted = false;
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
        else {
          const point = this.ordinaryPosition(now);
          // sessions broadcasts a returned change at five Hz, including idle
          // strolling and its last step. Resting does not send extra frames.
          changed = changed || !this.lastOrdinaryPoint || length(point, this.lastOrdinaryPoint) > .00001;
          this.lastOrdinaryPoint = point;
        }
        break;
      }
      if (this.phase === "waiting") {
        if (now - this.phaseAt >= NPC_ROUTINE_MS.waiting) {
          // Deadline wins even if the room became free on this same sample.
          // This resident has decided to go on with their day, not reserve it.
          this.phase = "leaving"; this.phaseAt += NPC_ROUTINE_MS.waiting; changed = true;
          continue;
        }
        if (canEnter(this.hutId, this.definition.id)) {
          this.admitted = true;
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
      if (this.phase === "idle") {
        this.nextVisitAt = now + NPC_ROUTINE_MS.interval;
        this.idleAt = this.phaseAt - this.pausedIdleElapsed;
        this.admitted = false;
        this.lastOrdinaryPoint = this.ordinaryPosition(now);
      }
    }
    return changed;
  }

  occupies(hutId: string, now: number, exceptNpcId?: string): boolean {
    if (!this.admitted || this.definition?.id === exceptNpcId || hutId !== this.hutId) return false;
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
    const ordinary = this.ordinaryPosition(now);
    let point: Point = ordinary;
    let yaw = ordinary.yaw;
    if (this.phase === "walking") {
      const sample = along(this.visitRoute, age / NPC_ROUTINE_MS.walking);
      point = sample; yaw = sample.yaw;
    } else if (this.phase === "waiting") { point = door; yaw = Math.PI; }
    else if (this.phase === "entering") {
      point = lerp(door, inside, age / NPC_ROUTINE_MS.entering); yaw = Math.PI;
    } else if (this.phase === "occupied" || this.phase === "flushing") { point = inside; yaw = Math.PI; }
    else if (this.phase === "leaving") {
      if (this.admitted && age < NPC_ROUTINE_MS.exitDoorway) { point = lerp(inside, door, age / NPC_ROUTINE_MS.exitDoorway); yaw = 0; }
      else {
        const doorwayTime = this.admitted ? NPC_ROUTINE_MS.exitDoorway : 0;
        const sample = along([...this.visitRoute].reverse(), (age - doorwayTime) / (NPC_ROUTINE_MS.leaving - doorwayTime));
        point = sample; yaw = sample.yaw;
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

  private ordinaryPosition(now: number): Point & { yaw: number } {
    const definition = this.definition!;
    const stops = definition.dailyRoute;
    if (!stops?.length) return { ...definition.home };
    const travelMs = (index: number): number => length(stops[index]!, stops[(index + 1) % stops.length]!) / .72 * 1000;
    const cycle = stops.reduce((total, stop, index) => total + stop.restMs + travelMs(index), 0);
    let elapsed = Math.max(0, now - this.idleAt) % cycle;
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i]!, next = stops[(i + 1) % stops.length]!;
      if (elapsed < stop.restMs) return { x: stop.x, z: stop.z, yaw: stop.yaw };
      elapsed -= stop.restMs;
      const walk = travelMs(i);
      if (elapsed < walk) return { ...lerp(stop, next, elapsed / walk), yaw: facing(stop, next) };
      elapsed -= walk;
    }
    return { ...definition.home };
  }
}
