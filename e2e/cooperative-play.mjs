#!/usr/bin/env node
// Ordinary sounds answering ordinary sounds, through two real browser identities.
// Use a LOCAL scratch database: this script creates/removes its own contributions.
// APP_URL=http://localhost:18868 node e2e/cooperative-play.mjs [screenshotsDir]
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { openTools, openListening } from "./world-ui.mjs";

const base = process.env.APP_URL ?? "http://localhost:8080";
const endpoint = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname), "cooperative-play requires a local scratch server");
assert.notEqual(endpoint.port, "18861", "18861 is an existing working server; use a scratch port");
const phoneOnly = process.argv.includes("--phone-layout-only");
const out = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
const people = [];
const made = [];
const check = (condition, message) => { assert.ok(condition, message); console.log("ok  " + message); };
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png` }); };
const label = (page, id) => page.locator(`.sound-label[data-id="${id}"]`);
const conversation = (page) => page.locator("#sound-conversation");
const markerCount = (page) => page.locator("#stage").evaluate((stage) => Number(stage.dataset.marks ?? 0));
const at = (page) => page.locator("#stage").evaluate((stage) => stage.dataset.at.split(",").map(Number));
const waitForText = (locator, text) => locator.filter({ hasText: text }).waitFor();

async function person(name, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 812 : 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.setItem("soac-guide", JSON.stringify({ tour: true, places: ["forest", "creek", "forest-edge", "boardwalk", "cafe", "beach", "pier", "shop"] }));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  const who = { context, page, name, sessionId: null };
  people.push(who);
  await page.goto(base + "/scene/seaside?zone=boardwalk");
  who.sessionId = await page.locator("#boot").evaluate((boot) => JSON.parse(boot.textContent).snapshot.sessionId);
  await page.fill('.enter-card input[name="nickname"]', name);
  await page.click(".enter-card [data-enter]");
  await page.waitForSelector(".enter-card", { state: "detached" });
  await page.waitForFunction(() => document.getElementById("stage").dataset.at && !document.getElementById("status").classList.contains("offline"));
  return who;
}

async function closePanels(page) {
  for (const id of ["sound-palette", "sound-conversation"]) {
    if (await page.locator(`#${id}`).evaluate((dialog) => dialog.open).catch(() => false)) await page.keyboard.press("Escape");
  }
}

async function place(who, soundId, click = () => who.page.locator(`#sound-palette [data-sound="${soundId}"]`).click()) {
  const response = who.page.waitForResponse((res) => res.request().method() === "POST" && new URL(res.url()).pathname === `/api/sessions/${who.sessionId}/sounds`);
  await click();
  const res = await response;
  const result = await res.json();
  assert.ok(res.ok() && result.ok && result.sound, `placement failed (${res.status()}): ${JSON.stringify(result)}`);
  made.push({ who, sound: result.sound });
  await who.page.waitForSelector("#sound-palette", { state: "hidden" });
  return result.sound;
}

async function openConversation(page, id) {
  await closePanels(page);
  await page.waitForFunction((id) => !!document.querySelector(`.sound-label[data-id="${id}"]`), id);
  if (!await label(page, id).locator(".sound-conversation").isVisible()) {
    await openListening(page);
    await page.locator(`.trail-sounds li[data-id="${id}"]`).getByRole("button", { name: /^Face / }).click();
  }
  await label(page, id).locator(".sound-conversation").click();
  await conversation(page).waitFor({ state: "visible" });
  await page.waitForFunction((id) => document.getElementById("sound-conversation").dataset.id === id, id);
}

async function remove(who, id) {
  await closePanels(who.page);
  const response = who.page.waitForResponse((res) => res.request().method() === "DELETE" && new URL(res.url()).pathname === `/api/sessions/${who.sessionId}/sounds/${id}`);
  await label(who.page, id).locator(".sound-remove").click();
  const res = await response;
  assert.ok(res.ok(), `removal failed (${res.status()}): ${await res.text()}`);
}

async function inspectPendingPhone(page, id) {
  await page.locator("#reply-intent").waitFor({ state: "visible" });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "a pending reply also fits the phone world view");
  check(!await label(page, id).isVisible(), "pending reply controls replace the duplicate nearby sound action card");
  const chatBounds = await page.locator(".chat-bar").boundingBox();
  const replyBounds = await page.locator("#reply-intent").boundingBox();
  check(!chatBounds || chatBounds.y + chatBounds.height <= replyBounds.y || replyBounds.y + replyBounds.height <= chatBounds.y,
    "nearby chat and the pending reply controls do not overlap on the phone");
  const visibleToast = page.locator("#toast.show");
  const toastBounds = await visibleToast.count() ? await visibleToast.boundingBox() : null;
  const actions = await Promise.all(["Choose a sound", "Cancel reply"].map((name) => page.getByRole("button", { name, exact: true }).boundingBox()));
  const overlaps = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  check(!actions.some((bounds) => overlaps(toastBounds, bounds)), "a placement toast does not cover either pending reply action");
  await shot(page, "pending-reply-phone");
  await page.getByRole("button", { name: "Cancel reply", exact: true }).click();
  await label(page, id).waitFor({ state: "visible" });
  check(true, "cancelling a pending reply restores the nearby sound action card");
  const normalChat = await page.locator(".chat-bar").boundingBox();
  const leaveButton = await page.locator("#leave-sound").boundingBox();
  check(!overlaps(normalChat, leaveButton), "normal nearby chat also leaves the placement button unobstructed");
  await shot(page, "cancelled-reply-phone");
}

try {
  if (phoneOnly) {
    const phone = await person("Phone Alison", 375);
    await person("Nearby Robin");
    await phone.page.bringToFront();
    await phone.page.locator(".chat-bar").waitFor({ state: "visible" });
    check(true, "the phone layout is checked with an actual nearby person's chat controls");
    await phone.page.click("#leave-sound");
    const sound = await place(phone, "cafe-chatter");
    await label(phone.page, sound.id).locator(".sound-reply").click();
    await phone.page.keyboard.press("Escape");
    await inspectPendingPhone(phone.page, sound.id);
    check(errors.length === 0, "no browser page errors: " + errors.join(" | "));
  } else {
  const ada = await person("Coop Ada");
  const bo = await person("Coop Bo");
  const a = ada.page;
  const b = bo.page;
  const initial = await markerCount(b);
  await a.click("#leave-sound");
  const source = await place(ada, "cafe-chatter");
  check(!source.replyTo, "an ordinary placement has no reply relationship");
  await label(b, source.id).waitFor({ state: "visible", timeout: 1500 });
  check((await label(b, source.id).textContent()).includes(ada.name), "Bo discovers Ada's contribution and its author");
  // Give Bo room to walk without another avatar at the exact same spawn.
  await openTools(a);
  await a.click('#zones [data-zone="forest"]');
  await a.waitForFunction(() => Number(document.getElementById("stage").dataset.at.split(",")[1]) < -100);

  await label(b, source.id).locator(".sound-reply").click();
  await waitForText(b.locator("#sound-library-reply"), ada.name);
  check(await markerCount(b) === initial + 1, "choosing Reply opens a contextual library without placing a sound");
  await b.keyboard.press("Escape");
  await b.locator("#reply-intent").waitFor({ state: "visible" });
  await b.getByRole("button", { name: "Cancel reply", exact: true }).click();
  check(await b.locator("#reply-intent").isHidden(), "Cancel reply clears the pending relationship without changing the world");

  await label(b, source.id).locator(".sound-reply").click();
  await b.keyboard.press("Escape");
  await b.waitForFunction(() => !document.querySelector("dialog:modal") && !document.getElementById("leave-sound").hidden);
  const beforeMove = await at(b);
  await b.locator("canvas.world-canvas").focus();
  await b.keyboard.down("d");
  await b.waitForFunction((from) => {
    const now = document.getElementById("stage").dataset.at.split(",").map(Number);
    return Math.hypot(now[0] - from[0], now[1] - from[1]) > 0.3;
  }, beforeMove, { timeout: 4000 });
  await b.keyboard.up("d");
  const moved = await at(b);
  check(Math.hypot(moved[0] - beforeMove[0], moved[1] - beforeMove[1]) > 0.3, "a pending reply allows walking to a new location");
  check((await b.locator("#reply-intent").textContent()).includes(ada.name), "the reply target stays visible while walking");
  await b.getByRole("button", { name: "Choose a sound", exact: true }).click();
  await waitForText(b.locator("#sound-library-reply"), ada.name);
  const replyPosition = await at(b);

  // Fail a real submission before it reaches the server. The explicit retry
  // must retain its intent and key, without silently publishing on reconnect.
  const attempts = [];
  await b.route(`**/api/sessions/${bo.sessionId}/sounds`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) return route.abort("internetdisconnected");
    return route.continue();
  });
  const beforeFailure = await markerCount(b);
  await b.locator('#sound-palette [data-sound="espresso"]').click();
  await b.waitForFunction(() => /connection|try again|reconnect/i.test(document.querySelector(".library-feedback").textContent));
  check(await b.locator("#sound-palette").isVisible(), "a network failure stays visible inside the open reply library");
  check((await b.locator("#sound-library-reply").textContent()).includes(ada.name), "a failed reply retains its source for explicit retry");
  await b.waitForTimeout(1200);
  check(await markerCount(b) === beforeFailure && attempts.length === 1, "a failed reply is neither placed nor automatically resubmitted");
  const reply = await place(bo, "espresso");
  await b.unroute(`**/api/sessions/${bo.sessionId}/sounds`);
  check(attempts.length === 2 && attempts[0].operationId && attempts[0].operationId === attempts[1].operationId, "explicit retry uses the same operation id");
  check(reply.replyTo?.id === source.id && reply.replyTo.by === ada.name, "the server confirms the reply's source and attribution");
  check(Math.hypot(reply.x - replyPosition[0], reply.z - replyPosition[1]) < 0.3, "the reply is placed at Bo's current location after walking");
  check(await b.locator("#reply-intent").isHidden(), "confirmed placement clears the pending reply");
  await a.waitForFunction((id) => !!document.querySelector(`.sound-label[data-id="${id}"]`), reply.id);
  check((await a.locator("#toast").textContent()).includes("answered"), "Ada receives a real-time acknowledgement of the sound answering hers");

  await openTools(a);

  await a.click('#zones [data-zone="boardwalk"]');
  await openConversation(a, source.id);
  await waitForText(conversation(a), bo.name);
  check((await conversation(a).textContent()).includes("Espresso"), "Ada's conversation panel includes Bo's confirmed answer");
  await openConversation(b, reply.id);
  await waitForText(conversation(b), ada.name);
  check((await conversation(b).textContent()).includes("Café chatter"), "Bo's conversation panel identifies the parent contribution");
  await shot(a, "conversation-two-people");

  await b.reload();
  await b.click(".enter-card [data-enter]");
  await b.waitForSelector(".enter-card", { state: "detached" });
  // Reload returns to the zone spawn, beside the parent. Only the nearest
  // source exposes actions, so follow its visible relationship to the answer.
  await openConversation(b, source.id);
  await conversation(b).locator(`[data-id="${reply.id}"]`).getByRole("button", { name: "View conversation", exact: true }).click();
  await b.waitForFunction((id) => document.getElementById("sound-conversation").dataset.id === id, reply.id);
  await waitForText(conversation(b), ada.name);
  check((await conversation(b).textContent()).includes(ada.name), "a reload preserves the reply relationship");
  // Public removal remains public. Removing a parent must not remove or
  // resurrect the answer, including for a late/reconnecting page.
  await remove(bo, source.id);
  await a.waitForFunction(() => /contribution has been removed/i.test(document.getElementById("sound-conversation").textContent));
  check(await label(a, reply.id).count() === 1, "removing the source leaves its reply in the public world");
  check(await label(a, source.id).count() === 0, "another person may still remove the source from beside it");
  // The original maker leaves before Chen arrives. Keep two rendering worlds
  // at a time, as in the other GPU runs, rather than measuring three-world
  // rendering pressure as an accidental phone interaction requirement.
  await a.close();
  const chen = await person("Coop Chen", 375);
  const c = chen.page;
  await openConversation(c, reply.id);
  await waitForText(conversation(c), bo.name);
  check(await c.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "the conversation does not cause horizontal overflow on a phone");
  const bounds = await conversation(c).boundingBox();
  check(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 375 && bounds.y + bounds.height <= 812, "the relationship dialog fits a small phone viewport");
  await shot(c, "conversation-phone");
  check((await conversation(c).textContent()).includes(ada.name), "a late visitor discovers both contributors after the original maker leaves");
  await c.reload();
  await c.click(".enter-card [data-enter]");
  await c.waitForSelector(".enter-card", { state: "detached" });
  await openConversation(c, reply.id);
  await waitForText(conversation(c), /contribution has been removed/i);
  check((await conversation(c).textContent()).includes(ada.name), "a reconnect retains a readable removed-source record and attribution");
  await shot(c, "removed-source-phone");
  await closePanels(c);
  await label(c, reply.id).locator(".sound-reply").click();
  await c.keyboard.press("Escape");
  await inspectPendingPhone(c, reply.id);

  // A different source disappears while Chen is choosing an answer. The UI
  // must ask before downgrading a reply into an ordinary placement.
  await closePanels(b);
  await b.click("#leave-sound");
  const vanished = await place(bo, "evening-forest");
  await label(c, vanished.id).locator(".sound-reply").click();
  await b.waitForTimeout(1100);
  await remove(bo, vanished.id);
  await c.waitForFunction((id) => !document.querySelector(`.sound-label[data-id="${id}"]`), vanished.id);
  const beforeGoneAttempt = await markerCount(c);
  await c.locator('#sound-palette [data-sound="trickle"]').click();
  await c.waitForFunction(() => /removed/i.test(document.querySelector(".library-feedback").textContent));
  const ordinary = c.getByRole("button", { name: "Leave without a reply", exact: true });
  await ordinary.waitFor({ state: "visible" });
  check(await markerCount(c) === beforeGoneAttempt, "a removed source never silently becomes an unlinked placement");
  const unlinked = await place(chen, "trickle", () => ordinary.click());
  check(!unlinked.replyTo, "only the explicit Leave without a reply action places the chosen sound unlinked");
  check(await c.locator("#reply-intent").isHidden(), "leaving explicitly without a reply clears the invalid target");
  check(errors.length === 0, "no browser page errors: " + errors.join(" | "));
  }
} catch (error) {
  for (const { page, name } of people) {
    if (page.isClosed()) continue;
    await shot(page, "failure-" + name.replaceAll(" ", "-")).catch(() => undefined);
    console.error(name + " state: " + JSON.stringify(await page.evaluate(() => ({
      at: document.getElementById("stage")?.dataset.at,
      active: document.activeElement?.tagName + "." + document.activeElement?.className,
      dialogs: [...document.querySelectorAll("dialog")].map((d) => ({ id: d.id, open: d.open, hidden: d.hidden, modal: d.matches(":modal") })),
      reply: document.getElementById("reply-intent")?.textContent,
    })).catch(() => null)));
  }
  throw error;
} finally {
  // End each page's movement reporter before cleanup, and remove only rows
  // this test itself created. Relations keep their intentional tombstones.
  await Promise.all(people.map(({ page }) => page.close().catch(() => undefined)));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  for (const { who, sound } of made) {
    try {
      await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
      await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`);
      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch { /* The scratch server may have gone away after a failure. */ }
  }
  await browser.close();
}
