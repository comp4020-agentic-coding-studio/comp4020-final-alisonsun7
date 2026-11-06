import { mkdtempSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { HUTS } from "../src/shared/huts.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";

// This boundary needs a controlled clock: jumping Date without running the
// 200 ms sweep leaves the exact expired entry a reconnect can encounter.
it("does not revive an expired hut occupant when someone else has already entered", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "soac-hut-admission-"));
  vi.stubEnv("DB_PATH", join(scratch, "place.db"));
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const start = Date.parse("2026-11-06T00:00:00.000Z");
  vi.setSystemTime(start);
  vi.resetModules();
  let database: typeof import("../src/db.ts").db | undefined;
  let closeWatcher: (() => void) | undefined;
  try {
    const { db } = await import("../src/db.ts");
    database = db;
    const sessions = await import("../src/sessions.ts");
    const { createUser } = await import("../src/users.ts");
    const a = createUser("Expired Ada", "cat").user;
    const b = createUser("Arriving Bo", "dog").user;
    const room = sessions.openSession("seaside", "weekday");
    const hut = HUTS.find((h) => h.id === "mens-toilet")!;
    const inside = { x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 - 1.6, yaw: 0 };
    const messages: ServerMessage[] = [];
    const watcher = { write: (frame: string) => { messages.push(JSON.parse(frame.slice(6).trim()) as ServerMessage); return true; } } as unknown as ServerResponse;
    sessions.subscribe(watcher, "seaside", "weekday", null);
    closeWatcher = () => sessions.unsubscribe(watcher, "seaside", "weekday", null);

    expect(sessions.move(a, room.id, inside)).toEqual({ ok: true });
    const left = sessions.leaveSound(a, room.id, { soundId: "toilet-flush", whileInside: true });
    expect(left.ok).toBe(true);
    const id = left.sound!.id;
    const aId = sessions.snapshotFor(room, a).you!.id;
    const bId = sessions.snapshotFor(room, b).you!.id;

    // No timer callbacks run here: Ada is expired but remains in the map.
    vi.setSystemTime(start + 20_001);
    expect(sessions.move(b, room.id, inside)).toEqual({ ok: true });
    const returned = sessions.move(a, room.id, inside);
    expect(returned).toMatchObject({ ok: false, code: "hut_taken", hutId: hut.id });
    if (!returned.ok && returned.code === "hut_taken") expect(returned.position.z).toBeGreaterThan(hut.z1);
    expect(sessions.leaveSound(a, room.id, { soundId: "toilet-flush", whileInside: true })).toMatchObject({ ok: false, code: "not_here" });
    expect(sessions.snapshotFor(room, null).sounds.some((sound) => sound.id === id)).toBe(false);
    // History survives the expiry cleanup; its original actor is recorded.
    expect(db.prepare("SELECT id, placed_by, removed_by, removed_at FROM placed_sounds WHERE id = ?").get(id)).toMatchObject({ id, placed_by: aId, removed_by: aId, removed_at: expect.any(String) });
    expect(messages.some((message) => message.type === "sound-removed" && message.id === id && message.left)).toBe(true);

    vi.advanceTimersByTime(200);
    const last = messages.filter((message) => message.type === "moves").at(-1);
    expect(last?.people.map((person) => person.id)).toEqual([bId]);
  } finally {
    closeWatcher?.();
    database?.close();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(scratch, { recursive: true, force: true });
  }
});
