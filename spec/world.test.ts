import { describe, expect, inject, it } from "vitest";
import { PER_PERSON, SCENES, WORLD_BOUNDS, maxSoundsIn } from "../src/shared/catalog.ts";
import type { Snapshot } from "../src/shared/protocol.ts";
import { Stream, join, opId, sendOp } from "./helpers.ts";

// The walkable world (ADR 004): one drawn place whose spots have positions
// in metres. The server checks its spots exactly as it checks a photo's
// anchors, and the place holds more sounds than one photo did.
const baseUrl = inject("baseUrl");
const world = SCENES.find((s) => s.view === "world")!;

async function snapshot(mode: string): Promise<Snapshot> {
  const stream = await Stream.open(baseUrl, world.id, mode, null);
  const snap = stream.messages[0].msg as Snapshot;
  stream.close();
  return snap;
}

describe("the walkable world", () => {
  it("is the only place listed, and the photo scenes are kept for old memories", async () => {
    expect(world).toBeDefined();
    expect(SCENES.filter((s) => !s.retired).map((s) => s.id)).toEqual([world.id]);
    const html = await (await fetch(new URL("/explore", baseUrl))).text();
    expect(html).toContain(`/scene/${world.id}?mode=`);
    for (const old of SCENES.filter((s) => s.retired)) {
      expect(html).not.toContain(`/scene/${old.id}?`);
      expect((await fetch(new URL(`/scene/${old.id}`, baseUrl))).status).toBe(200);
    }
  });

  it("every spot has a position, a place for a figure, and a map point inside 0..1", () => {
    for (const shot of world.shots) {
      expect(shot.spawn, shot.id).toBeDefined();
      for (const a of shot.anchors) {
        expect(a.at, `${shot.id}/${a.id}`).toBeDefined();
        expect(a.foot, `${shot.id}/${a.id}`).toBeDefined();
        for (const v of [a.x, a.y, a.stand.x, a.stand.y]) expect(v >= 0 && v <= 1, `${shot.id}/${a.id}`).toBe(true);
        expect(a.at!.x).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX);
        expect(a.at!.x).toBeLessThanOrEqual(WORLD_BOUNDS.maxX);
      }
    }
  });

  it("says on the page that it's drawn, not surveyed, and shows the real photo", async () => {
    const html = await (await fetch(new URL(`/scene/${world.id}?mode=morning`, baseUrl))).text();
    expect(html).toMatch(/not a survey/);
    expect(html).toContain('id="postcard"');
    expect(html).toContain('"three":"/vendor/three.module.min.js"');
  });

  it("accepts a sound at a world spot, refuses one that belongs elsewhere, and holds more than 12", async () => {
    const mode = "weekday";
    let snap = await snapshot(mode);
    // A place left full by earlier runs is sealed first, so this one starts
    // from a fresh, empty session.
    if (snap.placements.length > 8) {
      const starter = await join(baseUrl, "Sealer");
      await sendOp(baseUrl, starter, snap.sessionId, { operationId: opId(), type: "session.start" });
      await sendOp(baseUrl, starter, snap.sessionId, { operationId: opId(), type: "session.finish" });
      for (let i = 0; i < 50 && (snap = await snapshot(mode)).placements.length > 0; i++) await new Promise((r) => setTimeout(r, 100));
    }
    const sessionId = snap.sessionId;

    const ok = await sendOp(baseUrl, await join(baseUrl, "Walker"), sessionId, {
      operationId: opId(),
      type: "sound.add",
      soundId: "microwave-hum",
      shotId: "tea-point",
      anchorId: "microwaves",
      gain: 0.6,
    });
    expect(ok.result.ok, JSON.stringify(ok.result)).toBe(true);

    const wrong = await sendOp(baseUrl, await join(baseUrl, "Lost"), sessionId, {
      operationId: opId(),
      type: "sound.add",
      soundId: "microwave-hum",
      shotId: "bridge",
      anchorId: "paving",
      gain: 0.6,
    });
    expect(wrong.result.ok).toBe(false);
    if (!wrong.result.ok) expect(wrong.result.code).toBe("wrong_place");

    // fill past the photo scenes' limit of 12, four sounds per person
    expect(maxSoundsIn(world.id)).toBeGreaterThan(12);
    let placed = snap.placements.length + 1;
    let n = 0;
    while (placed < 14) {
      const who = await join(baseUrl, `Filler ${n++}`);
      for (let i = 0; i < PER_PERSON && placed < 14; i++) {
        const r = await sendOp(baseUrl, who, sessionId, { operationId: opId(), type: "sound.add", soundId: "footsteps", shotId: "lobby", anchorId: "lobby-floor", gain: 0.5 });
        expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
        placed++;
      }
    }
  });
});
