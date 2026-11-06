import { mkdtempSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { createDefaultEnvironment, formatTime, minuteAt, timePhase } from "../src/shared/environment.ts";
import type { EnvironmentResult } from "../src/shared/environment.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";
import { join as joinPerson, Stream } from "./helpers.ts";

describe("the anchored shared environment", () => {
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
    scratch = mkdtempSync(join(tmpdir(), "soac-environment-"));
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
  const request = (revision = 0) => ({ weather: "rain", minuteOfDay: 1110, clockRunning: false, revision });
  const environment = () => sessions.snapshotFor(room, null).environment;
  function watch(): ServerMessage[] {
    const messages: ServerMessage[] = [];
    const response = { write: (frame: string) => { messages.push(JSON.parse(frame.slice(6).trim()) as ServerMessage); return true; } } as unknown as ServerResponse;
    sessions.subscribe(response, "seaside", "weekday", null);
    unsubscribers.push(() => sessions.unsubscribe(response, "seaside", "weekday", null));
    return messages;
  }

  it("keeps all old modes in the original room and initially preserves the clear afternoon", () => {
    const initial = environment();
    expect(initial).toEqual({ weather: "clear", minuteOfDay: 840, clockRunning: false, revision: 0, updatedAt: "2026-11-06T00:00:00.000Z" });
    for (const mode of ["weekday", "morning", "rainy-dusk"])
      expect(sessions.snapshotFor(sessions.openSession("seaside", mode), null).environment).toEqual(initial);
    expect(database.prepare("SELECT mode FROM sessions").all()).toEqual([{ mode: "morning" }]);
    expect(database.prepare("SELECT COUNT(*) AS n FROM session_environments").get()).toMatchObject({ n: 1 });
  });

  it("derives a wrapping clock from the persisted anchor without DB writes, and stops at a reviewed minute", () => {
    const paused = createDefaultEnvironment("2026-11-06T00:00:00.000Z");
    expect(minuteAt(paused, Date.now() + 60_000)).toBe(840);
    const running = { ...paused, minuteOfDay: 1438, clockRunning: true };
    expect(minuteAt(running, Date.now() + 3500)).toBe(1.5);
    expect(minuteAt(running, Date.now() + 1440_000)).toBe(1438);
    expect(minuteAt(running, Date.now() - 3000)).toBe(1438);
    expect(formatTime(1441.8)).toBe("00:01");
    expect([300, 420, 1050, 1200].map(timePhase)).toEqual(["dawn", "day", "dusk", "night"]);
    const user = users.createUser("Clock keeper", "cat").user;
    expect(sessions.changeEnvironment(user, room.id, { ...request(), minuteOfDay: 1438, clockRunning: true }).ok).toBe(true);
    vi.advanceTimersByTime(3500);
    const advanced = environment();
    expect(advanced.minuteOfDay).toBe(1438);
    expect(advanced.revision).toBe(1);
    expect(minuteAt(advanced)).toBe(1.5);
    expect(sessions.changeEnvironment(user, room.id, { ...request(1), minuteOfDay: Math.floor(minuteAt(advanced)) })).toMatchObject({ ok: true, environment: { minuteOfDay: 1, clockRunning: false, revision: 2 } });
    vi.advanceTimersByTime(8000);
    expect(minuteAt(environment())).toBe(1);
  });

  it("rejects a competing stale revision and broadcasts one attributed committed choice to visitors", () => {
    const a = users.createUser("Ada", "cat").user;
    const b = users.createUser("Bo", "dog").user;
    const messages = watch();
    const first = sessions.changeEnvironment(a, room.id, { ...request(), userId: b.id, nickname: "Bo" });
    expect(first).toMatchObject({ ok: true, environment: { weather: "rain", revision: 1 }, serverNow: expect.any(String) });
    const stale = sessions.changeEnvironment(b, room.id, { ...request(), weather: "mist" });
    expect(stale).toMatchObject({ ok: false, code: "stale", environment: first.ok ? first.environment : undefined });
    const changes = messages.filter((m) => m.type === "environment");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: "environment", sessionId: room.id, by: "Ada", byId: sessions.snapshotFor(room, a).you!.id });
    expect(environment()).toEqual(first.ok ? first.environment : undefined);
    // Reviewing the winner lets the second person make their own explicit choice.
    expect(sessions.changeEnvironment(b, room.id, { ...request(1), weather: "mist" })).toMatchObject({ ok: true, environment: { weather: "mist", revision: 2 } });
    expect(messages.filter((m) => m.type === "environment")).toHaveLength(2);
  });

  it("limits only accepted environment writes and keeps the independent sound operation available", () => {
    const user = users.createUser("Ada", "cat").user;
    const messages = watch();
    expect(sessions.changeEnvironment(user, room.id, request()).ok).toBe(true);
    expect(sessions.changeEnvironment(user, room.id, request())).toMatchObject({ code: "stale" });
    expect(sessions.changeEnvironment(user, room.id, request(1))).toEqual({ ok: false, code: "slow_down" });
    expect(environment().revision).toBe(1);
    expect(messages.filter((m) => m.type === "environment")).toHaveLength(1);
    expect(sessions.move(user, room.id, { x: 100, z: 100, yaw: 0 })).toEqual({ ok: true });
    expect(sessions.leaveSound(user, room.id, { soundId: "guitar" })).toMatchObject({ ok: true });
    vi.advanceTimersByTime(1000);
    expect(sessions.changeEnvironment(user, room.id, request(1))).toMatchObject({ ok: true, environment: { revision: 2 } });
  });

  it("validates every submitted field before changing revision or broadcasting", () => {
    const user = users.createUser("Ada", "cat").user;
    const initial = environment();
    const messages = watch();
    for (const bad of [null, [], {}, "rain", { ...request(), weather: "storm" },
      ...[-1, 1440, 1.5, NaN, Infinity, "840"].map((minuteOfDay) => ({ ...request(), minuteOfDay })),
      ...[-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "0"].map((revision) => ({ ...request(), revision })),
      { ...request(), clockRunning: 1 }])
      expect(sessions.changeEnvironment(user, room.id, bad)).toEqual({ ok: false, code: "bad_request" });
    expect(sessions.changeEnvironment(user, "ses_0000000000000000", request())).toEqual({ ok: false, code: "no_session" });
    expect(environment()).toEqual(initial);
    expect(messages.filter((m) => m.type === "environment")).toHaveLength(0);
    expect(sessions.changeEnvironment(user, room.id, request())).toMatchObject({ ok: true, environment: { revision: 1 } });
  });

  it("restores the running anchor after restart while keeping old sound rows and room identity intact", async () => {
    const user = users.createUser("Ada", "cat").user;
    expect(sessions.move(user, room.id, { x: 100, z: 100, yaw: 0 })).toEqual({ ok: true });
    const sound = sessions.leaveSound(user, room.id, { soundId: "guitar" }).sound!;
    const oldSound = database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(sound.id);
    expect(sessions.changeEnvironment(user, room.id, { ...request(), minuteOfDay: 1430, clockRunning: true }).ok).toBe(true);
    const saved = environment();
    const roomId = room.id;
    database.close();
    vi.clearAllTimers();
    vi.setSystemTime(Date.parse(saved.updatedAt) + 25_000);
    await load();
    expect(room.id).toBe(roomId);
    expect(environment()).toEqual(saved);
    expect(minuteAt(environment(), Date.parse(saved.updatedAt) + 25_000)).toBe(15);
    expect(database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(sound.id)).toEqual(oldSound);
    expect(sessions.snapshotFor(room, null).sounds).toHaveLength(1);
  });

  it("adds environment storage to a previous database without rewriting contributions", async () => {
    const user = users.createUser("Existing person", "dog").user;
    sessions.move(user, room.id, { x: 100, z: 100, yaw: 0 });
    const sound = sessions.leaveSound(user, room.id, { soundId: "guitar" }).sound!;
    const oldSound = database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(sound.id);
    database.exec("DROP TABLE session_environments");
    database.close();
    vi.clearAllTimers();
    await load();
    expect(environment()).toMatchObject({ weather: "clear", minuteOfDay: 840, clockRunning: false, revision: 0 });
    expect(database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(sound.id)).toEqual(oldSound);
  });
});

it("serves environment writes only to a cookie identity, shares them over HTTP/SSE and returns a stale choice for review", async () => {
  const base = inject("baseUrl");
  const a = await joinPerson(base, "Weather Ada");
  const b = await joinPerson(base, "Weather Bo", "dog");
  const visitor = await Stream.open(base, "seaside", "weekday", null);
  const sessionId = visitor.snapshot().sessionId;
  const initial = visitor.snapshot().environment;
  const send = (cookie: string | null, body: unknown) => fetch(new URL(`/api/sessions/${sessionId}/environment`, base), {
    method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  });
  const change = { weather: initial.weather === "mist" ? "clear" : "mist", minuteOfDay: 360, clockRunning: true, revision: initial.revision };
  try {
    expect((await send(null, change)).status).toBe(401);
    expect((await send("soac_session=forged", change)).status).toBe(401);
    expect((await send(a.cookie, { ...change, minuteOfDay: 1440 })).status).toBe(400);
    const accepted = await send(a.cookie, { ...change, userId: "forged", nickname: b.name });
    expect(accepted.status).toBe(200);
    const result = await accepted.json() as EnvironmentResult;
    if (!result.ok) throw new Error("environment write was refused");
    const event = await visitor.next((m) => m.type === "environment" && m.environment.revision === result.environment.revision);
    expect(event).toMatchObject({ type: "environment", by: a.name, environment: result.environment, serverNow: result.serverNow });
    const stale = await send(b.cookie, { ...change, weather: "cloudy" });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ ok: false, code: "stale", environment: result.environment });
    const fresh = await Stream.open(base, "seaside", "rainy-dusk", b);
    try {
      expect(fresh.snapshot().sessionId).toBe(sessionId);
      expect(fresh.snapshot().environment).toEqual(result.environment);
      expect(fresh.snapshot().sounds).toEqual(visitor.snapshot().sounds);
      // Restore the previous shared atmosphere using the second cookie, which
      // has not made an accepted write and so does not need a real-time wait.
      expect((await send(b.cookie, { ...initial, revision: result.environment.revision })).status).toBe(200);
    } finally { fresh.close(); }
  } finally { visitor.close(); }
});
