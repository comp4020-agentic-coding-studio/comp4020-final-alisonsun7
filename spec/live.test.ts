import { afterEach, describe, expect, inject, it } from "vitest";
import { MAX_SOUNDS, PER_PERSON } from "../src/shared/catalog.ts";
import type { Committed, Placement, Snapshot } from "../src/shared/protocol.ts";
import { isCommitted, join, opId, sendOp, Stream, type Person } from "./helpers.ts";

// The live contract (pack docs/05), against the running app: one place's
// stream, operations with ids, the server's order, and who may change what.
//
// These share the deployed app's places with real people, so every test
// removes the sounds it added, and none starts the 3-minute clock (that's
// spec/lifecycle.test.ts, on its own server).
const baseUrl = inject("baseUrl");
const SCENE = "marie-reay-ground";
const MODE = "everyday";
const LIFTS = { shotId: "lift-wall", anchorId: "lifts" };

const streams: Stream[] = [];
const added: { who: Person; sessionId: string; placement: Placement }[] = [];

async function open(who: Person | null): Promise<Stream> {
  const s = await Stream.open(baseUrl, SCENE, MODE, who);
  streams.push(s);
  return s;
}

async function add(who: Person, sessionId: string, soundId = "lift-ding", where = LIFTS, operationId = opId()) {
  const out = await sendOp(baseUrl, who, sessionId, { operationId, type: "sound.add", soundId, gain: 0.6, ...where });
  if (out.result.ok && out.result.committed[0]?.payload.kind === "sound.add") {
    added.push({ who, sessionId, placement: out.result.committed[0].payload.placement });
  }
  return out;
}

afterEach(async () => {
  for (const { who, sessionId, placement } of added.splice(0)) {
    const snap = (await (await fetch(new URL(`/api/sessions/${sessionId}`, baseUrl))).json()) as Snapshot;
    const now = snap.placements.find((p) => p.id === placement.id);
    if (now) await sendOp(baseUrl, who, sessionId, { operationId: opId(), type: "sound.remove", placementId: now.id, baseRevision: now.revision });
  }
  for (const s of streams.splice(0)) s.close();
});

// Room for this test's sounds even if real people have filled the place.
async function placeWithRoom(need: number): Promise<Snapshot> {
  const watcher = await open(null);
  const snap = watcher.snapshot();
  if (snap.status !== "idle" && snap.status !== "active") throw new Error(`the place is ${snap.status}; try again in a moment`);
  if (MAX_SOUNDS - snap.placements.length < need) throw new Error(`the place holds ${snap.placements.length} sounds already; this test needs ${need} free`);
  return snap;
}

describe("the live stream", () => {
  it("starts with a full snapshot, and a visitor who hasn't joined isn't counted as here", async () => {
    const visitor = await open(null);
    const snap = visitor.snapshot();
    expect(snap.type).toBe("snapshot");
    expect(snap.sceneId).toBe(SCENE);
    expect(snap.sessionId).toMatch(/^ses_[a-f0-9]{16}$/);
    expect(Number.isInteger(snap.seq)).toBe(true);
    expect(snap.you).toBeNull();

    const before = snap.online.length;
    const ana = await join(baseUrl, "Ana", "cat");
    const anaStream = await open(ana);
    expect(anaStream.snapshot().you?.name).toBe("Ana");
    const presence = await visitor.next((m) => m.type === "presence" && m.online.some((p) => p.name === "Ana"));
    expect(presence.type === "presence" && presence.online.length).toBe(before + 1);

    // and leaving is seen too
    anaStream.close();
    await visitor.next((m) => m.type === "presence" && !m.online.some((p) => p.name === "Ana"), 3000, visitor.messages.length - 1);
  });

  it("a sound one person adds reaches another person's stream within a second, in server order", async () => {
    const { sessionId } = await placeWithRoom(2);
    const ana = await join(baseUrl, "Ana", "cat");
    const ben = await join(baseUrl, "Ben", "dog");
    const benStream = await open(ben);
    const startSeq = benStream.snapshot().seq;

    const sentAt = performance.now();
    const { status, result } = await add(ana, sessionId);
    expect(status).toBe(200);
    expect(result.ok).toBe(true);

    const seen = await benStream.next(isCommitted("sound.add"), 1000);
    const arrived = benStream.messages.find((m) => m.msg === seen)!.at;
    expect(arrived - sentAt).toBeLessThan(1000);
    expect(seen.serverSeq).toBe(startSeq + 1);
    expect(seen.payload.kind === "sound.add" && seen.payload.placement.ownerName).toBe("Ana");

    // a second change is the next number: no gaps a client would have to fill
    await add(ana, sessionId, "footsteps");
    const second = await benStream.next((m): m is Committed => isCommitted("sound.add")(m) && m.serverSeq === startSeq + 2, 1000);
    expect(second.payload.kind === "sound.add" && second.payload.placement.soundId).toBe("footsteps");
  });

  it("someone who reconnects gets the whole place in the snapshot, not just later events", async () => {
    const { sessionId } = await placeWithRoom(1);
    const ana = await join(baseUrl, "Ana", "cat");
    const { result } = await add(ana, sessionId, "quiet-talk");
    expect(result.ok).toBe(true);
    const placementId = added[added.length - 1].placement.id;

    const late = await open(null);
    expect(late.snapshot().placements.some((p) => p.id === placementId)).toBe(true);
  });

  it("missed events can be fetched by sequence number", async () => {
    const { sessionId, seq } = await placeWithRoom(1);
    const ana = await join(baseUrl, "Ana", "cat");
    await add(ana, sessionId, "lift-ding");
    const events = (await (await fetch(new URL(`/api/sessions/${sessionId}/events?sinceSeq=${seq}`, baseUrl))).json()) as Committed[];
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.map((e) => e.serverSeq)).toEqual(events.map((_, i) => seq + 1 + i));
  });
});

describe("operations", () => {
  it("need a session cookie", async () => {
    const { sessionId } = await placeWithRoom(0);
    const { status, result } = await sendOp(baseUrl, null, sessionId, { operationId: opId(), type: "sound.add", soundId: "lift-ding", gain: 0.5, ...LIFTS });
    expect(status).toBe(401);
    expect(result.ok).toBe(false);
  });

  it("a retried operation id is applied once", async () => {
    const { sessionId } = await placeWithRoom(1);
    const ana = await join(baseUrl, "Ana", "cat");
    const watcher = await open(null);
    const id = opId();
    const first = await add(ana, sessionId, "lift-ding", LIFTS, id);
    const again = await add(ana, sessionId, "lift-ding", LIFTS, id);
    expect(first.result.ok && first.result.duplicate).toBe(false);
    expect(again.result.ok && again.result.duplicate).toBe(true);

    await new Promise((r) => setTimeout(r, 300));
    expect(watcher.committed().filter((c) => c.operationId === id)).toHaveLength(1);
    const snap = (await (await fetch(new URL(`/api/sessions/${sessionId}`, baseUrl))).json()) as Snapshot;
    expect(snap.placements.filter((p) => p.ownerName === "Ana" && p.soundId === "lift-ding" && added.some((a) => a.placement.id === p.id))).toHaveLength(1);
  });

  it("refuses sounds that don't belong where they're put, and nonsense input", async () => {
    const { sessionId } = await placeWithRoom(0);
    const ana = await join(baseUrl, "Ana", "cat");
    const cases: [Record<string, unknown>, number, string][] = [
      [{ soundId: "espresso", ...LIFTS, gain: 0.5 }, 409, "wrong_place"],
      [{ soundId: "lift-ding", shotId: "lift-wall", anchorId: "nowhere", gain: 0.5 }, 409, "unknown_anchor"],
      [{ soundId: "lift-ding", shotId: "bridge", anchorId: "paving", gain: 0.5 }, 409, "unknown_anchor"],
      [{ soundId: "air-horn", ...LIFTS, gain: 0.5 }, 409, "unknown_sound"],
      [{ soundId: "lift-ding", ...LIFTS, gain: 1.5 }, 409, "bad_gain"],
      [{ soundId: "lift-ding", ...LIFTS, gain: -0.1 }, 409, "bad_gain"],
      [{ soundId: "lift-ding", ...LIFTS }, 400, "bad_request"],
    ];
    for (const [body, status, code] of cases) {
      const out = await sendOp(baseUrl, ana, sessionId, { operationId: opId(), type: "sound.add", ...body });
      expect(out.status, JSON.stringify(body)).toBe(status);
      expect(!out.result.ok && out.result.code, JSON.stringify(body)).toBe(code);
    }
    expect((await sendOp(baseUrl, ana, sessionId, { operationId: "x", type: "sound.add" })).status).toBe(400);
    expect((await sendOp(baseUrl, ana, sessionId, { operationId: opId(), type: "garden.paint" })).status).toBe(400);
    expect((await sendOp(baseUrl, ana, "ses_0000000000000000", { operationId: opId(), type: "session.start" })).status).toBe(404);
  });

  it("only the person who added a sound can change or remove it", async () => {
    const { sessionId } = await placeWithRoom(1);
    const ana = await join(baseUrl, "Ana", "cat");
    const ben = await join(baseUrl, "Ben", "dog");
    await add(ana, sessionId);
    const placement = added[added.length - 1].placement;

    const remove = await sendOp(baseUrl, ben, sessionId, { operationId: opId(), type: "sound.remove", placementId: placement.id, baseRevision: placement.revision });
    expect(!remove.result.ok && remove.result.code).toBe("not_owner");
    const louder = await sendOp(baseUrl, ben, sessionId, { operationId: opId(), type: "sound.update", placementId: placement.id, baseRevision: placement.revision, gain: 1 });
    expect(!louder.result.ok && louder.result.code).toBe("not_owner");

    // the owner can, and an edit from an old revision is refused with the current one
    const quieter = await sendOp(baseUrl, ana, sessionId, { operationId: opId(), type: "sound.update", placementId: placement.id, baseRevision: placement.revision, gain: 0.2 });
    expect(quieter.result.ok).toBe(true);
    const stale = await sendOp(baseUrl, ana, sessionId, { operationId: opId(), type: "sound.update", placementId: placement.id, baseRevision: placement.revision, gain: 0.9 });
    expect(!stale.result.ok && stale.result.code).toBe("stale");
    expect(!stale.result.ok && stale.result.placement?.gain).toBe(0.2);

    // moving it checks the new spot like adding does
    const moved = await sendOp(baseUrl, ana, sessionId, {
      operationId: opId(),
      type: "sound.update",
      placementId: placement.id,
      baseRevision: placement.revision + 1,
      shotId: "tea-point",
      anchorId: "sink",
    });
    expect(!moved.result.ok && moved.result.code).toBe("wrong_place");
  });

  it(`one person can place at most ${PER_PERSON} sounds in a place`, async () => {
    const { sessionId } = await placeWithRoom(PER_PERSON + 1);
    const ana = await join(baseUrl, "Ana", "cat");
    for (let i = 0; i < PER_PERSON; i++) expect((await add(ana, sessionId, "footsteps", { shotId: "lift-wall", anchorId: "lobby-floor" })).result.ok).toBe(true);
    const over = await add(ana, sessionId, "footsteps", { shotId: "lift-wall", anchorId: "lobby-floor" });
    expect(!over.result.ok && over.result.code).toBe("your_limit");
  });

  it("a removed sound is gone for everyone, and removing it again says so", async () => {
    const { sessionId } = await placeWithRoom(1);
    const ana = await join(baseUrl, "Ana", "cat");
    const watcher = await open(null);
    await add(ana, sessionId, "bin-drop", { shotId: "lift-wall", anchorId: "bins" });
    const placement = added.pop()!.placement;
    const removed = await sendOp(baseUrl, ana, sessionId, { operationId: opId(), type: "sound.remove", placementId: placement.id, baseRevision: placement.revision });
    expect(removed.result.ok).toBe(true);
    const seen = await watcher.next(isCommitted("sound.remove"), 1000);
    expect(seen.payload.kind === "sound.remove" && seen.payload.placementId).toBe(placement.id);
    const again = await sendOp(baseUrl, ana, sessionId, { operationId: opId(), type: "sound.remove", placementId: placement.id, baseRevision: placement.revision + 1 });
    expect(!again.result.ok && again.result.code).toBe("no_placement");
  });

  it("someone who didn't start a memory can't end it early, and nobody can end one that hasn't started", async () => {
    const snap = await placeWithRoom(0);
    const ana = await join(baseUrl, "Ana", "cat");
    if (snap.status === "idle") {
      const out = await sendOp(baseUrl, ana, snap.sessionId, { operationId: opId(), type: "session.finish" });
      expect(!out.result.ok && out.result.code).toBe("not_started");
    } else {
      const out = await sendOp(baseUrl, ana, snap.sessionId, { operationId: opId(), type: "session.finish" });
      expect(!out.result.ok && out.result.code).toBe("not_starter");
    }
  });
});

describe("memories", () => {
  it("the archive lists only public memories, and an unknown one is a 404", async () => {
    const list = (await (await fetch(new URL("/api/memories", baseUrl))).json()) as { id: string }[];
    expect(Array.isArray(list)).toBe(true);
    for (const m of list) expect(m.id).toMatch(/^mem_[a-f0-9]{16}$/);
    expect((await fetch(new URL("/api/memories/mem_0000000000000000", baseUrl))).status).toBe(404);
  });
});
