import { expect, inject, it } from "vitest";
import { COLS, STEP_MS, formatTime } from "../src/types.js";
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

// README: the timeline shows the whole loop, so its total is six steps long
// and the playhead can be moved from the keyboard as well as by dragging.
it("the garden page has a timeline: a seekable track, a playhead and the loop's length", async () => {
  const s = await Session.join(baseUrl, "Timeline");
  const html = await (await s.fetch("/")).text();
  expect(html).toContain('id="timeline-track"');
  expect(html).toMatch(/id="timeline-track"[^>]*role="slider"[^>]*tabindex="0"/);
  expect(html).toContain('id="timeline-playhead"');
  expect(html).toContain('id="timeline-now">0:00.0<');
  expect(html).toContain(`id="timeline-total">${formatTime(COLS * STEP_MS)}<`);
  expect(formatTime(COLS * STEP_MS)).toBe("0:02.4");
});

it("formats timeline clock readings as m:ss.t", () => {
  expect(formatTime(0)).toBe("0:00.0");
  expect(formatTime(399)).toBe("0:00.3");
  expect(formatTime(1200)).toBe("0:01.2");
  expect(formatTime(61_250)).toBe("1:01.2");
});
