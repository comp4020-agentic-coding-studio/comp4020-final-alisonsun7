import { mkdtempSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUTS } from "../src/shared/huts.ts";
import { NPC_ROUTINE_MS as duration } from "../src/shared/npc-routines.ts";
import { PLANET_HALF, PLANET_HUTS } from "../src/shared/planet.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";
import type { User } from "../src/users.ts";

describe("shared human and resident hut admission", () => {
  let scratch: string;
  let database: typeof import("../src/db.ts").db;
  let sessions: typeof import("../src/sessions.ts");
  let users: typeof import("../src/users.ts");
  let room: ReturnType<typeof sessions.openSession>;
  let closeStreams: (() => void)[];
  const start = Date.parse("2026-11-07T10:00:00Z");
  const toilet = HUTS.find(hut => hut.id === "mens-toilet")!;
  const inside = { x: (toilet.door.x0 + toilet.door.x1) / 2, z: toilet.z1 - 1.3, yaw: 0 };
  const outside = { x: inside.x, z: toilet.z1 + 1.2, yaw: 0 };
  const npc = () => sessions.snapshotFor(room, null).npcs![0]!;
  function watch(user: User | null = null, sceneId = "seaside") {
    const messages: ServerMessage[] = [];
    const response = { write: (frame: string) => { messages.push(JSON.parse(frame.slice(6).trim()) as ServerMessage); return true; } } as unknown as ServerResponse;
    sessions.subscribe(response, sceneId, "weekday", user);
    const close = () => sessions.unsubscribe(response, sceneId, "weekday", user);
    closeStreams.push(close);
    return { messages, close };
  }
  beforeEach(async () => {
    scratch = mkdtempSync(join(tmpdir(), "soac-npc-hut-"));
    closeStreams = [];
    vi.stubEnv("DB_PATH", join(scratch, "place.db"));
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(start);
    vi.resetModules();
    database = (await import("../src/db.ts")).db;
    sessions = await import("../src/sessions.ts");
    users = await import("../src/users.ts");
    room = sessions.openSession("seaside", "weekday");
  });
  afterEach(() => {
    for (const close of closeStreams) close();
    database?.close();
    vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs();
    rmSync(scratch, { recursive: true, force: true });
  });

  it("uses real authoritative locks, shares phases and flush tokens, and creates no NPC people or sounds", () => {
    const user = users.createUser("Watching Ada", "cat").user;
    const first = watch(user);
    sessions.move(user, room.id, outside);
    const counts = () => ["users", "participants", "placed_sounds", "sound_replies", "sound_operations"].map(table => database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get());
    const before = counts();
    expect(sessions.inviteNpcRestroom(user, room.id, { hutId: toilet.id })).toMatchObject({ ok: true, npcs: [{ phase: "walking", occupying: false }] });
    const second = watch();
    expect(second.messages.find(message => message.type === "snapshot")).toMatchObject({ npcs: [npc()] });
    vi.advanceTimersByTime(duration.walking + duration.entering);
    expect(npc()).toMatchObject({ phase: "occupied", occupying: true });
    expect(sessions.move(user, room.id, inside)).toMatchObject({ ok: false, code: "hut_taken", hutId: toilet.id, position: outside });
    expect(sessions.leaveSound(user, room.id, { soundId: "toilet-flush", whileInside: true })).toMatchObject({ ok: false, code: "not_inside" });
    vi.advanceTimersByTime(duration.occupied);
    const flushing = npc();
    expect(flushing).toMatchObject({ phase: "flushing", flushId: expect.any(String), occupying: true });
    for (const stream of [first, second]) expect(stream.messages.some(message => message.type === "moves"
      && message.npcs?.some(frame => frame.flushId === flushing.flushId))).toBe(true);
    expect(sessions.snapshotFor(room, null).online.map(person => person.name)).toEqual([user.nickname]);
    expect(first.messages.some(message => message.type === "sound-left")).toBe(false);
    vi.advanceTimersByTime(duration.flushing + duration.exitDoorway);
    expect(npc()).toMatchObject({ phase: "leaving", occupying: false });
    expect(sessions.move(user, room.id, inside)).toEqual({ ok: true });
    expect(counts()).toEqual(before);
  });

  it("never claims a human's occupied hut, and waits for an actual accepted exit", () => {
    const user = users.createUser("Inside Bo", "dog").user;
    watch(user);
    expect(sessions.move(user, room.id, inside)).toEqual({ ok: true });
    expect(sessions.inviteNpcRestroom(user, room.id, {})).toMatchObject({ ok: true });
    vi.advanceTimersByTime(duration.walking + 4000);
    expect(npc()).toMatchObject({ phase: "waiting", occupying: false });
    expect(npc().z).toBeGreaterThan(toilet.z1);
    expect(sessions.move(user, room.id, inside)).toEqual({ ok: true });
    vi.advanceTimersByTime(200);
    expect(npc().phase).toBe("waiting");
    expect(sessions.move(user, room.id, outside)).toEqual({ ok: true });
    vi.advanceTimersByTime(200);
    expect(npc()).toMatchObject({ phase: "entering", occupying: true });
    expect(sessions.move(user, room.id, inside)).toMatchObject({ ok: false, code: "hut_taken" });
  });

  it("validates and limits explicit invitations without accepting client-authored NPC state", () => {
    const user = users.createUser("Inviter", "cat").user;
    expect(sessions.inviteNpcRestroom(user, "missing", {})).toEqual({ ok: false, code: "no_session" });
    expect(sessions.inviteNpcRestroom(user, room.id, null)).toEqual({ ok: false, code: "bad_request" });
    expect(sessions.inviteNpcRestroom(user, room.id, { hutId: "shop" })).toEqual({ ok: false, code: "bad_request" });
    expect(sessions.inviteNpcRestroom(user, room.id, { hutId: "mens-shower" })).toEqual({ ok: false, code: "bad_request" });
    expect(sessions.inviteNpcRestroom(user, room.id, {})).toEqual({ ok: false, code: "not_here" });
    watch(user); sessions.move(user, room.id, outside);
    expect(sessions.inviteNpcRestroom(user, room.id, { x: Infinity, phase: "flushing", occupying: true })).toMatchObject({ ok: true, npcs: [{ phase: "walking", occupying: false, x: expect.any(Number) }] });
    expect(sessions.inviteNpcRestroom(user, room.id, {})).toEqual({ ok: false, code: "slow_down" });
    vi.advanceTimersByTime(5000);
    expect(sessions.inviteNpcRestroom(user, room.id, {})).toEqual({ ok: false, code: "busy" });
  });

  it("schedules visits only for listened-to rooms and releases all transient reservations on last disconnect", () => {
    const first = watch();
    expect(npc().phase).toBe("idle");
    vi.advanceTimersByTime(duration.interval - 200);
    expect(npc().phase).toBe("idle");
    vi.advanceTimersByTime(200 + duration.walking + duration.entering);
    expect(npc()).toMatchObject({ phase: "occupied", occupying: true });
    first.close();
    expect(sessions.snapshotFor(room, null).npcs).toEqual([]);
    vi.advanceTimersByTime(duration.interval * 2);
    watch();
    expect(npc()).toMatchObject({ phase: "idle", occupying: false });
    const user = users.createUser("New arrival", "cat").user;
    expect(sessions.move(user, room.id, inside)).toEqual({ ok: true });
  });

  it("uses the planet's own hut layout for human and NPC admission", () => {
    const planet = sessions.openSession("planet", "weekday");
    const user = users.createUser("Planet tester", "cat").user;
    watch(user, "planet");
    const hut = PLANET_HUTS.find(item => item.kind.endsWith("toilet"))!;
    const position = { x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 - 1.3, yaw: 0 };
    const doorway = { ...position, z: hut.z1 + 1.2 };
    expect(sessions.move(user, planet.id, doorway)).toEqual({ ok: true });
    expect(sessions.inviteNpcRestroom(user, planet.id, { hutId: hut.id })).toMatchObject({ ok: true });
    vi.advanceTimersByTime(duration.walking + duration.entering);
    expect(sessions.snapshotFor(planet, null).npcs).toMatchObject([{ hutId: hut.id, phase: "occupied", occupying: true }]);
    expect(sessions.move(user, planet.id, position)).toMatchObject({ ok: false, code: "hut_taken", hutId: hut.id });
    vi.advanceTimersByTime(duration.occupied + duration.flushing + duration.exitDoorway);
    expect(sessions.move(user, planet.id, position)).toEqual({ ok: true });
    expect(sessions.leaveSound(user, planet.id, { soundId: "toilet-flush", whileInside: true })).toMatchObject({ ok: true, sound: { whileIn: hut.id } });
    expect(sessions.snapshotFor(room, null).sounds).toEqual([]);
  });

  it("enforces sound spacing, crowding, removal and talk by spherical distance across the planet seam", () => {
    const planet = sessions.openSession("planet", "weekday");
    const ada = users.createUser("Seam Ada", "cat").user;
    const bo = users.createUser("Seam Bo", "dog").user;
    watch(ada, "planet");
    const listener = watch(bo, "planet");
    expect(sessions.move(ada, planet.id, { x: PLANET_HALF - 0.8, z: 0, yaw: 0 })).toEqual({ ok: true });
    expect(sessions.move(bo, planet.id, { x: -PLANET_HALF + 0.8, z: 0, yaw: 0 })).toEqual({ ok: true });
    const guitar = sessions.leaveSound(ada, planet.id, { soundId: "guitar" });
    expect(guitar.ok).toBe(true);
    expect(sessions.leaveSound(bo, planet.id, { soundId: "guitar" })).toMatchObject({ ok: false, code: "too_close" });
    expect(sessions.leaveSound(bo, planet.id, { soundId: "trickle" })).toMatchObject({ ok: true });
    expect(sessions.say(ada, planet.id, { text: "Hello around the world" })).toMatchObject({ ok: true, heard: 1 });
    expect(listener.messages.some(message => message.type === "said" && message.text === "Hello around the world")).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(sessions.removeSound(bo, planet.id, guitar.sound!.id)).toEqual({ ok: true });
    for (const soundId of ["guitar", "cafe-chatter", "cafe-music", "coastal-gulls", "children-playing"]) {
      vi.advanceTimersByTime(1000);
      expect(sessions.leaveSound(ada, planet.id, { soundId }).ok, soundId).toBe(true);
    }
    expect(sessions.leaveSound(bo, planet.id, { soundId: "espresso" })).toMatchObject({ ok: false, code: "crowded" });
    expect(sessions.move(ada, planet.id, { x: PLANET_HALF + .01, z: 0, yaw: 0 })).toEqual({ ok: false, code: "bad_request" });
    expect(sessions.move(ada, planet.id, { x: 0, z: PLANET_HALF / 2 + .01, yaw: 0 })).toEqual({ ok: false, code: "bad_request" });
    expect(sessions.snapshotFor(room, null).sounds).toEqual([]);
  });
});
