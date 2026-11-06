import { mkdtempSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HUTS } from "../src/shared/huts.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";
import { PLACE_MAX } from "../src/shared/sounds.ts";
import type { User } from "../src/users.ts";

// Real SQLite and session operations, with an isolated database and clock.
// HTTP and browser suites separately exercise cookies, routing and the UI.
let scratch: string;
let database: typeof import("../src/db.ts").db;
let sessions: typeof import("../src/sessions.ts");
let users: typeof import("../src/users.ts");
let room: ReturnType<typeof sessions.openSession>;
let unsubscribers: (() => void)[];

async function load() {
  vi.resetModules();
  database = (await import("../src/db.ts")).db;
  sessions = await import("../src/sessions.ts");
  users = await import("../src/users.ts");
  room = sessions.openSession("seaside", "weekday");
}
beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "soac-replies-"));
  unsubscribers = [];
  vi.stubEnv("DB_PATH", join(scratch, "place.db"));
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(Date.parse("2026-11-06T00:00:00Z"));
  await load();
});
afterEach(() => {
  for (const close of unsubscribers) close();
  database?.close();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(scratch, { recursive: true, force: true });
});

const tick = () => vi.advanceTimersByTime(1100);
function person(name: string, x = 900, z = 900): User {
  const user = users.createUser(name, "cat").user;
  expect(sessions.move(user, room.id, { x, z, yaw: 0 })).toEqual({ ok: true });
  return user;
}
function watch(): ServerMessage[] {
  const messages: ServerMessage[] = [];
  const response = { write: (frame: string) => { messages.push(JSON.parse(frame.slice(6).trim()) as ServerMessage); return true; } } as unknown as ServerResponse;
  sessions.subscribe(response, "seaside", "weekday", null);
  unsubscribers.push(() => sessions.unsubscribe(response, "seaside", "weekday", null));
  return messages;
}

it("commits a parent and two branches, broadcasts attribution, and replays one operation without another row or event", () => {
  const source = sessions.leaveSound(person("Ada", 800, 800), room.id, { soundId: "evening-forest" }).sound!;
  const sourceBefore = database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(source.id);
  const messages = watch();
  const b = person("Bo", 900, 900);
  const c = person("Cy", 930, 930);
  const request = { soundId: "trickle", replyToId: source.id, operationId: "reply-operation-bo" };
  const first = sessions.leaveSound(b, room.id, request);
  const retry = sessions.leaveSound(b, room.id, request);
  expect(first).toMatchObject({ ok: true, sound: { by: "Bo", x: 900, z: 900, replyToId: source.id, replyTo: { id: source.id, by: "Ada" } } });
  expect(retry).toMatchObject({ ok: true, replayed: true, sound: { id: first.sound!.id } });
  const second = sessions.leaveSound(c, room.id, { ...request, operationId: "reply-operation-cy" });
  expect(second.ok).toBe(true);
  expect(second.sound!.id).not.toBe(first.sound!.id);
  expect(database.prepare("SELECT COUNT(*) AS n FROM sound_replies").get()).toMatchObject({ n: 2 });
  expect(messages.filter((m) => m.type === "sound-left")).toHaveLength(2);
  expect(messages.filter((m) => m.type === "sound-left").every((m) => m.sound.replyTo?.id === source.id)).toBe(true);
  expect(database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(source.id)).toEqual(sourceBefore);
  expect(sessions.snapshotFor(room, null).sounds.find((sound) => sound.id === first.sound!.id)?.replyTo).toMatchObject({ id: source.id, by: "Ada" });
  const related = sessions.soundReplies(room.id, source.id);
  expect(related.ok && related.replies.map((sound) => sound.id).sort()).toEqual([first.sound!.id, second.sound!.id].sort());
  // Request identity is scoped to the cookie's user, not a global token.
  expect(sessions.leaveSound(person("Dee", 960, 960), room.id, request)).toMatchObject({ ok: true, sound: { by: "Dee" } });
});

it("rejects retargeted retries and applies rate, spacing, crowding and total capacity to new reply operations", () => {
  const source = sessions.leaveSound(person("Ada", 800, 800), room.id, { soundId: "evening-forest" }).sound!;
  const b = person("Bo");
  const request = { soundId: "trickle", replyToId: source.id, operationId: "stable-operation" };
  expect(sessions.leaveSound(b, room.id, request).ok).toBe(true);
  expect(sessions.leaveSound(b, room.id, { ...request, soundId: "espresso" })).toMatchObject({ code: "operation_conflict" });
  expect(sessions.leaveSound(b, room.id, { ...request, operationId: "fresh-operation", soundId: "espresso" })).toMatchObject({ code: "slow_down" });
  tick();
  expect(sessions.leaveSound(b, room.id, { ...request, operationId: "spaced-operation" })).toMatchObject({ code: "too_close" });
  for (const soundId of ["guitar", "espresso", "cafe-music", "cafe-chatter", "beach-waves"]) {
    expect(sessions.leaveSound(person(soundId), room.id, { soundId, replyToId: source.id, operationId: `crowd-${soundId}` }).ok).toBe(true);
  }
  expect(sessions.leaveSound(b, room.id, { ...request, operationId: "crowded-operation", soundId: "children-playing" })).toMatchObject({ code: "crowded" });
  // Populate only this scratch database to reach the capacity boundary.
  const count = (database.prepare("SELECT COUNT(*) AS n FROM placed_sounds").get() as { n: number }).n;
  const author = sessions.snapshotFor(room, b).you!.id;
  const insert = database.prepare("INSERT INTO placed_sounds (id,session_id,sound_id,x,z,placed_by,placed_at) VALUES (?,?,'guitar',1500,1500,?,?)");
  for (let i = count; i < PLACE_MAX; i++) insert.run(`snd_${i.toString(16).padStart(16, "0")}`, room.id, author, new Date().toISOString());
  expect(sessions.leaveSound(person("Full", 1700, 1700), room.id, { soundId: "trickle", replyToId: source.id, operationId: "full-operation" })).toMatchObject({ code: "place_full" });
  expect(database.prepare("SELECT COUNT(*) AS n FROM sound_operations WHERE operation_id IN ('fresh-operation','spaced-operation','crowded-operation','full-operation')").get()).toMatchObject({ n: 0 });
});

it("refuses a source removed before commit, without silently placing an ordinary sound", () => {
  const a = person("Ada");
  const source = sessions.leaveSound(a, room.id, { soundId: "guitar" }).sound!;
  tick();
  expect(sessions.removeSound(a, room.id, source.id).ok).toBe(true);
  const before = database.prepare("SELECT COUNT(*) AS n FROM placed_sounds").get();
  const b = person("Bo", 930, 930);
  expect(sessions.leaveSound(b, room.id, { soundId: "trickle", replyToId: source.id, operationId: "deleted-source" })).toMatchObject({ code: "reply_gone" });
  expect(sessions.leaveSound(b, room.id, { soundId: "trickle", replyToId: "snd_0000000000000000", operationId: "missing-source" })).toMatchObject({ code: "reply_gone" });
  expect(sessions.leaveSound(b, room.id, { soundId: "trickle", replyToId: source.id })).toMatchObject({ code: "bad_request" });
  expect(database.prepare("SELECT COUNT(*) AS n FROM placed_sounds").get()).toEqual(before);
  expect(database.prepare("SELECT COUNT(*) AS n FROM sound_replies").get()).toMatchObject({ n: 0 });
});

it("excludes private-stay sounds as either endpoint and from public conversation reads", () => {
  const parent = sessions.leaveSound(person("Ada", 800, 800), room.id, { soundId: "guitar" }).sound!;
  const hut = HUTS[0];
  const occupant = person("Private", (hut.door.x0 + hut.door.x1) / 2, hut.z1 - 1.6);
  const privateSound = sessions.leaveSound(occupant, room.id, { soundId: "toilet-flush", whileInside: true }).sound!;
  const b = person("Bo");
  expect(sessions.leaveSound(b, room.id, { soundId: "trickle", replyToId: privateSound.id, operationId: "private-parent" })).toMatchObject({ code: "reply_private" });
  expect(sessions.leaveSound(occupant, room.id, { soundId: "toilet-flush", whileInside: true, replyToId: parent.id, operationId: "private-answer" })).toMatchObject({ code: "reply_private" });
  expect(sessions.soundReplies(room.id, privateSound.id)).toEqual({ ok: false, code: "reply_private" });
  expect(database.prepare("SELECT COUNT(*) AS n FROM sound_replies").get()).toMatchObject({ n: 0 });
});

it("restores links and retry acknowledgements after restart, preserving removed parents and answers as tombstones", async () => {
  const a = person("Ada", 800, 800);
  const source = sessions.leaveSound(a, room.id, { soundId: "guitar" }).sound!;
  const b = person("Bo");
  const request = { soundId: "trickle", replyToId: source.id, operationId: "restart-operation" };
  const answer = sessions.leaveSound(b, room.id, request).sound!;
  database.close();
  vi.clearAllTimers();
  await load();
  // No move is needed for a read-only retry of an already committed command.
  expect(sessions.leaveSound(b, room.id, request)).toMatchObject({ ok: true, replayed: true, sound: { id: answer.id, x: 900, z: 900, replyTo: { id: source.id } } });
  expect(sessions.move(a, room.id, { x: source.x, z: source.z, yaw: 0 }).ok).toBe(true);
  const messages = watch();
  expect(sessions.removeSound(a, room.id, source.id).ok).toBe(true);
  expect(messages.some((m) => m.type === "sound-removed" && m.id === source.id && !!m.removedAt)).toBe(true);
  const late = sessions.snapshotFor(room, null);
  expect(late.sounds.some((sound) => sound.id === source.id)).toBe(false);
  expect(late.sounds.find((sound) => sound.id === answer.id)?.replyTo).toMatchObject({ id: source.id, by: "Ada", removedAt: expect.any(String) });
  // A nearby third person may remove the answer: attribution grants no lock.
  expect(sessions.removeSound(person("Cy"), room.id, answer.id).ok).toBe(true);
  expect(sessions.leaveSound(b, room.id, request)).toMatchObject({ ok: true, replayed: true, sound: { id: answer.id, removedAt: expect.any(String), replyTo: { id: source.id, removedAt: expect.any(String) } } });
  expect(sessions.snapshotFor(room, null).sounds).toHaveLength(0);
  const related = sessions.soundReplies(room.id, source.id);
  expect(related).toMatchObject({ ok: true, sound: { removedAt: expect.any(String) }, replies: [{ id: answer.id, removedAt: expect.any(String) }] });
  expect(database.prepare("SELECT COUNT(*) AS n FROM placed_sounds").get()).toMatchObject({ n: 2 });
});

it("paginates direct replies without dropping removed endpoints or repeating cursor rows", () => {
  const source = sessions.leaveSound(person("Ada", 800, 800), room.id, { soundId: "guitar" }).sound!;
  const ids: string[] = [];
  for (let i = 0; i < 51; i++) {
    const user = person(`Responder ${i}`, 1100 + (i % 10) * 15, 1100 + Math.floor(i / 10) * 15);
    const reply = sessions.leaveSound(user, room.id, { soundId: "trickle", replyToId: source.id, operationId: "page-operation" });
    expect(reply.ok).toBe(true);
    ids.push(reply.sound!.id);
  }
  expect(sessions.removeSound(person("Cleaner", 1100, 1100), room.id, ids[0]).ok).toBe(true);
  const first = sessions.soundReplies(room.id, source.id);
  expect(first.ok && first.replies).toHaveLength(50);
  if (!first.ok) throw new Error("no replies");
  expect(first.nextCursor).toBeTruthy();
  const second = sessions.soundReplies(room.id, source.id, first.nextCursor!);
  if (!second.ok) throw new Error("no second page");
  expect(second.replies).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect([...first.replies, ...second.replies].map((sound) => sound.id).sort()).toEqual([...ids].sort());
  expect([...first.replies, ...second.replies].find((sound) => sound.id === ids[0])?.removedAt).toEqual(expect.any(String));
  expect(sessions.soundReplies(room.id, source.id, source.id)).toMatchObject({ code: "bad_request" });
});

it("adds reply tables to an old database without rewriting its existing sound rows", async () => {
  const old = sessions.leaveSound(person("Existing"), room.id, { soundId: "guitar" }).sound!;
  const before = database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(old.id);
  database.exec("DROP TABLE sound_operations; DROP TABLE sound_replies");
  database.close();
  vi.clearAllTimers();
  await load();
  expect(database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(old.id)).toEqual(before);
  expect(database.prepare("SELECT COUNT(*) AS n FROM sound_replies").get()).toMatchObject({ n: 0 });
  expect(database.prepare("SELECT COUNT(*) AS n FROM sound_operations").get()).toMatchObject({ n: 0 });
});
