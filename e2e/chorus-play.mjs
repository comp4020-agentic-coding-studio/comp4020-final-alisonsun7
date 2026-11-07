#!/usr/bin/env node
// Restored play and immediate shared-sound responses in Little Chorus.
// LOCAL SCRATCH server only; normal UI writes and verified soft-removal.
// APP_URL=http://localhost:18882 APP_BUILD=.cache/chorus-build/dist node e2e/chorus-play.mjs [shotsDir]
// CHORUS_PREFLIGHT_ONLY=1 checks the new selectors before joining/publishing.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const { PLANET_PLACES, planetDistance } = await import(pathToFileURL(resolve(process.env.APP_BUILD ?? "dist", "shared/planet.js")).href);
const base = process.env.APP_URL ?? "http://localhost:8080";
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "Chorus checks require a local scratch server");
assert.notEqual(address.port, "18861", "Never run browser-writing checks on the working preview");
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const people = [], made = [], errors = [];
let assertionFailed = false;
const check = (value, label) => { assert.ok(value, label); console.log("ok  " + label); };
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const at = page => page.locator("#planet-stage").evaluate(stage => stage.dataset.at.split(",").map(Number));
const point = coordinates => ({ x: coordinates[0], z: coordinates[1] });
const pin = (page, id) => page.locator(`.planet-sound-pin[data-id="${id}"]`);
const nearby = page => page.locator("#planet-nearby-sound");
const card = (page, id) => page.locator(`.planet-sound-card[data-id="${id}"]`);
const tools = page => page.locator("#planet-tools-panel");
const shared = page => page.locator("#planet-soundscape");
const threads = page => page.locator("#planet-stage").evaluate(stage => Number(stage.dataset.replyThreads));
const publicSounds = snapshot => snapshot.sounds.filter(sound => !sound.whileIn && !sound.removedAt);

async function snapshot(who, path = "/planet") {
  const response = await who.context.request.get(base + path);
  assert.ok(response.ok(), `Could not read actual snapshot (${response.status()})`);
  const match = (await response.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, "Snapshot must come from the server's actual boot payload");
  return JSON.parse(match[1]).snapshot;
}

async function person(name, avatar, preflight = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => {
    localStorage.setItem("soundfolk-view", "third");
    localStorage.setItem("soac-sound", "off");
    window.__chorusAudioStarts = 0;
    window.__chorusStreams = [];
    const Audio = window.AudioContext;
    window.AudioContext = class extends Audio {
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => { window.__chorusAudioStarts++; return start(...args); };
        return source;
      }
    };
    // Keep references solely to close a real stream for the missed-event test.
    // No snapshot, event, request or server response is fabricated.
    const Stream = window.EventSource;
    window.EventSource = class extends Stream {
      constructor(...args) { super(...args); window.__chorusStreams.push(this); }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const who = { context, page, name, sessionId: null, posts: 0, moves: [] };
  people.push(who);
  page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
  page.on("request", request => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (/\/sounds$/.test(path)) who.posts++;
    if (/\/move$/.test(path)) {
      try { who.moves.push({ request, time: Date.now(), position: request.postDataJSON(), accepted: false }); } catch { /* no invented sample */ }
    }
  });
  page.on("response", async response => {
    const sample = who.moves.find(sample => sample.request === response.request());
    if (!sample) return;
    try { sample.accepted = response.ok() && (await response.json()).ok === true; } catch { /* unconfirmed movement is excluded */ }
  });
  await page.goto(base + "/planet");
  if (preflight) {
    // The old planet fails before joining or placing any contribution.
    assert.equal(await page.locator("#planet-run").count(), 1, "Run must remain a first-class control in the new world");
    assert.equal(await page.locator("#planet-jump").count(), 1, "Jump must remain a first-class control in the new world");
    if (process.env.CHORUS_PREFLIGHT_ONLY === "1") return who;
  }
  await page.locator("#planet-join").waitFor({ state: "visible" });
  who.sessionId = await page.locator("#planet-boot").evaluate(boot => JSON.parse(boot.textContent).snapshot.sessionId);
  await page.fill('#planet-join-form input[name="nickname"]', name);
  await page.check(`#planet-join-form input[value="${avatar}"]`, { force: true });
  await page.click("#planet-enter");
  await page.locator("#planet-join").waitFor({ state: "hidden" });
  await page.waitForFunction(() => !!document.getElementById("planet-stage").dataset.at);
  return who;
}

async function openTools(page) {
  if (!await tools(page).evaluate(dialog => dialog.open)) await page.locator("#planet-tools").click();
  await tools(page).waitFor({ state: "visible" });
}

async function goTo(page, id) {
  await openTools(page);
  const target = await page.evaluate(async id => {
    const { PLANET_PLACES } = await import("/shared/planet.js");
    const place = PLANET_PLACES.find(place => place.id === id);
    return { x: place.x, z: place.z + (place.kind === "tea" ? 3 : 0) };
  }, id);
  await page.locator(`#planet-destinations [data-zone="${id}"]`).click();
  await page.waitForFunction(target => {
    const dialog = document.getElementById("planet-tools-panel");
    const position = document.getElementById("planet-stage").dataset.at?.split(",").map(Number);
    return !dialog.open && dialog.hidden && position && Math.hypot(position[0] - target.x, position[1] - target.z) < .03;
  }, target);
  await page.waitForTimeout(250);
}

// The existing destination is temporarily used as a route fixture, just as
// the original hut/seam checks do. Its authored data is restored immediately.
// Movement, collision, admission and every command remain production code.
async function arriveOnGreen(page, x = 1.8, z = 2.2) {
  const original = await page.evaluate(async ({ x, z }) => {
    const { PLANET_PLACES } = await import("/shared/planet.js");
    const place = PLANET_PLACES.find(place => place.id === "green");
    const before = { x: place.x, z: place.z }; Object.assign(place, { x, z }); return before;
  }, { x, z });
  try { await goTo(page, "green"); }
  finally {
    await page.evaluate(async original => {
      const { PLANET_PLACES } = await import("/shared/planet.js");
      Object.assign(PLANET_PLACES.find(place => place.id === "green"), original);
    }, original);
  }
}

async function place(who, soundId, open = true) {
  if (open) await who.page.locator("#planet-place").click();
  const waiting = who.page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds`);
  await who.page.locator(`#sound-palette [data-sound="${soundId}"]`).click();
  const response = await waiting, result = await response.json();
  assert.ok(response.ok() && result.ok && result.sound, `Actual placement failed: ${JSON.stringify(result)}`);
  made.push({ who, sound: result.sound });
  await who.page.locator("#sound-palette").waitFor({ state: "hidden" });
  return result.sound;
}

async function openShared(page) {
  if (!await shared(page).evaluate(dialog => dialog.open)) await page.locator("#planet-shared").click();
  await shared(page).waitFor({ state: "visible" });
}

async function closeDialog(page, id) {
  if (await page.locator(id).evaluate(dialog => dialog.open)) await page.keyboard.press("Escape");
  await page.waitForFunction(id => !document.querySelector(id).open, id);
  await page.waitForTimeout(100);
}

async function selectSound(page, id) {
  await pin(page, id).waitFor({ state: "visible" });
  await pin(page, id).click();
  await page.waitForFunction(id => document.getElementById("planet-nearby-sound").dataset.id === id, id);
}

async function measureTravel(who, observer, running) {
  await arriveOnGreen(who.page);
  const first = who.moves.length;
  await who.page.locator("canvas.planet-canvas").focus();
  const started = Date.now();
  if (running) await who.page.keyboard.down("Shift");
  await who.page.keyboard.down("w");
  try {
    if (running) await observer.page.waitForFunction(name => JSON.parse(document.getElementById("planet-stage").dataset.players ?? "[]")
      .some(player => player.name === name && player.running), who.name);
    await who.page.waitForTimeout(1500);
  } finally {
    await who.page.keyboard.up("w");
    if (running) await who.page.keyboard.up("Shift");
  }
  const stopped = Date.now();
  const samples = who.moves.slice(first).filter(sample => sample.accepted && sample.time >= started + 120 && sample.time <= stopped - 80);
  assert.ok(samples.length >= 3, "Measure actual accepted-position reports over several movement frames");
  const from = samples[0], to = samples.at(-1);
  return { speed: planetDistance(from.position, to.position) / ((to.time - from.time) / 1000), samples: samples.length };
}

async function run() {
  const ada = await person("Chorus Ada", "cat", true);
  if (process.env.CHORUS_PREFLIGHT_ONLY === "1") { check(true, "new movement selectors exist before joining or publishing"); return; }
  const bo = await person("Chorus Bo", "dog");
  const a = ada.page, b = bo.page;
  const coastBefore = (await snapshot(ada, "/scene/seaside")).sounds;
  await a.waitForFunction(() => document.getElementById("planet-stage").dataset.people === "2");
  const initial = await snapshot(ada);
  check(/little\s*chorus/i.test(await a.title()), "the running product uses the new Little Chorus name");
  check(initial.online.map(person => person.name).sort().join("|") === [ada.name, bo.name].sort().join("|"),
    "the real room contains two human identities and does not count its NPCs as friends");

  const walk = await measureTravel(ada, bo, false);
  const run = await measureTravel(ada, bo, true);
  console.log("Measured spherical speeds: " + JSON.stringify({ walk, run }));
  check(walk.speed > 1 && run.speed > walk.speed * 1.5, "Shift + W really runs faster than walking over the same authored route");
  check(ada.posts === 0 && bo.posts === 0, "running and observing a friend never creates a sound contribution");
  await a.locator("#planet-run").click();
  await a.waitForFunction(() => document.getElementById("planet-run").getAttribute("aria-pressed") === "true");
  await openTools(a);
  await a.waitForFunction(() => document.getElementById("planet-run").getAttribute("aria-pressed") === "false");
  await closeDialog(a, "#planet-tools-panel");
  check(await a.locator("#planet-run").getAttribute("aria-pressed") === "false", "opening Places resets both running and its visible pressed state");
  // Chrome's headless pages all retain real document focus/visibility when
  // bringToFront switches tabs. Do not invent a blur event or call it covered.
  console.log("not run  native tab-blur reset (headless Chrome emits no actual tab blur)");
  await openTools(a);
  await a.locator("#planet-chat-toggle").click();
  await a.locator("#planet-chat").waitFor({ state: "visible" });
  await openTools(a);
  await closeDialog(a, "#planet-tools-panel");
  const chattingAt = await at(a);
  await a.locator("canvas.planet-canvas").focus();
  await a.keyboard.down("w");
  try { await a.waitForTimeout(500); } finally { await a.keyboard.up("w"); }
  check(planetDistance(point(chattingAt), point(await at(a))) < .03 && await a.locator("#planet-chat").isVisible(),
    "closing Places while chat remains open keeps actual W movement paused");
  await a.locator("#planet-chat-close").click();
  await arriveOnGreen(a);
  const beforeJump = await at(a);
  const remoteGround = await (await b.waitForFunction(({ name, at }) => {
    const player = JSON.parse(document.getElementById("planet-stage").dataset.players ?? "[]").find(player => player.name === name);
    return player && Math.hypot(player.x - at[0], player.z - at[1]) < .05 && player.jump < .02 ? player.radius : false;
  }, { name: ada.name, at: beforeJump })).jsonValue();
  const localJump = a.waitForFunction(() => {
    const data = document.getElementById("planet-stage").dataset, height = Number(data.jumpHeight);
    return height > .2 ? { height, body: Number(data.renderedSelfRadius), ground: Number(data.surfaceRadius) } : false;
  });
  const remoteJump = b.waitForFunction(name => {
    const player = JSON.parse(document.getElementById("planet-stage").dataset.players ?? "[]").find(player => player.name === name);
    return player?.jump > .15 ? { jump: player.jump, radius: player.radius } : false;
  }, ada.name);
  await a.locator("canvas.planet-canvas").focus();
  await a.keyboard.press("Space");
  const jump = await (await localJump).jsonValue();
  const remote = await (await remoteJump).jsonValue();
  check(jump.body - jump.ground > .2 && Math.abs(jump.body - jump.ground - jump.height) < .08
    && remote.radius - remoteGround > .15 && Math.abs(remote.radius - remoteGround - remote.jump) < .08,
    "Space raises the actual local body radially above its ground and the other person receives the rendered jump");
  await a.waitForFunction(() => document.getElementById("planet-stage").dataset.grounded === "true"
    && Number(document.getElementById("planet-stage").dataset.jumpHeight) < .02);
  await b.waitForFunction(name => JSON.parse(document.getElementById("planet-stage").dataset.players ?? "[]")
    .some(player => player.name === name && player.jump < .02), ada.name);
  check(planetDistance(point(beforeJump), point(await at(a))) < .03, "a stationary jump lands without changing the admitted horizontal position");

  await goTo(a, "green");
  await a.locator("#planet-interact").waitFor({ state: "visible" });
  const beforeRoo = publicSounds(await snapshot(ada)).map(sound => sound.id).sort();
  await a.locator("canvas.planet-canvas").focus();
  await a.keyboard.press("e");
  await a.waitForFunction(() => JSON.parse(document.getElementById("planet-stage").dataset.kangaroo ?? "{}").phase === "following");
  await a.locator("#planet-interact").click();
  await a.waitForFunction(() => {
    const roo = JSON.parse(document.getElementById("planet-stage").dataset.kangaroo ?? "{}");
    return roo.phase === "playing" && roo.height > .1;
  });
  check(true, "the nearby kangaroo responds to the actual E action and play button with a real hop");
  await shot(a, "chorus-kangaroo-play");
  await a.locator("#planet-interact").click();
  await a.waitForFunction(() => JSON.parse(document.getElementById("planet-stage").dataset.kangaroo ?? "{}").phase === "resting");
  assert.deepEqual(publicSounds(await snapshot(ada)).map(sound => sound.id).sort(), beforeRoo);
  check(await a.locator("#planet-stage").getAttribute("data-people") === "2", "the local kangaroo encounter neither invents people nor publishes public sounds");

  const sea = await a.evaluate(async () => {
    const { buildPlanet } = await import("/client/planet-build.js");
    const build = buildPlanet();
    try {
      const names = ["soundfolk-coast", "soundfolk-ocean", "soundfolk-beach", "soundfolk-pier", "soundfolk-tide-channel"];
      return names.map(name => {
        const object = build.root.getObjectByName(name);
        let vertices = 0;
        object?.traverse(part => { if (part.isMesh) vertices += part.geometry.getAttribute("position")?.count ?? 0; });
        return { name, exists: !!object, visible: !!object?.visible, vertices };
      });
    } finally { build.dispose(); }
  });
  check(sea.every(part => part.exists && part.visible && part.vertices > 0), "the production geometry contains a real ocean, beach, pier and tidal channel");
  await goTo(a, PLANET_PLACES.find(place => place.kind === "pool").id);
  await a.waitForFunction(() => document.getElementById("planet-stage").dataset.sea === "true");
  await shot(a, "chorus-coast-and-sea");
  check(true, "the real renderer exposes its visible sea rather than replacing the coast with a decorative caption");

  await goTo(a, "green");
  await arriveOnGreen(b);
  const source = await place(ada, "guitar");
  await selectSound(b, source.id);
  check((await pin(b, source.id).textContent()).includes(ada.name), "a real in-world sound pin names the recording's human author");
  const beforeRespond = bo.posts;
  await nearby(b).locator("[data-respond]").click();
  await b.locator("#sound-palette").waitFor({ state: "visible" });
  check(await b.locator("#sound-palette").evaluate(dialog => dialog.matches(":modal"))
    && (await b.locator("#sound-library-reply").textContent()).includes(ada.name) && bo.posts === beforeRespond,
    "Respond to sound directly opens a native contextual library without automatically posting");
  const beforeThread = await threads(b);
  const answer = await place(bo, "hand-claps", false);
  check(answer.replyTo?.id === source.id && answer.replyTo?.by === ada.name, "an explicit reply commits the real source relationship through the existing server API");
  await Promise.all([a, b].map(page => page.waitForFunction(before => Number(document.getElementById("planet-stage").dataset.replyThreads) > before, beforeThread)));
  check(true, "the two real contribution endpoints create a canonical 3D reply thread in both browsers");
  await selectSound(b, answer.id);
  await b.locator("#planet-conversation").click();
  await b.locator("#sound-conversation").waitFor({ state: "visible" });
  await b.locator("#sound-conversation").filter({ hasText: ada.name }).filter({ hasText: bo.name }).waitFor();
  check(await b.locator("#sound-conversation").evaluate(dialog => dialog.matches(":modal")), "Conversation restores the real durable thread and both authors in a native dialog");
  await shot(b, "chorus-sound-conversation");
  await closeDialog(b, "#sound-conversation");

  await arriveOnGreen(b, 0, 6);
  await selectSound(b, source.id);
  await b.locator("#planet-conversation").click();
  const walkingFrom = await at(b), beforeVisit = bo.posts;
  await b.locator(`#sound-conversation .conversation-sound[data-id="${source.id}"]`).getByRole("button", { name: "Walk toward sound", exact: true }).click();
  await b.locator("#sound-conversation").waitFor({ state: "hidden" });
  await b.waitForFunction(() => document.getElementById("planet-stage").dataset.walkingIntent === "true");
  await b.waitForFunction(from => {
    const at = document.getElementById("planet-stage").dataset.at.split(",").map(Number);
    return Math.hypot(at[0] - from[0], at[1] - from[1]) > .15;
  }, walkingFrom);
  check(planetDistance(point(await at(b)), source) < planetDistance(point(walkingFrom), source) && bo.posts === beforeVisit
    && await b.locator("canvas.planet-canvas").evaluate(canvas => document.activeElement === canvas),
    "Conversation's native close finishes before Walk toward sound moves and returns keyboard control");
  await b.keyboard.press("s");
  await b.waitForFunction(() => document.getElementById("planet-stage").dataset.walkingIntent === "false");

  await arriveOnGreen(b, 0, 6);
  await selectSound(b, source.id);
  const beforeIntent = bo.posts;
  const approachFrom = await at(b);
  await nearby(b).locator("[data-respond]").click();
  await b.locator("#planet-reply-intent").waitFor({ state: "visible" });
  await b.waitForFunction(() => document.getElementById("planet-stage").dataset.walkingIntent === "true");
  await b.waitForFunction(from => {
    const at = document.getElementById("planet-stage").dataset.at.split(",").map(Number);
    return Math.hypot(at[0] - from[0], at[1] - from[1]) > .15;
  }, approachFrom);
  check(bo.posts === beforeIntent && planetDistance(point(await at(b)), source) < planetDistance(point(approachFrom), source)
    && await b.locator("canvas.planet-canvas").evaluate(canvas => document.activeElement === canvas),
    "choosing a distant response walks toward its source with keyboard control and no fabricated reply");
  if (await b.locator("#sound-palette").isVisible()) await closeDialog(b, "#sound-palette");
  await b.locator("#planet-reply-cancel").click();
  await b.locator("#planet-reply-intent").waitFor({ state: "hidden" });
  await b.waitForFunction(() => document.getElementById("planet-stage").dataset.walkingIntent === "false");
  // Position diagnostics are refreshed every twelve render frames, whereas
  // walkingIntent changes every frame. Sample the actual stopped frame first.
  const cancelledFrame = await b.locator("#planet-stage").evaluate(stage => Number(stage.dataset.serverNow));
  await b.waitForFunction(frame => Number(document.getElementById("planet-stage").dataset.serverNow) > frame, cancelledFrame);
  const cancelledAt = await at(b);
  await b.waitForTimeout(350);
  const stoppedAt = await at(b);
  console.log("Stopped response samples: " + JSON.stringify({ cancelledAt, stoppedAt, postsBefore: beforeIntent, postsAfter: bo.posts }));
  check(bo.posts === beforeIntent && planetDistance(point(cancelledAt), point(stoppedAt)) < .04
    && await b.locator("canvas.planet-canvas").evaluate(canvas => document.activeElement === canvas),
    "cancelling a walking response stops the real character, restores keyboard control and never publishes its draft");
  await arriveOnGreen(b, 0, 6);
  await selectSound(b, source.id);
  await nearby(b).locator("[data-respond]").click();
  await b.waitForFunction(() => document.getElementById("planet-stage").dataset.walkingIntent === "true");
  assert.ok(await b.locator("canvas.planet-canvas").evaluate(canvas => document.activeElement === canvas), "Distant Respond must return actual keyboard focus before manual cancellation");
  // A manual keydown cancels automatic travel immediately, even when a quick
  // tap begins and ends between render frames.
  await b.keyboard.press("s");
  await b.waitForFunction(() => document.getElementById("planet-stage").dataset.walkingIntent === "false");
  await b.keyboard.down("w");
  try {
    await b.waitForFunction(source => {
      const at = document.getElementById("planet-stage").dataset.at.split(",").map(Number);
      return Math.hypot(at[0] - source.x, at[1] - source.z) < 3.6;
    }, source);
  } finally { await b.keyboard.up("w"); }
  check(!await b.locator("#sound-palette").isVisible() && await b.locator("#planet-reply-intent").isVisible() && bo.posts === beforeIntent,
    "manual movement cancels automatic response travel and does not open the library merely by walking nearby later");
  await b.locator("#planet-reply-cancel").click();
  await b.locator("#planet-reply-intent").waitFor({ state: "hidden" });
  await arriveOnGreen(b);
  if (await b.locator("#planet-sound").getAttribute("aria-pressed") === "true") await b.locator("#planet-sound").click();
  const silence = await b.evaluate(() => window.__chorusAudioStarts);
  await a.waitForTimeout(1100);
  await place(ada, "cafe-music");
  await b.waitForTimeout(1200);
  check(await b.locator("#planet-sound").getAttribute("aria-pressed") === "false"
    && await b.locator("#planet-stage").getAttribute("data-voices") === "0"
    && await b.evaluate(() => window.__chorusAudioStarts) === silence,
    "another friend's sound does not turn on audio or start a decoded recording for a muted listener");

  // Miss an actual removal, then recover through a real fresh server snapshot.
  const closed = await b.evaluate(() => {
    const sources = window.__chorusStreams.filter(source => source.url.includes("scene=planet") && source.readyState !== EventSource.CLOSED);
    for (const source of sources) source.close();
    return sources.length;
  });
  assert.ok(closed > 0, "The test must close a real active stream rather than pretending a removal was missed");
  await openShared(a);
  const removing = a.waitForResponse(response => response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith("/sounds/" + source.id));
  await card(a, source.id).locator("[data-planet-remove]").click();
  assert.ok((await (await removing).json()).ok, "Normal in-reach removal must be accepted");
  await a.waitForFunction(id => !document.querySelector(`.planet-sound-pin[data-id="${id}"]`), source.id);
  check(await pin(b, source.id).count() === 1, "the disconnected page actually misses the source removal");
  await closeDialog(a, "#planet-soundscape");
  await b.reload();
  await b.waitForFunction(() => !!document.getElementById("planet-stage").dataset.at);
  await b.waitForFunction(({ source, answer }) => !document.querySelector(`.planet-sound-pin[data-id="${source}"]`)
    && !!document.querySelector(`.planet-sound-pin[data-id="${answer}"]`), { source: source.id, answer: answer.id });
  await selectSound(b, answer.id);
  await b.locator("#planet-conversation").click();
  await b.locator("#sound-conversation").filter({ hasText: ada.name }).filter({ hasText: /removed/i }).waitFor();
  check((await snapshot(bo)).sounds.find(sound => sound.id === answer.id)?.replyTo?.removedAt,
    "reconnection clears the removed source while preserving the real child's conversation and removed-parent metadata");
  await closeDialog(b, "#sound-conversation");
  await b.waitForFunction(() => Number(document.getElementById("planet-stage").dataset.replyThreads) === 0);
  check(true, "removing a parent clears its live 3D arc without deleting its friend's answer");

  await b.setViewportSize({ width: 390, height: 844 });
  await selectSound(b, answer.id);
  const phone = await b.evaluate(() => {
    const selectors = ["#planet-run", "#planet-jump", "#planet-place", "#planet-nearby-sound [data-respond]", "#planet-conversation", ".planet-touch button"];
    const buttons = selectors.flatMap(selector => [...document.querySelectorAll(selector)]);
    return buttons.map(button => {
      const rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { label: button.getAttribute("aria-label") ?? button.textContent, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        operable: !button.disabled && rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && !!hit && button.contains(hit) };
    });
  });
  check(phone.length === 9 && phone.every(button => button.operable), "phone movement, running, jump, sound response and conversation each have a reachable forty-four-pixel target");
  const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  check(phone.every((a, index) => phone.slice(index + 1).every(b => !overlap(a, b))), "the core phone actions do not overlap or cover one another");
  await shot(b, "chorus-phone-play-and-respond");
  const phonePosts = bo.posts;
  await b.locator("#planet-run").click();
  check(await b.locator("#planet-run").getAttribute("aria-pressed") === "true", "phone running is an explicit remembered toggle for the current play session");
  await b.locator("#planet-run").click();
  await b.locator("#planet-jump").click();
  await b.waitForFunction(() => Number(document.getElementById("planet-stage").dataset.jumpHeight) > .15);
  check(bo.posts === phonePosts, "the actual phone jump raises the character without publishing a sound");
  await b.waitForFunction(() => document.getElementById("planet-stage").dataset.grounded === "true");
  await nearby(b).locator("[data-respond]").click();
  await b.locator("#sound-palette").waitFor({ state: "visible" });
  for (const key of [...Array(28).fill("Tab"), ...Array(8).fill("Shift+Tab")]) {
    await b.keyboard.press(key);
    assert.ok(await b.locator("#sound-palette").evaluate(dialog => dialog.contains(document.activeElement)), "Native response library focus must not escape");
  }
  await closeDialog(b, "#sound-palette");
  check(bo.posts === phonePosts, "phone Respond is keyboard-safe and still requires explicit confirmation to leave a sound");
  assert.deepEqual((await snapshot(ada, "/scene/seaside")).sounds, coastBefore, "Restored planet play must preserve the existing coastal sound data");
  check(true, "the original coast retains exactly the same persistent contributions");
  check(errors.length === 0, "no browser errors: " + errors.join(" | "));
}

try { await run(); }
catch (error) {
  assertionFailed = true;
  for (const { page, name } of people) if (!page.isClosed()) await shot(page, "failure-" + name.replaceAll(" ", "-")).catch(() => undefined);
  throw error;
} finally {
  const cleanupErrors = [];
  await Promise.all(people.map(({ page }) => page.close().catch(() => undefined)));
  for (const { who, sound } of made) {
    await new Promise(resolve => setTimeout(resolve, 1100));
    try {
      const move = await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
      const moved = await move.json();
      assert.ok(move.ok() && moved.ok, `Cleanup move failed: ${JSON.stringify(moved)}`);
      const response = await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`), result = await response.json();
      assert.ok((response.ok() && result.ok) || result.code === "gone", `Cleanup removal failed: ${JSON.stringify(result)}`);
    } catch (error) { cleanupErrors.push(new Error(`Cleanup ${sound.id}: ${error.message}`, { cause: error })); }
  }
  if (made.length) {
    try {
      const current = await snapshot(made[0].who), ids = new Set(made.map(({ sound }) => sound.id));
      assert.deepEqual(current.sounds.filter(sound => ids.has(sound.id) && !sound.removedAt).map(sound => sound.id), [], "All new ordinary contributions must be soft-removed through the real API");
      check(true, "the final actual snapshot confirms cleanup of every test-created contribution");
    } catch (error) { cleanupErrors.push(new Error(`Cleanup verification: ${error.message}`, { cause: error })); }
  }
  await browser.close();
  for (const error of cleanupErrors) console.error(error.message);
  if (cleanupErrors.length && !assertionFailed) throw new AggregateError(cleanupErrors, "Chorus play cleanup failed");
}
