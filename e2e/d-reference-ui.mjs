#!/usr/bin/env node
// The real, compact D interface: actual page, native dialogs and one sound.
// Run only against the isolated candidate, never the user's preview.
// APP_URL=http://localhost:18876 node e2e/d-reference-ui.mjs [screenshotsDir]
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { openTools, openListening } from "./world-ui.mjs";

const base = process.env.APP_URL ?? "http://localhost:8080";
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1"].includes(address.hostname) && address.port !== "18861", "Use a scratch localhost server, never the user preview");
const output = resolve(process.argv[2] ?? ".cache/d-reference-ui");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const errors = [];
const metrics = { viewports: {}, checks: [] };
let made = null;
let sessionId = null;
let soundPosts = 0;
let environmentPosts = 0;
const check = (value, message) => { assert.ok(value, message); metrics.checks.push(message); console.log("ok  " + message); };
await context.addInitScript(() => {
  localStorage.setItem("soac-guide", JSON.stringify({ tour: true, places: ["forest", "creek", "forest-edge", "boardwalk", "cafe", "beach", "pier", "shop"] }));
  localStorage.setItem("soac-sound", "off");
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  const path = new URL(request.url()).pathname;
  if (request.method() === "POST" && /\/sounds$/.test(path)) soundPosts++;
  if (request.method() === "POST" && /\/environment$/.test(path)) environmentPosts++;
});
const drawer = () => page.locator("#world-tools-panel");
const at = () => page.locator("#stage").evaluate((stage) => stage.dataset.at);
const shot = (name) => page.screenshot({ path: resolve(output, name + ".png"), fullPage: true });
const snapshot = () => page.evaluate(async () => {
  const response = await fetch(location.href);
  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  return JSON.parse(doc.getElementById("boot").textContent).snapshot;
});
const canvasFocused = () => page.waitForFunction(() => document.activeElement?.matches("canvas.world-canvas"));

async function checkHud(name) {
  const m = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    const frame = getComputedStyle(document.getElementById("stage-frame"));
    return {
      width: innerWidth, height: innerHeight,
      bar: rect(".bar"), stage: rect("#stage"), canvas: rect("canvas.world-canvas"), pill: rect("#leave-sound"),
      border: [frame.borderTopWidth, frame.borderRightWidth, frame.borderBottomWidth, frame.borderLeftWidth],
      radius: frame.borderTopLeftRadius,
      pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight,
      controls: ["look-settings", "sound-switch", "world-tools-toggle"].map((id) => {
        const button = document.getElementById(id), r = button.getBoundingClientRect();
        return { id, width: r.width, height: r.height, label: button.getAttribute("aria-label") };
      }),
    };
  });
  metrics.viewports[name] = m;
  const near = (a, b) => Math.abs(a - b) <= 1;
  check(near(m.bar.y, 0) && near(m.bar.height, 52), name + ": the title strip is 52px high");
  check(near(m.stage.x, 0) && near(m.stage.y, m.bar.bottom) && near(m.stage.width, m.width) && near(m.stage.bottom, m.height), name + ": the world fills all space below the title strip");
  check(near(m.canvas.x, m.stage.x) && near(m.canvas.y, m.stage.y) && near(m.canvas.width, m.stage.width) && near(m.canvas.height, m.stage.height), name + ": the real canvas fills its stage");
  check(m.border.every((width) => parseFloat(width) === 0) && parseFloat(m.radius) === 0, name + ": the world has no inset border or rounded frame");
  check(m.pageWidth <= m.width && m.pageHeight <= m.height + 1, name + ": the page has no hidden extra margin or scroll overflow");
  check(m.pill.height >= 48 && m.pill.height <= 60 && near(m.pill.x + m.pill.width / 2, m.width / 2)
    && m.pill.top >= m.stage.top && m.pill.bottom <= m.stage.bottom - 12, name + ": the 48–60px sound pill is centred inside the canvas");
  check(m.controls.every((button) => button.width >= 44 && button.height >= 44 && button.label), name + ": visible Sound, Controls and Tools have named 44px targets");
}

async function noWalking(message) {
  const before = await at();
  await page.keyboard.down("w");
  await page.waitForTimeout(400);
  await page.keyboard.up("w");
  check(await at() === before, message);
}

async function goTo(zone) {
  await openTools(page);
  await page.locator(`#zones [data-zone="${zone}"]`).click();
  await page.waitForFunction(() => !document.getElementById("world-tools-panel").open);
  await canvasFocused();
  await page.waitForURL((url) => url.searchParams.get("zone") === zone);
  await page.waitForTimeout(220);
}

async function checkDrawerViewport(name) {
  await openTools(page);
  const m = await drawer().evaluate((dialog) => {
    const b = dialog.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height, scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth, scrollHeight: dialog.scrollHeight, clientHeight: dialog.clientHeight, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  metrics.viewports[name + "-drawer"] = m;
  check(m.x >= 0 && m.y >= 52 && m.x + m.width <= m.viewportWidth && m.y + m.height <= m.viewportHeight && m.width <= 360,
    name + ": the narrow native drawer stays within the viewport");
  check(m.scrollWidth <= m.clientWidth && m.scrollHeight > m.clientHeight, name + ": the drawer scrolls vertically without horizontal overflow");
  await page.locator("#world-tools-panel .not-affiliated a").scrollIntoViewIfNeeded();
  check(await drawer().evaluate((dialog) => dialog.scrollTop > 0), name + ": Sources remains reachable by scrolling the drawer");
  const close = await page.locator("#world-tools-close").boundingBox();
  check(close && close.y >= 52 && close.y + close.height <= m.viewportHeight, name + ": the sticky Close control remains visible");
  await shot(name + "-tools-scrolled");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.id === "world-tools-toggle");
}

try {
  await page.goto(base + "/scene/seaside?mode=weekday&zone=boardwalk");
  sessionId = await page.locator("#boot").evaluate((boot) => JSON.parse(boot.textContent).snapshot.sessionId);
  await page.fill('.enter-card input[name="nickname"]', "D UI " + Date.now().toString(36));
  await page.click(".enter-card [data-enter]");
  await page.waitForSelector(".enter-card", { state: "detached" });
  await page.waitForFunction(() => document.getElementById("stage").dataset.at && !document.getElementById("status").classList.contains("offline"));
  await checkHud("desktop");
  check(!await drawer().evaluate((dialog) => dialog.open) && !await page.locator("#listening-trail").evaluate((details) => details.open), "Tools and the nearby guide are collapsed on arrival");

  await openTools(page);
  check(await drawer().evaluate((dialog) => dialog.matches(":modal")), "Tools uses a real native modal focus scope");
  check(await page.locator("#world-tools-toggle").getAttribute("aria-expanded") === "true", "the Tools entry exposes its expanded state");
  metrics.focusTrace = [];
  for (const key of [...Array(18).fill("Tab"), ...Array(8).fill("Shift+Tab")]) {
    await page.keyboard.press(key);
    const focus = await drawer().evaluate((dialog) => {
      const active = document.activeElement;
      return { tag: active?.tagName, id: active?.id, text: active?.textContent?.trim().slice(0, 60), inside: dialog.contains(active) };
    });
    metrics.focusTrace.push({ key, ...focus });
    assert.ok(focus.inside, "keyboard focus escaped the native drawer");
  }
  check(true, "Tab and Shift+Tab keep keyboard focus inside Tools");
  await noWalking("W in Tools never moves the visitor");
  await shot("desktop-tools");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.id === "world-tools-toggle");
  check(!await drawer().evaluate((dialog) => dialog.open) && await page.locator("#world-tools-toggle").getAttribute("aria-expanded") === "false", "Escape closes Tools and returns focus to its visible entry");

  await openTools(page);
  await page.click("#environment-settings");
  await page.locator("#environment-dialog").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.getElementById("world-tools-panel").open);
  check(await page.locator("#environment-dialog").evaluate((dialog) => dialog.matches(":modal") && dialog.contains(document.activeElement)), "Weather opens its own native dialog after the drawer closes");
  const writes = environmentPosts;
  await noWalking("W remains paused when Tools hands focus to Weather & time");
  check(environmentPosts === writes, "opening Weather and typing W does not apply a shared change");
  // Explicitly choose the reference's afternoon for the actual-page evidence.
  await page.locator('input[name="environment-weather"][value="clear"]').check();
  await page.locator('button[data-time="day"]').click();
  await page.locator("#environment-running").uncheck();
  if (await page.locator("#environment-apply").isEnabled()) {
    const applied = page.waitForResponse((response) => response.request().method() === "POST" && /\/environment$/.test(new URL(response.url()).pathname));
    await page.locator("#environment-apply").click();
    check((await applied).ok(), "the reference afternoon is applied only by its explicit button");
  }
  await page.keyboard.press("Escape");
  await canvasFocused();
  await shot("desktop-world");
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.waitForTimeout(220);
  await shot("reference-world-1672");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(220);

  const beforeTravel = await at();
  await goTo("forest-edge");
  check(await at() !== beforeTravel && new URL(page.url()).searchParams.get("zone") === "forest-edge", "Go to closes Tools, changes the destination URL and restores canvas focus");
  const initial = await snapshot();
  const current = (await at()).split(",").map(Number);
  const kind = ["bicycle-bell", "coastal-gulls", "trickle", "gentle-breeze"].find((id) => !initial.sounds.some((sound) => sound.soundId === id && Math.hypot(sound.x - current[0], sound.z - current[1]) < 4));
  assert.ok(kind && initial.sounds.filter((sound) => Math.hypot(sound.x - current[0], sound.z - current[1]) <= 10).length < 6, "Use an uncrowded scratch world for the one real UI contribution");
  await page.click("#leave-sound");
  const placed = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/sessions/${sessionId}/sounds`);
  await page.locator(`#sound-palette [data-sound="${kind}"]`).click();
  const response = await placed;
  const result = await response.json();
  assert.ok(response.ok() && result.ok && result.sound, "the explicit library click must create the test contribution");
  made = result.sound;
  await page.locator("#sound-palette").waitFor({ state: "hidden" });
  await canvasFocused();
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  await page.waitForTimeout(220);
  check(Math.hypot(...(await at()).split(",").map((value, i) => Number(value) - current[i])) > .2, "walking resumes after Go to and the library close");
  await openListening(page);
  const row = page.locator(`.trail-sounds li[data-id="${made.id}"]`);
  await row.waitFor({ state: "visible" });
  const beforeFace = await at();
  const postsBeforeFace = soundPosts;
  const idsBeforeFace = (await snapshot()).sounds.map((sound) => sound.id).sort();
  await row.getByRole("button", { name: /^Face / }).click();
  await page.waitForFunction(() => !document.getElementById("world-tools-panel").open);
  await canvasFocused();
  await page.waitForFunction((id) => document.querySelector(`.trail-sounds li[data-id="${id}"] .trail-detail`)?.textContent.includes("Ahead"), made.id);
  check(await at() === beforeFace, "Face sound closes Tools and turns without changing the visitor's position");
  assert.deepEqual((await snapshot()).sounds.map((sound) => sound.id).sort(), idsBeforeFace);
  check(soundPosts === postsBeforeFace, "Face sound sends no placement request and adds no contribution row");
  await shot("desktop-faced-sound");

  await goTo("boardwalk");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(220);
  await checkHud("phone");
  await shot("phone-world");
  await checkDrawerViewport("phone");

  // Reproduce the real bottom-CTA regression through walking and looking.
  await goTo("forest");
  await page.keyboard.down("d");
  await page.waitForTimeout(5000);
  await page.keyboard.up("d");
  const roo = page.locator(".roo-bubble:not([hidden])");
  await roo.locator(".roo-back:not([hidden])").waitFor({ state: "visible", timeout: 12000 });
  const noRooOverlap = async (name) => {
    const [bubble, button, pill, stage] = await Promise.all([
      roo.boundingBox(), roo.locator(".roo-back").boundingBox(), page.locator("#leave-sound").boundingBox(), page.locator("#stage").boundingBox(),
    ]);
    const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    check(bubble && button && pill && stage && !overlap(button, pill) && !overlap(bubble, pill)
      && bubble.y >= stage.y && bubble.y + bubble.height <= stage.y + stage.height,
      name + ": the kangaroo's real return target and words stay clear of the bottom sound pill");
    await shot(name);
  };
  await noRooOverlap("phone-roo-visible");
  const view = await page.locator("canvas.world-canvas").boundingBox();
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2 - 200, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(220);
  await noRooOverlap("phone-roo-looked-away");
  await roo.locator(".roo-back").click();
  await page.waitForFunction(() => {
    const [x, z] = document.getElementById("stage").dataset.at.split(",").map(Number);
    return Math.abs(x + 1) < 3 && z < -110;
  });
  check(true, "the unobstructed kangaroo return button really takes the visitor back to the trail");
  await goTo("boardwalk");
  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForTimeout(220);
  await checkHud("landscape");
  await shot("landscape-world");
  await checkDrawerViewport("landscape");
  check(errors.length === 0, "the real page reports no browser errors: " + errors.join(" | "));
} catch (error) {
  await shot("failure").catch(() => undefined);
  throw error;
} finally {
  await page.keyboard.up("w").catch(() => undefined);
  if (made && sessionId) {
    await page.waitForTimeout(250);
    await context.request.post(`${base}/api/sessions/${sessionId}/move`, { data: { x: made.x, z: made.z, yaw: 0 } }).catch(() => undefined);
    const removed = await context.request.delete(`${base}/api/sessions/${sessionId}/sounds/${made.id}`).catch(() => null);
    if (!removed?.ok()) console.error("Cleanup could not remove this test's scratch contribution:", made.id);
  }
  await writeFile(resolve(output, "metrics.json"), JSON.stringify({ ...metrics, errors, soundPosts, environmentPosts }, null, 2));
  await browser.close();
}
