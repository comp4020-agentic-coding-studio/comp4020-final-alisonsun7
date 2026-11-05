#!/usr/bin/env node
// The café through the UI, in two Chrome sessions: both join, one goes to
// the counter and puts the espresso machine on the espresso cart, the other
// sees its marker arrive; then walking with the keyboard carries you from
// the window to the counter.
//
//   APP_URL=http://localhost:8080 node e2e/world-two-browsers.mjs [shotsDir]
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
  page.on("console", (m) => m.type() === "error" && errors.push(`${name} console: ${m.text()}`));
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
await a.goto(`${base}/scene/cafe?mode=weekday&shot=street`);
await b.goto(`${base}/scene/cafe?mode=weekday&shot=tables`);
await a.waitForSelector("canvas.world-canvas");
await b.waitForSelector("canvas.world-canvas");

// Go to the counter, choose the espresso machine, click the glowing spot.
await a.click('#shots a[data-shot="counter"]');
await a.waitForTimeout(600);
check(a.url().includes("shot=counter"), "Go to moves Ada to the counter");
await a.click('.cat:has-text("Places")');
await a.click('.chip:has-text("Espresso machine")');
const spot = a.locator('.world-spot.accepts:not([hidden])[data-anchor="counter/espresso-cart"]');
await spot.waitFor({ timeout: 3000 });
const before = Date.now();
await spot.click();
await b.locator(".world-marker").first().waitFor({ state: "attached", timeout: 3000 });
check(true, `Bo's page has the marker ${Date.now() - before} ms after Ada's click`);
check((await b.locator("#theirs .sound-row").count()) >= 1, "Bo lists Ada's sound under Others' sounds");
if (out) await a.screenshot({ path: `${out}/world-a-counter.jpg`, type: "jpeg", quality: 70 });

// Bo backs away from the window: S carries him across the room to the counter.
await b.click('#shots a[data-shot="window"]');
await b.waitForTimeout(500);
await b.locator("canvas.world-canvas").focus();
await b.keyboard.down("s");
await b.waitForTimeout(2600);
await b.keyboard.up("s");
await b.waitForTimeout(300);
check(b.url().includes("shot=counter"), `walking back with S moves Bo from the window to the counter (${new URL(b.url()).searchParams.get("shot")})`);
if (out) await b.screenshot({ path: `${out}/world-b-walked.jpg`, type: "jpeg", quality: 70 });

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
