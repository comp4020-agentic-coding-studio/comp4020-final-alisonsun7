import { chromium } from "playwright";
const out = "/private/tmp/claude-501/-Users-wensun-Documents-8020-Crit/70f883d5-bbd9-4308-be74-441696750a38/scratchpad/sea";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 840 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
for (const [m, s] of (process.argv[2] ?? "").split(",").map((x) => x.split(":"))) {
  await page.goto(`http://localhost:8099/scene/seaside?mode=${m}&shot=${s}`);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/v-${m}-${s}.jpg`, type: "jpeg", quality: 72, clip: { x: 28, y: 130, width: 880, height: 540 } });
}
console.log(errors.join("\n") || "no errors");
await browser.close();
