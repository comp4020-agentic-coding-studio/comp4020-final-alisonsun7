#!/usr/bin/env node
// Two independent browsers use the real hut doors and sound prompts. Run on
// a scratch database: APP_URL=http://localhost:18863 node e2e/huts.mjs [shots]
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { openTools, openListening } from "./world-ui.mjs";
import { HUTS } from "../src/shared/huts.ts";

const base = process.env.APP_URL ?? "http://localhost:8080";
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
const check = (condition, message) => { assert.ok(condition, message); console.log("ok  " + message); };
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png` }); };
const position = (page) => page.locator("#stage").getAttribute("data-at").then((raw) => raw.split(",").map(Number));
const waitDoor = (page, id, state) => page.waitForFunction(({ id, state }) => {
  const door = JSON.parse(document.getElementById("stage").dataset.huts ?? "{}")[id];
  return door && Object.entries(state).every(([key, value]) => door[key] === value) && door.open < 0.05;
}, { id, state });
const marks = (page) => page.locator("#stage").getAttribute("data-marks").then(Number);

try {
  async function person(name, avatar) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      localStorage.setItem("soac-guide", JSON.stringify({ tour: true, places: ["forest", "creek", "forest-edge", "boardwalk", "cafe", "beach", "pier", "shop"] }));
      window.__hutAudioStarts = 0;
      const Audio = window.AudioContext;
      window.AudioContext = class extends Audio {
        createBufferSource() {
          const source = super.createBufferSource();
          const start = source.start.bind(source);
          source.start = (...args) => { window.__hutAudioStarts++; return start(...args); };
          return source;
        }
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);
    page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
    await page.goto(`${base}/scene/seaside?zone=boardwalk`);
    await page.fill(".enter-card input[name=nickname]", name);
    await page.check(`.enter-card input[value=${avatar}]`, { force: true });
    await page.click(".enter-card [data-enter]");
    await page.waitForSelector(".enter-card", { state: "detached" });
    await page.waitForFunction(() => document.getElementById("stage").dataset.at);
    return page;
  }

  // Start each route by the appropriate door, then exercise actual keyboard
  // walking and collision. Changing this page's catalogue spawn only sets up
  // the route; no production debug movement API or server position is used.
  async function arrive(page, x, z) {
    await page.evaluate(async ({ x, z }) => {
      const { SCENES } = await import("/shared/catalog.js");
      Object.assign(SCENES[0].zones.find((zone) => zone.id === "boardwalk").spawn, { x, z, yaw: 0 });
    }, { x, z });
    await openTools(page);
    await page.click('#zones a[data-zone="boardwalk"]');
    await page.waitForTimeout(350);
  }
  async function walk(page, key, until) {
    await page.locator("canvas.world-canvas").focus();
    await page.keyboard.down(key);
    try { await until(); } finally { await page.keyboard.up(key); }
    await page.waitForTimeout(250);
  }

  const a = await person("Hut Ada", "cat");
  const b = await person("Hut Bo", "dog");
  // Cover both kinds of private room; the HTTP spec additionally covers
  // simultaneous entrants, multiple pages, disconnect and stale positions.
  for (const [id, sound, button] of [["womens-toilet", "toilet-flush", "Leave toilet flushing"], ["womens-shower", "shower", "Leave someone showering"]]) {
    const hut = HUTS.find((candidate) => candidate.id === id);
    const x = (hut.door.x0 + hut.door.x1) / 2;
    await arrive(a, x, hut.z1 + 1.4);
    await arrive(b, x + 1.0, hut.z1 + 2.5);
    const before = await marks(b);
    await walk(a, "w", () => a.waitForFunction((z) => Number(document.getElementById("stage").dataset.at.split(",")[1]) < z - 1.25, hut.z1));
    await a.getByRole("button", { name: button, exact: true }).waitFor();
    await waitDoor(b, id, { taken: true, locked: true, light: "red" });
    check(true, `${id}: a person inside turns the other browser's light red and locks its shut door`);
    await shot(a, `${id}-inside`);
    await arrive(b, x, hut.z1 + 2.1);
    await b.waitForFunction(() => document.getElementById("toast").textContent.includes("Please wait"));
    await shot(b, `${id}-waiting`);
    await walk(b, "w", () => b.waitForTimeout(1200));
    check((await position(b))[1] > hut.z1, `${id}: walking at the occupied door cannot enter`);
    await waitDoor(b, id, { taken: true, locked: true, light: "red" });
    check(true, `${id}: an outsider approaching cannot open the occupied door`);

    // An optimistic page can get ahead of the stream (or first arrive in a
    // taken hut). The real scene move handler must restore its accepted
    // position after the server refuses admission.
    let releaseRejection;
    let resumed;
    let moveRequests = 0;
    let rejectionHeld = false;
    let signalHeld;
    const held = new Promise((resolve) => { signalHeld = resolve; });
    const released = new Promise((resolve) => { releaseRejection = resolve; });
    const moveRoute = async (route) => {
      moveRequests++;
      const response = await route.fetch();
      if (!rejectionHeld && response.status() === 409) {
        rejectionHeld = true;
        signalHeld();
        await released;
      }
      await route.fulfill({ response });
    };
    const delayRejection = id === "womens-toilet";
    if (delayRejection) await b.route("**/api/sessions/*/move", moveRoute);
    const refused = b.waitForResponse((response) => response.url().endsWith("/move") && response.status() === 409);
    await arrive(b, x, hut.z1 - 1.6);
    if (delayRejection) {
      try {
        // The server has really refused this command, but the page has not
        // received its body. Turning creates fresh movement demand while it
        // waits: a static player would hide overlapping move requests.
        await Promise.race([held, b.waitForTimeout(6000).then(() => { throw new Error("The real hut rejection was not intercepted"); })]);
        const beforeHold = moveRequests;
        await b.locator("canvas.world-canvas").focus();
        await b.keyboard.down("q");
        try { await b.waitForTimeout(700); } finally { await b.keyboard.up("q"); }
        check(moveRequests === beforeHold, "a real delayed 409 prevents a second move even while the player keeps turning");
        resumed = b.waitForResponse((response) => response.url().endsWith("/move")
          && response.status() === 200 && response.request().postDataJSON().z > hut.z1);
      } finally {
        releaseRejection();
      }
    }
    const rejection = await (await refused).json();
    check(rejection.code === "hut_taken", `${id}: the server refuses bypassing the locked doorway`);
    await b.waitForFunction((z) => Number(document.getElementById("stage").dataset.at.split(",")[1]) > z, hut.z1);
    check(true, `${id}: the rejected browser returns outside instead of remaining inside`);
    if (delayRejection) {
      await resumed;
      check(moveRequests > 1, "after the delayed rejection corrects the real view outside, accepted move reports resume");
      await b.unroute("**/api/sessions/*/move", moveRoute);
    }
    await arrive(b, x + 0.2, hut.z1 + 2.1);

    const starts = await b.evaluate(() => window.__hutAudioStarts);
    const placed = a.waitForResponse((response) => response.url().endsWith("/sounds") && response.request().method() === "POST");
    await a.getByRole("button", { name: button, exact: true }).click();
    const result = await (await placed).json();
    check(result.ok && result.sound.soundId === sound && result.sound.whileIn === id, `${id}: the inside prompt leaves its own temporary sound`);
    await b.waitForFunction((n) => Number(document.getElementById("stage").dataset.marks) === n + 1, before);
    await b.waitForFunction((n) => window.__hutAudioStarts > n, starts);
    check(true, `${id}: the other browser receives and plays that sound`);
    await shot(b, `${id}-sound`);

    // Back out through the actual doorway. The server ends the sound, and
    // the waiting person sees a green light and can walk in next.
    await arrive(b, x + 1.1, hut.z1 + 2.8);
    await walk(a, "s", () => a.waitForFunction((z) => Number(document.getElementById("stage").dataset.at.split(",")[1]) > z + 0.8, hut.z1));
    await a.waitForFunction((id) => JSON.parse(document.getElementById("stage").dataset.huts)[id].light === "green", id);
    await b.waitForFunction((n) => Number(document.getElementById("stage").dataset.marks) === n, before);
    check(true, `${id}: leaving ends the sound for everyone and returns the light to green`);
    // Move Ada clear of the doorway, leaving Bo's real route unobstructed.
    await arrive(a, x + 1.1, hut.z1 + 2.8);
    await arrive(b, x, hut.z1 + 2.1);
    await b.waitForFunction(() => !document.getElementById("toast").classList.contains("show"));
    await shot(b, `${id}-free`);
    await arrive(b, x, hut.z1 + 1.4);
    await walk(b, "w", () => b.waitForFunction((z) => Number(document.getElementById("stage").dataset.at.split(",")[1]) < z - 1.25, hut.z1));
    await b.getByRole("button", { name: button, exact: true }).waitFor();
    check(true, `${id}: after it becomes free, the waiting person can enter`);
    await b.getByRole("button", { name: "Not now", exact: true }).click();
    await arrive(b, x + 1.1, hut.z1 + 2.8);
  }
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} finally {
  await browser.close();
}
