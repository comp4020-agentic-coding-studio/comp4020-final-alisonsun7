import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemorySnapshot, MemorySummary, Snapshot } from "../src/shared/protocol.ts";
import { isCommitted, join, opId, sendOp, Stream, type Person } from "./helpers.ts";

// The 3-minute memory, saving, and surviving a restart can't be checked on
// the shared app without waiting three minutes or breaking its database. So
// this file builds the app and starts its own copy: a throwaway database, a
// 3-second clock, and the test hook that makes the next save fail.
const CLOCK_MS = 3000;
const SCENE = "chifley-path";
const MODE = "rainy-dusk";
const PAVING = { shotId: "bridge", anchorId: "paving" };

const dir = mkdtempSync(joinPath(tmpdir(), "soac-spec-"));
const dbPath = joinPath(dir, "test.db");
let port = 0;
let base = "";
let app: ChildProcess | null = null;
let output = "";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

async function start(): Promise<void> {
  app = spawn(process.execPath, ["dist/server.js"], {
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), DB_PATH: dbPath, SOAC_SESSION_MS: String(CLOCK_MS), SOAC_TEST_HOOKS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout!.on("data", (d) => (output += d));
  app.stderr!.on("data", (d) => (output += d));
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`the test server didn't start:\n${output}`);
}

async function stop(): Promise<void> {
  if (!app) return;
  const exited = new Promise((r) => app!.once("exit", r));
  app.kill("SIGKILL"); // no graceful shutdown: what a crash or a redeploy does
  await exited;
  app = null;
}

beforeAll(async () => {
  const built = spawnSync("pnpm", ["build"], { encoding: "utf8" });
  if (built.status !== 0) throw new Error(`pnpm build failed:\n${built.stdout}\n${built.stderr}`);
  port = await freePort();
  base = `http://localhost:${port}`;
  await start();
}, 60_000);

afterAll(async () => {
  await stop();
  rmSync(dir, { recursive: true, force: true });
});

const getJson = async <T>(path: string): Promise<T> => (await (await fetch(new URL(path, base))).json()) as T;
const add = (who: Person, sessionId: string, soundId = "footsteps", where = PAVING) =>
  sendOp(base, who, sessionId, { operationId: opId(), type: "sound.add", soundId, gain: 0.5, ...where });

describe("a 3-minute memory (3 seconds here)", () => {
  it("runs on the server's clock, is saved with its people and sounds, and the place starts silent again", async () => {
    const ana = await join(base, "Ana", "cat");
    const ben = await join(base, "Ben", "dog");
    const anaStream = await Stream.open(base, SCENE, MODE, ana);
    const benStream = await Stream.open(base, SCENE, MODE, ben);
    const { sessionId } = anaStream.snapshot();

    // one sound before the clock starts, one during
    expect((await add(ana, sessionId, "rain", { shotId: "bridge", anchorId: "lamp-post" })).result.ok).toBe(true);
    const started = await sendOp(base, ana, sessionId, { operationId: opId(), type: "session.start" });
    expect(started.result.ok).toBe(true);
    const startEvent = await benStream.next(isCommitted("session.start"), 1000);
    expect(startEvent.payload.kind === "session.start" && startEvent.payload.durationMs).toBe(CLOCK_MS);

    // only one clock per place
    const twice = await sendOp(base, ben, sessionId, { operationId: opId(), type: "session.start" });
    expect(!twice.result.ok && twice.result.code).toBe("already_started");
    // only the starter may save early
    const early = await sendOp(base, ben, sessionId, { operationId: opId(), type: "session.finish" });
    expect(!early.result.ok && early.result.code).toBe("not_starter");

    await new Promise((r) => setTimeout(r, 600));
    expect((await add(ben, sessionId, "puddle-steps")).result.ok).toBe(true);

    // the server ends it, not any browser
    const ending = await benStream.next(isCommitted("session.ending"), CLOCK_MS + 2000);
    expect(ending.by).toBeNull();
    const saved = await benStream.next(isCommitted("session.saved"), 2000);
    const memoryId = saved.payload.kind === "session.saved" ? saved.payload.memoryId : "";
    expect(memoryId).toMatch(/^mem_[a-f0-9]{16}$/);

    // everyone is moved to a new, empty session in the same place
    const fresh = await benStream.next((m) => m.type === "snapshot" && m.sessionId !== sessionId, 2000);
    expect(fresh.type === "snapshot" && fresh.placements).toEqual([]);
    expect(fresh.type === "snapshot" && fresh.status).toBe("idle");
    expect(fresh.type === "snapshot" && fresh.lastMemoryId).toBe(memoryId);

    // the old session takes no more changes
    const late = await add(ana, sessionId);
    expect(!late.result.ok && late.result.code).toBe("sealed");

    const memory = await getJson<MemorySnapshot>(`/api/memories/${memoryId}`);
    expect(memory.sceneId).toBe(SCENE);
    expect(memory.mode).toBe(MODE);
    expect(memory.contributors.map((p) => p.name).sort()).toEqual(["Ana", "Ben"]);
    expect(memory.placements.map((p) => p.soundId).sort()).toEqual(["puddle-steps", "rain"]);
    // what was there at the start is the first frame; what came later is replayed when it happened
    const rain = memory.timeline.find((e) => e.payload.kind === "sound.add" && e.payload.placement.soundId === "rain")!;
    const steps = memory.timeline.find((e) => e.payload.kind === "sound.add" && e.payload.placement.soundId === "puddle-steps")!;
    expect(rain.t).toBe(0);
    expect(steps.t).toBeGreaterThan(300);
    expect(steps.t).toBeLessThanOrEqual(memory.durationMs);

    const archive = await getJson<MemorySummary[]>("/api/memories");
    expect(archive.some((m) => m.id === memoryId)).toBe(true);
    const page = await fetch(new URL(`/memory/${memoryId}`, base));
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Ana");
    expect(html).toContain("Ben");

    anaStream.close();
    benStream.close();
  }, 15_000);

  it("the starter can save early, and the memory is as long as it ran", async () => {
    const ana = await join(base, "Ana", "cat");
    const stream = await Stream.open(base, SCENE, "morning", ana);
    const { sessionId } = stream.snapshot();
    const notYet = await sendOp(base, ana, sessionId, { operationId: opId(), type: "session.finish" });
    expect(!notYet.result.ok && notYet.result.code).toBe("not_started");

    await add(ana, sessionId, "birdsong", { shotId: "bridge", anchorId: "lamp-post" });
    await sendOp(base, ana, sessionId, { operationId: opId(), type: "session.start" });
    await new Promise((r) => setTimeout(r, 1200));
    const finished = await sendOp(base, ana, sessionId, { operationId: opId(), type: "session.finish" });
    expect(finished.result.ok).toBe(true);
    const saved = finished.result.ok ? finished.result.committed.find((c) => c.payload.kind === "session.saved") : undefined;
    expect(saved).toBeDefined();
    const memory = await getJson<MemorySnapshot>(`/api/memories/${saved!.payload.kind === "session.saved" ? saved!.payload.memoryId : ""}`);
    expect(memory.durationMs).toBeGreaterThanOrEqual(1000);
    expect(memory.durationMs).toBeLessThan(CLOCK_MS);
    stream.close();
  });

  it("a save that fails says so, keeps every sound, saves nothing, and can be retried", async () => {
    const ana = await join(base, "Ana", "cat");
    const stream = await Stream.open(base, SCENE, "weekday", ana);
    const { sessionId } = stream.snapshot();
    await add(ana, sessionId, "bicycle", { shotId: "bridge", anchorId: "bridge-deck" });
    const before = (await getJson<MemorySummary[]>("/api/memories")).length;

    expect((await fetch(new URL("/test/fail-next-save", base), { method: "POST" })).status).toBe(204);
    await sendOp(base, ana, sessionId, { operationId: opId(), type: "session.start" });
    const failed = await stream.next(isCommitted("session.failed"), CLOCK_MS + 2000);
    expect(failed.payload.kind === "session.failed" && failed.payload.error).toMatch(/couldn't be saved/);
    // never a "saved" for this session
    expect(stream.committed().some((c) => c.payload.kind === "session.saved")).toBe(false);

    const snap = await getJson<Snapshot>(`/api/sessions/${sessionId}`);
    expect(snap.status).toBe("failed");
    expect(snap.error).toMatch(/couldn't be saved/);
    expect(snap.placements.map((p) => p.soundId)).toEqual(["bicycle"]);
    expect((await getJson<MemorySummary[]>("/api/memories")).length).toBe(before);

    // anyone in the place can retry once the clock has run out
    const ben = await join(base, "Ben", "dog");
    const retry = await sendOp(base, ben, sessionId, { operationId: opId(), type: "session.finish" });
    expect(retry.result.ok).toBe(true);
    await stream.next(isCommitted("session.saved"), 2000);
    expect((await getJson<MemorySummary[]>("/api/memories")).length).toBe(before + 1);
    stream.close();
  }, 15_000);
});

describe("two people at once", () => {
  it("changes sent at the same moment are both kept, in one order everyone sees", async () => {
    const ana = await join(base, "Ana", "cat");
    const ben = await join(base, "Ben", "dog");
    const watcher = await Stream.open(base, "marie-reay-ground", "everyday", null);
    const { sessionId, seq } = watcher.snapshot();
    const [a, b] = await Promise.all([
      add(ana, sessionId, "lift-ding", { shotId: "lift-wall", anchorId: "lifts" }),
      add(ben, sessionId, "lift-ding", { shotId: "lift-wall", anchorId: "lifts" }),
    ]);
    expect(a.result.ok && b.result.ok).toBe(true);
    await watcher.next((m) => isCommitted("sound.add")(m) && m.serverSeq === seq + 2, 1000);
    const adds = watcher.committed().filter((c) => c.payload.kind === "sound.add");
    expect(adds.map((c) => c.serverSeq)).toEqual([seq + 1, seq + 2]);
    // at the same spot, the second stands beside the first, not on top of it
    const spots = adds.map((c) => (c.payload.kind === "sound.add" ? c.payload.placement.x : -1));
    expect(spots[0]).not.toBe(spots[1]);
    watcher.close();
  });
});

describe("restarts", () => {
  it("sounds and memories survive the server being killed and started again", async () => {
    const ana = await join(base, "Ana", "cat");
    const snap = (await Stream.open(base, "lab-cafe", "everyday", ana)).snapshot();
    expect((await add(ana, snap.sessionId, "espresso", { shotId: "counter", anchorId: "coffee-machine" })).result.ok).toBe(true);
    const memories = await getJson<MemorySummary[]>("/api/memories");

    await stop();
    await start();

    const after = await getJson<Snapshot>(`/api/sessions/${snap.sessionId}`);
    expect(after.placements.map((p) => p.soundId)).toEqual(["espresso"]);
    expect(await getJson<MemorySummary[]>("/api/memories")).toEqual(memories);
    // the same cookie still works
    const stillAna = await add(ana, snap.sessionId, "grinder", { shotId: "counter", anchorId: "coffee-machine" });
    expect(stillAna.result.ok).toBe(true);
  }, 20_000);

  it("a memory whose clock ran out while the server was down is saved when it comes back", async () => {
    const ana = await join(base, "Ana", "cat");
    const stream = await Stream.open(base, "lab-cafe", "everyday", ana);
    const { sessionId } = stream.snapshot();
    await sendOp(base, ana, sessionId, { operationId: opId(), type: "session.start" });
    stream.close();

    await stop();
    await new Promise((r) => setTimeout(r, CLOCK_MS + 300));
    await start();

    const snap = await getJson<Snapshot>(`/api/sessions/${sessionId}`);
    expect(snap.status).toBe("saved");
    expect(output).toMatch(/clock_recovered/);
  }, 20_000);

  it("a memory still running when the server restarts keeps its clock", async () => {
    const ana = await join(base, "Ana", "cat");
    const stream = await Stream.open(base, SCENE, MODE, ana);
    const { sessionId } = stream.snapshot();
    await sendOp(base, ana, sessionId, { operationId: opId(), type: "session.start" });
    stream.close();

    await stop();
    await start();
    expect(output).toMatch(/clock_resumed/);
    const watcher = await Stream.open(base, SCENE, MODE, null);
    await watcher.next(isCommitted("session.saved"), CLOCK_MS + 2000);
    watcher.close();
  }, 20_000);
});

describe("names are text, never markup", () => {
  it("a nickname that looks like HTML is escaped on every page that shows it", async () => {
    const name = "</script><b>x</b>";
    const eve = await join(base, name, "cat");
    const stream = await Stream.open(base, SCENE, MODE, eve);
    const { sessionId } = stream.snapshot();
    await add(eve, sessionId);
    await sendOp(base, eve, sessionId, { operationId: opId(), type: "session.start" });
    const done = await sendOp(base, eve, sessionId, { operationId: opId(), type: "session.finish" });
    const memoryId = done.result.ok ? done.result.committed.flatMap((c) => (c.payload.kind === "session.saved" ? [c.payload.memoryId] : []))[0] : "";
    expect(memoryId).toBeTruthy();

    for (const path of [`/memory/${memoryId}`, "/archive", `/scene/${SCENE}?mode=${MODE}`]) {
      const html = await (await fetch(new URL(path, base), { headers: { cookie: eve.cookie } })).text();
      expect(html, path).not.toContain("</script><b>");
      expect(html, path).not.toContain("<b>x</b>");
    }
    stream.close();
  });
});
