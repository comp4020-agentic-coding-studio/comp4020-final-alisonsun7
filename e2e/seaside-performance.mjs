#!/usr/bin/env node
// Native Chrome/Metal developer inspection, not a listening or human-playtest verdict.
// Only this fresh scratch database may receive UI writes. No SQL writes, seeded
// identities, injected audio, position changes, clocks or visibility events.
// APP_URL=http://localhost:18952 SCRATCH_DB=.cache/seaside-performance/browser/history.db
// node e2e/seaside-performance.mjs .cache/seaside-performance/browser-artifacts
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
import {createHash} from "node:crypto";
const frogRevision=createHash("sha256").update(readFileSync("public/assets/sounds/pond-frogs.mp3")).digest("hex").slice(0,12);

const address = new URL(process.env.APP_URL ?? "");
assert.equal(address.protocol, "http:");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname));
assert.equal(address.port, "18952", "Only the isolated combined candidate may receive UI writes");
assert.equal(address.pathname, "/");
assert.ok(!address.search && !address.hash && !address.username && !address.password);
assert.ok(process.env.SCRATCH_DB, "Supply the candidate's exact fresh scratch database");
const dbPath = realpathSync(resolve(process.env.SCRATCH_DB));
assert.equal(dbPath, resolve(".cache/seaside-performance/browser/history.db"));
const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = () => db.prepare("SELECT * FROM placed_sounds ORDER BY id").all();
assert.equal(rows().length, 0, "Preserve any previous run; use a fresh isolated database");
const analysisOnly=process.env.AUDIO_SINK==="none";
const base = address.origin, out = process.argv[2];assert.ok(out);mkdirSync(out, { recursive: true });
const report = { kind: "seaside-performance-native-chrome-developer-inspection", base, dbPath,
  audioSink:analysisOnly?"none (native silent analysis sink)":"default",
  limitations: [analysisOnly?"Native silent sink checks software rendering, not device output":"Default native output requested", "No human listening, pleasantness or playtest claim", "No page-visibility test", "Output analyser taps real WebAudio; no signal or timing is fabricated"],
  checks: [], captures: [], observations: [], sources: [], errors: [], requests: [], runtimeAssets: [], recordings: [], passed: false };
const check = (value, label) => { assert.ok(value, label);report.checks.push(label);console.log("ok " + label); };
const people = [];
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });

async function state(page) {
  return page.locator("#planet-stage").evaluate(stage => {
    const json = name => JSON.parse(stage.dataset[name] ?? "null");
    return { ground: json("groundSafety"), busker: json("busker"), water: json("waterlife"),
      soundOn: stage.dataset.soundOn, buskerVoice: stage.dataset.buskerVoice, voices: stage.dataset.voices,
      audioState: stage.dataset.audioState, watching: stage.dataset.watchingSound, sounds: stage.dataset.sounds,
      serverNow: Number(stage.dataset.serverNow), audio: window.__seasideMetrics(),
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
}
async function settled(page) {
  const frame = await page.locator("#planet-stage").evaluate(stage => JSON.parse(stage.dataset.groundSafety).frame);
  await page.waitForFunction(previous => JSON.parse(document.getElementById("planet-stage").dataset.groundSafety).frame > previous + 1, frame);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function shot(who, name) {
  await settled(who.page);const actual = await state(who.page);
  report.captures.push({ name, identity: who.name, capturedAt: new Date().toISOString(), ...actual });
  await who.page.screenshot({ path: `${out}/${name}.png`, fullPage: false });return actual;
}
const ready = page => page.waitForFunction(() => !!document.getElementById("planet-stage")?.dataset.groundSafety && !document.querySelector("dialog:modal"));
async function contextPage(name, href = "/planet") {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true, reducedMotion: "no-preference" });
  await context.addInitScript(analysisOnly => {
    const Native = window.AudioContext, native = Function.prototype.toString.call(Native).includes("[native code]");
    const contexts = [], sources = [], decodes = [], gains = [], panners = [], connect = AudioNode.prototype.connect;
    // Observe the actual post-master/limiter output through a parallel analyser.
    AudioNode.prototype.connect = function(destination, ...args) {
      const result = connect.call(this, destination, ...args);
      if (destination === this.context.destination && this.context.__seasideMeter) connect.call(this, this.context.__seasideMeter);
      return result;
    };
    window.AudioContext = class extends Native {
      constructor(...args) { super(...(analysisOnly?[{...args[0],sinkId:{type:"none"}}]:args));this.__seasideMeter = this.createAnalyser();contexts.push(this); }
      createGain() {const node=super.createGain();gains.push(node);return node;}
      createPanner() {const node=super.createPanner();panners.push(node);return node;}
      createBufferSource() {
        const node = super.createBufferSource(), entry = { node, started: false, ended: false };
        const start = node.start.bind(node);node.start = (...args) => { const result = start(...args);entry.started = true;entry.args=args;entry.at=this.currentTime;return result; };
        node.addEventListener("ended", () => { entry.ended = true; });sources.push(entry);return node;
      }
      async decodeAudioData(...args) {
        const buffer = await super.decodeAudioData(...args), samples = buffer.getChannelData(0);
        let energy = 0;for (const sample of samples) energy += sample * sample;
        decodes.push({ duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, rms: Math.sqrt(energy / samples.length) });return buffer;
      }
    };
    window.__seasideMetrics = () => ({ native, contexts: contexts.map(context => {
      const samples = new Float32Array(context.__seasideMeter.fftSize);context.__seasideMeter.getFloatTimeDomainData(samples);
      return { state: context.state, currentTime:context.currentTime, sampleRate: context.sampleRate, rms: Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) };
    }), starts: sources.filter(source => source.started).length,
      active: sources.filter(source => source.started && !source.ended && source.node.context.state === "running").length,
      gains:gains.map(node=>node.gain.value),panners:panners.map(node=>({position:[node.positionX.value,node.positionY.value,node.positionZ.value],rolloff:node.rolloffFactor})),
      activeSources:sources.filter(source=>source.started&&!source.ended).map(source=>({duration:source.node.buffer?.duration,args:source.args,startedAt:source.at,currentTime:source.node.context.currentTime})), decodes: [...decodes] });
  },analysisOnly);
  const page = await context.newPage();page.setDefaultTimeout(18000);
  page.on("pageerror", error => report.errors.push(name + ": " + error.message));
  page.on("console", message => { if (message.type() === "error") report.errors.push(name + ": " + message.text()); });
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/client/")) report.runtimeAssets.push(url.pathname);
    if (!["GET", "HEAD"].includes(request.method())) report.requests.push({ identity: name, method: request.method(), path: url.pathname });
  });
  page.on("response", response => { const path = new URL(response.url()).pathname;if (path.startsWith("/assets/sounds/")) report.recordings.push({ identity: name, path, revision:new URL(response.url()).searchParams.get("v"), status: response.status() }); });
  const who = { name, context, page, lastWrite: 0 };people.push(who);await page.goto(base + href);return who;
}
async function join(who) {
  await who.page.locator("#planet-nickname").fill(who.name);await who.page.locator("#planet-enter").click();
  await who.page.getByRole("button", { name: "Explore quietly", exact: true }).click();await ready(who.page);
  const boot = await who.page.locator("#planet-boot").evaluate(element => JSON.parse(element.textContent));
  who.id = boot.snapshot.you.id;who.sessionId = boot.snapshot.sessionId;
  const actual = await state(who.page);
  check(actual.soundOn === "false" && actual.audio.starts === 0 && actual.audio.contexts.length === 0, who.name + " enters quietly without creating WebAudio");
}
async function exitWatch(who) {
  if (await who.page.locator("#planet-watch-exit").isVisible()) await who.page.locator("#planet-watch-exit").click();
}
async function travel(who, id) {
  await exitWatch(who);const direct = who.page.locator(`#chorus-travel [data-place="${id}"]`);
  if (await direct.isVisible()) await direct.click();
  else { await who.page.locator("#planet-tools").click();await who.page.locator(`#planet-destinations [data-zone="${id}"]`).click(); }
  await ready(who.page);await settled(who.page);
}
async function visitMateo(who) {
  await who.page.locator("#planet-tools").click();await who.page.locator("#planet-visit-mateo").click();await ready(who.page);
  await who.page.waitForFunction(() => {
    const actor = JSON.parse(document.getElementById("planet-stage").dataset.busker ?? "null");
    return actor?.screen.visible && actor.guitarScreen.visible && actor.guitarVisible;
  });await settled(who.page);
}
async function guitarClear(who) {
  await who.page.waitForFunction(() => {
    const stage = document.getElementById("planet-stage"), actor = JSON.parse(stage.dataset.busker ?? "null"), r = stage.getBoundingClientRect(), point = actor?.guitarScreen;
    return !!point?.visible && document.elementFromPoint(r.x + point.x, r.y + point.y)?.matches("canvas.planet-canvas");
  });
  check(true, "The actual projected guitar is clear of interface cards at " + (await state(who.page)).viewport.width + "px");
}
const voice = (who, expected) => who.page.waitForFunction(value => document.getElementById("planet-stage").dataset.buskerVoice === value, String(expected));
async function output(who) {
  await who.page.waitForFunction(() => window.__seasideMetrics().contexts.some(context => context.state === "running" && context.rms > .00001), null, { timeout: 8000, polling: 50 });
  const actual = await state(who.page);check(actual.audio.native, "Audio measurement uses the native AudioContext implementation");return actual.audio;
}
async function soundOff(who) {
  if ((await state(who.page)).soundOn === "true") await who.page.locator("#planet-sound").click();
  await voice(who, 0);await who.page.waitForFunction(() => window.__seasideMetrics().active === 0);
  await who.page.waitForFunction(() => window.__seasideMetrics().contexts.every(context => context.state !== "running" || context.rms <= .00001));
  check((await state(who.page)).soundOn === "false", "Sound off stops local sources without changing the shared work");
}
async function shared(who) {
  if (await who.page.locator("#planet-shared").isVisible()) await who.page.locator("#planet-shared").click();
  else { await who.page.locator("#planet-tools").click();await who.page.locator("#planet-open-soundscape").click(); }
  await who.page.locator("#planet-soundscape").waitFor({ state: "visible" });
}
async function closeShared(who) { await who.page.locator("#planet-soundscape").getByRole("button", { name: "Close", exact: true }).click();await ready(who.page); }
async function publish(who, id, parent = null, fullLibrary = false) {
  if (parent) { await shared(who);await who.page.locator(`#planet-soundscape [data-id="${parent.id}"] [data-planet-reply]`).click(); }
  else await who.page.locator("#planet-place").click();
  await who.page.locator("#chorus-studio").waitFor({ state: "visible" });
  const curated = who.page.locator(`#chorus-studio [data-leave="${id}"]`);
  if (fullLibrary || !await curated.isVisible()) {
    await who.page.getByRole("button", { name: "Explore every sound", exact: true }).click();
    await who.page.locator("#sound-palette").waitFor({ state: "visible" });
    await who.page.locator('#sound-palette input[type="search"]').fill({ guitar: "guitar", "pond-frogs": "Pond frogs", "pond-bubbles": "Pond bubbles" }[id]);
  }
  await who.page.waitForTimeout(Math.max(0, 1100 - (Date.now() - who.lastWrite)));
  const response = who.page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds`);
  if (await curated.isVisible()) await curated.click();else await who.page.locator(`#sound-palette button[data-sound="${id}"]`).click();
  const result = await (await response).json();assert.ok(result.ok, JSON.stringify(result));who.lastWrite = Date.now();await ready(who.page);
  assert.equal(result.sound.byId, who.id);assert.equal(result.sound.soundId, id);if (parent) assert.equal(result.sound.replyToId, parent.id);
  report.sources.push(result.sound);return result.sound;
}
async function remove(who, source) {
  assert.equal(source.byId, who.id);await who.page.waitForTimeout(Math.max(0, 1100 - (Date.now() - who.lastWrite)));await shared(who);
  const response = who.page.waitForResponse(response => response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith("/sounds/" + source.id));
  await who.page.locator(`#planet-soundscape [data-id="${source.id}"] [data-planet-remove]`).click();
  const result = await (await response).json();assert.ok(result.ok, JSON.stringify(result));who.lastWrite = Date.now();await closeShared(who);
}
async function water(who, source) {
  await who.page.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.waterlife ?? "[]").some(actor => actor.sourceId === id), source.id);
  const actor = (await state(who.page)).water.find(actor => actor.sourceId === source.id);assert.equal(actor.byId, source.byId);return actor;
}
async function reachable(who, selector) {
  return who.page.locator(selector).evaluate(element => {
    const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.width >= 44 && r.height >= 44 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && !!hit && element.contains(hit);
  });
}

try {
  const a = await contextPage("Seaside Ada", "/planet?view=2d");
  const redirect = await a.context.request.get(base + "/planet?view=2d", { maxRedirects: 0 });
  check(redirect.status() === 303 && redirect.headers().location === "/planet" && new URL(a.page.url()).pathname === "/planet" && !new URL(a.page.url()).searchParams.has("view"), "The retired 2D link really redirects 303 into the retained 3D world");
  await join(a);
  check(await a.page.locator("#planet-stage").getAttribute("data-presentation") === "3d" && await a.page.locator(".planet-presentations, #planet-presentations-settings").count() === 0, "Only the retained 3D presentation is offered");
  const flat = await Promise.all(["flat-world", "flat-art", "presentation-handoff"].map(id => a.context.request.get(base + "/client/" + id + ".js")));
  check(flat.every(response => response.status() === 404), "Retired renderers and presentation handoff have no runtime endpoints");
  report.graphics = await a.page.locator("canvas.planet-canvas").evaluate(canvas => { const gl = canvas.getContext("webgl2"), debug = gl.getExtension("WEBGL_debug_renderer_info");return { version: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }; });
  check(/metal/i.test(report.graphics.renderer) && !/swiftshader|llvmpipe|software/i.test(report.graphics.renderer), "The real 3D renderer runs on native Metal rather than software fallback");
  await visitMateo(a);await guitarClear(a);
  let actual = await state(a.page);report.observations.push({ label: "quiet-Mateo", state: actual });
  check(actual.busker.origin === "npc" && /Mateo.*NPC/.test(actual.busker.label) && await a.page.locator(".planet-person-label").filter({ hasText: "Mateo" }).count() === 1, "Mateo is explicitly labelled as an authored NPC with a visible physical guitar");
  check(actual.audio.starts === 0 && rows().length === 0, "Visiting the performer neither starts quiet audio nor invents a contribution");
  const beforePose = actual.busker.pose, beforePoseTime = Date.now();await a.page.waitForTimeout(120);
  await a.page.waitForFunction(pose => JSON.parse(document.getElementById("planet-stage").dataset.busker).pose !== pose, beforePose);
  report.observations.push({ label: "natural-strum-change", elapsedMs: Date.now() - beforePoseTime, beforePose, state: await state(a.page) });
  check(Date.now() - beforePoseTime >= 120, "Mateo's real server-timed pose changes without an injected clock");await shot(a, "mateo-quiet-desktop");
  await a.page.locator("#planet-sound").click();await voice(a, 1);report.observations.push({ label: "Mateo-native-output", audio: await output(a) });await shot(a, "mateo-playing-desktop");
  await soundOff(a);const offStarts = (await state(a.page)).audio.starts;
  const b = await contextPage("Seaside Bo");await join(b);await travel(b, "pool");
  check(a.id !== b.id && a.sessionId === b.sessionId && JSON.stringify(await a.context.cookies()) !== JSON.stringify(await b.context.cookies()), "Two independent cookie identities inhabit the same existing room");
  actual = await state(a.page);check(actual.soundOn === "false" && actual.audio.starts === offStarts && actual.audio.active === 0, "A late friend's arrival and travel cannot unmute Ada");
  await a.page.locator("#planet-sound").click();await voice(a, 1);await travel(a, "green");await voice(a, 0);
  check((await state(a.page)).soundOn === "true", "Walking to Green stops the out-of-range performer while retaining the local listening choice");
  await visitMateo(a);await voice(a, 1);await output(a);
  const beforeGuitar = (await state(a.page)).audio.starts;
  const guitar = await publish(a, "guitar", null, true);await voice(a, 0);
  await a.page.waitForFunction(starts => window.__seasideMetrics().starts > starts && window.__seasideMetrics().active > 0, beforeGuitar);await output(a);
  check(rows().length === 1 && rows()[0].placed_by === a.id && rows()[0].sound_id === "guitar", "An explicit full-library guitar publication belongs to Ada and makes Mateo yield");await shot(a, "player-guitar-desktop");
  await remove(a, guitar);await voice(a, 1);await output(a);
  check(rows().length === 1 && rows()[0].removed_at !== null, "Withdrawing the real guitar restores Mateo and retains its historical row");
  await a.page.setViewportSize({ width: 390, height: 844 });await settled(a.page);await guitarClear(a);
  check(await reachable(a, "#planet-place") && await reachable(a, "#planet-watch-exit") && !(await state(a.page)).overflow, "Phone sharing and observation-exit controls remain unobstructed 44px targets");await shot(a, "mateo-phone");

  await soundOff(a);await travel(a, "pool");await a.page.locator("#planet-place").click();
  const beforeListen = (await state(a.page)).audio;await a.page.locator('#chorus-studio [data-listen="pond-frogs"]').click();
  await a.page.waitForFunction(starts => window.__seasideMetrics().starts > starts, beforeListen.starts);const frogAudio = await output(a);
  check(frogAudio.decodes.slice(beforeListen.decodes.length).some(decoded => decoded.duration > 17.9 && decoded.duration < 18.1 && decoded.rms > .00001)
    && report.recordings.some(recording => recording.identity === a.name && recording.path === "/assets/sounds/pond-frogs.mp3" && recording.revision === frogRevision && recording.status === 200), "Private Listen genuinely fetches and decodes the current content-versioned eighteen-second pond chorus and emits native audio");
  check((await state(a.page)).soundOn === "false" && rows().length === 1, "A private frog listen neither enables world audio nor publishes a source");await shot(a, "pond-private-listen-phone");
  await a.page.locator("#chorus-studio").getByRole("button", { name: "Cancel", exact: true }).click();await ready(a.page);
  await a.page.waitForFunction(() => window.__seasideMetrics().active === 0);
  const frogs = await publish(a, "pond-frogs"), bubbles = await publish(b, "pond-bubbles", frogs);
  for (const source of [frogs, bubbles]) {
    const left = await water(a, source), right = await water(b, source);assert.equal(left.anchorX, right.anchorX);assert.equal(left.anchorZ, right.anchorZ);
    report.observations.push({ label: "shared-real-water-source", sourceId: source.id, Ada: left, Bo: right });
  }
  for (const who of [a, b]) {
    await shared(who);
    check((await who.page.locator(`#planet-soundscape [data-id="${frogs.id}"]`).textContent()).includes(a.name) && (await who.page.locator(`#planet-soundscape [data-id="${bubbles.id}"]`).textContent()).includes(b.name), who.name + " sees the actual authors of the frog and its bubble reply");
    await closeShared(who);
  }
  const reply = db.prepare("SELECT sound_id,parent_id FROM sound_replies WHERE sound_id=?").get(bubbles.id);assert.equal(reply.parent_id, frogs.id);report.replyRow = reply;
  check((await state(b.page)).audio.starts === 0 && (await state(b.page)).soundOn === "false", "Bo's real reply and all incoming changes preserve his original quiet choice");
  await shared(a);await a.page.locator(`#planet-soundscape [data-id="${frogs.id}"]`).getByRole("button", { name: "Watch the frogs", exact: true }).click();await ready(a.page);
  await a.page.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.waterlife).some(actor => actor.sourceId === id && actor.visible && actor.throat > .4), frogs.id, { timeout: 22000 });
  check(await reachable(a, "#planet-watch-exit") && !(await state(a.page)).overflow, "The real frog-chorus response fits the phone observation layout");await shot(a, "friends-pond-chorus-phone");
  await travel(b, "pool");await remove(b, bubbles);await travel(a, "pool");await remove(a, frogs);
  for (const who of [a, b]) await who.page.waitForFunction(() => JSON.parse(document.getElementById("planet-stage").dataset.waterlife ?? "[]").length === 0 && document.getElementById("planet-stage").dataset.sounds === "0");
  report.history = rows();
  check(report.history.length === 3 && report.history.every(source => source.removed_at !== null) && new Set(report.history.map(source => source.placed_by)).size === 2 && report.sources.length === 3, "Exactly three explicit publications remain as withdrawn history, without fabricated NPC sources");
  assert.equal(db.prepare("SELECT parent_id FROM sound_replies WHERE sound_id=?").get(bubbles.id).parent_id, frogs.id);
  for (const who of [a, b]) {
    await who.page.reload();await ready(who.page);const returned = await who.page.locator("#planet-boot").evaluate(element => JSON.parse(element.textContent));
    check(returned.snapshot.you.id === who.id && returned.snapshot.sessionId === who.sessionId && (await state(who.page)).water.length === 0 && (await state(who.page)).audio.starts === 0, who.name + " returns with the same identity, quiet audio and no revived withdrawn source");
  }
  await shot(a, "withdrawn-history-phone");
  check(!report.runtimeAssets.some(path => /flat-world|flat-art|presentation-handoff/.test(path)), "Neither real document loads a retired flat renderer");
  assert.deepEqual(report.errors, []);check(true, "Native rendering and real audio decoding produce no browser or shader errors");report.passed = true;
} catch (error) {
  report.failure = error.stack ?? String(error);
  for (const who of people) if (!who.page.isClosed()) {
    const name = "failure-" + who.name.replaceAll(" ", "-");
    report.captures.push({ name, identity: who.name, capturedAt: new Date().toISOString(), ...await state(who.page).catch(() => ({ unreadableState: true })) });
    await who.page.screenshot({ path: `${out}/${name}.png`, fullPage: false }).catch(() => {});
  }
  throw error;
} finally { await browser.close();db.close();writeFileSync(`${out}/results.json`, JSON.stringify(report, null, 2) + "\n"); }
