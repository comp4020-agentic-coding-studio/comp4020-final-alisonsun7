import { expect, inject, it } from "vitest";
import { Session } from "./session.ts";

const baseUrl = inject("baseUrl");
const unique = () => Math.random().toString(36).slice(2);

it("a single visitor creates a room and saves an idea that survives reload (DD01)", async () => {
  const a = new Session(baseUrl);
  const { code, res } = await a.createRoom(`Saturday Out ${unique()}`, "Wen");
  expect(res.status).toBe(303);
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  const submit = await a.submitIdea(code, { category: "WHERE", title: "National Zoo", requestKey: unique() });
  expect(submit.status).toBe(201);
  const created = await submit.json();
  expect(created).toMatchObject({ category: "WHERE", title: "National Zoo", authorNickname: "Wen" });

  // "Reload" is a fresh GET with the same session's cookies, hitting the DB
  // again — not a client-side echo of what was just posted.
  const reload = await a.roomPage(code);
  const html = await reload.text();
  expect(html).toContain("National Zoo");
  expect(html).toContain(code);
});

it("a retried submission with the same request key does not duplicate, but a different payload under the same key is rejected (DD08/DD09)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Retry Room ${unique()}`, "Wen");
  const key = unique();

  const first = await a.submitIdea(code, { category: "EAT", title: "Dumpling House", requestKey: key });
  expect(first.status).toBe(201);
  const firstBody = await first.json();

  const replay = await a.submitIdea(code, { category: "EAT", title: "Dumpling House", requestKey: key });
  expect(replay.status).toBe(200);
  const replayBody = await replay.json();
  expect(replayBody.id).toBe(firstBody.id);

  const conflicting = await a.submitIdea(code, { category: "DO", title: "Something else", requestKey: key });
  expect(conflicting.status).toBe(409);

  const board = await (await a.roomPage(code)).text();
  const occurrences = board.split("Dumpling House").length - 1;
  expect(occurrences).toBe(1);
  expect(board).not.toContain("Something else");

  const distinct = await a.submitIdea(code, { category: "DO", title: "Bowling", requestKey: unique() });
  expect(distinct.status).toBe(201);
});

it("concurrent distinct proposals from the same participant both survive", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Concurrent Room ${unique()}`, "Wen");

  const [r1, r2] = await Promise.all([
    a.submitIdea(code, { category: "WHERE", title: "Beach", requestKey: unique() }),
    a.submitIdea(code, { category: "DO", title: "Hike", requestKey: unique() }),
  ]);
  expect(r1.status).toBe(201);
  expect(r2.status).toBe(201);

  const board = await (await a.roomPage(code)).text();
  expect(board).toContain("Beach");
  expect(board).toContain("Hike");
});

it("rejects invalid input without saving it (DD08 draft-preserving boundary)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Validation Room ${unique()}`, "Wen");

  const emptyTitle = await a.submitIdea(code, { category: "WHERE", title: "   ", requestKey: unique() });
  expect(emptyTitle.status).toBe(400);

  const badCategory = await a.submitIdea(code, { category: "NOPE", title: "x", requestKey: unique() });
  expect(badCategory.status).toBe(400);

  const tooLong = await a.submitIdea(code, { category: "WHERE", title: "x".repeat(121), requestKey: unique() });
  expect(tooLong.status).toBe(400);

  const board = await (await a.roomPage(code)).text();
  expect(board).toContain("No ideas yet.");
});

it("escapes user-supplied idea titles and nicknames in the served HTML (no stored XSS)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`XSS Room ${unique()}`, "<b>Wen</b>");
  await a.submitIdea(code, {
    category: "EAT",
    title: "<script>alert(1)</script> & chips",
    requestKey: unique(),
  });

  const html = await (await a.roomPage(code)).text();
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; chips");
  expect(html).not.toContain("<b>Wen</b>");
  expect(html).toContain("&lt;b&gt;Wen&lt;/b&gt;");
});

it("a credential issued for one room cannot post into another room, and never names the reason (DD10)", async () => {
  const a = new Session(baseUrl);
  const b = new Session(baseUrl);
  const { code: codeA } = await a.createRoom(`Room A ${unique()}`, "Wen");
  await b.createRoom(`Room B ${unique()}`, "Alex");

  const res = await b.submitIdea(codeA, { category: "DO", title: "sneaky", requestKey: unique() });
  expect(res.status).toBe(401);

  const board = await (await a.roomPage(codeA)).text();
  expect(board).not.toContain("sneaky");
});

it("an anonymous visitor can read the board but is not offered a non-functional submit form (DD05 scope)", async () => {
  const a = new Session(baseUrl);
  const { code } = await a.createRoom(`Visible Room ${unique()}`, "Wen");
  await a.submitIdea(code, { category: "WHERE", title: "Museum", requestKey: unique() });

  const res = await fetch(new URL(`/rooms/${code}`, baseUrl));
  const html = await res.text();
  expect(html).toContain("Museum");
  expect(html).not.toContain('id="idea-form"');
});

it("an unknown room code answers 404, not a confusing empty board", async () => {
  const res = await fetch(new URL("/rooms/ZZZZZZ", baseUrl));
  expect(res.status).toBe(404);
});
