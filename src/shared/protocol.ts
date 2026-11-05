// The wire shapes between server and client. Semantics follow the pack's
// docs/05 event contract; transport is SSE (server → client) plus JSON POSTs
// (client → server), as ADR 003 explains.
import type { SoundId } from "./catalog.js";

export type Avatar = "cat" | "dog";
export const AVATARS: Avatar[] = ["cat", "dog"];

export type SessionStatus = "idle" | "active" | "ending" | "saved" | "failed";

// A person as others see them in one session: participant id, never the
// user id or anything from their cookie.
export interface Person {
  id: string;
  name: string;
  avatar: Avatar;
}

export interface Placement {
  id: string;
  ownerId: string; // participant id
  ownerName: string;
  ownerAvatar: Avatar;
  soundId: SoundId;
  shotId: string;
  anchorId: string;
  x: number;
  y: number;
  gain: number;
  pan: number;
  revision: number;
  createdAt: string;
}

export interface Snapshot {
  type: "snapshot";
  sessionId: string;
  sceneId: string;
  mode: string;
  status: SessionStatus;
  serverNow: string;
  startedAt: string | null;
  startedBy: string | null; // participant id
  durationMs: number;
  seq: number;
  placements: Placement[];
  online: Person[];
  you: Person | null; // null for someone looking before they've joined
  // the memory the previous session in this place was sealed into, if any
  lastMemoryId: string | null;
  error: string | null;
}

export type CommittedKind =
  | "sound.add"
  | "sound.update"
  | "sound.remove"
  | "session.start"
  | "session.ending"
  | "session.saved"
  | "session.failed";

export interface PlacementPatch {
  placementId: string;
  revision: number;
  gain?: number;
  shotId?: string;
  anchorId?: string;
  x?: number;
  y?: number;
  pan?: number;
}

export type CommittedPayload =
  | { kind: "sound.add"; placement: Placement }
  | { kind: "sound.update"; patch: PlacementPatch }
  | { kind: "sound.remove"; placementId: string }
  | { kind: "session.start"; startedAt: string; startedBy: string; durationMs: number }
  | { kind: "session.ending" }
  | { kind: "session.saved"; memoryId: string }
  | { kind: "session.failed"; error: string };

export interface Committed {
  type: "committed";
  sessionId: string;
  serverSeq: number;
  operationId: string;
  by: string | null; // participant id; null for the server's own clock
  serverAt: string;
  elapsedMs: number;
  payload: CommittedPayload;
}

export interface Presence {
  type: "presence";
  sessionId: string;
  online: Person[];
}

// Where everyone who has joined is standing, a few times a second. Never
// stored.
export interface Moves {
  type: "moves";
  sessionId: string;
  people: (Person & { x: number; z: number; yaw: number })[];
}

// Something someone said, sent only to people standing near them. Never
// stored.
export interface Said {
  type: "said";
  sessionId: string;
  by: string; // participant id
  name: string;
  text: string;
}

export type ServerMessage = Snapshot | Committed | Presence | Moves | Said;

export type Op =
  | { operationId: string; type: "sound.add"; soundId: string; shotId: string; anchorId: string; gain: number }
  | { operationId: string; type: "sound.update"; placementId: string; baseRevision: number; gain?: number; shotId?: string; anchorId?: string }
  | { operationId: string; type: "sound.remove"; placementId: string; baseRevision: number }
  | { operationId: string; type: "session.start" }
  | { operationId: string; type: "session.finish" };

export type RejectCode =
  | "bad_request"
  | "unknown_sound"
  | "unknown_anchor"
  | "wrong_place"
  | "bad_gain"
  | "place_full"
  | "your_limit"
  | "no_placement"
  | "not_owner"
  | "stale"
  | "sealed"
  | "not_started"
  | "already_started"
  | "not_starter"
  | "slow_down"
  | "no_session"
  | "save_failed"
  | "spot_full"
  | "no_memories";

export type OpResult =
  | { ok: true; duplicate: boolean; committed: Committed[] }
  | { ok: false; code: RejectCode; message: string; placement?: Placement };

// What a saved memory holds: enough to rebuild the place and replay how it
// got there, without any audio recorded.
export interface TimelineEntry {
  seq: number;
  t: number; // ms since the memory started; 0 for sounds already there
  payload: Extract<CommittedPayload, { kind: "sound.add" | "sound.update" | "sound.remove" }>;
}

export interface MemorySnapshot {
  version: 1;
  memoryId: string;
  sceneId: string;
  mode: string;
  title: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  contributors: Person[]; // placed at least one sound
  listeners: Person[]; // were there, placed nothing
  placements: Placement[]; // as it ended
  timeline: TimelineEntry[];
}

export interface MemorySummary {
  id: string;
  sceneId: string;
  mode: string;
  title: string;
  savedAt: string;
  contributors: string[];
  sounds: number;
}

export const REJECT_MESSAGES: Record<RejectCode, string> = {
  bad_request: "That request didn't make sense to the server.",
  unknown_sound: "That sound isn't one this place knows.",
  unknown_anchor: "That spot isn't part of this scene.",
  wrong_place: "That sound belongs in another part of this scene.",
  bad_gain: "Volume has to be between 0 and 1.",
  place_full: "This place already holds as many sounds as it can. Remove one, or save this memory.",
  your_limit: "You've placed as many sounds as one person can here. Remove one of yours first.",
  no_placement: "That sound has already gone.",
  not_owner: "Only the person who added a sound can change or remove it.",
  stale: "Someone changed this sound. We've reloaded the latest version.",
  sealed: "This memory is being saved; new changes go into the next one.",
  not_started: "No memory is recording yet.",
  already_started: "A memory is already recording here.",
  not_starter: "Only the person who started this memory can save it early; it saves itself at 3:00.",
  slow_down: "That's a lot of changes at once. Try again in a moment.",
  no_session: "That session doesn't exist.",
  save_failed: "The memory couldn't be saved. Nothing was lost; try again.",
  spot_full: "This spot already has as many sounds as it can hold. Try another one nearby.",
  no_memories: "This place keeps its sounds as they are: there's nothing to record.",
};
