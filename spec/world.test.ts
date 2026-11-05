import { readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { SCENES } from "../src/shared/catalog.ts";
import type { PlacedSound, Snapshot } from "../src/shared/protocol.ts";
import { SOUNDS, soundUrl } from "../src/shared/sounds.ts";
import { seasideKit } from "../src/client/seaside.ts";
import { Stream, join, type Person } from "./helpers.ts";

// The walkable place (ADR 004 to 007, 011): one world whatever the time of
// day, with zones to go to, people who see each other, talk between people
// who are near, and the sounds people leave in it.
const baseUrl = inject("baseUrl");
const world = SCENES.find((s) => s.id === "seaside")!;

async function snapshot(mode: string, who: Person | null = null): Promise<Snapshot> {
  const stream = await Stream.open(baseUrl, world.id, mode, who);
  const snap = stream.messages[0].msg as Snapshot;
  stream.close();
  return snap;
}

describe("the walkable world", () => {
  it("is the place listed, and says on its page what it is", async () => {
    expect(SCENES.map((s) => s.id)).toEqual(["seaside"]);
    const explore = await (await fetch(new URL("/explore", baseUrl))).text();
    expect(explore).toContain(`/scene/${world.id}?mode=`);
    const html = await (await fetch(new URL(`/scene/${world.id}?mode=weekday`, baseUrl))).text();
    expect(html).toContain(world.about.slice(0, 30));
    expect(html).toContain('"three":"/vendor/three.module.min.js"');
  });

  it("Go to puts you inside the part of the place it names", () => {
    for (const z of world.zones) expect(seasideKit.zoneAt(z.spawn.x, z.spawn.z), z.id).toBe(z.id);
  });

  it("opens at the zone asked for (?zone=, or the older ?shot=)", async () => {
    for (const q of ["zone=pier", "shot=pier"]) {
      const html = await (await fetch(new URL(`/scene/${world.id}?mode=weekday&${q}`, baseUrl))).text();
      expect(html, q).toContain('"zoneId":"pier"');
    }
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
});

describe("the old sound stays gone (ADR 010)", () => {
  it("the routes and scripts of the sound before ADR 010 are 404", async () => {
    const html = await (await fetch(new URL(`/scene/${world.id}?mode=weekday`, baseUrl))).text();
    for (const gone of ["Enable sound", "Now playing", "3-minute"]) expect(html, gone).not.toContain(gone);
    const snap = await snapshot("weekday");
    expect(snap).not.toHaveProperty("placements");
    for (const [method, path] of [
      ["POST", `/api/sessions/${snap.sessionId}/ops`],
      ["GET", `/api/sessions/${snap.sessionId}/events`],
      ["GET", `/api/sessions/${snap.sessionId}`],
      ["GET", "/archive"],
      ["GET", "/api/memories"],
      ["GET", "/memory/mem_0000000000000000"],
      ["GET", "/client/audio.js"],
      ["GET", "/client/synth.js"],
    ]) {
      expect((await fetch(new URL(path, baseUrl), { method })).status, `${method} ${path}`).toBe(404);
    }
  });
});

// Sounds people leave where they stand, and remove from beside them (ADR
// 011). Each test works far out at sea (x, z around 900), away from where
// anyone walks, and removes what it leaves.
describe("sounds people leave (ADR 011)", () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let sessionId = "";
  const call = async (who: Person | null, method: string, path: string, body?: unknown) => {
    if (!sessionId) sessionId = (await snapshot("weekday")).sessionId;
    return fetch(new URL(`/api/sessions/${sessionId}/${path}`, baseUrl), {
      method,
      headers: { "content-type": "application/json", ...(who ? { cookie: who.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  // a move, then long enough for the next to count (moves closer than 90 ms
  // apart are dropped)
  const stand = async (who: Person, x: number, z: number) => {
    await call(who, "POST", "move", { x, z, yaw: 0 });
    await wait(120);
  };
  const leave = async (who: Person, soundId: string) => {
    const res = await call(who, "POST", "sounds", { soundId });
    const body = (await res.json()) as { ok: boolean; code?: string; sound?: PlacedSound };
    await wait(1050); // one change a second per person
    return { status: res.status, ...body };
  };
  const remove = async (who: Person, id: string) => {
    const res = await call(who, "DELETE", `sounds/${id}`);
    const body = (await res.json()) as { ok: boolean; code?: string };
    await wait(1050);
    return { status: res.status, ...body };
  };
  // whatever a run that failed half way left out here
  const clearAround = async (who: Person, x: number, z: number) => {
    for (const s of (await snapshot("weekday")).sounds.filter((s) => Math.hypot(s.x - x, s.z - z) < 20)) {
      await stand(who, s.x, s.z);
      await remove(who, s.id);
    }
  };

  it("every sound on offer is served, and is recorded as CC0 or public domain", async () => {
    const manifest = JSON.parse(readFileSync("public/assets-manifest.json", "utf8")) as { assets: { id: string; path: string; rights: string; source: string }[] };
    for (const kind of SOUNDS) {
      const entry = manifest.assets.find((a) => a.id === `commons-${kind.id}`);
      expect(entry, kind.id).toBeDefined();
      expect(entry!.rights).toMatch(/^(CC0|Public domain)/);
      expect(entry!.source).toMatch(/commons\.wikimedia\.org/);
      const res = await fetch(new URL(soundUrl(kind.id), baseUrl));
      expect(res.status, kind.id).toBe(200);
      expect(res.headers.get("content-type")).toBe("audio/mpeg");
    }
    expect((await fetch(new URL("/assets/sounds/../../package.json", baseUrl))).status).toBe(404);
  });

  it("refuses someone who hasn't joined, or isn't standing anywhere yet, or names no sound", async () => {
    expect((await call(null, "POST", "sounds", { soundId: "guitar" })).status).toBe(401);
    const nowhere = await join(baseUrl, "Nowhere");
    expect(await leave(nowhere, "guitar")).toMatchObject({ status: 409, code: "not_here" });
    await stand(nowhere, 900, 900);
    expect(await leave(nowhere, "a-whale")).toMatchObject({ status: 400, code: "bad_request" });
  });

  it("leaves a sound where you stand, shows it to everyone at once, keeps it, and lets someone beside it remove it", async () => {
    const ari = await join(baseUrl, "Ari");
    const ben = await join(baseUrl, "Ben");
    const watcher = await Stream.open(baseUrl, world.id, "weekday", null);
    await clearAround(ari, 905, 905);
    await stand(ari, 905, 905);
    const sentAt = performance.now();
    const left = await leave(ari, "guitar");
    expect(left).toMatchObject({ status: 201, ok: true, sound: { soundId: "guitar", x: 905, z: 905, by: "Ari" } });
    const id = left.sound!.id;
    // someone watching sees it within a second
    const seen = await watcher.next((m) => m.type === "sound-left" && m.sound.id === id, 1000);
    expect(seen.type === "sound-left" && seen.sound).toMatchObject({ soundId: "guitar", by: "Ari", x: 905, z: 905 });
    expect(watcher.messages.find((m) => m.msg.type === "sound-left" && m.msg.sound.id === id)!.at - sentAt).toBeLessThan(1000);
    // and it is there for whoever comes next
    expect((await snapshot("weekday")).sounds.some((s) => s.id === id)).toBe(true);

    // Ben, 10 m away, can't remove it; beside it, he can, once
    await stand(ben, 915, 905);
    expect(await remove(ben, id)).toMatchObject({ status: 409, code: "too_far" });
    await stand(ben, 907, 906);
    expect(await remove(ben, id)).toMatchObject({ status: 200, ok: true });
    const gone = await watcher.next((m) => m.type === "sound-removed" && m.id === id, 1000);
    expect(gone.type === "sound-removed" && gone.by).toBe("Ben");
    expect(await remove(ben, id)).toMatchObject({ status: 409, code: "gone" });
    expect((await snapshot("weekday")).sounds.some((s) => s.id === id)).toBe(false);
    watcher.close();
  });

  it("needs room between two of the same sound, and keeps any spot from crowding", async () => {
    const cy = await join(baseUrl, "Cy");
    const ids: string[] = [];
    await clearAround(cy, 950, 950);
    await stand(cy, 950, 950);
    const first = await leave(cy, "trickle");
    expect(first.ok).toBe(true);
    ids.push(first.sound!.id);
    await stand(cy, 951, 951);
    expect(await leave(cy, "trickle")).toMatchObject({ status: 409, code: "too_close" });
    // other sounds can share the spot, up to six around it
    for (const soundId of ["guitar", "espresso", "cafe-music", "cafe-chatter", "evening-forest"]) {
      const r = await leave(cy, soundId);
      expect(r.ok, soundId).toBe(true);
      ids.push(r.sound!.id);
    }
    await stand(cy, 956, 950);
    expect(await leave(cy, "trickle")).toMatchObject({ status: 409, code: "crowded" });
    await stand(cy, 950.5, 950.5);
    for (const id of ids) expect((await remove(cy, id)).ok).toBe(true);
  }, 40_000);
});

describe("people in the place (ADR 007)", () => {
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

  it("is only the sunny day; old links and old pages for the retired times of day find the same room (ADR 012)", async () => {
    expect(world.modes.map((m) => m.id)).toEqual(["weekday"]);
    const html = await (await fetch(new URL(`/scene/${world.id}?mode=weekday`, baseUrl))).text();
    expect(html).not.toContain("mode-switch");
    for (const old of world.retiredModes) {
      const res = await fetch(new URL(`/scene/${world.id}?mode=${old}&zone=pier`, baseUrl), { redirect: "manual" });
      expect(res.status, old).toBe(301);
      expect(res.headers.get("location")).toBe(`/scene/${world.id}?mode=weekday&zone=pier`);
      expect((await snapshot(old)).sessionId, old).toBe((await snapshot("weekday")).sessionId);
    }
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
