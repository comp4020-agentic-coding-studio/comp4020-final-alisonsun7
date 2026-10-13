import { expect, inject, it } from "vitest";
import { Session } from "./session.js";

const baseUrl = inject("baseUrl");

// The first deploy served a page whose script imported two modules the
// server 404'd: the page returned 200 and every server-side test passed,
// but no grid ever rendered. So: follow every script and stylesheet the
// page references, and every module those scripts import, and require 200.
it("every script, module and stylesheet the garden page loads actually resolves", async () => {
  const s = await Session.join(baseUrl, "Loader");
  const html = await (await s.fetch("/")).text();

  const queue = [
    ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<link[^>]+href="(\/[^"]+)"/g)].map((m) => m[1]),
  ];
  expect(queue).toContain("/client/app.js");

  const seen = new Set<string>();
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await fetch(new URL(path, baseUrl));
    expect(res.status, `${path} did not load`).toBe(200);
    if (path.endsWith(".js")) {
      const src = await res.text();
      for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        queue.push(new URL(m[1], new URL(path, baseUrl)).pathname);
      }
    }
  }
  expect(seen.has("/client/audio.js")).toBe(true);
  expect(seen.has("/types.js")).toBe(true);
});

it("the garden page has the grid, five notes plus an eraser, play/stop and three instruments", async () => {
  const s = await Session.join(baseUrl, "Layout");
  const html = await (await s.fetch("/")).text();
  expect(html).toContain('id="grid"');
  for (const note of ["C4", "D4", "E4", "G4", "A4", "eraser"]) expect(html).toContain(`data-tool="${note}"`);
  expect(html).toContain('id="play"');
  expect(html).toContain('id="stop"');
  for (const i of ["piano", "guitar", "saxophone"]) expect(html).toContain(`data-instrument="${i}"`);
});

it("a visitor without a session sees the join form", async () => {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  expect(html).toContain('action="/join"');
});
