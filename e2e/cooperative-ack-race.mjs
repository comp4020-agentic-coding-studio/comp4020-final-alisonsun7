#!/usr/bin/env node
// A real placement commits and arrives through SSE, is removed by another
// person, and only then receives its original HTTP acknowledgement.
// Use a LOCAL scratch database. The optional mutation changes only the served
// scene.js in one browser; no repository or compiled file is edited.
// APP_URL=http://localhost:18868 node e2e/cooperative-ack-race.mjs [shotsDir]
// APP_URL=http://localhost:18868 node e2e/cooperative-ack-race.mjs --without-tombstone-guard
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.APP_URL ?? "http://localhost:8080";
const endpoint = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname), "ack-race requires a local scratch server");
assert.notEqual(endpoint.port, "18861", "18861 is an existing working server; use a scratch port");
const mutate = process.argv.includes("--without-tombstone-guard");
const out = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
const contexts = [];
const made = [];
const check = (condition, message) => { assert.ok(condition, message); console.log("ok  " + message); };
const soundLabel = (page, id) => page.locator(`.sound-label[data-id="${id}"]`);
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png` }); };

async function pageFor(name, joined) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 840 }, reducedMotion: "reduce" });
  contexts.push(context);
  await context.addInitScript(() => {
    localStorage.setItem("soac-guide", JSON.stringify({ tour: true, places: ["forest", "creek", "forest-edge", "boardwalk", "cafe", "beach", "pier", "shop"] }));
    // Expose the real transport solely to cut and reopen it. The replacement
    // stream receives real server snapshots and calls the app's original
    // handlers; no snapshot, movement or sound event is fabricated.
    const Native = window.EventSource;
    window.__streams = [];
    window.EventSource = class extends Native {
      constructor(...args) { super(...args); window.__streams.push(this); }
    };
    window.__cutStream = () => {
      const stream = window.__streams.findLast((item) => item.readyState === Native.OPEN);
      if (!stream) throw new Error("No live stream to cut");
      window.__streamHandlers = { url: stream.url, onopen: stream.onopen, onmessage: stream.onmessage, onerror: stream.onerror };
      stream.close();
    };
    window.__reconnectStream = () => {
      const handlers = window.__streamHandlers;
      const stream = new window.EventSource(handlers.url);
      stream.onopen = handlers.onopen;
      stream.onmessage = handlers.onmessage;
      stream.onerror = handlers.onerror;
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  if (mutate && joined) {
    await page.route("**/client/scene.js", async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      const guard = /if\s*\(removedSounds\.has\(sound\.id\)\)\s*return;/g;
      assert.equal([...source.matchAll(guard)].length, 1, "the mutation must remove exactly the received-tombstone guard");
      await route.fulfill({ response, body: source.replace(guard, "/* test mutation: ignore received tombstones */") });
    });
  }
  await page.goto(base + "/scene/seaside?zone=boardwalk");
  if (joined) {
    await page.fill('.enter-card input[name="nickname"]', name);
    await page.click(".enter-card [data-enter]");
  } else await page.click(".enter-card [data-look]");
  await page.waitForSelector(".enter-card", { state: "detached" });
  await page.waitForFunction(() => document.getElementById("stage").dataset.at && !document.getElementById("status").classList.contains("offline"));
  return page;
}

async function ordinary(page, soundId) {
  await page.click("#leave-sound");
  const response = page.waitForResponse((res) => res.request().method() === "POST" && /\/sounds$/.test(new URL(res.url()).pathname));
  await page.locator(`#sound-palette [data-sound="${soundId}"]`).click();
  const result = await (await response).json();
  assert.ok(result.ok && result.sound);
  made.push({ context: page.context(), sessionId: await page.locator("#boot").evaluate((boot) => JSON.parse(boot.textContent).snapshot.sessionId), sound: result.sound });
  await page.waitForSelector("#sound-palette", { state: "hidden" });
  return result.sound;
}

async function remove(page, id) {
  const response = page.waitForResponse((res) => res.request().method() === "DELETE" && new URL(res.url()).pathname.endsWith("/sounds/" + id));
  await soundLabel(page, id).locator(".sound-remove").click();
  assert.ok((await response).ok(), "the other person can remove the contribution from beside it");
}

async function race(a, b, soundId, snapshotGap) {
  let release;
  let committed;
  const gate = new Promise((resolve) => { release = resolve; });
  const commit = new Promise((resolve) => { committed = resolve; });
  const path = "**/api/sessions/*/sounds";
  await a.route(path, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const result = await response.json();
    assert.ok(response.ok() && result.ok && result.sound, "the held acknowledgement must describe a real committed sound");
    committed(result.sound);
    await gate;
    await route.fulfill({ response, body: JSON.stringify(result) });
  });
  try {
    await a.click("#leave-sound");
    await a.locator(`#sound-palette [data-sound="${soundId}"]`).click();
    const sound = await commit;
    made.push({ context: a.context(), sessionId: await a.locator("#boot").evaluate((boot) => JSON.parse(boot.textContent).snapshot.sessionId), sound });
    await a.waitForFunction((id) => !!document.querySelector(`.sound-label[data-id="${id}"]`), sound.id);
    await soundLabel(b, sound.id).waitFor({ state: "visible" });
    check(true, `${snapshotGap ? "snapshot gap" : "live SSE"}: the pending HTTP action has already arrived through real SSE`);
    if (snapshotGap) await a.evaluate(() => window.__cutStream());
    await remove(b, sound.id);
    await b.waitForFunction((id) => !document.querySelector(`.sound-label[data-id="${id}"]`), sound.id);
    if (snapshotGap) {
      check(await soundLabel(a, sound.id).count() === 1, "the cut stream genuinely misses the removal event");
      await a.evaluate(() => window.__reconnectStream());
    }
    await a.waitForFunction((id) => !document.querySelector(`.sound-label[data-id="${id}"]`), sound.id);
    check(true, `${snapshotGap ? "fresh snapshot" : "live removal"}: the origin page sees that the committed contribution has gone`);
    release();
    await a.waitForSelector("#sound-palette", { state: "hidden" });
    await a.waitForTimeout(500);
    check(await soundLabel(a, sound.id).count() === 0, `${snapshotGap ? "snapshot gap" : "live SSE"}: a late successful HTTP acknowledgement cannot resurrect the sound`);
    check(await soundLabel(b, sound.id).count() === 0, "the other browser remains consistent without a reload");
    await shot(a, snapshotGap ? "ack-after-snapshot" : "ack-after-removal");
  } finally {
    release();
    await a.unroute(path);
  }
}

try {
  const a = await pageFor("Ack Ada", true);
  const b = await pageFor("Ack visitor", false);
  const seed = await ordinary(a, "cafe-chatter");
  await soundLabel(b, seed.id).locator(".sound-conversation").click();
  await b.locator("#sound-conversation").waitFor({ state: "visible" });
  await b.locator("#sound-conversation").filter({ hasText: "Ack Ada" }).waitFor();
  check((await b.locator("#sound-conversation").textContent()).includes("Ack Ada"), "a visitor can read the contribution's conversation");
  check(await b.getByRole("button", { name: /Reply with a sound|Walk closer to reply|^Remove$/ }).count() === 0, "a visitor has no Reply or Remove action");
  await b.keyboard.press("Escape");
  await b.reload();
  await b.fill('.enter-card input[name="nickname"]', "Ack Bo");
  await b.click(".enter-card [data-enter]");
  await b.waitForSelector(".enter-card", { state: "detached" });
  await remove(b, seed.id);
  await a.waitForFunction((id) => !document.querySelector(`.sound-label[data-id="${id}"]`), seed.id);
  await b.waitForTimeout(1100);
  await race(a, b, "espresso", false);
  await b.waitForTimeout(1100);
  await race(a, b, "evening-forest", true);
  check(errors.length === 0, "no browser page errors: " + errors.join(" | "));
} finally {
  await Promise.all(contexts.flatMap((context) => context.pages()).map((page) => page.close().catch(() => undefined)));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  for (const { context, sessionId, sound } of made) {
    try {
      await context.request.post(`${base}/api/sessions/${sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
      await context.request.delete(`${base}/api/sessions/${sessionId}/sounds/${sound.id}`);
      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch { /* Preserve the original assertion if the scratch server stops. */ }
  }
  await browser.close();
}
