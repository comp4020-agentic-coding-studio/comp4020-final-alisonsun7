import { expect, inject, it } from "vitest";
import { Session } from "./session.ts";

const baseUrl = inject("baseUrl");
const unique = () => Math.random().toString(36).slice(2);

it("a second independent browser identity joins by code and both see each other (DD02/DD03)", async () => {
  const a = new Session(baseUrl);
  const b = new Session(baseUrl);
  const { code } = await a.createRoom(`Saturday Out ${unique()}`, "Wen");

  const joinRes = await b.joinRoom(code, "Alex");
  expect(joinRes.status).toBe(303);
  expect(joinRes.headers.get("location")).toBe(`/rooms/${code}`);

  // A refreshes (fresh GET, A's own cookies) and sees B.
  const aView = await (await a.roomPage(code)).text();
  expect(aView).toContain("Wen");
  expect(aView).toContain("Alex");
  expect(aView).toContain("2 of 12 joined");

  // B independently sees the same board, from B's own session.
  const bView = await (await b.roomPage(code)).text();
  expect(bView).toContain("Wen");
  expect(bView).toContain("Alex");
});

it("roles guide but never restrict: either member can add to any category (DD05)", async () => {
  const a = new Session(baseUrl);
  const b = new Session(baseUrl);
  const { code } = await a.createRoom(`Room ${unique()}`, "Wen");
  await b.joinRoom(code, "Alex");

  const aView = await (await a.roomPage(code)).text();
  const bView = await (await b.roomPage(code)).text();
  // Exactly one category has nobody assigned (2 members, 3 categories) and
  // both pages (same server-rendered facts) agree on which one.
  const sharedInA = [...aView.matchAll(/shared — no one's assigned here yet/g)].length;
  expect(sharedInA).toBe(1);
  expect(bView).toContain("shared — no one's assigned here yet");

  // Whichever category is "theirs", Alex can still add to a category that
  // is not their assigned responsibility.
  const forWhere = await b.submitIdea(code, { category: "WHERE", title: "Alex suggests WHERE too", requestKey: unique() });
  const forDo = await b.submitIdea(code, { category: "DO", title: "Alex suggests DO too", requestKey: unique() });
  expect([forWhere.status, forDo.status]).toEqual([201, 201]);
});

it("a single member cannot start; a second member can; starting twice doesn't reset (DD14)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Room ${unique()}`, "Wen");

  // Solo: idea input still works, but there is no clickable start control.
  const soloPage = await (await a.roomPage(code)).text();
  expect(soloPage).not.toContain("Start planning together");
  const soloIdea = await a.submitIdea(code, { category: "WHERE", title: "Solo idea before anyone joins", requestKey: unique() });
  expect(soloIdea.status).toBe(201);

  const startTooFew = await a.startRoom(code);
  // The room page it redirects to still shows phase unchanged (no button
  // appeared, no crash) — starting was simply not available yet.
  expect(startTooFew.status).toBe(303);
  expect(await (await a.roomPage(code)).text()).not.toContain("has started planning");

  const b = new Session(baseUrl);
  await b.joinRoom(code, "Alex");

  const afterJoinPage = await (await a.roomPage(code)).text();
  expect(afterJoinPage).toContain("Start planning together");

  const started = await a.startRoom(code);
  expect(started.status).toBe(303);
  const afterStart = await (await b.roomPage(code)).text();
  expect(afterStart).toContain("has started planning");

  // Idempotent: a second start (by either member) doesn't un-start or error.
  const startedAgain = await b.startRoom(code);
  expect(startedAgain.status).toBe(303);
  expect(await (await a.roomPage(code)).text()).toContain("has started planning");
});

it("joining an unknown code or a full room gives a clear, specific error", async () => {
  // Filling a room to capacity means 11+ sequential real HTTP round trips;
  // fast over localhost/Docker, but exceeds vitest's 5s default against a
  // real deployed APP_URL over the internet.
  const stranger = new Session(baseUrl);
  const unknown = await stranger.joinRoom("ZZZZZZ", "Nobody");
  expect(unknown.status).toBe(404);
  expect(await unknown.text()).toContain("No room matches that code.");

  const owner = new Session(baseUrl);
  const { code } = await owner.createRoom(`Full Room ${unique()}`, "P1");
  for (let i = 2; i <= 12; i++) {
    const joiner = new Session(baseUrl);
    const res = await joiner.joinRoom(code, `P${i}`);
    expect(res.status).toBe(303);
  }

  const thirteenth = new Session(baseUrl);
  const full = await thirteenth.joinRoom(code, "P13");
  expect(full.status).toBe(409);
  expect(await full.text()).toContain("full (12 of 12)");
}, 20000);

it("two concurrent joins racing for the final (12th) seat accept at most one (DD07, full two-context race)", async () => {
  // Same reason as above: 10 sequential joins plus the race itself.
  const owner = new Session(baseUrl);
  const { code } = await owner.createRoom(`Racing Room ${unique()}`, "P1");
  for (let i = 2; i <= 11; i++) {
    const joiner = new Session(baseUrl);
    const res = await joiner.joinRoom(code, `P${i}`);
    expect(res.status).toBe(303);
  }

  const racerA = new Session(baseUrl);
  const racerB = new Session(baseUrl);
  const [resA, resB] = await Promise.all([
    racerA.joinRoom(code, "Racer A"),
    racerB.joinRoom(code, "Racer B"),
  ]);
  const statuses = [resA.status, resB.status].sort();
  expect(statuses).toEqual([303, 409]);

  const board = await (await owner.roomPage(code)).text();
  expect(board).toContain("12 of 12 joined");
}, 20000);

it("stable identity on reload/return: cookies alone restore room, nickname and role (DD03)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Durable Room ${unique()}`, "Wen");

  const before = await (await a.roomPage(code)).text();
  const roleBefore = /Wen \(you\) — (\w+)/.exec(before)?.[1];
  expect(roleBefore).toBeTruthy();

  // "Closing and reopening the browser with retained storage" is modelled as
  // further requests from the same Session (same cookies), not a fresh one.
  for (let i = 0; i < 3; i++) {
    const again = await (await a.roomPage(code)).text();
    const roleAgain = /Wen \(you\) — (\w+)/.exec(again)?.[1];
    expect(roleAgain).toBe(roleBefore);
  }

  const home = await (await a.homePage()).text();
  expect(home).toContain("Welcome back, Wen");
  expect(home).toContain(`/rooms/${code}`);
});

it("a visitor with no saved identity sees a plain home page, not a stale welcome", async () => {
  const stranger = new Session(baseUrl);
  const home = await (await stranger.homePage()).text();
  expect(home).not.toContain("Welcome back");
});

it("rooms stay isolated: room B's roster and board never appear on room A's page", async () => {
  const a = new Session(baseUrl);
  const b = new Session(baseUrl);
  const { code: codeA } = await a.createRoom(`Isolated A ${unique()}`, "Wen");
  const { code: codeB } = await b.createRoom(`Isolated B ${unique()}`, "Jordan");
  await a.submitIdea(codeA, { category: "WHERE", title: "Only in room A", requestKey: unique() });
  await b.submitIdea(codeB, { category: "WHERE", title: "Only in room B", requestKey: unique() });

  const pageA = await (await a.roomPage(codeA)).text();
  expect(pageA).toContain("Only in room A");
  expect(pageA).not.toContain("Only in room B");
  expect(pageA).not.toContain("Jordan");

  const pageB = await (await b.roomPage(codeB)).text();
  expect(pageB).toContain("Only in room B");
  expect(pageB).not.toContain("Only in room A");
  expect(pageB).not.toContain("Wen");
});
