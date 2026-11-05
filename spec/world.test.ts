import { readFileSync } from "node:fs";
import { afterAll, describe, expect, inject, it } from "vitest";
import { PER_PERSON, SCENES, SEASIDE_BOUNDS, maxSoundsIn } from "../src/shared/catalog.ts";
import type { Snapshot } from "../src/shared/protocol.ts";
import { cafeKit } from "../src/client/cafe.ts";
import { seasideKit } from "../src/client/seaside.ts";
import { campusKit } from "../src/client/world-build.ts";
import { Stream, join, opId, sendOp, type Person } from "./helpers.ts";

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
    const snap = await snapshot("weekday");
    const sessionId = snap.sessionId;
    const walker = await join(baseUrl, "Walker");
    const ok = await addSound(walker, sessionId, "espresso", "counter", "espresso-cart");
    expect(ok.result.ok, JSON.stringify(ok.result)).toBe(true);

    const wrong = await addSound(await join(baseUrl, "Lost"), sessionId, "espresso", "beach", "sand");
    expect(wrong.result.ok).toBe(false);
    if (!wrong.result.ok) expect(wrong.result.code).toBe("wrong_place");

    // past the photo scenes' limit of 12: one sound in each of 13 quiet places
    expect(maxSoundsIn(world.id)).toBeGreaterThan(12);
    const filler = await join(baseUrl, "Filler");
    for (const shot of world.shots)
      for (const a of shot.anchors) {
        const now = await snapshot("weekday");
        if (now.placements.length >= 13) break;
        if (now.placements.some((p) => p.shotId === shot.id && p.anchorId === a.id)) continue;
        expect((await addSound(filler, sessionId, a.sounds[0], shot.id, a.id)).result.ok).toBe(true);
      }
    expect((await snapshot("weekday")).placements.length).toBeGreaterThan(12);
  });
});

const added: { who: Person; sessionId: string; id: string }[] = [];

async function addSound(who: Person, sessionId: string, soundId: string, shotId: string, anchorId: string) {
  const r = await sendOp(baseUrl, who, sessionId, { operationId: opId(), type: "sound.add", soundId, shotId, anchorId, gain: 0.5 });
  if (r.result.ok) for (const c of r.result.committed) if (c.payload.kind === "sound.add") added.push({ who, sessionId, id: c.payload.placement.id });
  return r;
}


// The seaside keeps its sounds for good, so the spec takes away its own.
afterAll(async () => {
  for (const a of added) {
    const p = (await snapshot("weekday")).placements.find((x) => x.id === a.id);
    if (p) await sendOp(baseUrl, a.who, a.sessionId, { operationId: opId(), type: "sound.remove", placementId: p.id, baseRevision: p.revision });
  }
});

describe("a living place (ADR 007)", () => {
  it("lets the arrival card join without leaving the page (JSON), and refuses a blank name", async () => {
    const post = (body: Record<string, string>) =>
      fetch(new URL("/join", baseUrl), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(body), redirect: "manual" });
    const ok = await post({ nickname: "  Wren  ", avatar: "dog" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie") ?? "").toMatch(/^soac_session=/);
    expect(await ok.json()).toEqual({ ok: true, name: "Wren", avatar: "dog" });
    const blank = await post({ nickname: "   ", avatar: "cat" });
    expect(blank.status).toBe(400);
    expect(blank.headers.get("set-cookie")).toBeNull();
  });

  it("is one world at every time of day: a sound added in the morning is there at dusk", async () => {
    const morning = await snapshot("morning");
    const dusk = await snapshot("rainy-dusk");
    expect(dusk.sessionId).toBe(morning.sessionId);
    const r = await addSound(await join(baseUrl, "Early"), morning.sessionId, "woodpecker", "forest", "tall-pines");
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    // (if the place had another sound, the first event switched it off)
    const add = r.result.ok ? r.result.committed.find((c) => c.payload.kind === "sound.add") : undefined;
    const id = add && add.payload.kind === "sound.add" ? add.payload.placement.id : "";
    expect((await snapshot("rainy-dusk")).placements.some((p) => p.id === id)).toBe(true);
  });

  it("records no 3-minute memories", async () => {
    const snap = await snapshot("weekday");
    const who = await join(baseUrl, "Recorder");
    for (const type of ["session.start", "session.finish"]) {
      const r = await sendOp(baseUrl, who, snap.sessionId, { operationId: opId(), type });
      expect(r.status).toBe(409);
      if (!r.result.ok) expect(r.result.code).toBe("no_memories");
    }
  });

  it("lets anyone turn a place's sound up or down, for everyone, and says who did; and anyone turn it off", async () => {
    const snap = await snapshot("weekday");
    const owner = await join(baseUrl, "Owner");
    const other = await join(baseUrl, "Other");
    const listener = await Stream.open(baseUrl, world.id, "rainy-dusk", null);
    const r = await addSound(owner, snap.sessionId, "waves", "beach", "shoreline");
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    if (!r.result.ok) return;
    const added = r.result.committed.find((c) => c.payload.kind === "sound.add")!.payload as { placement: { id: string; revision: number } };
    const placement = added.placement;
    const louder = await sendOp(baseUrl, other, snap.sessionId, { operationId: opId(), type: "sound.update", placementId: placement.id, baseRevision: placement.revision, gain: 0.9 });
    expect(louder.result.ok, JSON.stringify(louder.result)).toBe(true);
    // someone watching at another time of day sees it change, and who did it
    const seen = await listener.next((m) => m.type === "committed" && m.payload.kind === "sound.update" && m.payload.patch.placementId === placement.id);
    expect(seen.type === "committed" && seen.payload.kind === "sound.update" && seen.payload.patch).toMatchObject({ gain: 0.9, adjustedBy: "Other" });
    expect((await snapshot("weekday")).placements.find((p) => p.id === placement.id)).toMatchObject({ gain: 0.9, adjustedBy: "Other" });
    listener.close();
    const off = await sendOp(baseUrl, other, snap.sessionId, { operationId: opId(), type: "sound.remove", placementId: placement.id, baseRevision: placement.revision + 1 });
    expect(off.result.ok, JSON.stringify(off.result)).toBe(true);
    expect((await snapshot("weekday")).placements.some((p) => p.id === placement.id)).toBe(false);
  });

  it("plays one sound at a place: choosing another switches it, whoever chose the first; the same one is refused", async () => {
    const snap = await snapshot("weekday");
    const ada = await join(baseUrl, "Ada");
    const bo = await join(baseUrl, "Bo");
    const first = await addSound(ada, snap.sessionId, "seagulls", "pier", "pier-end");
    expect(first.result.ok, JSON.stringify(first.result)).toBe(true);
    const again = await addSound(bo, snap.sessionId, "seagulls", "pier", "pier-end");
    expect(again.result.ok).toBe(false);
    if (!again.result.ok) expect(again.result.code).toBe("already_here");
    const switched = await addSound(bo, snap.sessionId, "waves", "pier", "pier-end");
    expect(switched.result.ok, JSON.stringify(switched.result)).toBe(true);
    if (switched.result.ok) expect(switched.result.committed.map((c) => c.payload.kind)).toEqual(["sound.remove", "sound.add"]);
    const there = (await snapshot("weekday")).placements.filter((p) => p.shotId === "pier" && p.anchorId === "pier-end");
    expect(there.map((p) => [p.soundId, p.ownerName])).toEqual([["waves", "Bo"]]);
  });

  it("has no limit per person: one person can give five places their sound", async () => {
    const snap = await snapshot("weekday");
    const who = await join(baseUrl, "Busy");
    let ok = 0;
    for (const shot of world.shots)
      for (const a of shot.anchors) {
        if (ok >= PER_PERSON + 1) break;
        if ((await snapshot("weekday")).placements.some((p) => p.shotId === shot.id && p.anchorId === a.id)) continue;
        const r = await addSound(who, snap.sessionId, a.sounds[0], shot.id, a.id);
        expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
        ok++;
      }
    expect((await snapshot("weekday")).placements.filter((p) => p.ownerName === "Busy").length).toBe(PER_PERSON + 1);
  });

  it("tells everyone where people stand, and says words only to people within earshot", async () => {
    const snap = await snapshot("weekday");
    const ada = await join(baseUrl, "Ada");
    const bo = await join(baseUrl, "Bo");
    const cy = await join(baseUrl, "Cy");
    const [sa, sb, sc] = await Promise.all([ada, bo, cy].map((p) => Stream.open(baseUrl, world.id, "weekday", p)));
    const post = (who: Person, what: string, body: unknown) =>
      fetch(new URL(`/api/sessions/${snap.sessionId}/${what}`, baseUrl), { method: "POST", headers: { "content-type": "application/json", cookie: who.cookie }, body: JSON.stringify(body) });

    // speaking before you're anywhere is refused
    expect((await post(ada, "say", { text: "hello?" })).status).toBe(409);

    await post(ada, "move", { x: 2, z: 10, yaw: 0 });
    await post(bo, "move", { x: 4, z: 12, yaw: 0 });
    await post(cy, "move", { x: 2, z: -100, yaw: 0 });
    const moves = await sb.next((m) => m.type === "moves" && m.people.length >= 3, 3000);
    expect(moves.type === "moves" && moves.people.find((p) => p.name === "Ada")).toMatchObject({ x: 2, z: 10 });

    const from = sc.messages.length;
    const said = await post(ada, "say", { text: "  hi\u0007 there  " + "x".repeat(200) });
    expect(said.status).toBe(200);
    expect(await said.json()).toMatchObject({ ok: true, heard: 1 });
    const heard = await sb.next((m) => m.type === "said");
    expect(heard.type === "said" && heard.text.startsWith("hi there x")).toBe(true);
    expect(heard.type === "said" && heard.text.length).toBe(120);
    await sa.next((m) => m.type === "said");
    // Cy, a hundred metres away in the forest, hears nothing
    await new Promise((r) => setTimeout(r, 400));
    expect(sc.messages.slice(from).some((m) => m.msg.type === "said")).toBe(false);

    expect((await post(bo, "say", { text: "   " })).status).toBe(400);
    for (const s of [sa, sb, sc]) s.close();
  });

});
