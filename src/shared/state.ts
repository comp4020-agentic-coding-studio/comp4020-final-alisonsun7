// Applying committed events to a session's placements. Pure, so the live
// client, the memory replay and the tests all use the same rules.
import type { Committed, Placement, Snapshot, TimelineEntry } from "./protocol.js";

export interface LiveState {
  snapshot: Snapshot;
  // set when an event arrives out of order: the client must refetch the
  // snapshot rather than guess what it missed
  gap: boolean;
}

export function applyPlacementEvent(placements: Placement[], payload: TimelineEntry["payload"]): Placement[] {
  switch (payload.kind) {
    case "sound.add":
      if (placements.some((p) => p.id === payload.placement.id)) return placements;
      return [...placements, payload.placement];
    case "sound.update":
      return placements.map((p) => {
        if (p.id !== payload.patch.placementId || p.revision >= payload.patch.revision) return p;
        const { placementId: _id, ...fields } = payload.patch;
        return { ...p, ...fields };
      });
    case "sound.remove":
      return placements.filter((p) => p.id !== payload.placementId);
  }
}

// Apply one committed event. Events at or below the snapshot's seq are
// already in it (a duplicate or a late echo) and are ignored; an event that
// skips a seq marks a gap.
export function applyCommitted(state: LiveState, ev: Committed): LiveState {
  const snap = state.snapshot;
  if (ev.sessionId !== snap.sessionId || ev.serverSeq <= snap.seq) return state;
  if (ev.serverSeq !== snap.seq + 1) return { ...state, gap: true };

  const next: Snapshot = { ...snap, seq: ev.serverSeq, serverNow: ev.serverAt };
  const p = ev.payload;
  switch (p.kind) {
    case "sound.add":
    case "sound.update":
    case "sound.remove":
      next.placements = applyPlacementEvent(snap.placements, p);
      break;
    case "session.start":
      next.status = "active";
      next.startedAt = p.startedAt;
      next.startedBy = p.startedBy;
      next.durationMs = p.durationMs;
      break;
    case "session.ending":
      next.status = "ending";
      break;
    case "session.saved":
      next.status = "saved";
      next.lastMemoryId = p.memoryId;
      break;
    case "session.failed":
      next.status = "failed";
      next.error = p.error;
      break;
  }
  return { snapshot: next, gap: false };
}

// The placements as they were `t` ms into a memory: what replay draws.
export function placementsAt(timeline: TimelineEntry[], t: number): Placement[] {
  let placements: Placement[] = [];
  for (const entry of timeline) {
    if (entry.t > t) break;
    placements = applyPlacementEvent(placements, entry.payload);
  }
  return placements;
}

export function remainingMs(snap: Pick<Snapshot, "status" | "startedAt" | "durationMs">, nowMs: number): number {
  if (snap.status !== "active" || !snap.startedAt) return snap.durationMs;
  return Math.max(0, Date.parse(snap.startedAt) + snap.durationMs - nowMs);
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
