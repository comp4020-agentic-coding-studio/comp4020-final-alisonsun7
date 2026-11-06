#!/usr/bin/env node
// The seaside place through the UI, in two Chrome sessions: Go to; walking
// with the keyboard from the café window to the counter, over the footbridge,
// and out of the forest onto the boardwalk; wandering off the trail brings
// the kangaroo.
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
await a.goto(`${base}/scene/seaside?mode=weekday&zone=boardwalk`);
await b.goto(`${base}/scene/seaside?mode=weekday&zone=tables`);
await a.waitForSelector("canvas.world-canvas");
await b.waitForSelector("canvas.world-canvas");
// arriving: choose to enter quietly
for (const p of [a, b]) await p.click(".enter-card [data-enter]");

// Go to the counter
await a.click('#zones a[data-zone="counter"]');
await a.waitForTimeout(600);
check(a.url().includes("zone=counter"), "Go to moves Ada to the counter");

// Bo backs away from the window: S carries him across the room to the counter.
await b.click('#zones a[data-zone="window"]');
await b.waitForTimeout(500);
await b.locator("canvas.world-canvas").focus();
await b.keyboard.down("s");
await b.waitForTimeout(2600);
await b.keyboard.up("s");
await b.waitForTimeout(300);
check(b.url().includes("zone=counter"), `walking back with S moves Bo from the window to the counter (${new URL(b.url()).searchParams.get("zone")})`);
if (out) await b.screenshot({ path: `${out}/world-b-walked.jpg`, type: "jpeg", quality: 70 });

// The creek is crossed on the footbridge: from its north side, W carries Bo
// over it to the south bank.
await b.click('#zones a[data-zone="creek"]');
await b.waitForTimeout(500);
await b.locator("canvas.world-canvas").focus();
const zAt = async () => Number((await b.locator("#stage").getAttribute("data-at")).split(",")[1]);
const northZ = await zAt();
await b.keyboard.down("w");
await b.waitForTimeout(7500);
await b.keyboard.up("w");
await b.waitForTimeout(300);
const southZ = await zAt();
// the creek's banks are at z -75.2 and -62.8
check(northZ < -75.2 && southZ > -62.8, `W carries Bo over the footbridge (z ${northZ} → ${southZ})`);

// The forest and the shore are one place: from the forest's edge, W walks
// down the trail and out onto the boardwalk.
await b.click('#zones a[data-zone="forest-edge"]');
await b.waitForTimeout(500);
await b.locator("canvas.world-canvas").focus();
await b.keyboard.down("w");
await b.waitForTimeout(8500);
await b.keyboard.up("w");
await b.waitForTimeout(300);
check(b.url().includes("zone=boardwalk"), `W walks Bo out of the forest onto the boardwalk (${new URL(b.url()).searchParams.get("zone")})`);
if (out) await b.screenshot({ path: `${out}/world-b-boardwalk.jpg`, type: "jpeg", quality: 70 });

// Wander off the trail in the forest and a kangaroo hops in to say so; its
// button takes you back to the trail.
await b.click('#zones a[data-zone="forest"]');
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
if (rooCame) {
  const stageBox = await b.locator("#stage").boundingBox();
  const bubbleBox = await bubble.boundingBox();
  const inside = bubbleBox.x >= stageBox.x && bubbleBox.y >= stageBox.y && bubbleBox.x + bubbleBox.width <= stageBox.x + stageBox.width && bubbleBox.y + bubbleBox.height <= stageBox.y + stageBox.height;
  check(inside, `the kangaroo's words are all inside the view (top ${Math.round(bubbleBox.y - stageBox.y)} px from the view's top)`);
  // Look away vertically: the words still fit when its head leaves the view.
  await b.locator("canvas.world-canvas").focus();
  const box = await b.locator("canvas.world-canvas").boundingBox();
  await b.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await b.mouse.down();
  await b.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 200, { steps: 8 });
  await b.mouse.up();
  await b.waitForTimeout(300);
  const after = await bubble.boundingBox();
  check(after.y >= stageBox.y && after.y + after.height <= stageBox.y + stageBox.height, `still inside after looking away (top ${Math.round(after.y - stageBox.y)} px)`);
}
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
