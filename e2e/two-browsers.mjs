#!/usr/bin/env node
// Two real browsers in one place, driven through the UI the way people use
// it. Measures how long a change takes to appear for the other person, then
// checks reconnecting, permissions, saving a memory and replaying it.
//
//   pnpm build && pnpm e2e                    starts its own app (throwaway DB)
//   APP_URL=http://localhost:8090 pnpm e2e    uses an app that's already running
//
// Uses the installed Google Chrome (channel "chrome"). Prints one line per
// check and exits non-zero if any fails.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

let base = process.env.APP_URL;
let app = null;
let dir = null;
const port = 8100 + Math.floor(Math.random() * 800);

async function startApp() {
  app = spawn(process.execPath, ["dist/server.js"], {
    env: { ...process.env, PORT: String(port), DB_PATH: join(dir, "e2e.db") },
    stdio: "ignore",
  });
  for (let i = 0; ; i++) {
    try {
      await fetch(base);
      return;
    } catch {
      if (i > 100) throw new Error("the app didn't start; run pnpm build first");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

async function stopApp() {
  const exited = new Promise((r) => app.once("exit", r));
  app.kill("SIGKILL");
  await exited;
}

if (!base) {
  dir = mkdtempSync(join(tmpdir(), "soac-e2e-"));
  base = `http://localhost:${port}`;
  await startApp();
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });
const errors = [];

async function person(name, avatar, viewport = { width: 1366, height: 820 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(`${name} console: ${m.text()}`));
  // which request failed, not just that one did (an op refused with 409 is expected)
  page.on("response", (r) => r.status() >= 400 && r.status() !== 409 && errors.push(`${name}: ${r.status()} ${new URL(r.url()).pathname}`));
  await page.goto(`${base}/explore`);
  await page.click("summary");
  await page.fill("#nickname", name);
  await page.check(`input[name=avatar][value=${avatar}]`);
  await page.click("#join-form button[type=submit]");
  await page.waitForURL("**/explore");
  return { ctx, page };
}

const PLACE = `${base}/scene/marie-reay-ground?mode=everyday`;

async function choose(page, category, label) {
  await page.click(`.cat:text-is("${category}")`);
  await page.click(`.chip:has(.chip-name:text-is("${label}"))`);
}

try {
  const { page: a } = await person("Ana", "cat");
  const { page: b } = await person("Ben", "dog", { width: 390, height: 844 });
  await a.goto(PLACE);
  await b.goto(PLACE);

  // presence: each sees the other
  await a.waitForSelector(`#people .person:text("Ben")`, { timeout: 3000 }).then(
    () => check("A sees B arrive", true),
    () => check("A sees B arrive", false),
  );

  // A places a sound through the UI; time until B's page shows it
  const before = await b.locator(".figure").count();
  await choose(a, "Places", "Lift chime");
  const t0 = Date.now();
  await a.click(`.anchor[data-anchor="lifts"]`);
  await b.waitForFunction((n) => document.querySelectorAll(".figure").length > n, before, { timeout: 5000 });
  const syncMs = Date.now() - t0;
  check("B sees A's sound without reloading, within 1 s", syncMs < 1000, `${syncMs} ms click-to-render`);
  const theirs = await b.locator("#theirs").textContent();
  check("B's list names who added it", /Lift chime/.test(theirs) && /Ana/.test(theirs));

  // B can't remove A's sound: the UI offers no Remove for it, and the API refuses
  check("B is offered no Remove for A's sound", (await b.locator("#theirs .remove").count()) === 0);

  // B adds one too; A sees it
  await choose(b, "People", "Quiet talk");
  const t1 = Date.now();
  await b.click(`.anchor[data-anchor="lobby-floor"]`);
  await a.waitForSelector(`#theirs :text("Quiet talk")`, { timeout: 5000 });
  check("A sees B's sound within 1 s", Date.now() - t1 < 1000, `${Date.now() - t1} ms`);

  // a sound refused at the wrong spot says why, and nothing is sent
  await choose(a, "Objects", "Recycling drop");
  await a.click(`.anchor[data-anchor="lifts"]`);
  const toast = await a.locator("#toast").textContent();
  check("a sound at the wrong spot is refused with a reason", /another part of this scene/.test(toast ?? ""), toast?.trim());
  await a.keyboard.press("Escape");

  // The server goes down and comes back (a redeploy, a crash): both pages
  // say so, reconnect by themselves, and nothing placed is lost.
  if (app) {
    await stopApp();
    await b.waitForSelector("#status.offline", { timeout: 8000 }).then(
      () => check("B is told the connection is lost", true),
      () => check("B is told the connection is lost", false),
    );
    await choose(a, "People", "Laptop typing");
    await a.click(`.anchor[data-anchor="high-table"]`);
    const refusedOffline = await a.locator("#toast").textContent();
    check("A can't make a change while offline, and is told so", /Connection lost/.test(refusedOffline ?? ""), refusedOffline?.trim());
    await a.keyboard.press("Escape");
    await startApp();
    const t2 = Date.now();
    await b.waitForFunction(() => !document.querySelector("#status")?.classList.contains("offline"), null, { timeout: 10_000 }).then(
      () => check("B reconnects by itself", true, `${Date.now() - t2} ms after the server came back`),
      () => check("B reconnects by itself", false),
    );
    const kept = await b.locator("#theirs").textContent();
    check("after the restart B still has both sounds", /Lift chime/.test(kept) && (await b.locator("#mine").textContent()).includes("Quiet talk"));
    await a.waitForFunction(() => !document.querySelector("#status")?.classList.contains("offline"), null, { timeout: 10_000 });
  } else {
    console.log("SKIP  server restart (APP_URL given: this run doesn't own the server)");
  }

  // after all that, a change still reaches the other person
  await a.locator("#mine .remove").first().click();
  const t3 = Date.now();
  await b.waitForFunction(() => !document.querySelector("#theirs")?.textContent?.includes("Lift chime"), null, { timeout: 5000 }).then(
    () => check("A's removal reaches B within 1 s", Date.now() - t3 < 1000, `${Date.now() - t3} ms`),
    () => check("A's removal reaches B within 1 s", false),
  );

  // a memory: A starts it, both see the clock, A saves it early
  await choose(a, "Places", "Lift chime");
  await a.click(`.anchor[data-anchor="lifts"]`);
  await a.click(`#session button:text("Start a 3-minute memory")`);
  await b.waitForSelector("#clock", { timeout: 3000 });
  const clockA = await a.locator("#clock").textContent();
  const clockB = await b.locator("#clock").textContent();
  check("both see the same server clock", clockA === clockB || Math.abs(toSec(clockA) - toSec(clockB)) <= 1, `${clockA} / ${clockB}`);
  check("only the starter is offered Save now", (await a.locator(`#session button:text("Save this memory now")`).count()) === 1 && (await b.locator(`#session button:text("Save")`).count()) === 0);
  await a.waitForTimeout(1500);
  await a.click(`#session button:text("Save this memory now")`);
  const link = await b.waitForSelector(`#toast a[href^="/memory/"]`, { timeout: 5000 }).catch(() => null);
  check("B is told the memory was saved, with a link", link !== null);
  const href = link ? await link.getAttribute("href") : null;
  await b.waitForFunction(() => document.querySelectorAll(".figure").length === 0, null, { timeout: 3000 }).then(
    () => check("the place is silent again for the next memory", true),
    () => check("the place is silent again for the next memory", false),
  );

  // someone who wasn't there opens the memory and replays it
  if (href) {
    const visitor = await browser.newContext({ viewport: { width: 1366, height: 820 } });
    const v = await visitor.newPage();
    v.on("pageerror", (e) => errors.push(`visitor: ${e.message}`));
    await v.goto(`${base}${href}`);
    const text = await v.locator("main").textContent();
    check("the memory page names both people and its sounds", /Ana/.test(text) && /Ben/.test(text) && /Lift chime/.test(text) && /Quiet talk/.test(text));
    await v.click("#play");
    await v.waitForTimeout(800);
    check("replay runs", /Pause/.test((await v.locator("#play").textContent()) ?? ""));
    // visible, not just in the DOM: a figure rebuilt every frame stays at the
    // start of its fade-in, which once left replay with none to see
    const shown = await v.$$eval(".figure", (els) => els.filter((el) => Number(getComputedStyle(el).opacity) > 0.9).length);
    check("replay shows the figures", shown >= 2, `${shown} visible`);
    await v.screenshot({ path: "/tmp/soac-e2e-memory.png" });
    const archive = await v.goto(`${base}/archive`);
    check("the archive lists it", archive?.status() === 200 && (await v.locator(`a[href="${href}"]`).count()) > 0);
  }
} catch (err) {
  check("ran to the end", false, err instanceof Error ? err.message.split("\n")[0] : String(err));
}

function toSec(clock) {
  const [m, s] = String(clock ?? "0:0").split(":").map(Number);
  return m * 60 + s;
}

await browser.close();
if (app) app.kill();
if (dir) rmSync(dir, { recursive: true, force: true });
check("no page errors in any browser", errors.length === 0, errors.slice(0, 3).join(" | "));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
