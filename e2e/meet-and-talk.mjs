#!/usr/bin/env node
// Two people in the seaside (ADR 007), through the UI: each sees the other
// standing in the world with their name; when they're close the talk box
// opens; what one says appears over their head for the other, is replaced
// by what they say next, and is gone after 5 s. Sounds stay after a reload
// (nothing to record), and anyone can turn anyone's sound up or down.
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
// different times of day: still one world
await a.goto(`${base}/scene/seaside?mode=morning&shot=beach`);
await b.goto(`${base}/scene/seaside?mode=rainy-dusk&shot=beach`);
await a.waitForSelector("canvas.world-canvas");
await b.waitForSelector("canvas.world-canvas");
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

// Ada adds a sound; Bo can turn it up; it's still there after Bo reloads
await a.locator("#chat-input").blur();
await a.click('.cat:has-text("Nature")');
await a.click('.chip:has-text("Waves")');
const spot = a.locator('.world-spot.accepts:not([hidden])[data-anchor="beach/shoreline"]');
await spot.waitFor({ timeout: 3000 }).catch(() => undefined);
await spot.click().catch(() => undefined);
const row = b.locator("#theirs .sound-row", { hasText: "Waves" }).first();
await row.waitFor({ timeout: 3000 }).catch(() => undefined);
check(await row.locator("input[type=range]").count() === 1, "Bo gets a volume slider for Ada's sound");
await b.reload();
await b.waitForSelector("canvas.world-canvas");
check(await b.locator("#theirs .sound-row", { hasText: "Waves" }).count() >= 1, "after a reload Ada's sound is still there");
check(await b.getByText("Start a 3-minute memory").count() === 0 && await a.getByText("Start a 3-minute memory").count() === 0, "nobody is offered a 3-minute recording");

// tidy: Ada takes her sound away again
const mine = a.locator("#mine .sound-row", { hasText: "Waves" }).first();
await mine.locator(".remove").click().catch(() => undefined);

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
