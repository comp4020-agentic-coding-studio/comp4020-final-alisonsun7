import { readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { PER_PERSON, SCENES, SEASIDE_BOUNDS, maxSoundsIn } from "../src/shared/catalog.ts";
import type { Snapshot } from "../src/shared/protocol.ts";
import { cafeKit } from "../src/client/cafe.ts";
import { seasideKit } from "../src/client/seaside.ts";
import { campusKit } from "../src/client/world-build.ts";
import { Stream, join, opId, sendOp } from "./helpers.ts";

// The walkable places (ADR 004, 005): built in 3D, spots with positions in
// metres. The server checks their spots exactly as it checks a photo's
// anchors, and a place holds more sounds than one photo did.
const baseUrl = inject("baseUrl");
const world = SCENES.find((s) => s.id === "seaside")!;

async function snapshot(mode: string): Promise<Snapshot> {
  const stream = await Stream.open(baseUrl, world.id, mode, null);
  const snap = stream.messages[0].msg as Snapshot;
  stream.close();
  return snap;
}

describe("the walkable world", () => {
  it("only walkable places are listed, and retired scenes are kept for old memories", async () => {
    expect(world).toBeDefined();
    expect(SCENES.filter((s) => !s.retired).every((s) => s.view === "world")).toBe(true);
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
        expect(a.at!.x).toBeGreaterThanOrEqual(SEASIDE_BOUNDS.minX);
        expect(a.at!.x).toBeLessThanOrEqual(SEASIDE_BOUNDS.maxX);
        expect(a.at!.z).toBeGreaterThanOrEqual(SEASIDE_BOUNDS.minZ);
        expect(a.at!.z).toBeLessThanOrEqual(SEASIDE_BOUNDS.maxZ);
      }
    }
  });

  it("Go to puts you inside the part of the place it names", () => {
    const kits = { cafe: cafeKit, campus: campusKit, seaside: seasideKit } as const;
    for (const scene of SCENES.filter((s) => s.view === "world")) {
      const kit = kits[scene.id as keyof typeof kits];
      for (const shot of scene.shots) expect(kit.zoneAt(shot.spawn!.x, shot.spawn!.z), `${scene.id}/${shot.id}`).toBe(shot.id);
    }
  });

  it("every walkable place says on the page what it is", async () => {
    for (const scene of SCENES.filter((s) => s.view === "world")) {
      expect(scene.about, scene.id).toBeTruthy();
      const html = await (await fetch(new URL(`/scene/${scene.id}?mode=morning`, baseUrl))).text();
      expect(html).toContain(scene.about!.slice(0, 30));
      expect(html).toContain('"three":"/vendor/three.module.min.js"');
    }
    // the campus, drawn from Wen's photos, still shows them
    expect(await (await fetch(new URL("/scene/campus?mode=morning", baseUrl))).text()).toContain('id="postcard"');
  });

  it("serves the place's models, surfaces and skies, and nothing outside their folders", async () => {
    const manifest = JSON.parse(readFileSync("public/assets-manifest.json", "utf8")) as { assets: { id: string; files?: string[]; rights: string }[] };
    const cc0 = manifest.assets.filter((a) => a.id.startsWith("polyhaven-"));
    expect(cc0.length).toBeGreaterThan(10);
    for (const a of cc0) {
      expect(a.rights).toMatch(/CC0/);
      const res = await fetch(new URL(a.files![0].replace(/^public/, ""), baseUrl));
      expect(res.status, a.files![0]).toBe(200);
    }
    for (const bad of ["/assets/models/../../package.json", "/assets/models/%2e%2e/%2e%2e/package.json", "/assets/db/x.gltf", "/vendor/addons/../../../package.json"]) {
      expect((await fetch(new URL(bad, baseUrl))).status, bad).toBe(404);
    }
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
      soundId: "espresso",
      shotId: "counter",
      anchorId: "espresso-cart",
      gain: 0.6,
    });
    expect(ok.result.ok, JSON.stringify(ok.result)).toBe(true);

    const wrong = await sendOp(baseUrl, await join(baseUrl, "Lost"), sessionId, {
      operationId: opId(),
      type: "sound.add",
      soundId: "espresso",
      shotId: "beach",
      anchorId: "sand",
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
        const r = await sendOp(baseUrl, who, sessionId, { operationId: opId(), type: "sound.add", soundId: "footsteps", shotId: "boardwalk", anchorId: "boardwalk", gain: 0.5 });
        expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
        placed++;
      }
    }
  });
});
