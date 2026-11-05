import { readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { SCENES } from "../src/shared/catalog.ts";
import type { Snapshot } from "../src/shared/protocol.ts";
import { seasideKit } from "../src/client/seaside.ts";
import { Stream, join, type Person } from "./helpers.ts";

// The walkable place (ADR 004 to 007; sound taken out by ADR 010): one world
// whatever the time of day, with zones to go to, people who see each other,
// and talk between people who are near.
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
    const html = await (await fetch(new URL(`/scene/${world.id}?mode=morning`, baseUrl))).text();
    expect(html).toContain(world.about.slice(0, 30));
    expect(html).toContain('"three":"/vendor/three.module.min.js"');
  });

  it("Go to puts you inside the part of the place it names", () => {
    for (const z of world.zones) expect(seasideKit.zoneAt(z.spawn.x, z.spawn.z), z.id).toBe(z.id);
  });

  it("opens at the zone asked for (?zone=, or the older ?shot=)", async () => {
    for (const q of ["zone=pier", "shot=pier"]) {
      const html = await (await fetch(new URL(`/scene/${world.id}?mode=morning&${q}`, baseUrl))).text();
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

describe("sound is gone (ADR 010)", () => {
  it("the place's pages carry no sound controls, and the sound routes are gone", async () => {
    const html = await (await fetch(new URL(`/scene/${world.id}?mode=weekday`, baseUrl))).text();
    for (const gone of ["sound-toggle", "Enable sound", "Add a sound", "Now playing", "3-minute"]) expect(html, gone).not.toContain(gone);
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

  it("is one room at every time of day", async () => {
    expect((await snapshot("rainy-dusk")).sessionId).toBe((await snapshot("morning")).sessionId);
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
