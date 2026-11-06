#!/usr/bin/env node
// Mateo's local guitar, without creating a shared contribution.
// Run against a LOCAL scratch database: the deduplication check leaves and
// removes a real player sound. APP_URL=http://localhost:18864 node e2e/busker-sound.mjs
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { openTools, openListening } from "./world-ui.mjs";

const base = process.env.APP_URL ?? "http://localhost:8080";
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const check = (condition, message) => { assert.ok(condition, message); console.log("ok  " + message); };
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 840 } });
  await context.addInitScript(() => {
    localStorage.setItem("soac-guide", JSON.stringify({ tour: true, places: ["forest", "creek", "forest-edge", "boardwalk", "cafe", "beach", "pier", "shop"] }));
    window.__sources = [];
    window.__contexts = [];
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination, ...args) {
      const result = connect.call(this, destination, ...args);
      if (destination === this.context.destination && this.context.__meter) connect.call(this, this.context.__meter);
      return result;
    };
    const Audio = window.AudioContext;
    window.AudioContext = class extends Audio {
      constructor(...args) { super(...args); this.__meter = this.createAnalyser(); window.__contexts.push(this); }
      createBufferSource() {
        const node = super.createBufferSource();
        const record = { node, started: false, ended: false };
        window.__sources.push(record);
        const start = node.start.bind(node);
        node.start = (...args) => { const result = start(...args); record.started = true; return result; };
        node.addEventListener("ended", () => { record.ended = true; });
        return node;
      }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/scene/seaside?zone=boardwalk");
  await page.fill(".enter-card input[name=nickname]", "Busker listener");
  await page.click(".enter-card [data-enter]");
  await page.waitForSelector(".enter-card", { state: "detached" });
  await page.waitForFunction(() => document.getElementById("stage").dataset.buskerVoice === "1");
  const active = () => page.evaluate(() => window.__sources.filter(({ node, started, ended }) => started && !ended && node.context.state === "running").length);
  check(await active() === 1, "the nearby animated guitarist has one real audio source");
  await page.waitForFunction(() => window.__contexts.some((ctx) => {
    const samples = new Float32Array(ctx.__meter.fftSize);
    ctx.__meter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) > 0.00001;
  }));
  check(true, "the guitar produces measurable audio at the listener output");
  check(Number(await page.getAttribute("#stage", "data-marks") ?? 0) === 0, "the NPC does not seed a shared sound or a light");
  if (out) await page.screenshot({ path: out + "/busker-playing.png" });

  await openTools(page);

  await page.click('#zones [data-zone="forest"]');
  await page.waitForFunction(() => document.getElementById("stage").dataset.buskerVoice === "0");
  await page.waitForTimeout(800);
  check(await active() === 0, "walking out of his hearing distance stops the guitar source");
  await openTools(page);
  await page.click('#zones [data-zone="boardwalk"]');
  await page.waitForFunction(() => document.getElementById("stage").dataset.buskerVoice === "1");
  check(await active() === 1, "coming back starts Mateo's guitar again");

  await page.click("#sound-switch");
  await page.waitForFunction(() => document.getElementById("stage").dataset.buskerVoice === "0");
  await page.waitForTimeout(800);
  check(await active() === 0, "Sound off stops Mateo along with the place");
  await page.click("#sound-switch");
  await page.waitForFunction(() => document.getElementById("stage").dataset.buskerVoice === "1");
  check(await active() === 1, "Sound on restores the nearby guitar");

  // Chrome automation can keep every tab visible, even in a headed run.
  // Supply only the platform visibility input; the real AudioContext must
  // actually suspend and resume, without replacing any audio implementation.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(() => window.__contexts.every((ctx) => ctx.state !== "running"), null, { polling: 100, timeout: 6000 });
  check(await active() === 0, "the hidden-page event suspends real guitar audio");
  await page.evaluate(() => {
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(() => !document.hidden && window.__contexts.some((ctx) => ctx.state === "running"));
  check(await active() === 1, "the visible-page event restores its sound preference");

  // The boardwalk spawn is already in Mateo's local hearing area. A player
  // contribution there must replace the NPC voice rather than double it.
  await page.click("#leave-sound");
  await page.locator('[data-sound="guitar"]').click();
  await page.waitForSelector("#sound-palette", { state: "hidden" });
  await page.waitForFunction(() => document.getElementById("stage").dataset.buskerVoice === "0" && document.getElementById("stage").dataset.voices === "1");
  await page.waitForTimeout(800);
  check(await active() === 1, "a nearby player guitar plays once, with the NPC guitar suppressed");
  if (out) await page.screenshot({ path: out + "/player-guitar-takes-precedence.png" });
  await page.waitForTimeout(400);
  await page.locator(".sound-label.in-reach .sound-remove").click();
  await page.waitForFunction(() => document.getElementById("stage").dataset.marks === "0" && document.getElementById("stage").dataset.buskerVoice === "1");
  await page.waitForTimeout(1400);
  check(await active() === 1, "removing the player guitar brings Mateo back without adding shared rows");
  check(errors.length === 0, "no page errors: " + errors.join(" | "));
} finally {
  await browser.close();
}
