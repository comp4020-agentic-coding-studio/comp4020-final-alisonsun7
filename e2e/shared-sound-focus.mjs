#!/usr/bin/env node
// The shared soundscape is the first invitation, through two real identities.
// Run ONLY on a local scratch server: this suite creates and soft-removes sounds.
// APP_URL=http://localhost:18879 node e2e/shared-sound-focus.mjs [screenshotsDir]
// Existing cooperative-ack-race.mjs remains the authority for delayed ACKs.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { openTools } from "./world-ui.mjs";
import { HUTS } from "../src/shared/huts.ts";

const base = process.env.APP_URL ?? "http://localhost:8080";
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "shared-sound-focus requires a local scratch server");
assert.notEqual(address.port, "18861", "18861 is the user's working preview; choose a scratch port");
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const people = [];
const made = [];
const errors = [];
const check = (value, message) => { assert.ok(value, message); console.log("ok  " + message); };
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const card = (page, id) => page.locator(`.shared-sound-card[data-id="${id}"]`);
const drawer = (page) => page.locator("#world-tools-panel");
const at = (page) => page.locator("#stage").evaluate((stage) => stage.dataset.at.split(",").map(Number));
const marks = (page) => page.locator("#stage").evaluate((stage) => Number(stage.dataset.marks));
const connections = (page) => page.locator("#stage").evaluate((stage) => Number(stage.dataset.soundConnections ?? 0));
const changes = (page) => page.locator(".shared-changes li").evaluateAll((rows) => rows.map((row) => ({ id: row.dataset.id, action: row.dataset.action, text: row.textContent })));
const publicSounds = (snapshot) => snapshot.sounds.filter((sound) => !sound.whileIn && !sound.removedAt);
const overlaps = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function freshSnapshot(page) {
  return page.evaluate(async () => {
    const response = await fetch(location.href);
    if (!response.ok) throw new Error("Could not read the actual server snapshot");
    const document = new DOMParser().parseFromString(await response.text(), "text/html");
    return JSON.parse(document.getElementById("boot").textContent).snapshot;
  });
}

async function waitSummary(page, sounds, humans = 2) {
  await page.waitForFunction(({ sounds, humans }) => {
    const summary = document.querySelector(".shared-sound-summary");
    return summary && Number(summary.dataset.people) === humans && Number(summary.dataset.sounds) === sounds
      && new RegExp(`\\b${humans} here\\b`).test(summary.textContent)
      && new RegExp(`\\b${sounds} sounds?\\b`).test(summary.textContent);
  }, { sounds, humans });
}

async function person(name, avatar) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.setItem("soac-guide", JSON.stringify({ tour: true, places: ["forest", "creek", "forest-edge", "boardwalk", "cafe", "beach", "pier", "shop"] }));
    localStorage.setItem("soac-sound", "off");
  });
  const page = await context.newPage();
  const who = { context, page, name, sessionId: null, soundPosts: 0 };
  people.push(who);
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/sounds$/.test(new URL(request.url()).pathname)) who.soundPosts++;
  });
  await page.goto(base + "/scene/seaside?mode=weekday&zone=boardwalk");
  // This assertion deliberately fails on the old interface, before any sound
  // is published; a green server/spec alone must not hide a missing entry.
  assert.equal(await page.locator("#shared-sound-toggle").count(), 1, "The actual page must expose the Our soundscape entry");
  who.sessionId = await page.locator("#boot").evaluate((boot) => JSON.parse(boot.textContent).snapshot.sessionId);
  await page.fill('.enter-card input[name="nickname"]', name);
  await page.check(`.enter-card input[value="${avatar}"]`, { force: true });
  await page.click(".enter-card [data-enter]");
  await page.waitForSelector(".enter-card", { state: "detached" });
  await page.waitForFunction(() => document.getElementById("stage").dataset.at && !document.getElementById("status").classList.contains("offline"));
  return who;
}

async function openShared(page, keyboard = false) {
  if (!await drawer(page).evaluate((dialog) => dialog.open)) {
    if (keyboard) { await page.locator("#shared-sound-toggle").focus(); await page.keyboard.press("Enter"); }
    else await page.locator("#shared-sound-toggle").click();
  }
  await drawer(page).waitFor({ state: "visible" });
  await page.locator("#shared-sound-place").waitFor({ state: "visible" });
}

async function closeShared(page) {
  if (await drawer(page).evaluate((dialog) => dialog.open)) await page.locator("#world-tools-close").click();
  await page.waitForFunction(() => !document.getElementById("world-tools-panel").open);
}

async function goTo(page, zone) {
  await openTools(page);
  await page.locator(`#zones [data-zone="${zone}"]`).click();
  await page.waitForFunction(() => !document.getElementById("world-tools-panel").open);
  await page.waitForURL((url) => url.searchParams.get("zone") === zone);
  await page.waitForTimeout(300);
}

async function place(who, soundId, open = true) {
  if (open) await who.page.locator("#leave-sound").click();
  const response = who.page.waitForResponse((res) => res.request().method() === "POST"
    && new URL(res.url()).pathname === `/api/sessions/${who.sessionId}/sounds`);
  await who.page.locator(`#sound-palette [data-sound="${soundId}"]`).click();
  const res = await response;
  const result = await res.json();
  assert.ok(res.ok() && result.ok && result.sound, `Real placement failed (${res.status()}): ${JSON.stringify(result)}`);
  made.push({ who, sound: result.sound });
  await who.page.locator("#sound-palette").waitFor({ state: "hidden" });
  return result.sound;
}

async function walk(page, key, predicate, argument) {
  await page.locator("canvas.world-canvas").focus();
  await page.keyboard.down(key);
  try { await page.waitForFunction(predicate, argument, { timeout: 5000 }); }
  finally { await page.keyboard.up(key); }
  await page.waitForTimeout(300);
}

async function expectNoMovementOrPublish(who, run, message) {
  const before = await at(who.page);
  const posts = who.soundPosts;
  await run();
  await who.page.waitForTimeout(350);
  const after = await at(who.page);
  check(Math.hypot(after[0] - before[0], after[1] - before[1]) < 0.02 && who.soundPosts === posts, message);
}

try {
  const ada = await person("Soundscape Ada", "cat");
  const bo = await person("Soundscape Bo", "dog");
  const a = ada.page, b = bo.page;
  const initial = publicSounds(await freshSnapshot(a)).length;
  await Promise.all([waitSummary(a, initial), waitSummary(b, initial)]);
  check(true, "the first entry counts two actual human identities and live public contributions, excluding scene characters");
  check((await a.locator("#shared-sound-toggle").textContent()).includes("Our soundscape"), "the product invitation names the shared soundscape");
  check(await a.locator("#sound-switch").getAttribute("aria-pressed") === "false"
    && await b.locator("#sound-switch").getAttribute("aria-pressed") === "false", "arrival respects Sound off in both browsers");
  await openShared(b, true);
  check(await drawer(b).evaluate((dialog) => dialog.matches(":modal") && dialog.contains(document.activeElement)), "Enter opens the existing native drawer with keyboard focus inside");
  check((await changes(b)).length === 0, "the first server snapshot is not presented as new activity");
  check((await b.locator(".shared-changes-heading").textContent()) === "While you’re here", "activity is explicitly scoped to the current visit");
  for (const key of [...Array(16).fill("Tab"), ...Array(8).fill("Shift+Tab")]) {
    await b.keyboard.press(key);
    assert.ok(await drawer(b).evaluate((dialog) => dialog.contains(document.activeElement)), "Tab escaped the shared sound drawer");
  }
  await expectNoMovementOrPublish(bo, async () => {
    await b.keyboard.down("w"); await b.waitForTimeout(350); await b.keyboard.up("w");
  }, "browsing with the movement key neither walks nor publishes");
  await b.keyboard.press("Escape");
  await b.waitForFunction(() => !document.getElementById("world-tools-panel").open && document.activeElement?.id === "shared-sound-toggle");
  check(true, "Escape returns keyboard focus to the soundscape entry that opened the drawer");

  const source = await place(ada, "cafe-chatter");
  await Promise.all([waitSummary(a, initial + 1), waitSummary(b, initial + 1)]);
  await b.waitForFunction((id) => document.querySelector(`.shared-changes li[data-id="${id}"][data-action="left"]`), source.id);
  await b.waitForTimeout(350);
  check((await changes(b)).filter((change) => change.id === source.id && change.action === "left").length === 1,
    "the other person's real SSE placement appears once rather than duplicate acknowledgement activity");
  check(await b.locator("#sound-switch").getAttribute("aria-pressed") === "false", "someone else's contribution does not switch on the listener's audio");
  await openShared(b);
  const sourceCard = card(b, source.id);
  check((await sourceCard.textContent()).includes("Café chatter") && (await sourceCard.textContent()).includes(ada.name)
    && (await sourceCard.textContent()).includes("Boardwalk"), "a shared card identifies the recording, its human author and its actual zone");
  check(await sourceCard.getByRole("button", { name: "Reply with a sound", exact: true }).isEnabled(), "a person beside a contribution can answer it");
  const postsBeforeListen = bo.soundPosts;
  await b.getByRole("button", { name: "Turn sound on", exact: true }).click();
  check(await b.locator("#sound-switch").getAttribute("aria-pressed") === "true" && bo.soundPosts === postsBeforeListen,
    "listening is an explicit action and does not place a contribution");
  await closeShared(b);
  const beforeWalk = await at(b);
  await walk(b, "a", (before) => {
    const now = document.getElementById("stage").dataset.at.split(",").map(Number);
    return Math.hypot(now[0] - before[0], now[1] - before[1]) > 0.6;
  }, beforeWalk);
  const beforeConnection = await connections(b);
  await openShared(b);
  await card(b, source.id).getByRole("button", { name: "Reply with a sound", exact: true }).click();
  await b.locator("#sound-library-reply").filter({ hasText: ada.name }).waitFor();
  check(bo.soundPosts === postsBeforeListen, "opening a reply only names its source and opens the library");
  const reply = await place(bo, "espresso", false);
  check(reply.replyTo?.id === source.id && reply.replyTo.by === ada.name, "a real second identity commits an attributed reply to the first contribution");
  await Promise.all([waitSummary(a, initial + 2), waitSummary(b, initial + 2)]);
  await b.waitForFunction((count) => Number(document.getElementById("stage").dataset.soundConnections) === count + 1, beforeConnection);
  check(await connections(b) === beforeConnection + 1, "the live nearby parent and answer produce one real 3D connection");
  await openShared(a);
  check((await card(a, reply.id).textContent()).includes("Espresso machine")
    && (await card(a, reply.id).textContent()).includes(bo.name)
    && (await card(a, reply.id).textContent()).includes("Answering " + ada.name), "the other browser discovers the reply and its parent in the shared list");
  check((await changes(a)).filter((change) => change.id === source.id && change.action === "left").length === 1
    && (await changes(a)).filter((change) => change.id === reply.id && change.action === "left").length === 1,
    "the author's own acknowledgement and the other author's SSE answer each create exactly one activity item");
  const conversationPosts = ada.soundPosts;
  await card(a, reply.id).getByRole("button", { name: "Conversation", exact: true }).click();
  await a.locator("#sound-conversation").waitFor({ state: "visible" });
  await a.locator("#sound-conversation").filter({ hasText: ada.name }).filter({ hasText: bo.name }).waitFor();
  check(!await drawer(a).evaluate((dialog) => dialog.open) && ada.soundPosts === conversationPosts,
    "Conversation hands focus to the existing relationship dialog without publishing");
  await a.keyboard.press("Escape");
  await shot(b, "shared-answer-in-world");

  await b.setViewportSize({ width: 375, height: 812 });
  await b.locator(".chat-bar").waitFor({ state: "visible" });
  const greeting = "Can you hear our two sounds?";
  await a.fill("#chat-input", greeting);
  await a.press("#chat-input", "Enter");
  await b.locator(".heard-log").filter({ hasText: greeting }).waitFor();
  const phone = await b.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      return node && !node.hidden && node.getClientRects().length ? node.getBoundingClientRect().toJSON() : null;
    };
    return { chip: box("#shared-sound-toggle"), leave: box("#leave-sound"), chat: box(".chat-bar"), heard: box(".heard-log"),
      overflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth, height: innerHeight };
  });
  check(phone.chip && phone.chip.width >= 44 && phone.chip.height >= 44 && !phone.overflow
    && phone.chip.x >= 0 && phone.chip.y >= 52 && phone.chip.right <= phone.width,
    "the soundscape entry has a named 44px phone target and stays in the viewport");
  check(!overlaps(phone.chip, phone.leave) && !overlaps(phone.chip, phone.chat) && !overlaps(phone.chip, phone.heard)
    && !overlaps(phone.leave, phone.chat), "the phone entry leaves placement, nearby chat and received words readable");
  await shot(b, "shared-sound-phone-world");
  await openShared(b);
  const phoneDrawer = await drawer(b).boundingBox();
  check(phoneDrawer && phoneDrawer.x >= 0 && phoneDrawer.y >= 52 && phoneDrawer.x + phoneDrawer.width <= 375
    && phoneDrawer.y + phoneDrawer.height <= 812 && await drawer(b).evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    "shared contributions fit the phone's native drawer without horizontal scrolling");
  const targetSizes = await b.locator("#shared-sound-place button:not([hidden])").evaluateAll((buttons) => buttons
    .filter((button) => button.getClientRects().length && !button.closest("[hidden]"))
    .map((button) => ({ text: button.textContent, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  check(targetSizes.length > 0 && targetSizes.every((button) => button.width >= 44 && button.height >= 44), "phone card and listening actions retain 44px touch targets");
  await shot(b, "shared-sound-phone-drawer");
  await closeShared(b);

  await goTo(b, "forest");
  await openShared(b);
  check(await card(b, source.id).getByRole("button", { name: "Walk closer to reply", exact: true }).isDisabled(), "the distant shared card cannot bypass the four-metre reply reach");
  const fromForest = await at(b);
  const faceYaw = Math.atan2(-(source.x - fromForest[0]), -(source.z - fromForest[1]));
  const actualFacing = b.waitForRequest((request) => {
    if (request.method() !== "POST" || !new URL(request.url()).pathname.endsWith("/move")) return false;
    const position = request.postDataJSON();
    return Math.abs(Math.atan2(Math.sin(position.yaw - faceYaw), Math.cos(position.yaw - faceYaw))) < 0.02;
  });
  await expectNoMovementOrPublish(bo, async () => {
    await card(b, source.id).getByRole("button", { name: "Face sound", exact: true }).click();
    await actualFacing;
  }, "facing a distant sound reports its actual bearing without walking or placing anything");
  check(await b.locator("#sound-switch").getAttribute("aria-pressed") === "true", "facing preserves the listener's explicit audio choice");
  await goTo(b, "boardwalk");

  // Enter the real hut by keyboard, using the same safe route fixture as
  // e2e/huts.mjs. No sound or activity event is fabricated in the page.
  const hut = HUTS.find((candidate) => candidate.id === "womens-toilet");
  const doorX = (hut.door.x0 + hut.door.x1) / 2;
  const originalSpawn = await a.evaluate(async ({ x, z }) => {
    const { SCENES } = await import("/shared/catalog.js");
    const spawn = SCENES[0].zones.find((zone) => zone.id === "boardwalk").spawn;
    const before = { ...spawn };
    Object.assign(spawn, { x, z, yaw: 0 });
    return before;
  }, { x: doorX, z: hut.z1 + 1.4 });
  const activityBeforeStay = await changes(b);
  const beforeStayMarks = await marks(b);
  try {
    await goTo(a, "boardwalk");
    await walk(a, "w", (z) => Number(document.getElementById("stage").dataset.at.split(",")[1]) < z - 1.25, hut.z1);
    const response = a.waitForResponse((res) => res.request().method() === "POST" && new URL(res.url()).pathname.endsWith("/sounds"));
    await a.getByRole("button", { name: "Leave toilet flushing", exact: true }).click();
    const result = await (await response).json();
    assert.ok(result.ok && result.sound?.whileIn === hut.id, "the stay sound must be accepted by actual hut admission");
    made.push({ who: ada, sound: result.sound });
    await b.waitForFunction((count) => Number(document.getElementById("stage").dataset.marks) === count + 1, beforeStayMarks);
    const withStay = await freshSnapshot(b);
    check(withStay.sounds.some((sound) => sound.id === result.sound.id && sound.whileIn === hut.id), "the other browser really receives the admitted private-stay sound");
    await waitSummary(b, initial + 2);
    await openShared(b);
    check(await card(b, result.sound.id).count() === 0, "a stay sound and its occupant never become a public shared card");
    assert.deepEqual(await changes(b), activityBeforeStay, "a private stay must not become public visit activity");
    check(true, "public counts and visit activity exclude the real private-stay sound");
    await closeShared(b);
    await walk(a, "s", (z) => Number(document.getElementById("stage").dataset.at.split(",")[1]) > z + 0.8, hut.z1);
    await b.waitForFunction((count) => Number(document.getElementById("stage").dataset.marks) === count, beforeStayMarks);
    await waitSummary(b, initial + 2);
    assert.deepEqual(await changes(b), activityBeforeStay, "ending a private stay must not become public removal activity");
    check(true, "the server ends a stay sound on exit without adding public activity");
  } finally {
    await a.evaluate(async (spawn) => {
      const { SCENES } = await import("/shared/catalog.js");
      Object.assign(SCENES[0].zones.find((zone) => zone.id === "boardwalk").spawn, spawn);
    }, originalSpawn);
  }

  // Seven genuine live contributions exercise the initial six-card limit,
  // expansion, and the activity bound. Spread them across real destinations
  // so this test respects the existing six-in-ten-metres placement rule.
  for (const [zone, soundId] of [["forest", "evening-forest"], ["creek", "trickle"], ["forest-edge", "gentle-breeze"], ["beach", "beach-waves"], ["pier", "harbour-boat"]]) {
    await goTo(a, zone);
    await a.waitForTimeout(1100);
    await place(ada, soundId);
  }
  await Promise.all([waitSummary(a, initial + 7), waitSummary(b, initial + 7)]);
  await openShared(b);
  check(await b.locator(".shared-sound-card").count() === 6, "the default drawer shows only the six newest live contributions");
  const latest = publicSounds(await freshSnapshot(b)).sort((x, y) => y.at.localeCompare(x.at) || x.id.localeCompare(y.id));
  assert.deepEqual(await b.locator(".shared-sound-card").evaluateAll((rows) => rows.map((row) => row.dataset.id)), latest.slice(0, 6).map((sound) => sound.id), "the initial cards must be the actual newest live public sounds");
  await b.getByRole("button", { name: /^Show all (?:\d+ )?sounds$/ }).click();
  check(await b.locator(".shared-sound-card").count() === initial + 7, "Show all exposes every live public contribution without changing the world");
  const recentChanges = await changes(b);
  check(recentChanges.length === 4 && new Set(recentChanges.map((change) => change.id + ":" + change.action)).size === 4
    && recentChanges.every((change) => made.some(({ sound }) => !sound.whileIn && sound.id === change.id)),
    "the recent activity list contains four distinct real public events with their sound ids");
  await closeShared(b);
  const connectedBeforeRemoval = await connections(b);
  assert.ok(connectedBeforeRemoval >= 1, "the original nearby reply must still have its 3D connection before removal");
  // Bo is back beside the parent. The real DELETE is authorised by the
  // server's recorded position, even though Ada originally made that sound.
  const removal = await bo.context.request.delete(`${base}/api/sessions/${bo.sessionId}/sounds/${source.id}`);
  const removed = await removal.json();
  assert.ok(removal.ok() && removed.ok, `Nearby public removal failed: ${JSON.stringify(removed)}`);
  await Promise.all([waitSummary(a, initial + 6), waitSummary(b, initial + 6)]);
  await b.waitForFunction((before) => Number(document.getElementById("stage").dataset.soundConnections) === before - 1, connectedBeforeRemoval);
  await openShared(b);
  check(await card(b, source.id).count() === 0 && await card(b, reply.id).count() === 1
    && (await card(b, reply.id).textContent()).includes("(removed)"), "removing a parent clears its line and card while its attributed child remains live");
  check((await changes(b)).filter((change) => change.id === source.id && change.action === "removed").length === 1,
    "a public removal is one truthful visit event rather than a duplicated optimistic/SSE item");
  await closeShared(b);
  const postsBeforeReload = bo.soundPosts;
  await b.reload();
  await b.click(".enter-card [data-enter]");
  await b.waitForSelector(".enter-card", { state: "detached" });
  await b.waitForFunction(() => document.getElementById("stage").dataset.at && !document.getElementById("status").classList.contains("offline"));
  await waitSummary(b, initial + 6);
  await openShared(b);
  if (await b.getByRole("button", { name: /^Show all (?:\d+ )?sounds$/ }).isVisible()) await b.getByRole("button", { name: /^Show all (?:\d+ )?sounds$/ }).click();
  check(await card(b, source.id).count() === 0 && await card(b, reply.id).count() === 1 && await connections(b) === connectedBeforeRemoval - 1,
    "the real reconnect snapshot retains the child and never revives its removed parent or thread");
  check((await changes(b)).length === 0 && bo.soundPosts === postsBeforeReload, "reloading preserves shared history without inventing visit events or automatically republishing a sound");
  await shot(b, "shared-sound-phone-return");
  check(errors.length === 0, "no browser page errors: " + errors.join(" | "));
} catch (error) {
  for (const { page, name } of people) {
    if (page.isClosed()) continue;
    await shot(page, "failure-" + name.replaceAll(" ", "-")).catch(() => undefined);
    console.error(name + " state: " + JSON.stringify(await page.evaluate(() => ({
      at: document.getElementById("stage")?.dataset.at,
      summary: document.querySelector(".shared-sound-summary")?.textContent,
      cards: [...document.querySelectorAll(".shared-sound-card")].map((row) => ({ id: row.dataset.id, text: row.textContent })),
      changes: document.querySelector(".shared-changes")?.textContent,
      connections: document.getElementById("stage")?.dataset.soundConnections,
      dialogs: [...document.querySelectorAll("dialog")].filter((dialog) => dialog.open).map((dialog) => dialog.id),
    })).catch(() => null)));
  }
  throw error;
} finally {
  // Stop movement reporters, then use normal server authority from beside
  // each test-created sound. Never delete rows, reset tables or touch 18861.
  await Promise.all(people.map(({ page }) => page.close().catch(() => undefined)));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  for (const { who, sound } of made) {
    try {
      if (sound.whileIn) {
        // Its authority is leaving the hut, not a public DELETE. Do not
        // reclaim an empty hut during cleanup by moving back into it.
        const hut = HUTS.find((candidate) => candidate.id === sound.whileIn);
        await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 + 1.5, yaw: 0 } });
        continue;
      }
      await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
      await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`);
      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch { /* Preserve the original assertion if the scratch server stops. */ }
  }
  await browser.close();
}
