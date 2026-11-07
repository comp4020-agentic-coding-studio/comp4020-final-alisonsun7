import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChorusWork } from "../src/shared/chorus.ts";
import { PLANET_HUTS, PLANET_PLACES } from "../src/shared/planet.ts";
import type { ServerMessage, Snapshot } from "../src/shared/protocol.ts";
import type { User } from "../src/users.ts";

// These are server-state checks: real SQLite, real cookie authentication and
// real SSE frames. Browser interaction, network latency, hearing the mix and
// a real next-day return are separate checks, not simulated accomplishments.
describe("a durable work made from authenticated sound replies", () => {
  let scratch: string;
  let database: typeof import("../src/db.ts").db;
  let sessions: typeof import("../src/sessions.ts");
  let users: typeof import("../src/users.ts");
  let room: ReturnType<typeof sessions.openSession>;
  let closeStreams: (() => void)[];

  async function load() {
    vi.resetModules();
    database = (await import("../src/db.ts")).db;
    sessions = await import("../src/sessions.ts");
    users = await import("../src/users.ts");
    room = sessions.openSession("planet", "weekday");
  }
  function fromCookie(token: string): User {
    const user = users.userFromRequest({ headers: { cookie: `soac_session=${token}` } } as IncomingMessage);
    expect(user).not.toBeNull();
    return user!;
  }
  function person(name: string, x = 0, z = 0) {
    const identity = users.createUser(name, "cat");
    const user = fromCookie(identity.token);
    expect(sessions.move(user, room.id, { x, z, yaw: 0 })).toEqual({ ok: true });
    return { ...identity, user };
  }
  function watch(user: User | null = null) {
    const messages: ServerMessage[] = [];
    const response = { write(frame: string) { messages.push(JSON.parse(frame.slice(6).trim()) as ServerMessage); return true; } } as unknown as ServerResponse;
    sessions.subscribe(response, "planet", "weekday", user);
    const close = () => sessions.unsubscribe(response, "planet", "weekday", user);
    closeStreams.push(close);
    return { messages, close, snapshot: () => messages.find(message => message.type === "snapshot") as Snapshot };
  }
  const tick = () => vi.advanceTimersByTime(1100);
  const works = (): ChorusWork[] => {
    const result = sessions.snapshotFor(room, null).chorus;
    expect(result, "the authoritative planet snapshot must include its work projection").toBeDefined();
    return result!;
  };
  const sourceRows = () => database.prepare("SELECT * FROM placed_sounds ORDER BY id").all();
  const latestChange = (messages: ServerMessage[]) => messages.filter(message => message.type === "sound-left" || message.type === "sound-removed").at(-1)!;

  beforeEach(async () => {
    scratch = mkdtempSync(join(tmpdir(), "little-chorus-state-"));
    closeStreams = [];
    vi.stubEnv("DB_PATH", join(scratch, "place.db"));
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(Date.parse("2026-11-07T12:00:00Z"));
    await load();
  });
  afterEach(() => {
    for (const close of closeStreams) close();
    database?.close();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(scratch, { recursive: true, force: true });
  });

  it("counts a shared cookie once, but a second authenticated identity opens the same work in both streams", () => {
    const ada = person("Same display name");
    const firstTab = watch(ada.user);
    const secondTab = watch(fromCookie(ada.token));
    expect(firstTab.snapshot().you!.id).toBe(secondTab.snapshot().you!.id);
    expect(sessions.snapshotFor(room, ada.user).online).toHaveLength(1);
    const root = sessions.leaveSound(ada.user, room.id, { soundId: "trickle", operationId: "identity-root" }).sound!;
    tick();
    expect(sessions.move(fromCookie(ada.token), room.id, { x: 1, z: 1, yaw: 0 }).ok).toBe(true);
    const ownAnswer = sessions.leaveSound(fromCookie(ada.token), room.id, { soundId: "evening-forest", replyToId: root.id, operationId: "identity-own-answer" }).sound!;
    expect(works()).toMatchObject([{ id: root.id, variant: "habitat", duet: false, contributors: [{ id: root.byId }] }]);
    expect(ownAnswer.byId).toBe(root.byId);

    // The display name does not establish identity, and a different token
    // does not borrow the first person's participant even with the same name.
    const friend = person("Same display name", -1, 1);
    const otherBrowser = watch(friend.user);
    expect(friend.user.id).not.toBe(ada.user.id);
    expect(otherBrowser.snapshot().you!.id).not.toBe(firstTab.snapshot().you!.id);
    const answer = sessions.leaveSound(friend.user, room.id, { soundId: "bicycle-bell", replyToId: root.id, operationId: "identity-friend-answer" });
    expect(answer.ok).toBe(true);
    const canonical = works();
    expect(canonical).toHaveLength(1);
    expect(canonical[0]).toMatchObject({ id: root.id, duet: true, variant: "habitat", placeId: "green" });
    expect(canonical[0].contributors.map(contributor => contributor.id).sort()).toEqual([root.byId, answer.sound!.byId].sort());
    expect(sessions.snapshotFor(room, null).online).toHaveLength(2);
    for (const stream of [firstTab, secondTab, otherBrowser]) expect(latestChange(stream.messages)).toMatchObject({ type: "sound-left", chorus: canonical });
  });

  it("serializes two same-tick replies and an explicit retry into one canonical graph without duplicate sources or events", async () => {
    const ada = person("Ada");
    const source = sessions.leaveSound(ada.user, room.id, { soundId: "trickle", operationId: "branch-root" }).sound!;
    const sourceBefore = database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(source.id);
    const bo = person("Bo", 1, 0), cy = person("Cy", -1, 0);
    const stream = watch();
    const request = { soundId: "evening-forest", replyToId: source.id, operationId: "branch-bo-answer" };
    const replies = await Promise.all([
      Promise.resolve().then(() => sessions.leaveSound(bo.user, room.id, request)),
      Promise.resolve().then(() => sessions.leaveSound(cy.user, room.id, { soundId: "guitar", replyToId: source.id, operationId: "branch-cy-answer" })),
      Promise.resolve().then(() => sessions.leaveSound(fromCookie(bo.token), room.id, request)),
    ]);
    expect(replies.every(reply => reply.ok)).toBe(true);
    expect(replies[2]).toMatchObject({ replayed: true, sound: { id: replies[0].sound!.id } });
    expect(replies[1].sound!.id).not.toBe(replies[0].sound!.id);
    expect(sourceRows()).toHaveLength(3);
    expect(database.prepare("SELECT COUNT(*) AS n FROM sound_replies").get()).toEqual({ n: 2 });
    expect(stream.messages.filter(message => message.type === "sound-left")).toHaveLength(2);
    expect(database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(source.id)).toEqual(sourceBefore);
    const work = works()[0];
    expect(work).toMatchObject({ id: source.id, duet: true });
    expect(work.sources.map(sound => sound.id).sort()).toEqual([source.id, replies[0].sound!.id, replies[1].sound!.id].sort());
    expect(latestChange(stream.messages)).toMatchObject({ chorus: [work] });
    // Same timestamp, deliberately reversed input: neither DB row delivery
    // order nor the visitor's join order is allowed to choose a new result.
    const { deriveChorusWorks } = await import("../src/shared/chorus.ts");
    expect(deriveChorusWorks([...work.sources].reverse())).toEqual([work]);
    const reconnect = watch(bo.user);
    expect(reconnect.snapshot().chorus).toEqual([work]);
  });

  it.each([
    ["green", "trickle", "evening-forest", "habitat"],
    ["stage", "guitar", "hand-claps", "ensemble"],
    ["reading", "gentle-breeze", "bicycle-bell", "lantern"],
  ] as const)("derives the %s result from actual live contributions, preserving the author's location", (placeId, first, second, variant) => {
    const place = PLANET_PLACES.find(item => item.id === placeId)!;
    const ada = person("Ada", place.x, place.z);
    const bo = person("Bo", place.x + 1, place.z);
    const a = watch(ada.user), b = watch(bo.user);
    const source = sessions.leaveSound(ada.user, room.id, { soundId: first, operationId: `variant-${placeId}-root` }).sound!;
    expect(works()[0].duet).toBe(false);
    expect(sessions.leaveSound(bo.user, room.id, { soundId: second, replyToId: source.id, operationId: `variant-${placeId}-answer` }).ok).toBe(true);
    const canonical = works();
    expect(canonical).toHaveLength(1);
    expect(canonical[0]).toMatchObject({ id: source.id, placeId, x: place.x, z: place.z, duet: true, variant });
    expect(canonical[0].liveSources).toHaveLength(2);
    expect(canonical[0].contributors.map(person => person.name).sort()).toEqual(["Ada", "Bo"]);
    expect(latestChange(a.messages)).toMatchObject({ chorus: canonical });
    expect(latestChange(b.messages)).toMatchObject({ chorus: canonical });
  });

  it("keeps a removed parent as attributed history while the live result closes, and rejects a late reply", () => {
    const ada = person("Ada"), bo = person("Bo", 1, 0), cy = person("Cy", -1, 0);
    const source = sessions.leaveSound(ada.user, room.id, { soundId: "guitar", operationId: "remove-root" }).sound!;
    const request = { soundId: "hand-claps", replyToId: source.id, operationId: "remove-answer" };
    const answer = sessions.leaveSound(bo.user, room.id, request).sound!;
    const stream = watch();
    expect(works()[0]).toMatchObject({ id: source.id, variant: "ensemble", duet: true });
    tick();
    expect(sessions.removeSound(ada.user, room.id, source.id)).toEqual({ ok: true });
    expect(sessions.leaveSound(cy.user, room.id, { soundId: "trickle", replyToId: source.id, operationId: "remove-late-reply" })).toMatchObject({ ok: false, code: "reply_gone" });
    const after = works();
    expect(after[0]).toMatchObject({ id: source.id, duet: false, variant: "lantern" });
    expect(after[0].sources).toHaveLength(2);
    expect(after[0].sources.find(sound => sound.id === source.id)).toMatchObject({ by: "Ada", removedAt: expect.any(String) });
    expect(after[0].sources.find(sound => sound.id === answer.id)).toMatchObject({ by: "Bo", replyToId: source.id });
    expect(after[0].liveSources.map(sound => sound.id)).toEqual([answer.id]);
    expect(latestChange(stream.messages)).toMatchObject({ type: "sound-removed", id: source.id, chorus: after });
    expect(watch().snapshot().chorus).toEqual(after);
    tick();
    expect(sessions.removeSound(bo.user, room.id, answer.id)).toEqual({ ok: true });
    const archived = works()[0];
    expect(archived).toMatchObject({ id: source.id, duet: false, liveSources: [] });
    expect(archived.sources).toHaveLength(2);
    expect(archived.sources.every(sound => !!sound.removedAt)).toBe(true);
    expect(sessions.leaveSound(bo.user, room.id, request)).toMatchObject({ ok: true, replayed: true, sound: { id: answer.id, removedAt: expect.any(String) } });
    expect(sessions.snapshotFor(room, null).sounds).toEqual([]);
    expect(sourceRows()).toHaveLength(2);
    expect(database.prepare("SELECT COUNT(*) AS n FROM sound_operations WHERE operation_id = 'remove-late-reply'").get()).toEqual({ n: 0 });
  });

  it("restores the identical work, cookie identity and retry after closing SQLite and recreating all server modules", async () => {
    const ada = person("Ada"), bo = person("Bo", 1, 0);
    watch(ada.user); watch(bo.user);
    const source = sessions.leaveSound(ada.user, room.id, { soundId: "trickle", operationId: "restart-work-root" }).sound!;
    const request = { soundId: "evening-forest", replyToId: source.id, operationId: "restart-work-answer" };
    const answer = sessions.leaveSound(bo.user, room.id, request).sound!;
    const before = works(), rows = sourceRows(), sessionId = room.id;
    const participantId = sessions.snapshotFor(room, bo.user).you!.id;
    for (const close of closeStreams) close(); closeStreams = [];
    database.close(); vi.clearAllTimers();
    await load();
    const restoredBo = fromCookie(bo.token);
    expect(restoredBo).toEqual(bo.user);
    expect(room.id).toBe(sessionId);
    expect(works()).toEqual(before);
    expect(sourceRows()).toEqual(rows);
    expect(sessions.snapshotFor(room, restoredBo).you!.id).toBe(participantId);
    expect(sessions.snapshotFor(room, null).online).toEqual([]);
    expect(sessions.leaveSound(restoredBo, room.id, request)).toMatchObject({ ok: true, replayed: true, sound: { id: answer.id, replyToId: source.id } });
    expect(watch(restoredBo).snapshot().chorus).toEqual(before);
    expect(sourceRows()).toEqual(rows);
  });

  it("never treats a private stay, a visitor or a restroom resident as a coauthor", () => {
    const ada = person("Ada");
    watch(ada.user); watch();
    sessions.leaveSound(ada.user, room.id, { soundId: "trickle", operationId: "private-exclusion-root" });
    const before = works();
    const hut = PLANET_HUTS.find(item => item.kind.endsWith("toilet"))!;
    const occupant = person("Private visitor", (hut.door.x0 + hut.door.x1) / 2, hut.z1 - 1.3);
    watch(occupant.user);
    const stay = sessions.leaveSound(occupant.user, room.id, { soundId: "toilet-flush", whileInside: true });
    expect(stay).toMatchObject({ ok: true, sound: { whileIn: hut.id } });
    expect(sessions.snapshotFor(room, null).sounds.some(sound => sound.id === stay.sound!.id)).toBe(true);
    expect(works()).toEqual(before);
    const participantCount = database.prepare("SELECT COUNT(*) AS n FROM participants").get();
    expect(sessions.inviteNpcRestroom(ada.user, room.id, { hutId: hut.id })).toMatchObject({ ok: true });
    vi.advanceTimersByTime(1000);
    expect(works()).toEqual(before);
    expect(database.prepare("SELECT COUNT(*) AS n FROM participants").get()).toEqual(participantCount);
    expect(works()[0].contributors.map(person => person.name)).toEqual(["Ada"]);
    expect(works()[0].duet).toBe(false);
    expect(sessions.leaveSound(ada.user, room.id, { soundId: "evening-forest", replyToId: stay.sound!.id, operationId: "private-is-not-a-parent" })).toMatchObject({ ok: false, code: "reply_private" });
  });
});
