import { expect, inject, it } from "vitest";
import type { BoardState } from "../src/types.js";
import { BoardEvents } from "./events.js";

// The crit's actual requirement: "a change one person makes reaches everyone
// else within about a second, without a reload." These tests are the
// automated proxy for that — two independent SSE connections stand in for
// two people's open tabs, and each check only passes if the second
// connection sees the first connection's change within budget.
const baseUrl = inject("baseUrl");
const BUDGET_MS = 1000;

it("a cell change made by one session reaches another within a second", async () => {
  const other = await BoardEvents.connect(baseUrl);
  try {
    await other.next(); // initial snapshot on connect

    // A cell index unlikely to collide with any other test's writes.
    const index = 7;
    const res = await fetch(new URL(`/cells/${index}`, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "mi" }),
    });
    expect(res.status).toBe(204);

    const seen = await other.waitFor((state) => state.cells[index] === "mi", BUDGET_MS);
    expect(seen.cells[index]).toBe("mi");
  } finally {
    other.cancel();
  }
});

it("clearing a cell (last write wins) reaches another session within a second", async () => {
  const index = 8;
  await fetch(new URL(`/cells/${index}`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note: "so" }),
  });

  const other = await BoardEvents.connect(baseUrl);
  try {
    const initial = await other.next();
    expect(initial?.cells[index]).toBe("so");

    await fetch(new URL(`/cells/${index}`, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: null }),
    });

    const seen = await other.waitFor((state) => state.cells[index] === null, BUDGET_MS);
    expect(seen.cells[index]).toBeNull();
  } finally {
    other.cancel();
  }
});

it("an instrument switch reaches another session within a second, mid-playback or not", async () => {
  const other = await BoardEvents.connect(baseUrl);
  try {
    await other.next();

    const target: BoardState["instrument"] = "sax";
    const res = await fetch(new URL("/instrument", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instrument: target }),
    });
    expect(res.status).toBe(204);

    const seen = await other.waitFor((state) => state.instrument === target, BUDGET_MS);
    expect(seen.instrument).toBe(target);
  } finally {
    other.cancel();
  }
});

it("pressing play reaches another session within a second and gives a shared start time", async () => {
  const other = await BoardEvents.connect(baseUrl);
  try {
    await other.next();

    await fetch(new URL("/stop", baseUrl), { method: "POST" });
    await other.waitFor((state) => !state.playing, BUDGET_MS);

    const before = Date.now();
    const res = await fetch(new URL("/play", baseUrl), { method: "POST" });
    expect(res.status).toBe(204);

    const seen = await other.waitFor((state) => state.playing, BUDGET_MS);
    expect(seen.playing).toBe(true);
    expect(seen.startedAtMs).not.toBeNull();
    // The shared transport's clock should be close to "now", not stale —
    // every open session derives its playhead from this one number.
    expect(seen.startedAtMs! - before).toBeGreaterThanOrEqual(-50);
    expect(seen.startedAtMs! - before).toBeLessThan(BUDGET_MS);
  } finally {
    other.cancel();
    await fetch(new URL("/stop", baseUrl), { method: "POST" });
  }
});

it("rejects an out-of-range cell index and an invalid note", async () => {
  const badIndex = await fetch(new URL("/cells/99", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note: "do" }),
  });
  expect(badIndex.status).toBe(400);

  const badNote = await fetch(new URL("/cells/0", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note: "ti" }),
  });
  expect(badNote.status).toBe(400);
});

it("the home page serves the board once a nickname cookie is set", async () => {
  const join = await fetch(new URL("/nickname", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ nickname: "Riley" }).toString(),
    redirect: "manual",
  });
  expect(join.status).toBe(303);
  const cookie = join.headers.getSetCookie()[0]?.split(";")[0];
  expect(cookie).toBeTruthy();

  const page = await fetch(new URL("/", baseUrl), { headers: { cookie: cookie! } });
  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain('id="grid"');
  expect(html).toContain("Riley");
});
