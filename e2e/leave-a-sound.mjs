#!/usr/bin/env node
// Two people and the sounds they leave (ADR 011), through the UI: Ada
// leaves a sound where she stands; Bo sees its
// light and is told, and his page plays it; a reload keeps it; Bo, beside
// it, removes it and Ada sees it go. The sound switch stops what plays.
//
//   APP_URL=http://localhost:8080 node e2e/leave-a-sound.mjs [shotsDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.APP_URL ?? "http://localhost:8080";
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) process.exitCode = 1;
};
const until = async (page, fn, arg, ms = 4000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function person(name, avatar, mode) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 840 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${base}/scene/seaside?mode=${mode}&zone=boardwalk`);
  await page.fill(".enter-card input[name=nickname]", name);
  await page.check(`.enter-card input[value="${avatar}"]`, { force: true });
  await page.click(".enter-card [data-enter]");
  await page.waitForSelector(".enter-card", { state: "detached" });
  return page;
}

const marks = (page) => page.evaluate(() => Number(document.getElementById("stage").dataset.marks ?? 0));
const voices = (page) => page.evaluate(() => Number(document.getElementById("stage").dataset.voices ?? 0));
const toastHas = (page, text) => until(page, (t) => document.getElementById("toast").textContent.includes(t), text);

const a = await person("Ada", "cat", "weekday");
const b = await person("Bo", "dog", "weekday");
await a.waitForTimeout(1200);
check((await a.getAttribute("#sound-switch", "aria-pressed")) === "true", "entering turns sound on");

// a run that failed half way may have left a sound where Ada stands
for (let i = 0; i < 8 && (await a.locator(".sound-label.in-reach .sound-remove").count()); i++) {
  await a.click(".sound-label.in-reach .sound-remove");
  await a.waitForTimeout(1100);
}

const before = await marks(b);
await a.click("#leave-sound");
check(await a.locator("#sound-palette:not([hidden]) li").count() === 6, "Leave a sound opens the six sounds to choose from");
check((await a.locator("#sound-palette li").first().textContent()).includes("suits here"), "those that suit the boardwalk come first");
await a.locator("#sound-palette li", { hasText: "Café chatter" }).getByText("Listen").click();
await a.waitForTimeout(600);
await a.click('#sound-palette [data-sound="cafe-chatter"]');
check(await toastHas(a, "You left Café chatter here"), "Ada is told she left it");
check(await a.locator("#sound-palette").isHidden(), "and the palette closes");

check(await until(b, (n) => Number(document.getElementById("stage").dataset.marks ?? 0) === n + 1, before, 1500), "Bo gets its light within a second and a half");
check(await toastHas(b, "Ada left Café chatter at Boardwalk"), "Bo is told who left what, and where");
check(await until(b, () => Number(document.getElementById("stage").dataset.voices ?? 0) >= 1, undefined, 6000), "Bo's page plays it");
const label = b.locator(".sound-label:not([hidden])", { hasText: "left by Ada" });
check(await label.count() === 1, "near it, Bo sees what it is and who left it");
if (out) await b.screenshot({ path: `${out}/sound-bo.jpg`, type: "jpeg", quality: 75 });

await b.reload();
await b.click(".enter-card [data-enter]");
check(await until(b, () => Number(document.getElementById("stage").dataset.marks ?? 0) >= 1), "a reload keeps it");

await b.click("#sound-switch");
check(await until(b, () => document.getElementById("stage").dataset.voices === "0"), "turning sound off stops what plays");
await b.click("#sound-switch");

const remove = b.locator(".sound-label.in-reach .sound-remove");
await remove.waitFor({ timeout: 4000 }).catch(() => undefined);
check(await remove.isVisible(), "standing beside it, Bo can remove it");
await remove.click();
check(await toastHas(b, "You removed Café chatter"), "Bo is told he removed it");
check(await until(a, () => document.getElementById("stage").dataset.marks === "0"), "its light goes from Ada's place too");
check(await toastHas(a, "Bo removed Café chatter"), "and Ada is told who removed it");
check((await voices(a)) === 0, "and Ada's page stops playing it");

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
