import { describe, expect, it } from "vitest";
import { NpcRestroomRoutines } from "../src/npc-routines.ts";
import { HUTS } from "../src/shared/huts.ts";
import { NPC_ROUTINE_MS as duration } from "../src/shared/npc-routines.ts";

const start = Date.parse("2026-11-07T10:00:00Z");
const toilet = HUTS.find(hut => hut.kind.endsWith("toilet"))!;
const frame = (routines: NpcRestroomRoutines, at: number) => routines.frames(at)[0]!;

describe("server-controlled resident restroom routine", () => {
  it("walks, claims, uses, flushes once, exits through the doorway and returns home", () => {
    const routines = new NpcRestroomRoutines("seaside", HUTS, start);
    const home = frame(routines, start);
    expect(home).toMatchObject({ phase: "idle", occupying: false });
    expect(routines.invite(start)).toBe(true);
    routines.advance(start + duration.walking / 2, () => true);
    const walking = frame(routines, start + duration.walking / 2);
    expect(walking).toMatchObject({ phase: "walking", occupying: false });
    expect(walking.x).not.toBe(home.x);
    expect(walking.z).toBeGreaterThan(toilet.z1);
    let now = start + duration.walking;
    routines.advance(now, () => true);
    expect(frame(routines, now)).toMatchObject({ phase: "entering", occupying: true });
    expect(routines.occupies(toilet.id, now)).toBe(true);
    expect(routines.occupies(toilet.id, now, home.id)).toBe(false);
    now += duration.entering;
    routines.advance(now, () => true);
    expect(frame(routines, now)).toMatchObject({ phase: "occupied", occupying: true });
    expect(frame(routines, now).z).toBeLessThan(toilet.z1);
    now += duration.occupied;
    routines.advance(now, () => true);
    const flush = frame(routines, now);
    expect(flush).toMatchObject({ phase: "flushing", occupying: true, flushId: expect.any(String) });
    expect(frame(routines, now + 1000).flushId).toBe(flush.flushId);
    now += duration.flushing;
    routines.advance(now, () => true);
    const leaving = frame(routines, now);
    expect(leaving).toMatchObject({ phase: "leaving", occupying: true });
    expect(leaving.flushId).toBeUndefined();
    routines.advance(now + duration.exitDoorway, () => true);
    const outside = frame(routines, now + duration.exitDoorway);
    expect(outside.occupying).toBe(false);
    expect(outside.z).toBeGreaterThan(toilet.z1);
    expect(outside.x).toBe((toilet.door.x0 + toilet.door.x1) / 2);
    now += duration.leaving;
    routines.advance(now, () => true);
    expect(frame(routines, now)).toMatchObject({ phase: "idle", occupying: false, x: home.x, z: home.z });
  });

  it("waits outside a human-occupied hut and cannot force or skip its entry", () => {
    const routines = new NpcRestroomRoutines("seaside", HUTS, start);
    expect(routines.invite(start, toilet.id)).toBe(true);
    routines.advance(start + duration.walking, () => false);
    const waiting = frame(routines, start + duration.walking);
    expect(waiting).toMatchObject({ phase: "waiting", occupying: false });
    expect(waiting.z).toBeGreaterThan(toilet.z1);
    routines.advance(start + 100_000, () => false);
    expect(frame(routines, start + 100_000)).toEqual(waiting);
    expect(routines.invite(start + 100_000)).toBe(false);
    routines.advance(start + 101_000, () => true);
    expect(frame(routines, start + 101_000)).toMatchObject({ phase: "entering", phaseStartedAt: new Date(start + 101_000).toISOString() });
    expect(frame(routines, start + 101_000).z).toBeGreaterThan(toilet.z1);
  });

  it("starts slow automatic visits only when explicitly advanced by an active room", () => {
    const routines = new NpcRestroomRoutines("seaside", HUTS, start);
    routines.advance(start + duration.interval - 1, () => true);
    expect(frame(routines, start + duration.interval - 1).phase).toBe("idle");
    routines.advance(start + duration.interval, () => true);
    expect(frame(routines, start + duration.interval)).toMatchObject({ phase: "walking", occupying: false });
    expect(routines.invite(start + duration.interval + 1)).toBe(false);
  });

  it("rejects unsuitable huts and produces deterministic, detached finite frames", () => {
    const first = new NpcRestroomRoutines("seaside", HUTS, start);
    const second = new NpcRestroomRoutines("seaside", HUTS, start);
    expect(first.invite(start, "shop")).toBe(false);
    expect(first.invite(start, "mens-shower")).toBe(false);
    expect(first.invite(NaN)).toBe(false);
    expect(new NpcRestroomRoutines("empty", [], start).frames(start)).toEqual([]);
    first.invite(start); second.invite(start);
    for (const now of [start, start + 1000, start + 6000, start + 8000, start + 13000, start + 16500, start + 22500]) {
      first.advance(now, () => true); second.advance(now, () => true);
      expect(first.frames(now)).toEqual(second.frames(now));
      const state = frame(first, now);
      expect([state.x, state.z, state.yaw, Date.parse(state.phaseStartedAt)].every(Number.isFinite)).toBe(true);
      state.x = Infinity;
      expect(Number.isFinite(frame(first, now).x)).toBe(true);
    }
    expect(first.frames(NaN)).toEqual([]);
  });
});
