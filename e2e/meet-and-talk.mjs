#!/usr/bin/env node
// Two people in the seaside (ADR 007), through the UI: each sees the other
// standing in the world with their name; when
// they're close the talk box opens; what one says appears over their head
// for the other, is replaced by what they say next, and is gone after 5 s.
// A newcomer is asked for a name and a cat or a dog, and joins in place.
// The sound controls from before ADR 010 stay gone (ADR 011 has its own,
// checked by e2e/leave-a-sound.mjs).
//
//   APP_URL=http://localhost:8080 node e2e/meet-and-talk.mjs [shotsDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.APP_URL ?? "http://localhost:8080";
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const errors = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) process.exitCode = 1;
};

async function person(name, avatar) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 840 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${base}/explore`);
  await page.click("summary");
  await page.fill("#nickname", name);
  await page.check(`input[name=avatar][value=${avatar}]`);
  await page.click("#join-form button[type=submit]");
  await page.waitForURL("**/explore");
  return page;
}

const a = await person("Ada", "cat");
const b = await person("Bo", "dog");
// Bo comes by an old link to a retired time of day (ADR 012): still the
// same place, with Ada in it
await a.goto(`${base}/scene/seaside?mode=weekday&zone=beach`);
await b.goto(`${base}/scene/seaside?mode=rainy-dusk&zone=beach`);
await a.waitForSelector("canvas.world-canvas");
await b.waitForSelector("canvas.world-canvas");
for (const p of [a, b]) await p.click(".enter-card [data-enter]");
await a.waitForTimeout(1500);

// Bo walks a few steps ahead of Ada, towards the sea
await b.locator("canvas.world-canvas").focus();
await b.keyboard.down("w");
await b.waitForTimeout(900);
await b.keyboard.up("w");

const boOnAda = a.locator(".other-name:not([hidden])", { hasText: "Bo" });
let seen = true;
try {
  await boOnAda.waitFor({ timeout: 4000 });
} catch {
  seen = false;
}
check(seen, "Ada sees Bo standing in the world, with his name");
check(await b.locator(".other-name", { hasText: "Ada" }).count() === 1, "Bo's page has Ada in the world too");

await a.locator(".chat-bar:not([hidden])").waitFor({ timeout: 4000 }).catch(() => undefined);
await b.locator(".chat-bar:not([hidden])").waitFor({ timeout: 4000 }).catch(() => undefined);
check(await a.locator(".chat-bar:not([hidden])").count() === 1 && await b.locator(".chat-bar:not([hidden])").count() === 1, "close together, both get a talk box");

const bubble = a.locator(".said-bubble:not([hidden])");
await b.fill("#chat-input", "Hi Ada, the sea is loud today");
await b.press("#chat-input", "Enter");
await bubble.waitFor({ timeout: 3000 }).catch(() => undefined);
check((await bubble.textContent().catch(() => "")) === "Hi Ada, the sea is loud today", "what Bo says appears over his head for Ada");
check((await b.locator(".chat-mine:not([hidden])").textContent().catch(() => "")) === "You: Hi Ada, the sea is loud today", "Bo sees his own words under the box");
if (out) await a.screenshot({ path: `${out}/talk-ada.jpg`, type: "jpeg", quality: 72 });

await b.waitForTimeout(700);
await b.fill("#chat-input", "Want a coffee?");
await b.press("#chat-input", "Enter");
await a.waitForTimeout(500);
check((await bubble.textContent().catch(() => "")) === "Want a coffee?", "his next words replace the last");
await a.waitForTimeout(5300);
check(await bubble.count() === 0, "and are gone after 5 s");

// Ada turns her back on Bo: what he says must still reach her eyes, not
// just a bubble over a head she can't see.
await a.locator("canvas.world-canvas").focus();
await a.keyboard.down("q");
await a.waitForTimeout(1650);
await a.keyboard.up("q");
await a.waitForTimeout(300);
check(!(await a.locator(".other-name", { hasText: "Bo" }).isVisible()), "(Bo is behind Ada now)");
await b.fill("#chat-input", "Behind you!");
await b.press("#chat-input", "Enter");
// any place on her screen will do: his bubble is there too, but out of sight
const shown = a.getByText("Behind you!").filter({ visible: true });
await shown.first().waitFor({ timeout: 3000 }).catch(() => undefined);
check(await shown.count() > 0, "with Bo behind her, Ada still sees what he says");
if (out) await a.screenshot({ path: `${out}/talk-behind.jpg`, type: "jpeg", quality: 72 });

check(await a.getByText("Enable sound").count() === 0 && (await a.locator("#sound-toggle, #steps-toggle, .world-spot, .spot-card, #tray").count()) === 0, "the sound controls from before ADR 010 stay gone");

// Someone new comes straight to the world: the arrival card asks their
// name and cat or dog, and they're in, without a reload.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 840 } });
const c = await ctx.newPage();
c.on("pageerror", (e) => errors.push(`Cy: ${e.message}`));
await c.goto(`${base}/scene/seaside?mode=weekday&zone=beach`);
await c.waitForSelector(".enter-card input[name=nickname]");
check(await c.locator(".enter-card .avatar-choice").count() === 2, "a newcomer is asked for a name and a cat or a dog before entering");
if (out) await c.screenshot({ path: `${out}/arrive.jpg`, type: "jpeg", quality: 75 });
await c.click(".enter-card [data-enter]");
check(await c.locator(".enter-error:not([hidden])").count() === 1, "without a name they're asked for one");
await c.fill(".enter-card input[name=nickname]", "Cy");
await c.check('.enter-card input[value="dog"]', { force: true });
const loads = [];
c.on("framenavigated", (f) => f === c.mainFrame() && loads.push(f.url()));
await c.click(".enter-card [data-enter]");
await c.waitForSelector(".enter-card", { state: "detached", timeout: 5000 }).catch(() => undefined);
check(await c.locator(".enter-card").count() === 0 && loads.length === 0, "a name and Enter take them in, without leaving the page");
await c.locator(".person.is-you", { hasText: "Cy" }).waitFor({ timeout: 4000 }).catch(() => undefined);
check(await c.locator(".person.is-you", { hasText: "Cy" }).count() === 1, "they're here as Cy");
check(await c.locator(".chat-bar").count() === 1, "and can talk to whoever they meet");
await ctx.close();

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
