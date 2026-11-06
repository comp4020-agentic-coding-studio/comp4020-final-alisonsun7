#!/usr/bin/env node
// The sound library and finding another person's contribution, in real Chrome.
// Run against a LOCAL scratch database: this creates and removes a real sound.
// APP_URL=http://localhost:8080 node e2e/sound-discovery.mjs [screenshotsDir]
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { SOUNDS } from "../src/shared/sounds.ts";

const base = process.env.APP_URL ?? "http://localhost:8080";
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
const check = (condition, message) => { assert.ok(condition, message); console.log("ok  " + message); };
const shot = async (page, name) => { if (out) await page.screenshot({ path: out + "/" + name + ".png" }); };

// The real library class, dialog and buttons, without another Three.js world.
// Only the service result is deferred. This is also runnable on its own with
// LIBRARY_CONTEXT_ONLY=1; LIBRARY_CONTEXT_NO_GUARD=1 is a response-only negative
// control and must fail the stale-feedback assertion without editing dist/.
async function libraryContextRegression() {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => errors.push("Library context: " + error.message));
  try {
    if (process.env.LIBRARY_CONTEXT_NO_GUARD === "1") {
      await page.route("**/client/sound-library.js", async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        const changed = source.replace("error && context === this.context", "error");
        assert.notEqual(changed, source, "the negative control must remove the actual context guard");
        await route.fulfill({ response, body: changed });
      });
    }
    await page.goto(base + "/about");
    await page.evaluate(async () => {
      const { SoundLibrary } = await import("/client/sound-library.js");
      const a = { id: "fixture-a", soundId: "trickle", x: 0, z: 0, by: "Fixture A", byId: "person-a", at: "2026-11-06T00:00:00.000Z" };
      const b = { id: "fixture-b", soundId: "beach-waves", x: 1, z: 0, by: "Fixture B", byId: "person-b", at: "2026-11-06T00:00:00.000Z" };
      let target = a;
      let resolveA;
      const calls = [];
      const library = new SoundLibrary({
        zone: () => ({ id: "boardwalk", title: "Boardwalk" }),
        listen: async () => true,
        stop: () => {},
        leave: (id) => {
          calls.push({ target: target.id, soundId: id });
          return target.id === a.id
            ? new Promise((resolve) => { resolveA = resolve; })
            : Promise.resolve("B current error: this reply needs a different sound.");
        },
        cancelReply: () => library.setReply(null),
        close: () => {},
      });
      document.body.append(library.element);
      library.setReply(a);
      library.open();
      window.__libraryContextFixture = {
        calls,
        chooseB: () => { target = b; library.setReply(b); library.open(); },
        finishA: () => resolveA("A stale error: the original target disappeared."),
      };
    });
    await page.locator('[data-sound="evening-forest"]').click();
    await page.waitForFunction(() => window.__libraryContextFixture.calls.length === 1, null, { timeout: 3000 });
    check(await page.locator('[data-sound="evening-forest"]').isDisabled(), "a real library Leave click remains pending while its service result is deferred");
    await page.locator(".library-close").click();
    await page.locator("#sound-palette").waitFor({ state: "hidden" });
    // Native close makes the dialog visually hidden before its queued close
    // event runs; wait for that real handler before preparing the next target.
    await page.waitForFunction(() => document.getElementById("sound-palette").hidden, null, { timeout: 3000 });
    await page.evaluate(() => window.__libraryContextFixture.chooseB());
    check(await page.locator("#sound-palette").evaluate((dialog) => dialog.matches(":modal"))
      && (await page.locator("#sound-library-reply").textContent()).includes("Fixture B"), "closing A and selecting B opens the real dialog with B as its reply target");
    await page.evaluate(() => window.__libraryContextFixture.finishA());
    await page.waitForFunction(() => !document.querySelector('[data-sound="evening-forest"]').disabled, null, { timeout: 3000 });
    check(!(await page.locator(".library-feedback").textContent()).includes("A stale error")
      && (await page.locator("#sound-library-reply").textContent()).includes("Fixture B")
      && await page.locator("#sound-palette").evaluate((dialog) => dialog.matches(":modal")), "a late A error cannot pollute B's feedback, reply target or open dialog");
    await page.locator('[data-sound="espresso"]').click();
    await page.waitForFunction(() => document.querySelector(".library-feedback").textContent.includes("B current error"), null, { timeout: 3000 });
    check((await page.locator("#sound-library-reply").textContent()).includes("Fixture B")
      && await page.evaluate(() => window.__libraryContextFixture.calls.length === 2 && window.__libraryContextFixture.calls[1].target === "fixture-b"), "B's own real Leave click still shows its current error for B");
    await shot(page, "library-context-switch");
    await page.locator(".library-close").click();
  } finally {
    await context.close();
  }
}

async function worldChecks() {
  async function person(name, zone) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      localStorage.setItem("soac-guide", JSON.stringify({ tour: true, places: ["forest", "creek", "forest-edge", "boardwalk", "cafe", "beach", "pier", "shop"] }));
      window.__audioStarts = 0;
      const Audio = window.AudioContext;
      window.AudioContext = class extends Audio {
        createBufferSource() {
          const source = super.createBufferSource();
          const start = source.start.bind(source);
          source.start = (...args) => { window.__audioStarts++; window.__lastAudioOffset = args[1] ?? 0; return start(...args); };
          return source;
        }
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/scene/seaside?zone=" + zone);
    await page.fill(".enter-card input[name=nickname]", name);
    await page.click(".enter-card [data-enter]");
    await page.waitForSelector(".enter-card", { state: "detached" });
    await page.waitForFunction(() => document.getElementById("stage").dataset.at);
    return page;
  }

  const a = await person("Alison", "boardwalk");
  const b = await person("Robin", "counter");
  await a.click("#sound-switch");
  await a.click("#leave-sound");
  check(await a.locator("#sound-palette").evaluate((dialog) => dialog.matches(":modal")), "the library has a native modal focus scope");
  check(await a.locator("#sound-palette [data-sound]").count() === SOUNDS.length, "the entire sound catalogue is offered");
  await shot(a, "desktop-library");
  await a.locator('[data-family="biophony"]').click();
  check(await a.locator("#sound-palette [data-sound]").count() === SOUNDS.filter((sound) => sound.family === "biophony").length, "family filters find animal sounds");
  await a.locator(".library-search input").fill("not-a-real-sound");
  check(await a.locator(".library-empty").isVisible(), "an empty search explains how to recover");
  await a.locator('[data-family="all"]').click();
  await a.locator(".library-search input").fill("");
  await a.locator(".library-close").focus();
  const at = await a.getAttribute("#stage", "data-at");
  await a.keyboard.down("w");
  await a.waitForTimeout(600);
  await a.keyboard.up("w");
  check(await a.getAttribute("#stage", "data-at") === at, "keys in the library do not move the player behind it");
  await a.locator(".library-close").focus();
  await a.keyboard.press("Shift+Tab");
  check(await a.evaluate(() => !!document.activeElement.closest("dialog")), "Tab stays inside the library");

  // Hold the audio response until AFTER the user closes the palette.
  // A late decode must not start an invisible private preview.
  let release;
  let requested = false;
  const gate = new Promise((resolve) => { release = resolve; });
  await a.route("**/assets/sounds/espresso.mp3", async (route) => { requested = true; await gate; await route.continue(); });
  const starts = await a.evaluate(() => window.__audioStarts);
  await a.locator('[data-listen="espresso"]').click();
  for (let i = 0; i < 60 && !requested; i++) await a.waitForTimeout(100);
  check(requested, "a private preview requests its recording");
  await a.keyboard.press("Escape");
  release();
  await a.waitForTimeout(1400);
  check(await a.evaluate(() => window.__audioStarts) === starts, "closing during loading prevents a late preview from playing");
  await a.unroute("**/assets/sounds/espresso.mp3");

  await a.click("#leave-sound");
  await a.locator('[data-listen="espresso"]').click();
  await a.waitForFunction(() => document.querySelector('[data-listen="espresso"]').textContent === "Stop");
  check(await a.locator('[data-listen="espresso"]').getAttribute("aria-pressed") === "true", "a playing preview exposes its Stop state");
  await a.locator('[data-listen="espresso"]').click();
  check(await a.locator('[data-listen="espresso"]').getAttribute("aria-pressed") === "false", "the same control stops the private preview");

  await a.locator('[data-listen="bicycle-bell"]').click();
  await a.waitForFunction(() => document.querySelector('[data-listen="bicycle-bell"]').textContent === "Stop");
  check(await a.evaluate(() => window.__lastAudioOffset) === 0, "a short bicycle call previews the bell before its quiet interval");
  await a.locator('[data-listen="bicycle-bell"]').click();

  const kind = SOUNDS.find((sound) => sound.id === "coastal-gulls") ?? SOUNDS[0];
  await a.locator(".library-search input").fill(kind.label);
  check(await a.locator("#sound-palette [data-sound]").count() === 1, "search finds a named sound");
  await a.locator('[data-sound="' + kind.id + '"]').click();
  await a.waitForSelector("#sound-palette", { state: "hidden" });
  await b.waitForFunction((label) => [...document.querySelectorAll(".trail-text strong")].some((item) => item.textContent === label), kind.label);
  check((await b.locator(".trail-text").filter({ hasText: kind.label }).textContent()).includes("Alison"), "another person finds the contribution and its author");
  const beforeFacing = await b.getAttribute("#stage", "data-at");
  await b.locator(".trail-sounds li").filter({ hasText: kind.label }).getByRole("button", { name: "Face " + kind.label, exact: true }).click();
  await b.waitForTimeout(700);
  check(await b.getAttribute("#stage", "data-at") === beforeFacing, "Face sound turns the view without teleporting the person");
  check((await b.locator(".trail-sounds li").filter({ hasText: kind.label }).locator(".trail-detail").textContent()).includes("Ahead"), "the direction updates as the view turns");
  await shot(b, "desktop-discovery");

  await a.click("#leave-sound");
  await a.locator('[data-sound="' + kind.id + '"]').click();
  await a.waitForFunction(() => document.querySelector(".library-feedback").textContent.length > 0);
  check(await a.locator("#sound-palette").isVisible(), "a refused placement explains the problem inside the open library");
  await a.keyboard.press("Escape");

  await a.setViewportSize({ width: 375, height: 812 });
  await a.emulateMedia({ reducedMotion: "reduce" });
  await a.click("#leave-sound");
  await shot(a, "mobile-library");
  check(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "the phone layout has no horizontal overflow");
  const bounds = await a.locator("#sound-palette").boundingBox();
  check(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 375 && bounds.y + bounds.height <= 812, "the library stays within the small phone viewport");
  await a.locator(".library-close").click();
  await a.evaluate(() => scrollTo(0, 0));
  await shot(a, "mobile-world");

  await b.click('#zones [data-zone="boardwalk"]');
  await b.locator(".sound-label.in-reach .sound-remove").first().click();
  await a.waitForFunction(() => document.getElementById("stage").dataset.marks === "0");
  await a.waitForFunction(() => document.querySelector(".trail-count").textContent.startsWith("0 "));
  check((await a.locator(".trail-count").textContent()).includes("0"), "removing the contribution updates the other person's discovery list");
  check(errors.length === 0, "no page errors: " + errors.join(" | "));
}

try {
  if (process.env.LIBRARY_CONTEXT_ONLY !== "1") await worldChecks();
  await libraryContextRegression();
  check(errors.length === 0, "no library-context page errors: " + errors.join(" | "));
} finally {
  await browser.close();
}
