#!/usr/bin/env node
// The seaside place through the UI, in two Chrome sessions: both join, one
// goes to the café counter and puts the espresso machine on the espresso
// cart, the other sees its marker arrive; walking with the keyboard carries
// you from the café window to the counter, and out of the forest onto the
// boardwalk; wandering off the trail brings a kangaroo.
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
await a.goto(`${base}/scene/seaside?mode=weekday&shot=boardwalk`);
await b.goto(`${base}/scene/seaside?mode=weekday&shot=tables`);
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

// The creek is crossed on the footbridge: from its north side, W carries Bo
// over it to the south bank.
await b.click('#shots a[data-shot="creek"]');
await b.waitForTimeout(500);
await b.locator("canvas.world-canvas").focus();
const zAt = async () => Number((await b.locator("#stage").getAttribute("data-at")).split(",")[1]);
const northZ = await zAt();
await b.keyboard.down("w");
await b.waitForTimeout(5000);
await b.keyboard.up("w");
await b.waitForTimeout(300);
const southZ = await zAt();
// the creek runs along z -66, its south bank at -62.8
check(northZ < -69.2 && southZ > -62.8, `W carries Bo over the footbridge (z ${northZ} → ${southZ})`);

// The forest and the shore are one place: from the forest's edge, W walks
// down the trail and out onto the boardwalk.
await b.click('#shots a[data-shot="forest-edge"]');
await b.waitForTimeout(500);
await b.locator("canvas.world-canvas").focus();
await b.keyboard.down("w");
await b.waitForTimeout(8500);
await b.keyboard.up("w");
await b.waitForTimeout(300);
check(b.url().includes("shot=boardwalk"), `W walks Bo out of the forest onto the boardwalk (${new URL(b.url()).searchParams.get("shot")})`);
if (out) await b.screenshot({ path: `${out}/world-b-boardwalk.jpg`, type: "jpeg", quality: 70 });

// Wander off the trail in the forest and a kangaroo hops in to say so; its
// button takes you back to the trail.
await b.click('#shots a[data-shot="forest"]');
await b.waitForTimeout(500);
await b.locator("canvas.world-canvas").focus();
await b.keyboard.down("d");
await b.waitForTimeout(5000);
await b.keyboard.up("d");
const strayX = Number((await b.locator("#stage").getAttribute("data-at")).split(",")[0]);
const bubble = b.locator(".roo-bubble:not([hidden])");
let rooCame = true;
try {
  await bubble.locator(".roo-back:not([hidden])").waitFor({ timeout: 12000 });
} catch {
  rooCame = false;
}
check(rooCame, `a kangaroo comes to say Bo has wandered off the trail (Bo at x ${strayX})`);
if (out) await b.screenshot({ path: `${out}/world-b-kangaroo.jpg`, type: "jpeg", quality: 72 });
if (rooCame) {
  await bubble.locator(".roo-back").click();
  await b.waitForTimeout(800);
  const [bx, bz] = (await b.locator("#stage").getAttribute("data-at")).split(",").map(Number);
  // the trail passes about x -1 here
  check(Math.abs(bx + 1) < 3 && bz < -110, `"Take me back to the trail" puts Bo back on it (${bx}, ${bz})`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
