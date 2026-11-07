#!/usr/bin/env node
// Friends shape one place through actual sound contributions and NPC responses.
// Local scratch server only: normal UI placement and soft-removal, never SQL.
// APP_URL=http://localhost:18880 node e2e/living-sound-world.mjs [shotsDir]
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { openTools } from "./world-ui.mjs";
import { SOUNDS } from "../src/shared/sounds.ts";
import { soundResponseFor } from "../src/shared/sound-response.ts";
import { HUTS } from "../src/shared/huts.ts";

const base = process.env.APP_URL ?? "http://localhost:8080";
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "living-sound-world requires a local scratch server");
assert.notEqual(address.port, "18861", "18861 is the working preview; choose a scratch port");
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const people = [], made = [], errors = [];
let assertionFailed = false;
const check = (condition, label) => { assert.ok(condition, label); console.log("ok  " + label); };
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const drawer = page => page.locator("#world-tools-panel");
const at = page => page.locator("#stage").evaluate(stage => stage.dataset.at.split(",").map(Number));
const responseRows = page => page.locator('.shared-resident-response[data-resident="trail-neighbour"]');

async function snapshot(page) {
  return page.evaluate(async () => {
    const response = await fetch(location.href);
    if (!response.ok) throw new Error("Could not read real server snapshot");
    const document = new DOMParser().parseFromString(await response.text(), "text/html");
    return JSON.parse(document.getElementById("boot").textContent).snapshot;
  });
}

async function person(name, avatar) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("soac-guide", JSON.stringify({ tour: true, places: ["forest", "creek", "forest-edge", "boardwalk", "cafe", "beach", "pier", "shop"] }));
    localStorage.setItem("soac-sound", "off");
    window.__audioStarts = 0;
    window.__audioContexts = 0;
    const OriginalAudio = window.AudioContext;
    window.AudioContext = class extends OriginalAudio {
      constructor(...args) { super(...args); window.__audioContexts++; }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (...args) => { window.__audioStarts++; return start(...args); };
        return source;
      }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const who = { context, page, name, sessionId: null, posts: 0 };
  people.push(who);
  page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
  page.on("request", request => {
    if (request.method() === "POST" && /\/sounds$/.test(new URL(request.url()).pathname)) who.posts++;
  });
  await page.goto(base + "/scene/seaside?mode=weekday&zone=forest-edge");
  who.sessionId = await page.locator("#boot").evaluate(element => JSON.parse(element.textContent).snapshot.sessionId);
  await page.fill('.enter-card input[name="nickname"]', name);
  await page.check(`.enter-card input[value="${avatar}"]`, { force: true });
  await page.click(".enter-card [data-enter]");
  await page.waitForSelector(".enter-card", { state: "detached" });
  await page.waitForFunction(() => document.getElementById("stage").dataset.at && !document.getElementById("status").classList.contains("offline"));
  return who;
}

async function openShared(page) {
  if (!await drawer(page).evaluate(dialog => dialog.open)) await page.locator("#shared-sound-toggle").click();
  await drawer(page).waitFor({ state: "visible" });
}

async function closeShared(page) {
  if (await drawer(page).evaluate(dialog => dialog.open)) await page.locator("#world-tools-close").click();
  await page.waitForFunction(() => !document.getElementById("world-tools-panel").open && document.getElementById("world-tools-panel").hidden);
}

async function goTo(page, zone) {
  await openTools(page);
  await page.locator(`#zones [data-zone="${zone}"]`).click();
  await page.waitForURL(url => url.searchParams.get("zone") === zone);
  await page.waitForFunction(() => !document.getElementById("world-tools-panel").open && document.getElementById("world-tools-panel").hidden);
  await page.waitForTimeout(350);
}

async function waitResponse(page, sourceId, behavior) {
  await openShared(page);
  await page.waitForFunction(({ sourceId, behavior }) => {
    const row = document.querySelector('.shared-resident-response[data-resident="trail-neighbour"]');
    return row?.dataset.source === sourceId && row.dataset.behavior === behavior;
  }, { sourceId, behavior });
}

async function place(who, soundId, open = true) {
  if (open) await who.page.locator("#leave-sound").click();
  const response = who.page.waitForResponse(res => res.request().method() === "POST" && new URL(res.url()).pathname === `/api/sessions/${who.sessionId}/sounds`);
  await who.page.locator(`#sound-palette [data-sound="${soundId}"]`).click();
  const res = await response;
  const result = await res.json();
  assert.ok(res.ok() && result.ok && result.sound, `Real sound placement failed (${res.status()}): ${JSON.stringify(result)}`);
  made.push({ who, sound: result.sound });
  await who.page.locator("#sound-palette").waitFor({ state: "hidden" });
  return result.sound;
}

async function walk(page, key, predicate, argument) {
  await page.locator("canvas.world-canvas").focus();
  await page.keyboard.down(key);
  try { await page.waitForFunction(predicate, argument, { timeout: 5000 }); }
  finally { await page.keyboard.up(key); }
  await page.waitForTimeout(350);
}

try {
  const ada = await person("Living Ada", "cat");
  const a = ada.page;
  await a.locator("#leave-sound").click();
  // This deliberately fails on the old candidate before publishing anything.
  assert.equal(await a.locator('[data-intention="cozy"]').count(), 1, "The live library must expose intention-first sound ideas");
  check(SOUNDS.length === 18 && await a.locator("#sound-palette [data-sound]").count() === SOUNDS.length,
    "all eighteen real catalogue sounds are individually offered");
  const beforeBrowse = await at(a);
  for (const mood of ["cozy", "lively", "wild"]) {
    await a.locator(`[data-intention="${mood}"]`).click();
    assert.deepEqual((await a.locator("#sound-palette [data-sound]").evaluateAll(buttons => buttons.map(button => button.dataset.sound))).sort(),
      SOUNDS.filter(sound => soundResponseFor(sound.id)?.mood === mood).map(sound => sound.id).sort());
  }
  check(ada.posts === 0 && await a.evaluate(() => window.__audioStarts) === 0,
    "idea browsing neither publishes nor starts audio");
  for (const soundId of ["rainstick", "hand-claps"]) {
    await a.locator(`[data-intention="${soundResponseFor(soundId).mood}"]`).click();
    const starts = await a.evaluate(() => window.__audioStarts);
    await a.locator(`[data-listen="${soundId}"]`).click();
    await a.waitForFunction(({ id, starts }) => document.querySelector(`[data-listen="${id}"]`)?.textContent === "Stop" && window.__audioStarts > starts, { id: soundId, starts });
    check(ada.posts === 0 && await a.locator("#sound-switch").getAttribute("aria-pressed") === "false",
      `${soundId} privately plays a decoded recording without changing Sound off or placing it`);
    await a.locator(`[data-listen="${soundId}"]`).click();
  }
  await a.locator('[data-family="biophony"]').click();
  check(await a.locator('[data-intention="all"]').getAttribute("aria-pressed") === "true"
    && await a.locator("#sound-palette [data-sound]").count() === SOUNDS.filter(sound => sound.family === "biophony").length,
    "family browsing clears the intention instead of hiding a second active filter");
  await a.setViewportSize({ width: 375, height: 812 });
  await a.locator('[data-intention="cozy"]').click();
  check(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll(".library-intentions button")].every(button => { const r = button.getBoundingClientRect(); return r.height >= 44 && r.width <= innerWidth; })),
    "phone sound ideas wrap with readable labels and forty-four-pixel targets");
  await a.locator("#sound-palette .library-close").focus();
  await a.keyboard.press("Shift+Tab");
  check(await a.evaluate(() => document.activeElement?.closest("dialog")?.id === "sound-palette"), "phone sound ideas keep keyboard focus in the native library");
  await a.evaluate(() => { document.getElementById("sound-palette").scrollTop = 0; });
  await shot(a, "living-phone-sound-ideas");
  await a.keyboard.press("Escape");
  await a.waitForFunction(() => document.getElementById("sound-palette").hidden);
  const afterBrowse = await at(a);
  check(ada.posts === 0 && Math.hypot(afterBrowse[0] - beforeBrowse[0], afterBrowse[1] - beforeBrowse[1]) < .02,
    "browsing, previewing and closing ideas never walks or publishes a scene preset");
  await a.setViewportSize({ width: 1440, height: 900 });

  const bo = await person("Living Bo", "dog");
  const b = bo.page;
  const initial = await snapshot(a);
  assert.equal(initial.sounds.filter(sound => !sound.whileIn && !sound.removedAt && Math.hypot(sound.x - 1, sound.z + 36) <= 18).length, 0,
    "Use a clean scratch forest-edge for deterministic resident checks; never remove other fixtures' sounds");
  const calm = await place(ada, "rainstick");
  await Promise.all([waitResponse(a, calm.id, "listen"), waitResponse(b, calm.id, "listen")]);
  check((await responseRows(a).textContent()).includes("Living Ada") && (await responseRows(b).textContent()).includes(SOUNDS.find(sound => sound.id === "rainstick").label),
    "both people see the actual trail resident listening to the same attributed calm contribution");
  check(await a.locator("#sound-switch").getAttribute("aria-pressed") === "true",
    "explicitly leaving a sound preserves the existing invitation to hear your own contribution");
  const boSound = await b.evaluate(() => ({
    pressed: document.getElementById("sound-switch").getAttribute("aria-pressed"),
    voices: document.getElementById("stage").getAttribute("data-voices"),
    starts: window.__audioStarts, contexts: window.__audioContexts,
  }));
  console.log("Bo sound-off state: " + JSON.stringify(boSound));
  // voices is written on voice start/stop, not before an AudioContext exists.
  // Assert the stronger actual guarantee: Bo has neither a context nor any
  // started recording; a resident animation cannot quietly initialize audio.
  check(boSound.pressed === "false" && boSound.starts === 0 && boSound.contexts === 0
    && (boSound.voices === null || boSound.voices === "0"),
    "a shared resident response remains visual while the other person's Sound off stays silent");
  await shot(a, "living-calm-corner");

  const beforeReloadPosts = bo.posts;
  await b.reload();
  await b.locator(".enter-card [data-enter]").click();
  await b.waitForSelector(".enter-card", { state: "detached" });
  await b.waitForFunction(() => document.getElementById("stage").dataset.at && !document.getElementById("status").classList.contains("offline"));
  await waitResponse(b, calm.id, "listen");
  check(bo.posts === beforeReloadPosts && (await snapshot(b)).sounds.some(sound => sound.id === calm.id),
    "a freshly loaded page selects the existing calm source from the real snapshot without republishing it");

  await Promise.all([closeShared(a), closeShared(b)]);
  const removal = b.waitForResponse(res => res.request().method() === "DELETE" && new URL(res.url()).pathname.endsWith("/sounds/" + calm.id));
  await b.locator(`.sound-label[data-id="${calm.id}"] .sound-remove`).click();
  const removed = await (await removal).json();
  assert.ok(removed.ok, `Normal in-world removal failed: ${JSON.stringify(removed)}`);
  await Promise.all([openShared(a), openShared(b)]);
  await Promise.all([a, b].map(page => page.waitForFunction(id => !document.querySelector(`.shared-resident-response[data-source="${id}"]`)
    && !document.querySelector(`.shared-sound-card[data-id="${id}"]`), calm.id)));
  check(true, "normal nearby removal clears the calm source and its resident response in both browsers");
  await closeShared(b);
  await b.waitForTimeout(1100);
  const lively = await place(bo, "hand-claps");
  await Promise.all([waitResponse(a, lively.id, "sway"), waitResponse(b, lively.id, "sway")]);
  check((await responseRows(a).textContent()).includes("Living Bo") && (await responseRows(a).textContent()).includes("swaying"),
    "a friend's actual hand-claps contribution changes the same resident from listening to swaying");
  await a.locator(`.shared-sound-card[data-id="${lively.id}"] [data-action="reply"]`).click();
  await a.locator('[data-intention="cozy"]').click();
  const answer = await place(ada, "trickle", false);
  check(answer.replyTo?.id === lively.id && answer.replyTo?.by === bo.name,
    "a cozy stream can explicitly answer a friend's lively ingredient without replacing their sound");
  await Promise.all([openShared(a), openShared(b)]);
  await b.waitForFunction(() => document.querySelector('.shared-corner-ingredients [data-mood="cozy"]')
    && document.querySelector('.shared-corner-ingredients [data-mood="lively"]')
    && document.querySelector(".shared-corner-summary").textContent.includes("made by 2 people"));
  check((await snapshot(b)).sounds.some(sound => sound.id === lively.id) && (await snapshot(b)).sounds.some(sound => sound.id === answer.id),
    "the corner records a real shared mix by two contributors rather than applying a whole-scene preset");
  await shot(b, "living-shared-mix");

  // Actual authoritative hut admission, using the existing safe doorway route.
  await Promise.all([closeShared(a), closeShared(b)]);
  await goTo(b, "boardwalk");
  const hut = HUTS.find(candidate => candidate.id === "womens-toilet");
  const doorX = (hut.door.x0 + hut.door.x1) / 2;
  const originalSpawn = await a.evaluate(async ({ x, z }) => {
    const { SCENES } = await import("/shared/catalog.js");
    const spawn = SCENES[0].zones.find(zone => zone.id === "boardwalk").spawn;
    const before = { ...spawn }; Object.assign(spawn, { x, z, yaw: 0 }); return before;
  }, { x: doorX, z: hut.z1 + 1.4 });
  try {
    await goTo(a, "boardwalk");
    await walk(a, "w", z => Number(document.getElementById("stage").dataset.at.split(",")[1]) < z - 1.25, hut.z1);
    const stayResponse = a.waitForResponse(res => res.request().method() === "POST" && new URL(res.url()).pathname.endsWith("/sounds"));
    await a.getByRole("button", { name: "Leave toilet flushing", exact: true }).click();
    const stay = await (await stayResponse).json();
    assert.ok(stay.ok && stay.sound?.whileIn === hut.id, "The real server must admit and create the private stay");
    made.push({ who: ada, sound: stay.sound });
    await b.waitForFunction(id => document.querySelector(`.sound-label[data-id="${id}"]`), stay.sound.id);
    await openShared(b);
    check((await snapshot(b)).sounds.some(sound => sound.id === stay.sound.id && sound.whileIn === hut.id)
      && await b.locator(`.shared-resident-response[data-source="${stay.sound.id}"]`).count() === 0
      && await b.locator(`.shared-sound-card[data-id="${stay.sound.id}"]`).count() === 0,
      "a real received private-stay sound never becomes a public ingredient or resident response");
    await walk(a, "s", z => Number(document.getElementById("stage").dataset.at.split(",")[1]) > z + .8, hut.z1);
    await b.waitForFunction(id => !document.querySelector(`.sound-label[data-id="${id}"]`), stay.sound.id);
    check(!(await snapshot(b)).sounds.some(sound => sound.id === stay.sound.id), "the authoritative server ends the stay on exit");
  } finally {
    await a.evaluate(async spawn => {
      const { SCENES } = await import("/shared/catalog.js");
      Object.assign(SCENES[0].zones.find(zone => zone.id === "boardwalk").spawn, spawn);
    }, originalSpawn);
  }
  check(errors.length === 0, "no browser page errors: " + errors.join(" | "));
} catch (error) {
  assertionFailed = true;
  for (const { page, name } of people) {
    if (!page.isClosed()) await shot(page, "failure-" + name.replaceAll(" ", "-")).catch(() => undefined);
  }
  throw error;
} finally {
  const cleanupErrors = [];
  await Promise.all(people.map(({ page }) => page.close().catch(() => undefined)));
  for (const { who, sound } of made) {
    await new Promise(resolve => setTimeout(resolve, 1100));
    try {
      const hut = sound.whileIn ? HUTS.find(candidate => candidate.id === sound.whileIn) : null;
      assert.ok(!sound.whileIn || hut, "Unknown private hut in cleanup");
      const position = hut ? { x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 + 1.5, yaw: 0 }
        : { x: sound.x, z: sound.z, yaw: 0 };
      const move = await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: position });
      const moved = await move.json();
      assert.ok(move.ok() && moved.ok, `Cleanup move failed (${move.status()}): ${JSON.stringify(moved)}`);
      if (sound.whileIn) continue;
      const response = await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`);
      const result = await response.json();
      assert.ok((response.ok() && result.ok) || result.code === "gone", `Cleanup removal failed (${response.status()}): ${JSON.stringify(result)}`);
    } catch (error) { cleanupErrors.push(new Error(`Cleanup ${sound.id}: ${error.message}`, { cause: error })); }
  }
  if (made.length) {
    try {
      const response = await made[0].who.context.request.get(base + "/scene/seaside?mode=weekday&zone=boardwalk");
      assert.ok(response.ok(), `Cleanup snapshot failed (${response.status()})`);
      const match = (await response.text()).match(/<script\b[^>]*\bid="boot"[^>]*>([\s\S]*?)<\/script>/i);
      assert.ok(match, "Cleanup must read the actual boot snapshot");
      const current = JSON.parse(match[1]).snapshot;
      assert.ok(Array.isArray(current.sounds), "Cleanup snapshot must contain live sounds");
      const ids = new Set(made.filter(({ sound }) => !sound.whileIn).map(({ sound }) => sound.id));
      assert.deepEqual(current.sounds.filter(sound => ids.has(sound.id) && !sound.removedAt).map(sound => sound.id), [],
        "Cleanup must leave none of this suite's ordinary contributions live");
      check(true, "the final real snapshot confirms every test-created ordinary sound was soft-removed");
    } catch (error) { cleanupErrors.push(new Error(`Cleanup verification: ${error.message}`, { cause: error })); }
  }
  await browser.close();
  for (const error of cleanupErrors) console.error(error.message);
  if (cleanupErrors.length && !assertionFailed) throw new AggregateError(cleanupErrors, "Living sound world cleanup failed");
}
