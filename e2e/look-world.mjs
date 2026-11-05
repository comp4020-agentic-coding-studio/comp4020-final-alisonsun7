#!/usr/bin/env node
// Screenshots of the walkable world in every mode and zone, for a person to
// look at. Not a test: it only reports page errors.
//
//   APP_URL=http://localhost:8080 node e2e/look-world.mjs <outDir>
import { chromium } from "playwright";
const base = process.env.APP_URL ?? "http://localhost:8080";
const out = process.argv[2];
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
for (const mode of ["morning", "weekday", "rainy-dusk"]) {
  for (const shot of ["bridge", "lobby", "tea-point", "stairs"]) {
    await page.goto(`${base}/scene/campus?mode=${mode}&shot=${shot}`);
    await page.waitForTimeout(mode === "morning" ? 4800 : 1500);
    await page.screenshot({ path: `${out}/${mode}-${shot}.jpg`, type: "jpeg", quality: 70 });
  }
}
console.log(errors.join("\n") || "no errors");
await browser.close();
