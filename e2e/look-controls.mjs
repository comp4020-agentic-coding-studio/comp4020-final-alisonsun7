#!/usr/bin/env node
// Dragging looks in the direction of the pointer, on both axes. Exercise the
// real canvas/camera without joining a room or writing to the shared place.
// APP_URL=http://localhost:8080 node e2e/look-controls.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.APP_URL ?? "http://localhost:8080";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 840 }, reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/about");
  await page.evaluate(async () => {
    const THREE = await import("/vendor/three.module.min.js");
    const { WorldView } = await import("/client/world.js");
    const { SCENES } = await import("/shared/catalog.js");
    const host = document.createElement("div");
    host.className = "stage world-stage";
    host.style.cssText = "width:1000px;height:600px;margin:20px;max-height:none";
    document.body.replaceChildren(host);
    const world = new WorldView(host, SCENES[0], "weekday", { startZone: "boardwalk" });
    // The public camera is the same API the sound labels project against.
    window.lookReview = () => {
      const direction = world.eye.getWorldDirection(new THREE.Vector3());
      return { direction: direction.toArray(), position: world.eye.position.toArray() };
    };
  });
  await page.waitForTimeout(400);
  const canvas = page.locator("canvas.world-canvas");
  const bounds = await canvas.boundingBox();
  const read = () => page.evaluate(() => window.lookReview());
  const drag = async (dx, dy) => {
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  };
  const start = await read();
  let before = start;
  await drag(0, 65);
  let after = await read();
  assert.ok(after.direction[1] < before.direction[1] - 0.1, "dragging down must look down");
  console.log("ok  dragging down looks down");
  before = after;
  await drag(0, -65);
  after = await read();
  assert.ok(after.direction[1] > before.direction[1] + 0.1, "dragging up must look up");
  console.log("ok  dragging up looks up");
  for (const [dx, sign, label] of [[-65, -1, "left"], [65, 1, "right"]]) {
    before = await read();
    await drag(dx, 0);
    after = await read();
    const right = [-before.direction[2], 0, before.direction[0]];
    const turn = after.direction.reduce((sum, value, i) => sum + value * right[i], 0);
    assert.ok(turn * sign > 0.1, "dragging " + label + " must look " + label);
    console.log("ok  dragging " + label + " looks " + label);
  }
  assert.deepEqual(after.position, start.position, "looking must not move the person");
  console.log("ok  dragging changes the view without walking");
  assert.deepEqual(errors, [], "no page errors");
  console.log("ok  no page errors");
} finally {
  await browser.close();
}
