#!/usr/bin/env node
// Read-only public smoke test. Never join, publish, chat, move an authenticated
// player, change weather, or use the writing e2e harness on a public world.
import assert from "node:assert/strict";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const address = new URL(process.env.APP_URL ?? "");
assert.equal(address.protocol, "https:");
assert.ok(["little-chorus-playtest-20261108.crazylife5.chatgpt.site", "comp4020-final-alisonsun7.fly.dev"].includes(address.hostname), "Only the explicitly named Sites test or existing Fly origin is allowed");
assert.equal(address.pathname, "/");
assert.ok(!address.port && !address.username && !address.password && !address.search && !address.hash);
const base = address.origin;
const out = join(dirname(fileURLToPath(import.meta.url)), "public-smoke-" + address.hostname + "-" + new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(out, {recursive: true});
const report = {
  kind: "read-only-public-native-Chrome-Metal-observer-smoke", base, startedAt: new Date().toISOString(),
  limitations: ["Anonymous read-only observers are not two real contributing players", "No public join, authored contribution, shared reply, chat, deletion, weather change or database write is exercised", "Quiet browsing does not establish audible device output or artistic listening quality", "Snapshots of an empty world cannot validate persisted authored works"],
  browser: null, checks: [], contexts: [], captures: [], requests: [], responses: [],
  writesAttempted: [], pageErrors: [], consoleErrors: [], failedRuntimeRequests: [], passed: false,
};
const check = (value, label) => {assert.ok(value, label);report.checks.push(label);console.log("ok " + label);};
const browser = await chromium.launch({channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"]});
report.browser = browser.version();
const visitors = [];
let closing = false;
const publicIds = snapshot => snapshot.sounds.filter(s => !s.whileIn && !s.removedAt).map(s => s.id).sort();
const runtimePath = url => {const u = new URL(url);return u.origin === base && (u.pathname.startsWith("/client/") || u.pathname.startsWith("/vendor/") || u.pathname.startsWith("/assets/") || /\.(?:js|css|mjs|png|jpe?g|webp|mp3|ogg|oga|glb|gltf|hdr)$/.test(u.pathname));};

async function makeVisitor(name, viewport, phone = false) {
  const context = await browser.newContext({viewport, hasTouch: phone, isMobile: phone, reducedMotion: "no-preference", serviceWorkers: "block"});
  // This guard is installed before any page exists. A forbidden attempt is a
  // failing observation even though it is aborted before reaching the server.
  await context.route("**/*", async route => {
    const request = route.request(), u = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) {
      report.writesAttempted.push({context: name, method: request.method(), origin: u.origin, path: u.pathname});
      await route.abort("blockedbyclient");return;
    }
    await route.continue();
  });
  await context.addInitScript(() => {
    const NativeEventSource = window.EventSource;
    window.__publicReadOnlyStreams = [];
    window.EventSource = class extends NativeEventSource {
      constructor(...args) {
        super(...args);
        const log = {url: this.url, opens: 0, errors: 0, messages: []};
        window.__publicReadOnlyStreams.push(log);
        this.addEventListener("open", () => {log.opens++;});
        this.addEventListener("error", () => {log.errors++;});
        this.addEventListener("message", event => {
          // Record protocol shape and real timing, never conversation text.
          try {const msg = JSON.parse(event.data);log.messages.push({type: msg.type, sessionId: msg.sessionId, serverNow: msg.serverNow ?? null, sourceIds: msg.sounds ? msg.sounds.filter(s => !s.whileIn && !s.removedAt).map(s => s.id).sort() : undefined, sourceId: msg.type === "sound-left" && !msg.sound.whileIn && !msg.sound.removedAt ? msg.sound.id : msg.type === "sound-removed" ? msg.id : undefined});if (log.messages.length > 500) log.messages.splice(1, 1);} catch {log.messages.push({invalidJSON: true});}
        });
      }
    };
  });
  const page = await context.newPage();page.setDefaultTimeout(25000);
  page.on("pageerror", error => report.pageErrors.push({context: name, error: error.message}));
  page.on("console", msg => {if (msg.type() === "error") report.consoleErrors.push({context: name, error: msg.text()});});
  page.on("request", request => {
    const u = new URL(request.url());report.requests.push({context: name, method: request.method(), origin: u.origin, path: u.pathname, type: request.resourceType()});
  });
  page.on("response", response => {
    const request = response.request(), u = new URL(response.url());
    report.responses.push({context: name, path: u.pathname, status: response.status(), type: request.resourceType(), contentType: response.headers()["content-type"] ?? null});
    if (runtimePath(response.url()) && response.status() >= 400) report.failedRuntimeRequests.push({context: name, path: u.pathname, status: response.status()});
  });
  page.on("requestfailed", request => {
    if (!closing && runtimePath(request.url())) report.failedRuntimeRequests.push({context: name, path: new URL(request.url()).pathname, failure: request.failure()?.errorText});
  });
  const who = {name, context, page, viewport};visitors.push(who);
  const navigation = await page.goto(base + "/planet", {waitUntil: "domcontentloaded"});
  check(navigation?.status() === 200 && new URL(page.url()).origin === base, name + " loads the actual public planet with HTTP 200");
  await page.locator("#planet-join[open]").waitFor({state: "visible"});
  check(await page.locator("#planet-join-title").innerText() === "A little room for you." && await page.locator("#planet-observe").isVisible(), name + " receives the real first-entry invitation and an anonymous observation choice");
  who.boot = await page.locator("#planet-boot").evaluate(e => JSON.parse(e.textContent));
  check(who.boot.joined === false && who.boot.snapshot.you === null, name + " is a fresh anonymous observer, not a fabricated player");
  check(who.boot.view === "3d" && who.boot.snapshot.sceneId === "planet", name + " receives the retained 3D planet edition");
  return who;
}
async function state(who) {
  return who.page.locator("#planet-stage").evaluate(stage => {
    const j = key => {try {return JSON.parse(stage.dataset[key] ?? "null");} catch {return null;}};
    const canvas = stage.querySelector("canvas.planet-canvas");
    return {presentation: stage.dataset.presentation, soundOn: stage.dataset.soundOn, audioState: stage.dataset.audioState,
      renderScale: Number(stage.dataset.renderScale), triangles: Number(stage.dataset.triangles), calls: Number(stage.dataset.calls),
      ground: j("groundSafety"), serverNow: Number(stage.dataset.serverNow), busker: j("busker"), watching: stage.dataset.watchingSound,
      canvas: canvas ? {width: canvas.width, height: canvas.height, css: {width: canvas.clientWidth, height: canvas.clientHeight}} : null,
      viewport: {width: innerWidth, height: innerHeight}, overflow: document.documentElement.scrollWidth > innerWidth + 1,
      streams: window.__publicReadOnlyStreams};
  });
}
async function settled(who) {
  await who.page.waitForFunction(() => {const s = document.getElementById("planet-stage");return !!s?.dataset.groundSafety && Number(s.dataset.triangles) > 0 && !document.querySelector("dialog:modal");});
  const first = (await state(who)).ground.frame;
  await who.page.waitForFunction(frame => JSON.parse(document.getElementById("planet-stage").dataset.groundSafety).frame > frame + 2, first);
}
async function shot(who, name) {
  const file = join(out, name + ".png");await who.page.screenshot({path: file, fullPage: false});
  report.captures.push({name, context: who.name, file, capturedAt: new Date().toISOString(), state: await state(who)});
}
async function observe(who) {
  await who.page.locator("#planet-observe").click();await settled(who);
  const before = await state(who);await who.page.waitForTimeout(500);await settled(who);const after = await state(who);
  check(after.soundOn === "false" && after.canvas.width > 0 && after.canvas.height > 0 && after.triangles > 0 && after.calls > 0, who.name + " renders actual 3D canvas geometry while respecting quiet browsing");
  check(after.ground.frame > before.ground.frame && after.serverNow > before.serverNow, who.name + " advances genuine rendered frames and the anchored world clock");
  check(!after.overflow, who.name + " has no horizontal viewport overflow");
}
async function nativeStream(who) {
  await who.page.waitForFunction(() => window.__publicReadOnlyStreams.some(s => s.opens > 0 && s.messages.some(m => m.type === "snapshot")), null, {timeout: 25000});
  const observed = (await state(who)).streams.find(s => new URL(s.url).pathname === "/api/stream");
  const snap = observed.messages.find(m => m.type === "snapshot");
  check(observed.opens > 0 && snap.sessionId === who.boot.snapshot.sessionId, who.name + " opens the product's real native SSE and receives the same authoritative room");
  return observed;
}
async function heartbeat(who) {
  // A second strictly read-only stream observes wire comments, which native
  // EventSource correctly hides from message listeners. Never replace messages.
  const wire = await who.page.evaluate(async () => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 24000);
    const result = {status: null, contentType: null, heartbeat: false, snapshot: null, updates: [], elapsedMs: null};
    const start = performance.now();let reader;
    try {
      const response = await fetch("/api/stream?scene=planet&mode=weekday", {method: "GET", cache: "no-store", signal: controller.signal});
      result.status = response.status;result.contentType = response.headers.get("content-type");reader = response.body.getReader();
      const decoder = new TextDecoder();let carry = "";
      while (!result.heartbeat) {
        const {done, value} = await reader.read();if (done) break;carry += decoder.decode(value, {stream: true});
        let end;
        while ((end = carry.indexOf("\n\n")) !== -1) {
          const packet = carry.slice(0, end);carry = carry.slice(end + 2);
          if (packet.includes(": keep-alive")) result.heartbeat = true;
          for (const line of packet.split("\n")) if (line.startsWith("data: ")) {
            const message = JSON.parse(line.slice(6)), safe = {type: message.type, sessionId: message.sessionId, serverNow: message.serverNow ?? null};
            if (message.type === "snapshot") {safe.sourceIds = message.sounds.filter(s => !s.whileIn && !s.removedAt).map(s => s.id).sort();result.snapshot = safe;}
            else if (result.updates.length < 8) result.updates.push(safe);
          }
        }
      }
    } catch (error) {result.error = error.message;}
    finally {result.elapsedMs = performance.now() - start;clearTimeout(timer);try {await reader?.cancel();} catch {}controller.abort();}
    return result;
  });
  check(wire.status === 200 && wire.contentType?.startsWith("text/event-stream") && wire.heartbeat, who.name + " receives a genuine SSE keep-alive from the public server");
  check(wire.snapshot?.sessionId === who.boot.snapshot.sessionId, who.name + " heartbeat stream retains the same shared world");
  return wire;
}

try {
  const desktop = await makeVisitor("desktop-anonymous", {width: 1920, height: 1080});
  await shot(desktop, "entry-desktop");await observe(desktop);await nativeStream(desktop);await shot(desktop, "quiet-3d-desktop");
  const phone = await makeVisitor("phone-anonymous", {width: 390, height: 844}, true);
  await observe(phone);await nativeStream(phone);
  check(desktop.context !== phone.context, "Desktop and phone use two isolated browser contexts");
  check(desktop.boot.snapshot.sessionId === phone.boot.snapshot.sessionId, "Both independent anonymous contexts receive the same real shared session");
  report.sharedInitial = {sessionId: desktop.boot.snapshot.sessionId, desktopSourceIds: publicIds(desktop.boot.snapshot), phoneSourceIds: publicIds(phone.boot.snapshot), joined: false};
  await phone.page.locator("#planet-tools").click();
  await phone.page.locator("#planet-tools-panel[open]").waitFor({state: "visible"});
  const visit = phone.page.locator("#planet-visit-mateo");await visit.scrollIntoViewIfNeeded();
  check(await visit.isVisible() && await visit.isEnabled(), "Phone Places & friends exposes the actual Visit Mateo action");
  await visit.click();await settled(phone);
  await phone.page.waitForFunction(() => {const a = JSON.parse(document.getElementById("planet-stage").dataset.busker ?? "null");return a?.screen.visible && a.guitarScreen.visible && a.guitarVisible;});
  const beforePose = (await state(phone)).busker.pose;
  await phone.page.waitForFunction(pose => JSON.parse(document.getElementById("planet-stage").dataset.busker).pose !== pose, beforePose);
  const actualPhone = await state(phone);
  check(actualPhone.watching === "performer" && actualPhone.soundOn === "false" && !actualPhone.overflow, "Phone can actually visit the moving seaside guitarist without enabling sound or overflowing");
  const clearGuitar = await phone.page.locator("#planet-stage").evaluate(stage => {const a = JSON.parse(stage.dataset.busker), r = stage.getBoundingClientRect();return !!document.elementFromPoint(r.x + a.guitarScreen.x, r.y + a.guitarScreen.y)?.matches("canvas.planet-canvas");});
  check(clearGuitar, "Mateo's real projected guitar is clear of obstructing phone cards");
  await shot(phone, "mateo-phone");
  const heartbeatResults = await Promise.all(visitors.map(heartbeat));
  for (let i = 0; i < visitors.length; i++) {
    const who = visitors[i], final = await state(who), cookies = await who.context.cookies();
    const snapshots = final.streams.flatMap(s => s.messages.filter(m => m.type === "snapshot"));
    for (const snapshot of snapshots) assert.equal(snapshot.sessionId, who.boot.snapshot.sessionId);
    let sourceIds = new Set(publicIds(who.boot.snapshot));
    for (const stream of final.streams) for (const message of stream.messages) {
      if (message.type === "snapshot") sourceIds = new Set(message.sourceIds);
      if (message.type === "sound-left" && message.sourceId) sourceIds.add(message.sourceId);
      if (message.type === "sound-removed" && message.sourceId) sourceIds.delete(message.sourceId);
    }
    report.contexts.push({name: who.name, viewport: who.viewport, joined: who.boot.joined, you: who.boot.snapshot.you, sessionId: who.boot.snapshot.sessionId, initialSourceIds: publicIds(who.boot.snapshot), cookieNamesOnly: cookies.map(c => c.name), nativeSSE: final.streams, heartbeat: heartbeatResults[i], final});
    report.contexts.at(-1).finalPublicSourceIds = [...sourceIds].sort();
  }
  assert.deepEqual(report.contexts[0].finalPublicSourceIds, report.contexts[1].finalPublicSourceIds);
  check(true, "Both real SSE observers agree on the latest public source IDs, including any genuine live changes (an empty set remains empty)");
  check(report.responses.filter(r => r.path === "/api/stream").every(r => r.status === 200 && r.contentType?.startsWith("text/event-stream")), "All actual public SSE connections return successful stream responses");
  check(report.writesAttempted.length === 0 && report.requests.every(r => ["GET", "HEAD"].includes(r.method)), "No write request was attempted; the global guard stayed active throughout");
  assert.deepEqual(report.pageErrors, []);assert.deepEqual(report.consoleErrors, []);assert.deepEqual(report.failedRuntimeRequests, []);
  check(true, "No browser page errors, console errors, failed JavaScript or failed runtime assets were observed");
  report.passed = true;
} catch (error) {
  report.failure = {name: error.name, message: error.message, stack: error.stack};process.exitCode = 1;
  for (const who of visitors) {try {await who.page.screenshot({path: join(out, "failure-" + who.name + ".png")});} catch {}}
} finally {
  closing = true;await browser.close();report.finishedAt = new Date().toISOString();
  writeFileSync(join(out, "results.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({passed: report.passed, base, out, checks: report.checks.length, writesAttempted: report.writesAttempted.length, failure: report.failure?.message ?? null}));
}
