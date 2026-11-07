// Authoritative, ephemeral resident routines. These figures are never people,
// participants or sound contributions, and are not included in online counts.
import type { Hut } from "./huts.js";

export type NpcRoutinePhase = "idle" | "walking" | "waiting" | "entering" | "occupied" | "flushing" | "leaving";

export interface NpcRoutineFrame {
  id: string;
  label: string;
  avatar: "cat" | "dog";
  x: number;
  z: number;
  // Figure facing: zero faces +Z, matching AnimalFigure.setFacing.
  yaw: number;
  phase: NpcRoutinePhase;
  hutId: string;
  phaseStartedAt: string;
  // Reservation starts on entry, and ends after crossing the doorway on exit.
  // It is the same server authority that rejects a second person's admission.
  occupying: boolean;
  // One transient playback token per actual flush, never a placed sound id.
  flushId?: string;
}

export type NpcRestroomResult =
  | { ok: true; npcs: NpcRoutineFrame[]; serverNow: string }
  | { ok: false; code: "no_session" | "bad_request" | "not_here" | "slow_down" | "busy" };

export const NPC_ROUTINE_MS = {
  interval: 240_000,
  walking: 6000,
  entering: 2000,
  occupied: 5000,
  flushing: 3500,
  leaving: 6000,
  // On leaving, walk straight through the doorway before turning for home.
  exitDoorway: 2000,
} as const;

export interface NpcRoutineDefinition {
  id: string;
  label: string;
  avatar: "cat" | "dog";
  home: { x: number; z: number; yaw: number };
  hutId: string;
}

export function restroomResident(sceneId: string, huts: readonly Hut[]): NpcRoutineDefinition | null {
  const toilet = huts.find(hut => hut.kind.endsWith("toilet"));
  if (!toilet) return null;
  return {
    id: `${sceneId}-restroom-neighbour`, label: "Rowan · resident NPC", avatar: "dog",
    home: { x: (toilet.door.x0 + toilet.door.x1) / 2 - 3, z: toilet.z1 + 1.9, yaw: 0.7 },
    hutId: toilet.id,
  };
}
