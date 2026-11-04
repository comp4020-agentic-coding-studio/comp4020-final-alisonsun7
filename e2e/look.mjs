#!/usr/bin/env node
// Screenshots of each page for a person to look at. Not a test: it saves
// what the pages look like into docs/screenshots/ (or a given folder).
//
//   APP_URL=http://localhost:8090 node e2e/look.mjs [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.APP_URL ?? "http://localhost:8080";
const out = process.argv[2] ?? "docs/screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const errors = [];

async function person(name, avatar, viewport = { width: 1366, height: 820 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name} console: ${m.text()}`));
  await page.goto(`${base}/explore`);
  await page.click("summary");
  await page.fill("#nickname", name);
  await page.check(`input[name=avatar][value=${avatar}]`);
  await page.click("#join-form button[type=submit]");
  await page.waitForURL("**/explore");
  return { ctx, page };
}

const shot = async (page, file) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${file}`, fullPage: false, type: "jpeg", quality: 72 });
  console.log(`saved ${out}/${file}`);
};

const visitor = await browser.newContext({ viewport: { width: 1366, height: 820 } });
const vpage = await visitor.newPage();
vpage.on("pageerror", (e) => errors.push(`visitor: ${e.message}`));
await vpage.goto(base);
await shot(vpage, "01-landing.jpg");
await vpage.goto(`${base}/explore`);
await shot(vpage, "02-explore.jpg");

const { page: a } = await person("Wen", "cat");
await a.goto(`${base}/scene/marie-reay-ground?mode=everyday`);
await shot(a, "03-marie-empty.jpg");

// place a few sounds through the UI
async function add(page, category, label, anchor) {
  await page.click(`.cat:text-is("${category}")`);
  await page.click(`.chip:has(.chip-name:text-is("${label}"))`);
  await page.click(`.anchor[data-anchor="${anchor}"]`);
  await page.waitForSelector(`.toast.show`);
}
await add(a, "Places", "Lift chime", "lifts");
await add(a, "People", "Laptop typing", "high-table");
await add(a, "Objects", "Recycling drop", "bins");
await shot(a, "04-marie-sounds.jpg");

for (const s of ["stair-front", "stairs", "tea-point", "lift-detail", "entry"]) {
  await a.click(`#shots a[data-shot="${s}"]`);
  await shot(a, `05-marie-${s}.jpg`);
}

for (const m of ["morning", "weekday", "rainy-dusk"]) {
  await a.goto(`${base}/scene/chifley-path?mode=${m}`);
  await shot(a, `06-chifley-${m}.jpg`);
}
await a.goto(`${base}/scene/lab-cafe?mode=everyday`);
await shot(a, "07-lab.jpg");

const { page: phone } = await person("Sam", "dog", { width: 390, height: 844 });
await phone.goto(`${base}/scene/marie-reay-ground?mode=everyday`);
await shot(phone, "08-phone-marie.jpg");

await browser.close();
if (errors.length) {
  console.error("page errors:\n" + errors.join("\n"));
  process.exit(1);
}
