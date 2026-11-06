import { readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { SCENES } from "../src/shared/catalog.ts";
import type { MoveResult, PlacedSound, Snapshot } from "../src/shared/protocol.ts";
import { PLACE_MAX, SOUNDS, soundUrl } from "../src/shared/sounds.ts";
import { HUTS } from "../src/shared/huts.ts";
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
    const res = await call(who, "POST", "move", { x, z, yaw: 0 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    await wait(120);
  };
  const leave = async (who: Person, soundId: string, whileInside = false) => {
    const res = await call(who, "POST", "sounds", whileInside ? { soundId, whileInside } : { soundId });
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

  // ADR 013: inside a toilet or shower you may leave its own sound for as
  // long as you're in; it goes, for everyone, when you come out.
  it("a toilet's flush lasts only while you're inside, and goes when you come out", async () => {
    const dot = await join(baseUrl, "Dot");
    const toilet = HUTS.find((h) => h.kind === "womens-toilet")!;
    const inX = (toilet.x0 + toilet.x1) / 2;
    const inZ = toilet.z1 - 0.8;
    const watcher = await Stream.open(baseUrl, world.id, "weekday", null);

    // outside, it's refused
    await stand(dot, inX, toilet.z1 + 2);
    expect(await leave(dot, "toilet-flush", true)).toMatchObject({ status: 409, code: "not_inside" });
    // inside, only the toilet's own sound, and only one
    await stand(dot, inX, inZ);
    expect(await leave(dot, "shower", true)).toMatchObject({ status: 400, code: "bad_request" });
    const flush = await leave(dot, "toilet-flush", true);
    expect(flush).toMatchObject({ status: 201, ok: true, sound: { soundId: "toilet-flush", whileIn: toilet.id } });
    expect(await leave(dot, "toilet-flush", true)).toMatchObject({ status: 409, code: "already" });
    const id = flush.sound!.id;
    expect((await snapshot("weekday")).sounds.find((s) => s.id === id)?.whileIn).toBe(toilet.id);

    // walking about inside keeps it; coming out ends it, for everyone
    await stand(dot, inX - 0.5, inZ - 0.5);
    expect((await snapshot("weekday")).sounds.some((s) => s.id === id)).toBe(true);
    await stand(dot, inX, toilet.z1 + 1.5);
    const gone = await watcher.next((m) => m.type === "sound-removed" && m.id === id, 1500);
    expect(gone).toMatchObject({ by: "Dot", left: true });
    expect((await snapshot("weekday")).sounds.some((s) => s.id === id)).toBe(false);
    watcher.close();
  }, 20_000);
});

describe("private huts (ADR 013)", () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const toilet = HUTS.find((h) => h.kind === "mens-toilet")!;
  const shower = HUTS.find((h) => h.kind === "mens-shower")!;
  const inside = (hut: typeof toilet) => ({ x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 - 1.6, yaw: 0 });
  const outside = (hut: typeof toilet) => ({ x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 + 1.5, yaw: 0 });
  const post = async (sessionId: string, who: Person, path: string, body: unknown) => {
    const res = await fetch(new URL(`/api/sessions/${sessionId}/${path}`, baseUrl), {
      method: "POST", headers: { "content-type": "application/json", cookie: who.cookie }, body: JSON.stringify(body),
    });
    const result = await res.json() as { ok: boolean; code?: string; sound?: PlacedSound; hutId?: string; position?: { x: number; z: number; yaw: number } };
    return { status: res.status, ...result };
  };

  it("admits exactly one concurrent arrival, corrects rejected positions, and releases the hut on disconnect", async () => {
    const a = await join(baseUrl, "Hut Ari");
    const b = await join(baseUrl, "Hut Ben");
    const sa = await Stream.open(baseUrl, world.id, "weekday", a);
    const sb = await Stream.open(baseUrl, world.id, "weekday", b);
    const sessionId = sa.snapshot().sessionId;
    const first = outside(toilet);
    try {
      for (const who of [a, b]) expect(await post(sessionId, who, "move", first)).toMatchObject({ ok: true });
      await wait(120);
      const results = await Promise.all([a, b].map((who) => post(sessionId, who, "move", inside(toilet))));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toMatchObject({ status: 409, code: "hut_taken", hutId: toilet.id, position: first });
      const winner = results[0].ok ? a : b;
      const loser = winner === a ? b : a;
      const winnerStream = winner === a ? sa : sb;
      const newcomer = await join(baseUrl, "Hut Cy");
      const rejected = await post(sessionId, newcomer, "move", inside(toilet)) as { status: number } & MoveResult;
      expect(rejected).toMatchObject({ status: 409, ok: false, code: "hut_taken", hutId: toilet.id });
      if (!rejected.ok && rejected.code === "hut_taken") expect(rejected.position.z).toBeGreaterThan(toilet.z1);
      expect(await post(sessionId, newcomer, "sounds", { soundId: "toilet-flush", whileInside: true })).toMatchObject({ code: "not_here" });

      // A newly connected watcher receives existing positions immediately;
      // the occupant need not move again to lock its door on that page.
      const watcher = await Stream.open(baseUrl, world.id, "weekday", null);
      try {
        const occupantId = winnerStream.snapshot().you!.id;
        const positions = await watcher.next((m) => m.type === "moves", 1000);
        expect(positions.type === "moves" && positions.people.filter((p) => p.id === occupantId)).toHaveLength(1);
        const from = watcher.messages.length;
        winnerStream.close();
        await winnerStream.closed;
        await watcher.next((m) => m.type === "moves" && !m.people.some((p) => p.id === occupantId), 1500, from);
        await wait(120);
        expect(await post(sessionId, loser, "move", inside(toilet))).toMatchObject({ status: 200, ok: true });
      } finally {
        watcher.close();
      }
    } finally {
      for (const who of [a, b]) await post(sessionId, who, "move", { x: 800, z: 800, yaw: 0 });
      sa.close(); sb.close();
    }
  });

  it("keeps a shower for another open page, then ends its sound when the last page disconnects", async () => {
    const who = await join(baseUrl, "Shower Dot");
    const first = await Stream.open(baseUrl, world.id, "weekday", who);
    const second = await Stream.open(baseUrl, world.id, "weekday", who);
    const watcher = await Stream.open(baseUrl, world.id, "weekday", null);
    const sessionId = first.snapshot().sessionId;
    try {
      expect(await post(sessionId, who, "move", inside(shower))).toMatchObject({ ok: true });
      expect(await post(sessionId, who, "sounds", { soundId: "toilet-flush", whileInside: true })).toMatchObject({ status: 400, code: "bad_request" });
      const left = await post(sessionId, who, "sounds", { soundId: "shower", whileInside: true });
      expect(left).toMatchObject({ status: 201, ok: true, sound: { whileIn: shower.id } });
      const id = (left.sound as PlacedSound).id;
      first.close();
      await first.closed;
      expect((await snapshot("weekday")).sounds.some((sound) => sound.id === id)).toBe(true);
      const from = watcher.messages.length;
      second.close();
      await second.closed;
      expect(await watcher.next((m) => m.type === "sound-removed" && m.id === id, 1500, from)).toMatchObject({ left: true });
      expect((await snapshot("weekday")).sounds.some((sound) => sound.id === id)).toBe(false);
    } finally {
      first.close(); second.close(); watcher.close();
    }
  });

  it("ends a stay after position updates stop, even while its stream remains connected", async () => {
    const who = await join(baseUrl, "Quiet Eli");
    const own = await Stream.open(baseUrl, world.id, "weekday", who);
    const watcher = await Stream.open(baseUrl, world.id, "weekday", null);
    const sessionId = own.snapshot().sessionId;
    try {
      expect(await post(sessionId, who, "move", inside(shower))).toMatchObject({ ok: true });
      const left = await post(sessionId, who, "sounds", { soundId: "shower", whileInside: true });
      expect(left).toMatchObject({ status: 201, ok: true });
      const id = (left.sound as PlacedSound).id;
      expect(await watcher.next((m) => m.type === "sound-removed" && m.id === id, 22_000)).toMatchObject({ left: true });
      expect((await snapshot("weekday")).sounds.some((sound) => sound.id === id)).toBe(false);
    } finally {
      own.close(); watcher.close();
    }
  }, 25_000);

  it("allows a temporary flush at the permanent sound limit, and does not charge it to that limit", async () => {
    const sessionId = (await snapshot("weekday")).sessionId;
    const made: { who: Person; sound: PlacedSound }[] = [];
    const who = await join(baseUrl, "Full-place Flo");
    const own = await Stream.open(baseUrl, world.id, "weekday", who);
    const remove = async (person: Person, id: string) => fetch(new URL(`/api/sessions/${sessionId}/sounds/${id}`, baseUrl), { method: "DELETE", headers: { cookie: person.cookie } });
    try {
      const count = (await snapshot("weekday")).sounds.filter((sound) => !sound.whileIn).length;
      // Separate contributors avoid changing the one-change-a-second rule;
      // every created row is removed in finally, even on a failed assertion.
      for (let i = count; i < PLACE_MAX; i++) {
        const person = await join(baseUrl, `Room-check ${i}`);
        expect(await post(sessionId, person, "move", { x: 1100 + (i % 15) * 20, z: 1100 + Math.floor(i / 15) * 20, yaw: 0 })).toMatchObject({ ok: true });
        const left = await post(sessionId, person, "sounds", { soundId: "guitar" });
        if (left.ok) made.push({ who: person, sound: left.sound as PlacedSound });
        expect(left).toMatchObject({ status: 201, ok: true });
      }
      expect(await post(sessionId, who, "move", inside(toilet))).toMatchObject({ ok: true });
      const temporary = await post(sessionId, who, "sounds", { soundId: "toilet-flush", whileInside: true });
      expect(temporary).toMatchObject({ status: 201, ok: true, sound: { whileIn: toilet.id } });
      await wait(1100);
      const spare = made.pop()!;
      expect((await remove(spare.who, spare.sound.id)).status).toBe(200);
      // 149 permanent sounds plus the temporary flush still leave one slot.
      // A lasting flush may share its location: the temporary one neither
      // uses up that slot nor triggers the same-sound spacing rule.
      const lasting = await post(sessionId, who, "sounds", { soundId: "toilet-flush" });
      if (lasting.ok) made.push({ who, sound: lasting.sound as PlacedSound });
      expect(lasting).toMatchObject({ status: 201, ok: true });
    } finally {
      await wait(1100);
      await Promise.all(made.map(async ({ who: person, sound }) => {
        expect((await remove(person, sound.id)).status).toBe(200);
      }));
      own.close();
    }
  }, 30_000);
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

    const expected = [
      { id: sa.snapshot().you!.id, x: 2, z: 10, yaw: 0 },
      { id: sb.snapshot().you!.id, x: 4, z: 12, yaw: 0 },
      { id: sc.snapshot().you!.id, x: 2, z: -100, yaw: 0 },
    ];
    const movesFrom = sb.messages.length;
    for (const [i, who] of [ada, bo, cy].entries()) {
      const { x, z, yaw } = expected[i];
      const res = await post(who, "move", { x, z, yaw });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true });
    }
    // A new subscription already receives older occupants' positions. Wait
    // for this run's participant ids at all three newly accepted positions,
    // rather than any earlier frame that happens to contain three people.
    const moves = await sb.next((m) => m.type === "moves" && expected.every((at) => m.people.some((p) => p.id === at.id && p.x === at.x && p.z === at.z && p.yaw === at.yaw)), 3000, movesFrom);
    for (const at of expected) expect(moves.type === "moves" && moves.people.find((p) => p.id === at.id)).toMatchObject(at);

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
