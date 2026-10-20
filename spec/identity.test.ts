import { expect, inject, it } from "vitest";
import { Session } from "./session.js";

const baseUrl = inject("baseUrl");

it("two people with the same nickname are still two different users", async () => {
  const a = await Session.join(baseUrl, "Sam");
  const b = await Session.join(baseUrl, "Sam");
  expect(a.cookieHeader).not.toBe(b.cookieHeader);
});

it("the session cookie is HttpOnly and carries no user id", async () => {
  const res = await fetch(new URL("/join", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "nickname=Cookie",
    redirect: "manual",
  });
  const cookie = res.headers.getSetCookie()[0];
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).not.toMatch(/usr_/);
});

it("changes without a session are refused", async () => {
  const res = await fetch(new URL("/notes", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ row: 0, col: 0, note: "C4" }),
  });
  expect(res.status).toBe(401);
});

// ADR 002: a visitor who hasn't joined sees the music through /preview, but
// never the stream that carries nicknames and activity.
it("the garden stream, with nicknames and activity, needs a session", async () => {
  const res = await fetch(new URL("/events", baseUrl));
  expect(res.status).toBe(401);
  await res.body?.cancel();
});

it("a forged session token is refused", async () => {
  const res = await fetch(new URL("/instrument", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "sg_session=not-a-real-token" },
    body: JSON.stringify({ instrument: "guitar" }),
  });
  expect(res.status).toBe(401);
});

it("a user id in the request body can't make a change look like someone else's", async () => {
  const mallory = await Session.join(baseUrl, "Mallory");
  const watcher = await (await Session.join(baseUrl, "Watcher")).events();
  await watcher.next();
  await mallory.fetch("/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ row: 0, col: 5, note: "G4", userId: "usr_someoneelse", nickname: "Alice" }),
  });
  const seen = await watcher.waitFor((s) => s.grid[0][5] === "G4");
  const entry = seen.activity.find((a) => a.text.startsWith("placed G at row 1, step 6"));
  expect(entry?.nickname).toBe("Mallory");
  watcher.cancel();
});

it("out-of-range squares, unknown notes and unknown instruments are refused", async () => {
  const s = await Session.join(baseUrl, "Tester");
  expect((await s.setNote(6, 0, "C4")).status).toBe(400);
  expect((await s.setNote(0, -1, "C4")).status).toBe(400);
  expect((await s.setNote(0, 0, "B4")).status).toBe(400);
  expect((await s.setInstrument("drums")).status).toBe(400);
});

it("a nickname with HTML is shown as text, not markup", async () => {
  const s = await Session.join(baseUrl, "<img src=x onerror=alert(1)>");
  const html = await (await s.fetch("/")).text();
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("&lt;img src=x");
});
