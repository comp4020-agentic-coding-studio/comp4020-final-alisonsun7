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
  // Ordinary activity lasts at least five minutes between visits. The same
  // time is used after finding a busy room; a queue is not a resident's job.
  interval: 300_000,
  walking: 10_000,
  waiting: 8000,
  entering: 2000,
  occupied: 5000,
  flushing: 3500,
  leaving: 10_000,
  // On leaving, walk straight through the doorway before turning for home.
  exitDoorway: 2000,
} as const;

export interface NpcRoutineDefinition {
  id: string;
  label: string;
  avatar: "cat" | "dog";
  home: { x: number; z: number; yaw: number };
  // Presentation routes only: no users, sound rows or new admission authority.
  dailyRoute?: readonly { x: number; z: number; yaw: number; restMs: number }[];
  approach?: readonly { x: number; z: number }[];
  hutId: string;
}

export function restroomResident(sceneId: string, huts: readonly Hut[]): NpcRoutineDefinition | null {
  const toilet = huts.find(hut => hut.kind.endsWith("toilet"));
  if (!toilet) return null;
  return {
    id: `${sceneId}-restroom-neighbour`, label: "Rowan · resident NPC", avatar: "dog",
    home: sceneId === "planet" ? { x: 8.2, z: 2.2, yaw: -.7 }
      : { x: (toilet.door.x0 + toilet.door.x1) / 2 - 3, z: toilet.z1 + 1.9, yaw: 0.7 },
    ...(sceneId === "planet" ? {
      // An outdoor loop beside the green, well away from the restroom door.
      // Repeated waypoints retrace the path instead of cutting across huts.
      dailyRoute: [
        { x: 8.2, z: 2.2, yaw: -.7, restMs: 45_000 },
        { x: 6.9, z: 1.5, yaw: -1.4, restMs: 35_000 },
        { x: 7.2, z: 3.3, yaw: -.5, restMs: 40_000 },
        { x: 9, z: 5, yaw: -1.2, restMs: 20_000 },
        { x: 7.2, z: 3.3, yaw: 1.4, restMs: 10_000 },
      ],
      approach: [{ x: 9, z: 5 }, { x: 10, z: 9 }],
    } : {}),
    hutId: toilet.id,
  };
}
