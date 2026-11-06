#!/usr/bin/env node
// Both remembered drag modes, on both axes. Exercise the actual arrival UI
// and real canvas/camera without joining or writing to the shared place.
// APP_URL=http://localhost:8080 node e2e/look-controls.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.APP_URL ?? "http://localhost:8080";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 840 }, reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/scene/seaside?zone=boardwalk");
  assert.equal(await page.locator('.enter-card input[name="arrival-look-mode"]').count(), 2, "arrival offers both look modes");
  console.log("ok  arrival explains both look modes");
  assert.ok(await page.locator('.enter-card input[value="follow"]').isChecked(), "follow pointer is the default");
  await page.locator('.enter-card input[value="scene"]').check();
  await page.click(".enter-card [data-look]");
  await page.click("#look-settings");
  assert.ok(await page.locator('#look-settings-dialog input[value="scene"]').isChecked(), "Controls reflects the arrival choice");
  console.log("ok  the arrival choice is available in Controls");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.matches("canvas.world-canvas"));
  assert.equal(await page.locator("#look-settings-dialog").evaluate((dialog) => dialog.open), false);
  console.log("ok  Escape closes Controls and returns focus to the world");
  await page.reload();
  assert.ok(await page.locator('.enter-card input[value="scene"]').isChecked(), "the preference survives a reload");
  console.log("ok  the selected mode is remembered on the next arrival");
  await page.click(".enter-card [data-look]");
  await page.click("#look-settings");
  await page.locator('#look-settings-dialog input[value="follow"]').check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  assert.ok(await page.locator('.enter-card input[value="follow"]').isChecked(), "Controls saves a later change");
  console.log("ok  Controls can change the remembered mode afterwards");
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
    window.setLookMode = (mode) => world.setLookMode(mode);
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
  for (const mode of ["follow", "scene"]) {
    await page.evaluate((mode) => window.setLookMode(mode), mode);
    const sign = mode === "follow" ? 1 : -1;
    let before = await read();
    await drag(0, 65);
    let after = await read();
    assert.ok((before.direction[1] - after.direction[1]) * sign > 0.1, mode + ": vertical drag follows the selected mode");
    console.log("ok  " + mode + ": down drag matches the preference");
    before = after;
    await drag(0, -65);
    after = await read();
    assert.ok((after.direction[1] - before.direction[1]) * sign > 0.1, mode + ": up drag follows the selected mode");
    console.log("ok  " + mode + ": up drag matches the preference");
    for (const [dx, turnSign, label] of [[-65, -1, "left"], [65, 1, "right"]]) {
      before = await read();
      await drag(dx, 0);
      after = await read();
      const right = [-before.direction[2], 0, before.direction[0]];
      const turn = after.direction.reduce((sum, value, i) => sum + value * right[i], 0);
      assert.ok(turn * turnSign * sign > 0.1, mode + ": " + label + " drag follows the selected mode");
      console.log("ok  " + mode + ": " + label + " drag matches the preference");
    }
    assert.deepEqual(after.position, start.position, "looking must not move the person");
  }
  console.log("ok  both modes change the view without walking");
  assert.deepEqual(errors, [], "no page errors");
  console.log("ok  no page errors");
} finally {
  await browser.close();
}
