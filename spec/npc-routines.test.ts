import { describe, expect, it, vi } from "vitest";
import { NpcRestroomRoutines } from "../src/npc-routines.ts";
import { HUTS } from "../src/shared/huts.ts";
import { NPC_ROUTINE_MS as duration } from "../src/shared/npc-routines.ts";
import { PLANET_HUTS, planetDistance, sceneHutAt } from "../src/shared/planet.ts";
import { buildPlanet } from "../src/client/planet-build.ts";

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
    const briefWait = start + duration.walking + 4000;
    routines.advance(briefWait, () => false);
    expect(frame(routines, briefWait)).toEqual(waiting);
    expect(routines.invite(briefWait)).toBe(false);
    routines.advance(briefWait + 200, () => true);
    expect(frame(routines, briefWait + 200)).toMatchObject({ phase: "entering", phaseStartedAt: new Date(briefWait + 200).toISOString() });
    expect(frame(routines, briefWait + 200).z).toBeGreaterThan(toilet.z1);
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

  it("has a shared outdoor daily walk instead of making an idle resident look like a queue", () => {
    const first = new NpcRestroomRoutines("planet", PLANET_HUTS, start);
    const second = new NpcRestroomRoutines("planet", PLANET_HUTS, start);
    const hut = PLANET_HUTS[0]!;
    const door = { x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 + .8 };
    const sampled = new Set<string>();
    let broadcasts = 0;
    for (let elapsed = 0; elapsed < duration.interval; elapsed += 200) {
      const now = start + elapsed;
      if (first.advance(now, () => true)) broadcasts++;
      second.advance(now, () => true);
      const state = frame(first, now);
      expect(state).toMatchObject({ phase: "idle", occupying: false });
      expect(first.frames(now)).toEqual(second.frames(now));
      expect(planetDistance(state, door)).toBeGreaterThan(4);
      expect(sceneHutAt("planet", state.x, state.z)).toBeUndefined();
      sampled.add(`${state.x},${state.z}`);
    }
    expect(sampled.size).toBeGreaterThan(20);
    expect(broadcasts).toBeGreaterThan(20);
    expect(first.active).toBe(false);
    expect(first.invite(start + duration.interval - 1)).toBe(true);
  });

  it("gives up a busy door after a short wait, walks away without reserving it and cools down", () => {
    const routines = new NpcRestroomRoutines("planet", PLANET_HUTS, start);
    const hut = PLANET_HUTS[0]!;
    routines.invite(start);
    const deadline = start + duration.walking + 8000;
    routines.advance(deadline - 1, () => false);
    expect(frame(routines, deadline - 1)).toMatchObject({ phase: "waiting", occupying: false });
    routines.advance(deadline, () => true);
    const leaving = frame(routines, deadline);
    expect(leaving).toMatchObject({ phase: "leaving", occupying: false });
    expect(leaving.z).toBeGreaterThan(hut.z1);
    expect(leaving.flushId).toBeUndefined();
    expect(routines.occupies(hut.id, deadline)).toBe(false);
    routines.advance(deadline + duration.leaving / 2, () => false);
    const midway = frame(routines, deadline + duration.leaving / 2);
    expect(planetDistance(midway, leaving)).toBeGreaterThan(.5);
    expect(midway.z).toBeGreaterThan(hut.z1);
    const finished = deadline + duration.leaving;
    routines.advance(finished, () => false);
    expect(frame(routines, finished)).toMatchObject({ phase: "idle", occupying: false });
    routines.advance(finished + duration.interval - 1, () => true);
    expect(frame(routines, finished + duration.interval - 1).phase).toBe("idle");
  });

  it("returns along the outdoor approach and resumes its interrupted ordinary activity without teleporting", () => {
    const routines = new NpcRestroomRoutines("planet", PLANET_HUTS, start);
    const inviteAt = start + 49_000;
    const origin = frame(routines, inviteAt);
    expect(planetDistance(origin, frame(routines, start))).toBeGreaterThan(.5);
    expect(routines.invite(inviteAt)).toBe(true);
    expect(planetDistance(frame(routines, inviteAt), origin)).toBeLessThan(.002);
    const leavingAt = inviteAt + duration.walking + duration.entering + duration.occupied + duration.flushing;
    const finished = leavingAt + duration.leaving;
    const samples: { x: number; z: number }[] = [];
    for (let now = inviteAt; now < finished; now += 100) {
      routines.advance(now, () => true);
      const state = frame(routines, now);
      if (state.phase === "walking" || state.phase === "leaving" && !state.occupying) {
        expect(sceneHutAt("planet", state.x, state.z)).toBeUndefined();
        samples.push(state);
      }
    }
    routines.advance(finished - 1, () => true);
    const almost = frame(routines, finished - 1);
    routines.advance(finished, () => true);
    const returned = frame(routines, finished);
    expect(returned.phase).toBe("idle");
    expect(planetDistance(almost, returned)).toBeLessThan(.01);
    expect(planetDistance(returned, origin)).toBeLessThan(.002);
    expect(samples.length).toBeGreaterThan(30);
  });

  it("spends over ninety percent of an active hour in ordinary life and cannot form a permanent queue", () => {
    for (const available of [true, false]) {
      const routines = new NpcRestroomRoutines("planet", PLANET_HUTS, start);
      let visits = 0, active = 0, waiting = 0, last = "idle";
      const hour = 3_600_000, step = 200;
      for (let elapsed = 0; elapsed < hour; elapsed += step) {
        const now = start + elapsed;
        routines.advance(now, () => available);
        const state = frame(routines, now);
        if (state.phase !== "idle") active += step;
        if (state.phase === "waiting") waiting += step;
        if (state.phase === "walking" && last === "idle") visits++;
        if (!available) expect(state.occupying).toBe(false);
        last = state.phase;
      }
      expect(visits).toBeGreaterThanOrEqual(8);
      expect(active / hour).toBeLessThan(.1);
      expect(waiting / hour).toBeLessThan(.03);
    }
  });

  it("keeps the authored daily and return routes on actual traversable planet ground", () => {
    // Sign rasterisation is irrelevant here; geometry, floors, hut boundaries
    // and the coastline use the same unmocked build as the production world.
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => new Proxy({}, { get: () => (() => {}) }) }) });
    const scene = buildPlanet();
    try {
      const ordinary = new NpcRestroomRoutines("planet", PLANET_HUTS, start);
      for (let elapsed = 0; elapsed < duration.interval; elapsed += 100) {
        const state = frame(ordinary, start + elapsed);
        expect(scene.canStand(state.x, state.z, new Set())).toBe(true);
        expect(scene.heightAt(state.x, state.z)).toBe(0);
      }
      for (const inviteAfter of [0, 49_000, 130_000]) {
        for (const available of [true, false]) {
          const routines = new NpcRestroomRoutines("planet", PLANET_HUTS, start);
          const invited = start + inviteAfter;
          routines.invite(invited);
          for (let elapsed = 0; elapsed <= 40_000; elapsed += 100) {
            const now = invited + elapsed;
            routines.advance(now, () => available);
            const state = frame(routines, now);
            expect(scene.canStand(state.x, state.z, new Set())).toBe(true);
          }
        }
      }
    } finally { scene.dispose(); vi.unstubAllGlobals(); }
  });
});
