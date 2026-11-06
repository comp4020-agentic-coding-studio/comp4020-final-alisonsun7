#!/usr/bin/env node
// Exercise shared weather/time, private drafts and travel in a scratch world.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.env.APP_URL ?? "http://localhost:18872";
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1"].includes(address.hostname) && address.port !== "18861", "Use a scratch localhost server, never the user's preview");
const output = process.argv[2] ? resolve(process.argv[2]) : null;
if (output) await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const errors = [];
const contexts = [];
const made = [];
const lastApply = new WeakMap();
const check = (value, message) => { assert.ok(value, message); console.log("ok  " + message); };
const shot = async (page, name) => { if (output) await page.screenshot({ path: resolve(output, name + ".png") }); };
const state = (page) => page.locator("#stage").evaluate((stage) => ({
  revision: Number(stage.dataset.environmentRevision), weather: stage.dataset.weather,
  minute: Number(stage.dataset.worldMinute), rain: stage.dataset.rain, drops: Number(stage.dataset.rainDrops),
  at: stage.dataset.at, marks: Number(stage.dataset.marks),
}));
const dialog = (page) => page.locator("#environment-dialog");
const shared = (page) => page.evaluate(async () => {
  const response = await fetch(location.href);
  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  return JSON.parse(doc.getElementById("boot").textContent).snapshot;
});

async function person(name, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  contexts.push(context);
  await context.addInitScript(() => {
    localStorage.setItem("soac-guide", JSON.stringify({ tour: true, places: ["forest", "creek", "forest-edge", "boardwalk", "cafe", "beach", "pier", "shop"] }));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(`${name ?? "visitor"}: ${error.message}`));
  await page.goto(base + "/scene/seaside?zone=boardwalk");
  // This deliberately fails against the previous build, before joining or writing.
  await page.locator("#environment-settings").waitFor({ state: "visible", timeout: 2500 });
  if (name) {
    await page.fill('.enter-card input[name="nickname"]', name);
    await page.click(".enter-card [data-enter]");
  } else await page.click(".enter-card [data-look]");
  await page.locator(".enter-card").waitFor({ state: "detached" });
  await page.waitForFunction(() => document.getElementById("stage").dataset.at && !document.getElementById("status").classList.contains("offline"));
  return page;
}

async function open(page, scenes = false) {
  if (await dialog(page).evaluate((element) => element.open)) {
    await page.locator(scenes ? "#scenes-tab" : "#environment-tab").click();
  } else await page.click(scenes ? "#scene-settings" : "#environment-settings");
  await dialog(page).waitFor({ state: "visible" });
}

async function choose(page, weather, time) {
  await page.locator(`input[name="environment-weather"][value="${weather}"]`).check();
  if (time) await page.locator(`button[data-time="${time}"]`).click();
}

async function apply(page) {
  const wait = 1100 - (Date.now() - (lastApply.get(page) ?? 0));
  if (wait > 0) await page.waitForTimeout(wait);
  const response = page.waitForResponse((res) => res.request().method() === "POST" && /\/environment$/.test(new URL(res.url()).pathname));
  await page.click("#environment-apply");
  const result = await (await response).json();
  assert.ok(result.ok, "environment update accepted: " + JSON.stringify(result));
  lastApply.set(page, Date.now());
  return result.environment;
}

async function waitState(page, revision, weather) {
  await page.waitForFunction(({ revision, weather }) => {
    const stage = document.getElementById("stage");
    return Number(stage.dataset.environmentRevision) === revision && stage.dataset.weather === weather;
  }, { revision, weather });
}

try {
  const a = await person("Sky Ada");
  const b = await person("Sky Bo");
  const start = await shared(a);
  check(start.sessionId === (await shared(b)).sessionId, "two real browser identities share the existing room");
  await a.click("#leave-sound");
  const soundResponse = a.waitForResponse((res) => res.request().method() === "POST" && /\/sounds$/.test(new URL(res.url()).pathname));
  await a.locator('#sound-palette [data-sound="cafe-chatter"]').click();
  const placed = await (await soundResponse).json();
  assert.ok(placed.ok && placed.sound, "create a real contribution before changing the atmosphere");
  made.push({ context: a.context(), sessionId: start.sessionId, sound: placed.sound });
  await a.locator("#sound-palette").waitFor({ state: "hidden" });

  let posts = 0;
  a.on("request", (request) => { if (request.method() === "POST" && /\/environment$/.test(new URL(request.url()).pathname)) posts++; });
  await open(a);
  const before = await state(a);
  await choose(a, "rain", "night");
  await a.keyboard.down("w");
  await a.waitForTimeout(250);
  await a.keyboard.up("w");
  check((await state(a)).at === before.at && posts === 0, "browsing weather and time pauses walking and never writes automatically");
  const rain = await apply(a);
  await waitState(b, rain.revision, "rain");
  check((await state(b)).minute === 1320 && /Rain.*22:00/.test(await b.locator("#world-conditions").textContent()), "explicit Apply shares the same night and weather through real SSE");
  await shot(a, "environment-desktop");

  await open(b);
  await choose(b, "clear", "day");
  await choose(a, "cloudy", "dawn");
  const dawn = await apply(a);
  await waitState(b, dawn.revision, "cloudy");
  check(await b.locator('input[name="environment-weather"][value="clear"]').isChecked() && await b.locator("#environment-time").inputValue() === "840", "a remote edit preserves another person's private draft");
  check(await b.locator("#environment-apply").isDisabled() && await b.locator(".environment-latest").isVisible(), "a stale draft must explicitly review the latest shared settings");
  await b.locator(".environment-latest").click();
  check(await b.locator('input[value="cloudy"]').isChecked() && await b.locator("#environment-time").inputValue() === "360", "Use latest loads the actual shared choices");

  await a.locator("#environment-running").check();
  const running = await apply(a);
  await waitState(b, running.revision, "cloudy");
  const minute = (await state(b)).minute;
  await b.waitForTimeout(2200);
  check((await state(b)).minute > minute + 1.5 && (await b.locator("#world-clock-mode").textContent()) === "24-minute day", "the shared clock advances at one world minute per real second");
  await a.locator("#environment-running").uncheck();
  const paused = await apply(a);
  await waitState(b, paused.revision, "cloudy");
  const held = (await state(b)).minute;
  await b.waitForTimeout(1300);
  check(Math.abs((await state(b)).minute - held) < .2 && /Time paused/.test(await b.locator("#world-clock-mode").textContent()), "pausing holds the same world time for both people");

  await open(b, true);
  check(await b.locator(".environment-scene").count() === 9, "Scenes offers nine illustrated destinations in the existing place");
  await b.locator('[data-destination="forest"]').click();
  await b.waitForFunction(() => Number(document.getElementById("stage").dataset.at.split(",")[1]) < -100);
  const afterTravel = await shared(b);
  check(afterTravel.sessionId === start.sessionId && afterTravel.sounds.some((sound) => sound.id === placed.sound.id), "scene travel keeps the same room and everyone's existing contributions");

  await open(b);
  await choose(b, "rain", "night");
  let attempts = 0;
  const pattern = "**/api/sessions/*/environment";
  await b.route(pattern, (route) => { attempts++; return route.abort("internetdisconnected"); });
  await b.click("#environment-apply");
  await b.waitForFunction(() => /connection.*interrupted/i.test(document.getElementById("environment-feedback").textContent));
  await b.waitForTimeout(1200);
  check(attempts === 1 && await b.locator('input[value="rain"]').isChecked() && await b.locator("#environment-time").inputValue() === "1320", "an interrupted request retains its draft without automatic retry");
  await b.unroute(pattern);
  const retried = await apply(b);
  await waitState(a, retried.revision, "rain");
  check((await state(b)).rain === "reduced-motion", "reduced motion keeps rain as atmosphere without moving drops");
  await b.bringToFront();
  await b.emulateMedia({ reducedMotion: "no-preference" });
  await b.waitForFunction(() => document.getElementById("stage").dataset.rain === "visible" && Number(document.getElementById("stage").dataset.rainDrops) > 0);
  await b.emulateMedia({ reducedMotion: "reduce" });
  await b.waitForFunction(() => document.getElementById("stage").dataset.rain === "reduced-motion" && Number(document.getElementById("stage").dataset.rainDrops) === 0);
  check(true, "changing reduced motion at runtime hides and restores the real rain geometry");

  // Hold a real committed HTTP response while a second person makes a newer edit.
  let release;
  let committed;
  const gate = new Promise((resolve) => { release = resolve; });
  const commit = new Promise((resolve) => { committed = resolve; });
  await a.route(pattern, async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    assert.ok(result.ok, "held environment update really commits");
    committed(result.environment);
    await gate;
    await route.fulfill({ response, body: JSON.stringify(result) });
  });
  try {
    await open(a);
    await choose(a, "mist", "dusk");
    await a.click("#environment-apply");
    const first = await commit;
    await waitState(b, first.revision, "mist");
    await choose(b, "clear", "night");
    const latest = await apply(b);
    await waitState(a, latest.revision, "clear");
    release();
    await a.waitForFunction(() => !document.getElementById("environment-apply").textContent.includes("Applying"));
    check((await state(a)).revision === latest.revision && /Clear.*22:00/.test(await a.locator("#world-conditions").textContent()), "a late successful acknowledgement cannot replace a newer shared atmosphere");
    check(await a.locator('input[value="clear"]').isChecked() && await a.locator("#environment-time").inputValue() === "1320", "the draft also shows the latest settings after a late acknowledgement");
  } finally {
    release();
    await a.unroute(pattern);
  }

  // Keep at most two live GPU worlds; cookies remain for final cleanup.
  await a.close();
  await b.close();
  const phone = await person(null, { width: 375, height: 812 });
  await phone.bringToFront();
  await open(phone);
  await choose(phone, "rain", "dawn");
  check(await phone.locator("#environment-apply").isDisabled(), "visitors can browse private choices but cannot change the shared sky");
  const fits = (page) => page.evaluate(() => {
    const panel = document.getElementById("environment-dialog");
    return document.documentElement.scrollWidth <= innerWidth && panel.scrollWidth <= panel.clientWidth;
  });
  check(await fits(phone), "weather and time fit a 375px phone without horizontal overflow");
  await shot(phone, "environment-phone");
  await phone.locator("#environment-tab").focus();
  await phone.keyboard.press("ArrowRight");
  check(await phone.locator("#scenes-tab").getAttribute("aria-selected") === "true" && await phone.locator("#scenes-tab").evaluate((tab) => tab === document.activeElement), "arrow keys select and focus the adjacent native-dialog tab");
  check(await fits(phone), "the illustrated scene grid also fits the phone");
  const targets = await phone.locator('.environment-scene button').evaluateAll((buttons) => buttons.every((button) => button.getBoundingClientRect().height >= 44));
  check(targets, "scene destination controls keep 44px touch targets");
  await shot(phone, "scenes-phone");
  await phone.locator('[data-destination="beach"]').click();
  await phone.waitForFunction(() => Number(document.getElementById("stage").dataset.at.split(",")[1]) > 10);
  const visitorSnapshot = await shared(phone);
  check(visitorSnapshot.sessionId === start.sessionId && visitorSnapshot.sounds.some((sound) => sound.id === placed.sound.id), "a visitor travels through the same room and finds the contribution after its author leaves");
  await open(phone, true);
  await phone.keyboard.press("Escape");
  await phone.waitForFunction(() => document.activeElement?.matches("canvas.world-canvas"));
  check(!await dialog(phone).evaluate((element) => element.open), "Escape closes the panel and returns walking focus to the world");
  await phone.setViewportSize({ width: 812, height: 375 });
  await open(phone);
  check(await fits(phone) && (await dialog(phone).boundingBox()).height <= 355, "the panel scrolls within a short landscape viewport");
  check(errors.length === 0, "no browser page errors: " + errors.join(" | "));
} finally {
  await Promise.all(contexts.flatMap((context) => context.pages()).map((page) => page.close().catch(() => undefined)));
  for (const { context, sessionId, sound } of made) {
    try {
      await context.request.post(`${base}/api/sessions/${sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
      await context.request.delete(`${base}/api/sessions/${sessionId}/sounds/${sound.id}`);
    } catch { /* Keep the original scratch-test failure. */ }
  }
  await browser.close();
}
