import { expect, inject, it } from "vitest";
import type { GardenState } from "../src/types.js";
import { GardenEvents, Session } from "./session.js";

const baseUrl = inject("baseUrl");

const openPreview = async (): Promise<GardenEvents> => new GardenEvents(await fetch(new URL("/preview", baseUrl)));

// README: a stranger should see what's in the garden before choosing a name.
it("the welcome page shows the current grid and how many people are creating, before joining", async () => {
  const alice = await Session.join(baseUrl, "WelcomeAlice");
  await alice.setNote(4, 2, "E4");
  const html = await (await fetch(new URL("/", baseUrl))).text();
  expect(html).toContain('id="mini-grid"');
  expect(html.match(/class="mini-cell"/g)).toHaveLength(36);
  expect(html).toContain('data-row="4" data-col="2" data-note="E4"');
  expect(html).toMatch(/creating right now|Be the first to plant a note/);
  expect(html).toContain('action="/join"');
});

it("the welcome page's scripts and modules all load", async () => {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  expect(html).toContain('src="/client/welcome.js"');
  const src = await (await fetch(new URL("/client/welcome.js", baseUrl))).text();
  for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
    const path = new URL(m[1], new URL("/client/welcome.js", baseUrl)).pathname;
    expect((await fetch(new URL(path, baseUrl))).status, `${path} did not load`).toBe(200);
  }
});

it("the preview stream needs no session and sees a placed note within a second", async () => {
  const preview = await openPreview();
  await preview.next();
  const bob = await Session.join(baseUrl, "PreviewBob");
  await bob.setNote(5, 5, "A4");
  const seen = await preview.waitFor((s) => s.grid[5][5] === "A4");
  expect(seen.grid[5][5]).toBe("A4");
  await bob.setNote(5, 5, null);
  preview.cancel();
});

it("the preview carries no nicknames or activity", async () => {
  await Session.join(baseUrl, "SecretNickname");
  const preview = await openPreview();
  const first = (await preview.next()) as GardenState;
  preview.cancel();
  expect(first).not.toHaveProperty("activity");
  expect(JSON.stringify(first)).not.toContain("SecretNickname");
});

it("someone watching the preview isn't counted as a person creating", async () => {
  const carol = await (await Session.join(baseUrl, "PresenceCarol")).events();
  const before = (await carol.next())!.online;
  const preview = await openPreview();
  await preview.next();
  // A new garden stream would broadcast to Carol; a preview watcher must not
  // change the count she sees when the next real change arrives.
  const dave = await Session.join(baseUrl, "PresenceDave");
  await dave.setNote(3, 3, "C4");
  const after = await carol.waitFor((s) => s.grid[3][3] === "C4");
  expect(after.online).toBe(before);
  await dave.setNote(3, 3, null);
  preview.cancel();
  carol.cancel();
});
