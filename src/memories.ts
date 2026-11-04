// Saved memories: read-only once written.
import { db } from "./db.js";
import type { MemorySnapshot, MemorySummary } from "./shared/protocol.js";

export function getMemory(id: string): MemorySnapshot | null {
  const row = db.prepare("SELECT snapshot_json FROM memories WHERE id = ?").get(id) as { snapshot_json: string } | undefined;
  return row ? (JSON.parse(row.snapshot_json) as MemorySnapshot) : null;
}

// Public memories only, newest first.
export function listMemories(limit = 60): MemorySummary[] {
  const rows = db
    .prepare("SELECT id, snapshot_json FROM memories WHERE visibility = 'public' ORDER BY saved_at DESC LIMIT ?")
    .all(limit) as { id: string; snapshot_json: string }[];
  return rows.map(({ id, snapshot_json }) => {
    const m = JSON.parse(snapshot_json) as MemorySnapshot;
    return {
      id,
      sceneId: m.sceneId,
      mode: m.mode,
      title: m.title,
      savedAt: m.endedAt,
      contributors: m.contributors.map((p) => p.name),
      sounds: m.placements.length,
    };
  });
}
