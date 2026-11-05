#!/usr/bin/env node
// The walkable world through the UI, in two Chrome sessions: both join,
// one walks to the tea point and puts a microwave hum on the microwaves, the
// other sees its marker and figure arrive; then walking with the keyboard
// moves you from the corridor into the lobby.
//
//   APP_URL=http://localhost:8080 node e2e/world-two-browsers.mjs [shotsDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.APP_URL ?? "http://localhost:8080";
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
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
await a.goto(`${base}/scene/campus?mode=weekday&shot=bridge`);
await b.goto(`${base}/scene/campus?mode=weekday&shot=lobby`);
await a.waitForSelector("canvas.world-canvas");
await b.waitForSelector("canvas.world-canvas");

// Go to the tea point, choose the hum, click the glowing spot.
await a.click('#shots a[data-shot="tea-point"]');
await a.waitForTimeout(600);
check(a.url().includes("shot=tea-point"), "Go to moves Ada to the tea point");
await a.click('.cat:has-text("Places")');
await a.click('.chip:has-text("Microwave hum")');
const spot = a.locator('.world-spot.accepts:not([hidden])[data-anchor="tea-point/microwaves"]');
await spot.waitFor({ timeout: 3000 });
const before = Date.now();
await spot.click();
await b.locator(".world-marker").first().waitFor({ state: "attached", timeout: 3000 });
check(true, `Bo's page has the marker ${Date.now() - before} ms after Ada's click`);
check((await b.locator("#theirs .sound-row").count()) >= 1, "Bo lists Ada's sound under Others' sounds");
if (out) await a.screenshot({ path: `${out}/world-a-teapoint.jpg`, type: "jpeg", quality: 70 });

// Bo walks in from the door: W carries him up the corridor into the lobby.
await b.click('#shots a[data-shot="entry"]');
await b.waitForTimeout(500);
await b.locator("canvas.world-canvas").focus();
await b.keyboard.down("w");
await b.waitForTimeout(2600);
await b.keyboard.up("w");
await b.waitForTimeout(300);
check(b.url().includes("shot=lobby"), `walking forward with W moves Bo from the corridor into the lobby (${new URL(b.url()).searchParams.get("shot")})`);
if (out) await b.screenshot({ path: `${out}/world-b-walked.jpg`, type: "jpeg", quality: 70 });

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
