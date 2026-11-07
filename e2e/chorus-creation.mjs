#!/usr/bin/env node
// Automated developer verification, not an unprompted novice/friend study.
// Normal UI writes on an isolated LOCAL database; never the working preview.
// APP_URL=http://localhost:18885 node e2e/chorus-creation.mjs [screenshots-dir]
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.APP_URL ?? "http://localhost:8080";
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "Creation checks need a local scratch server");
assert.notEqual(address.port, "18861", "Never write tests into the player's working preview");
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const people = [], made = [], errors = [], results = [];
let failed = false, releaseHeld = null;
const check = (condition, label, detail) => {
  assert.ok(condition, label); results.push({ label, ...(detail ? { detail } : {}) }); console.log("ok  " + label);
};
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const stageData = (page, key) => page.locator("#planet-stage").evaluate((stage, key) => stage.dataset[key], key);
const at = async page => (await stageData(page, "at")).split(",").map(Number);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
async function snapshot(who, path = "/planet") {
  const response = await who.context.request.get(base + path);
  assert.ok(response.ok(), `Snapshot HTTP ${response.status()}`);
  const match = (await response.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, "Read the actual server boot snapshot"); return JSON.parse(match[1]).snapshot;
}
async function ready(page) {
  await page.waitForFunction(() => !!document.getElementById("planet-stage")?.dataset.at && !document.querySelector("dialog:modal") && !document.getElementById("chorus-primary")?.disabled);
}
async function person(name, avatar, sound) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: !sound });
  await context.addInitScript(() => {
    // Observe real browser nodes; do not fabricate samples, snapshots or sound.
    window.__creationStarts = [];
    window.__creationStreams = [];
    window.__creationSnapshots = 0;
    window.__creationDroppedEvents = [];
    const Stream = window.EventSource;
    window.EventSource = class extends Stream {
      constructor(...arguments_) {
        super(...arguments_);window.__creationStreams.push(this);
        this.addEventListener("message", event => {
          try { if (JSON.parse(event.data).type === "snapshot") window.__creationSnapshots++; } catch { }
        });
      }
    };
    const Audio = window.AudioContext;
    window.AudioContext = class extends Audio {
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => {
          window.__creationStarts.push({ loop: source.loop, duration: source.buffer?.duration, arguments: args, now: this.currentTime });
          return start(...args);
        };
        return source;
      }
    };
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const who = { context, page, name, sessionId: null, participantId: null, posts: 0 };
  people.push(who);
  page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
  page.on("request", request => { if (request.method() === "POST" && /\/sounds$/.test(new URL(request.url()).pathname)) who.posts++; });
  await page.goto(base + "/planet");
  await page.locator("#planet-join").waitFor({ state: "visible" });
  await page.fill('#planet-join-form input[name="nickname"]', name);
  await page.check(`#planet-join-form input[value="${avatar}"]`, { force: true });
  await page.locator("#planet-enter").click();
  await page.locator("#chorus-welcome").waitFor({ state: "visible" });
  await page.locator("#chorus-welcome").getByRole("button", { name: sound ? "Enter with sound" : "Explore quietly", exact: true }).click();
  await ready(page);
  const initial = await snapshot(who);who.sessionId = initial.sessionId;who.participantId = initial.you.id;
  return who;
}
async function openStudio(who) {
  await who.page.locator("#chorus-primary").click();
  await who.page.locator("#chorus-studio").waitFor({ state: "visible" });
  assert.ok(await who.page.locator("#chorus-studio").evaluate(dialog => dialog.matches(":modal")));
}
async function leave(who, soundId) {
  const waiting = who.page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds`);
  await who.page.locator(`#chorus-studio [data-leave="${soundId}"]`).click();
  const response = await waiting, ackAt = Date.now(), result = await response.json();
  assert.ok(response.ok() && result.ok && result.sound, `Real UI contribution failed: ${JSON.stringify(result)}`);
  made.push({ who, sound: result.sound });
  await who.page.locator("#chorus-studio").waitFor({ state: "hidden" });
  return { sound: result.sound, result, ackAt };
}
async function waitWork(page, id, duet) {
  await page.waitForFunction(({ id, duet }) => {
    const stage = document.getElementById("planet-stage"), dock = document.getElementById("chorus-work");
    const sculpture = JSON.parse(stage.dataset.chorusGardens ?? "[]").find(work => work.workId === id);
    return dock.dataset.work === id && dock.dataset.duet === String(duet) && sculpture && sculpture.duet === duet && sculpture.open === Number(duet);
  }, { id, duet });
}
async function journal(page, root) {
  await page.locator("#chorus-our-works").click();
  await page.locator("#chorus-journal").waitFor({ state: "visible" });
  return page.locator(`#chorus-journal [data-work="${root}"]`);
}
async function closeDialog(page, selector) {
  await page.keyboard.press("Escape");
  await page.waitForFunction(selector => !document.querySelector(selector).open, selector);
  await page.waitForTimeout(80); // Native close callbacks are queued events.
}
async function buttonMetrics(page, selectors) {
  return page.evaluate(selectors => selectors.flatMap(selector => [...document.querySelectorAll(selector)]).map(button => {
    const r = button.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { text: button.getAttribute("aria-label") ?? button.textContent, x: r.x, y: r.y, width: r.width, height: r.height,
      usable: !button.disabled && r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && !!hit && button.contains(hit) };
  }), selectors);
}
async function travel(page, place, touch = false) {
  const choice = page.locator(`#chorus-travel [data-place="${place}"]`);
  if (touch) await choice.tap();else await choice.click();
  await page.waitForFunction(async id => {
    const { PLANET_PLACES } = await import("/shared/planet.js"), place = PLANET_PLACES.find(place => place.id === id);
    const position = document.getElementById("planet-stage").dataset.at?.split(",").map(Number);
    const green = place.kind === "green", front = green ? 2.2 : place.kind === "stage" || place.kind === "reading" ? 4 : place.kind === "tea" ? 3 : 0;
    return position && Math.hypot(position[0] - place.x - (green ? 1.8 : 0), position[1] - place.z - front) < .03;
  }, place);
}

async function readingArt() {
  const ada = await person("Reading Ada", "cat", true), bo = await person("Reading Bo", "dog", false);
  const a = ada.page, b = bo.page, baseline = await snapshot(ada), coast = (await snapshot(ada, "/scene/seaside")).sounds;
  await travel(a, "reading");await travel(b, "reading");
  await b.locator("canvas.planet-canvas").focus();await b.keyboard.down("d");await b.waitForTimeout(200);await b.keyboard.up("d");await b.waitForTimeout(220);
  await a.locator("#chorus-our-works").click();await a.locator("#chorus-new-work").click();
  await a.locator("#chorus-studio").waitFor({ state: "visible" });const water = await leave(ada, "trickle");
  await Promise.all([waitWork(a, water.sound.id, false), waitWork(b, water.sound.id, false)]);
  await openStudio(bo);const birds = await leave(bo, "gentle-breeze");
  await Promise.all([waitWork(a, water.sound.id, true), waitWork(b, water.sound.id, true)]);
  const forms = await Promise.all([a, b].map(async page => JSON.parse(await stageData(page, "chorusGardens")).find(work => work.workId === water.sound.id)));
  assert.deepEqual(forms.map(form => ({ id: form.workId, sourceIds: form.sourceIds, duet: form.duet, variant: form.variant }))[0],
    forms.map(form => ({ id: form.workId, sourceIds: form.sourceIds, duet: form.duet, variant: form.variant }))[1]);
  check(forms.every(form => form.variant === "habitat" && form.duet && form.sourceIds.length === 2) && birds.sound.replyToId === water.sound.id,
    "two independent browsers produce the same real water-and-bird canopy after the porch art shift");
  await shot(a, "chorus-reading-visible-desktop");
  await b.setViewportSize({ width: 390, height: 844 });await b.waitForTimeout(200);
  const targets = await buttonMetrics(b, ["#chorus-primary", "#chorus-our-works", "#planet-sound", "#planet-run", "#planet-jump", ".planet-touch button"]);
  check(targets.length === 9 && targets.every(button => button.usable), "Reading Nook's real phone work and movement controls remain reachable after the art shift", targets);
  await shot(b, "chorus-reading-visible-phone");
  const posts = bo.posts;await b.locator("#chorus-primary").tap();await b.locator("#chorus-studio").waitFor({ state: "visible" });
  await b.locator("#chorus-studio [data-listen]").first().tap();
  await b.locator("#chorus-studio [data-listen]").first().filter({ hasText: "Stop" }).waitFor();
  await b.locator("#chorus-studio").getByRole("button", { name: "Cancel", exact: true }).tap();
  await b.locator("#chorus-studio").waitFor({ state: "hidden" });
  check(bo.posts === posts && await stageData(b, "soundOn") === "false", "Reading Nook touch Listen and Cancel preserve the quiet preference and require an explicit shared contribution");
  for (const place of ["green", "stage"]) {
    await travel(a, place);await travel(b, place, true);
    await b.locator("canvas.planet-canvas").focus();await b.keyboard.down(place === "stage" ? "a" : "d");await b.waitForTimeout(200);await b.keyboard.up(place === "stage" ? "a" : "d");await b.waitForTimeout(220);
    await a.waitForTimeout(1100);await openStudio(ada);const melody = await leave(ada, "chorus-chords");
    await Promise.all([waitWork(a, melody.sound.id, false), waitWork(b, melody.sound.id, false)]);
    await openStudio(bo);await leave(bo, "chorus-pulse");
    await Promise.all([waitWork(a, melody.sound.id, true), waitWork(b, melody.sound.id, true)]);
    const portrait = await buttonMetrics(b, ["#chorus-primary", "#chorus-our-works", "#planet-sound", "#planet-run", "#planet-jump", ".planet-touch button"]);
    check(portrait.length === 9 && portrait.every(button => button.usable), `${place}'s actual portrait work, movement and sound controls remain reachable`, portrait);
    await shot(a, `chorus-portrait-${place}-desktop`);await shot(b, `chorus-portrait-${place}-phone`);
  }
  const beforeTouch = await at(b), back = await b.locator(".planet-move-back").boundingBox(), touch = await bo.context.newCDPSession(b);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: back.x + back.width / 2, y: back.y + back.height / 2 }] });
  await b.waitForTimeout(220);await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });await touch.detach();
  await b.waitForFunction(before => { const p = document.getElementById("planet-stage").dataset.at.split(",").map(Number);return Math.hypot(p[0] - before[0], p[1] - before[1]) > .15; }, beforeTouch);
  await travel(b, "stage", true);await b.locator("#planet-jump").tap();await b.waitForFunction(() => Number(document.getElementById("planet-stage").dataset.jumpHeight) > .15);
  await b.waitForFunction(() => document.getElementById("planet-stage").dataset.grounded === "true");
  check(await stageData(b, "soundOn") === "false", "after the portrait camera change, actual touch movement, place travel and jumping still work without undoing mute");
  assert.deepEqual((await snapshot(ada)).sounds.filter(sound => !made.some(item => item.sound.id === sound.id)), baseline.sounds);
  assert.deepEqual((await snapshot(ada, "/scene/seaside")).sounds, coast);
  check(errors.length === 0, "the targeted real reading flow preserves all existing sources and has no browser errors", errors);
}

async function run() {
  if (process.env.CHORUS_READING_ART_ONLY === "1") return readingArt();
  const ada = await person("Creation Ada", "cat", true), bo = await person("Creation Bo", "dog", false);
  const a = ada.page, b = bo.page;
  // The friends choose two nearby spots through real controls, rather than
  // leaving their bodies superimposed at the common arrival position.
  await b.locator("canvas.planet-canvas").focus();await b.keyboard.down("d");
  await b.waitForTimeout(350);await b.keyboard.up("d");
  await b.waitForFunction(() => Number(document.getElementById("planet-stage").dataset.at.split(",")[0]) > 2.4);
  const runFrom = await at(a), remoteRun = b.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.players ?? "[]")
    .some(player => player.id === id && player.running), ada.participantId);
  await a.locator("canvas.planet-canvas").focus();await a.keyboard.down("Shift");await a.keyboard.down("w");
  await a.waitForTimeout(420);await a.keyboard.up("w");await a.keyboard.up("Shift");await remoteRun;
  const runTo = await at(a);
  check(Math.hypot(runTo[0] - runFrom[0], runTo[1] - runFrom[1]) > .8,
    "Shift plus movement changes the actual ground position and the friend receives the running pose");
  await a.keyboard.down("Shift");await a.keyboard.down("s");await a.waitForTimeout(420);await a.keyboard.up("s");await a.keyboard.up("Shift");
  await a.waitForTimeout(280);
  const ground = Number(await stageData(a, "surfaceRadius"));
  const localJump = a.waitForFunction(ground => Number(document.getElementById("planet-stage").dataset.jumpHeight) > .18
    && Number(document.getElementById("planet-stage").dataset.renderedSelfRadius) > ground + .18, ground);
  const remoteJump = b.waitForFunction(({ id, ground }) => JSON.parse(document.getElementById("planet-stage").dataset.players ?? "[]")
    .some(player => player.id === id && player.jump > .15 && player.radius > ground + .15), { id: ada.participantId, ground });
  await a.keyboard.press("Space");await Promise.all([localJump, remoteJump]);
  await a.waitForFunction(() => document.getElementById("planet-stage").dataset.grounded === "true");
  check(true, "Space lifts the real local body above its ground and the other browser renders the shared jump before landing");
  const coast = (await snapshot(ada, "/scene/seaside")).sounds;
  const before = await snapshot(ada), baselineIds = before.sounds.map(sound => sound.id).sort();
  const audibleBaseline = await a.evaluate(async sources => {
    const { planetDistance } = await import("/shared/planet.js");
    const { planetHearingRadius } = await import("/client/planet-audio.js");
    const [x, z] = document.getElementById("planet-stage").dataset.at.split(",").map(Number);
    return sources.filter(source => !source.removedAt && planetDistance(source, { x, z }) < planetHearingRadius(source)).map(source => source.id);
  }, before.sounds);
  await a.waitForFunction(count => Number(document.getElementById("planet-stage").dataset.voices) === count, audibleBaseline.length);
  assert.ok(!before.chorus.some(work => work.placeId === "green" && work.liveSources.length), "Scratch Listening Green must be clear before this test begins");
  assert.notEqual(ada.participantId, bo.participantId);
  const aCookie = (await ada.context.cookies()).find(cookie => cookie.name === "soac_session");
  const bCookie = (await bo.context.cookies()).find(cookie => cookie.name === "soac_session");
  check(aCookie?.value && bCookie?.value && aCookie.value !== bCookie.value, "two independent cookie identities, rather than two shared-cookie tabs, enter the actual world");
  await a.waitForFunction(() => document.getElementById("planet-stage").dataset.people === "2");
  check(await stageData(a, "soundOn") === "true" && await stageData(b, "soundOn") === "false", "the welcome offers a sounding visit and a genuinely quiet visit");

  await openStudio(ada);
  const privatePosts = ada.posts;
  await a.locator('[data-listen="chorus-chords"]').focus();await a.keyboard.press("Enter");
  await a.locator('[data-listen="chorus-chords"]').filter({ hasText: "Stop" }).waitFor();
  check(ada.posts === privatePosts && (await a.evaluate(() => window.__creationStarts)).some(start => !start.loop), "keyboard Listen starts a real private buffer without publishing anything");
  const pausedAt = await at(a);
  await a.keyboard.down("w");await a.waitForTimeout(260);await a.keyboard.up("w");
  assert.ok(Math.hypot(...(await at(a)).map((value, index) => value - pausedAt[index])) < .03);
  for (const key of [...Array(15).fill("Tab"), ...Array(6).fill("Shift+Tab")]) {
    await a.keyboard.press(key);
    assert.ok(await a.locator("#chorus-studio").evaluate(dialog => dialog.contains(document.activeElement)), "studio keyboard focus stays inside its native dialog");
  }
  check(true, "the native studio traps keyboard focus and movement keys do not move the character behind it");
  const first = await leave(ada, "chorus-chords");
  await Promise.all([waitWork(a, first.sound.id, false), waitWork(b, first.sound.id, false)]);
  const solo = JSON.parse(await stageData(a, "chorusGardens")).find(work => work.workId === first.sound.id);
  check(solo.sourceIds.length === 1 && solo.sourceIds[0] === first.sound.id && !solo.duet, "the first real ingredient visibly grows one attributed source and leaves room for a friend's answer");
  const soloRender = { calls: Number(await stageData(a, "calls")), triangles: Number(await stageData(a, "triangles")) };
  await shot(a, "chorus-creation-desktop-solo");
  const quietStarts = await b.evaluate(() => window.__creationStarts.length);
  check(quietStarts === 0, "the friend's first contribution leaves the quiet browser silent");

  await openStudio(bo);
  check((await b.locator("#chorus-answering").textContent()).includes("Creation Ada") && (await b.locator("#chorus-answering").textContent()).includes("Warm chords"), "the reply names the actual friend and the exact ingredient being answered");
  const observedAt = a.waitForFunction(id => document.getElementById("chorus-work").dataset.work === id && document.getElementById("chorus-work").dataset.duet === "true", first.sound.id).then(() => Date.now());
  const answer = await leave(bo, "chorus-pulse");
  const latencyMs = Math.max(0, await observedAt - answer.ackAt);
  check(latencyMs <= 1000, "the other open session sees the shared duet within one second of the accepted reply", { latencyMs });
  await Promise.all([waitWork(a, first.sound.id, true), waitWork(b, first.sound.id, true)]);
  const actual = await snapshot(ada), shared = actual.chorus.find(work => work.id === first.sound.id);
  assert.equal(answer.sound.replyToId, first.sound.id);
  check(shared.variant === "ensemble" && shared.duet && shared.contributors.map(person => person.id).sort().join("|") === [ada.participantId, bo.participantId].sort().join("|"), "the server's durable reply chain forms one ensemble work with the two real contributors");
  const forms = await Promise.all([a, b].map(async page => JSON.parse(await stageData(page, "chorusGardens")).find(work => work.workId === first.sound.id)));
  assert.deepEqual(forms.map(form => ({ variant: form.variant, duet: form.duet, sourceIds: form.sourceIds, contributors: form.contributors, open: form.open }))[0], forms.map(form => ({ variant: form.variant, duet: form.duet, sourceIds: form.sourceIds, contributors: form.contributors, open: form.open }))[1]);
  await a.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.chorusResidents ?? "[]").some(resident => resident.workId === id && resident.variant === "ensemble" && resident.npc), first.sound.id);
  const duetRender = { calls: Number(await stageData(a, "calls")), triangles: Number(await stageData(a, "triangles")) };
  check(duetRender.calls > soloRender.calls + 5 && duetRender.triangles > soloRender.triangles,
    "the actual renderer draws additional sculptural geometry after the duet, with solo and duet screenshots retained", { soloRender, duetRender });
  await a.waitForFunction(count => Number(document.getElementById("planet-stage").dataset.voices) === count, audibleBaseline.length + 3);
  const realStarts = await a.evaluate(() => window.__creationStarts.filter(start => start.loop && Math.abs(start.duration - 10 / 3) < .001));
  check(realStarts.length >= 3 && realStarts.every(start => start.arguments[0] >= start.now && Math.abs(start.duration - 10 / 3) < .001), "the real sounding browser schedules three compatible bar-aligned voices, including the duet's derived harmony");
  check(await b.evaluate(() => window.__creationStarts.length) === quietStarts && await stageData(b, "voices") === "0", "forming the duet changes the quiet visitor's world and residents without starting local audio");
  await shot(a, "chorus-creation-desktop-duet");

  const extra = await ada.context.newPage();extra.on("pageerror", error => errors.push(`shared-cookie tab: ${error.message}`));
  await extra.goto(base + "/planet");await ready(extra);
  const sameIdentity = await snapshot({ context: ada.context });
  check(sameIdentity.you.id === ada.participantId && sameIdentity.online.length === 2 && shared.contributors.length === 2,
    "an extra shared-cookie tab stays the same person and cannot supply a third contributor");
  await extra.close();
  await b.reload();await ready(b);await waitWork(b, first.sound.id, true);
  const returning = (await snapshot(bo)).chorus.find(work => work.id === first.sound.id);
  check(returning.sources.length === 2 && returning.sources[1].replyToId === first.sound.id && returning.contributors.length === 2 && (await snapshot(bo)).you.id === bo.participantId,
    "a real reload restores the same work, identity, source relationship and both original authors");

  await b.setViewportSize({ width: 390, height: 844 });
  await b.waitForTimeout(180);
  const phone = await buttonMetrics(b, ["#chorus-primary", "#chorus-our-works", "#planet-sound", "#planet-run", "#planet-jump", ".planet-touch button"]);
  check(phone.length === 9 && phone.every(button => button.usable), "at 390 × 844, contribution, records, mute, run, jump and all four movement directions have reachable 44px targets", phone);
  const overlap = (left, right) => left.x < right.x + right.width && right.x < left.x + left.width && left.y < right.y + right.height && right.y < left.y + left.height;
  check(phone.every((button, index) => phone.slice(index + 1).every(other => !overlap(button, other))), "the phone's essential buttons do not overlap");
  check(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), "the scoring phone viewport has no horizontal page overflow");
  await shot(b, "chorus-creation-phone-work");
  const phoneBefore = await at(b), move = await b.locator(".planet-move-back").boundingBox();
  const touch = await bo.context.newCDPSession(b);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: move.x + move.width / 2, y: move.y + move.height / 2 }] });
  await b.waitForTimeout(350);await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });await touch.detach();
  await b.waitForFunction(before => {
    const p = document.getElementById("planet-stage").dataset.at.split(",").map(Number);return Math.hypot(p[0] - before[0], p[1] - before[1]) > .25;
  }, phoneBefore);
  await b.locator('#chorus-travel [data-place="green"]').tap();
  await b.waitForFunction(() => { const p = document.getElementById("planet-stage").dataset.at.split(",").map(Number);return Math.hypot(p[0] - 1.8, p[1] - 2.2) < .03; });
  await b.locator("#planet-jump").tap();await b.waitForFunction(() => Number(document.getElementById("planet-stage").dataset.jumpHeight) > .15);
  await b.waitForFunction(() => document.getElementById("planet-stage").dataset.grounded === "true");
  check(true, "real touch input moves the phone character, returns through a place button and performs a real jump");

  await b.locator("#chorus-primary").tap();await b.locator("#chorus-studio").waitFor({ state: "visible" });
  const phoneStudioPosts = bo.posts;
  // The selectors may yield one Listen per card; require the first choice to
  // be available immediately without scrolling, rather than all three.
  const firstChoice = b.locator("#chorus-studio [data-listen]").first();
  const firstBox = await firstChoice.boundingBox();
  check(firstBox && firstBox.width >= 44 && firstBox.height >= 44 && firstBox.y >= 0 && firstBox.y + firstBox.height <= 844,
    "the first curated Listen is visible and finger-sized on the phone's first screen");
  await firstChoice.tap();await firstChoice.filter({ hasText: "Stop" }).waitFor();
  check(bo.posts === phoneStudioPosts && await b.evaluate(() => window.__creationStarts.length) === 1 && await stageData(b, "soundOn") === "false",
    "a quiet visitor can explicitly preview on touch without publishing or turning on the shared world mix");
  await shot(b, "chorus-creation-phone-studio");
  await b.setViewportSize({ width: 844, height: 390 });
  check(await b.evaluate(() => document.getElementById("chorus-studio").scrollWidth <= document.getElementById("chorus-studio").clientWidth), "resizing an open studio to landscape keeps its content within the dialog");
  await b.setViewportSize({ width: 390, height: 844 });
  await b.locator("#chorus-studio").getByRole("button", { name: "Cancel", exact: true }).tap();
  await b.locator("#chorus-studio").waitFor({ state: "hidden" });
  check(bo.posts === phoneStudioPosts && await stageData(b, "soundOn") === "false", "phone Cancel and resize preserve the quiet preference and create no contribution");

  const record = await journal(b, first.sound.id);
  check((await record.textContent()).includes("Creation Ada") && (await record.textContent()).includes("Creation Bo") && (await record.locator(`[data-source="${answer.sound.id}"]`).textContent()).includes("answering Creation Ada"),
    "Our works presents real authors, the exact parent relationship and the work's place");
  await shot(b, "chorus-creation-phone-journal");await closeDialog(b, "#chorus-journal");

  // Delay an actual accepted POST response, then remove that contribution via
  // the other person's normal UI before its original author sees the ACK.
  await a.waitForTimeout(1100);await openStudio(ada);
  const committed = deferred(), held = deferred(); releaseHeld = held.resolve;
  await a.route(`**/api/sessions/${ada.sessionId}/sounds`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    // The HTTP request is already in flight. Temporarily drop the two actual
    // sound frames at its production handler, retaining real presence and
    // position. Closing the only transport here would correctly make the
    // server reject the still-uncommitted request as not_here.
    const armed = await a.evaluate(() => {
      const active = window.__creationStreams.filter(stream => stream.url.includes("scene=planet") && stream.readyState !== EventSource.CLOSED);
      const stream = active.at(-1);if (!stream) return false;
      window.__creationReconnectFrom = stream;
      window.__creationProductionHandlers = { message: stream.onmessage, open: stream.onopen, error: stream.onerror };
      const original = stream.onmessage;
      stream.onmessage = event => {
        let message;try { message = JSON.parse(event.data); } catch { }
        if (message && ["sound-left", "sound-removed"].includes(message.type)) {
          window.__creationDroppedEvents.push({ type: message.type, id: message.sound?.id ?? message.id });return;
        }
        original?.call(stream, event);
      };
      return true;
    });
    if (!armed) { committed.resolve({ result: { ok: false, reason: "No real native stream to observe" } });return route.abort(); }
    const response = await route.fetch(), result = await response.json();
    if (!result.ok || !result.sound) { committed.resolve({ result });return route.fulfill({ response }); }
    made.push({ who: ada, sound: result.sound });committed.resolve({ result });
    await held.promise;await route.fulfill({ response });
  });
  await a.locator('#chorus-studio [data-leave="chorus-bells"]').click();
  const delayed = (await committed.promise).result;assert.ok(delayed.ok && delayed.sound, "Actual held POST result: " + JSON.stringify(delayed));
  const delayedRecord = await journal(b, first.sound.id);
  await delayedRecord.locator(`[data-source="${delayed.sound.id}"]`).waitFor();
  const removing = b.waitForResponse(response => response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith("/sounds/" + delayed.sound.id));
  await delayedRecord.locator(`[data-record-action="remove:${delayed.sound.id}"]`).tap();
  assert.ok((await (await removing).json()).ok);
  await delayedRecord.locator(`[data-source="${delayed.sound.id}"]`).filter({ hasText: "withdrawn, remembered here" }).waitFor();
  check(await b.locator("#chorus-journal").evaluate(dialog => dialog.contains(document.activeElement)),
    "withdrawing a record preserves keyboard focus inside the journal after its focused button is removed by SSE");
  check(!JSON.parse(await stageData(a, "chorus")).some(work => work.sources.some(source => source.id === delayed.sound.id)),
    "the author's production handler misses both the real child's creation and its removal, leaving the held child unknown locally");
  const dropped = await a.evaluate(id => window.__creationDroppedEvents.filter(event => event.id === id).map(event => event.type).sort(), delayed.sound.id);
  assert.deepEqual(dropped, ["sound-left", "sound-removed"]);
  const afterRemovalStarts = await a.evaluate(() => window.__creationStarts.length);
  const beforeReconnect = await a.evaluate(() => {
    const old = window.__creationReconnectFrom, handlers = window.__creationProductionHandlers, count = window.__creationSnapshots;
    // A genuine new native connection returns the real server snapshot to
    // the existing controller's real handlers. No event/data is fabricated.
    // This is deliberate frame-loss plus transport-close/manual-reconnect,
    // rather than a claim to reproduce native network failure/retry timing.
    old.close();
    const next = new EventSource(old.url);
    next.onmessage = handlers.message;next.onopen = handlers.open;next.onerror = handlers.error;
    return count;
  });
  await a.waitForFunction(({ id, count }) => window.__creationSnapshots > count &&
    JSON.parse(document.getElementById("planet-stage").dataset.chorus ?? "[]").some(work =>
      work.sources.some(source => source.id === id && source.removedAt) && !work.live.includes(id)), { id: delayed.sound.id, count: beforeReconnect });
  check(true, "a real reconnect snapshot imports the previously unknown removed-child history before its original acknowledgement arrives");
  held.resolve();releaseHeld = null;
  await a.locator("#chorus-studio .chorus-feedback").filter({ hasText: "removed before confirmation" }).waitFor();
  await a.waitForTimeout(4500); // Beyond the next 72 BPM bar, including lead.
  const absent = await a.evaluate(id => !document.querySelector(`.planet-sound-pin[data-id="${id}"]`)
    && !JSON.parse(document.getElementById("planet-stage").dataset.chorusGardens ?? "[]").some(work => work.sourceIds.includes(id))
    && !JSON.parse(document.getElementById("planet-stage").dataset.chorus ?? "[]").some(work => work.live.includes(id)), delayed.sound.id);
  check(absent && await a.evaluate(() => window.__creationStarts.length) === afterRemovalStarts && !(await snapshot(ada)).sounds.some(sound => sound.id === delayed.sound.id),
    "after both missed events and a fresh snapshot, the held late acknowledgement cannot revive the source, sculpture, pin or real audio even beyond the next bar");
  await a.unroute(`**/api/sessions/${ada.sessionId}/sounds`);
  await closeDialog(a, "#chorus-studio");

  await b.waitForTimeout(1100);
  const withdrawing = b.waitForResponse(response => response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith("/sounds/" + answer.sound.id));
  await b.locator(`[data-record-action="remove:${answer.sound.id}"]`).tap();
  assert.ok((await (await withdrawing).json()).ok);
  await closeDialog(b, "#chorus-journal");
  await Promise.all([waitWork(a, first.sound.id, false), waitWork(b, first.sound.id, false)]);
  const remembered = (await snapshot(bo)).chorus.find(work => work.id === first.sound.id);
  check(remembered.sources.length === 3 && remembered.sources.find(source => source.id === answer.sound.id).removedAt && remembered.sources.find(source => source.id === delayed.sound.id).removedAt && remembered.contributors.length === 2,
    "withdrawing the reply closes the shared form in both browsers while all sources, authors and reply history remain");
  await a.waitForFunction(count => Number(document.getElementById("planet-stage").dataset.voices) === count, audibleBaseline.length + 1);
  check(await stageData(b, "soundOn") === "false", "withdrawal removes the derived harmony while preserving the other visitor's quiet preference");

  const closedStreams = await b.evaluate(() => {
    const active = window.__creationStreams.filter(stream => stream.url.includes("scene=planet") && stream.readyState !== EventSource.CLOSED);
    active.forEach(stream => stream.close());return active.length;
  });
  assert.ok(closedStreams > 0, "Actually close the reader's real SSE connection");
  const lastRecord = await journal(a, first.sound.id);
  const lastRemoval = a.waitForResponse(response => response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith("/sounds/" + first.sound.id));
  await lastRecord.locator(`[data-record-action="remove:${first.sound.id}"]`).click();
  assert.ok((await (await lastRemoval).json()).ok);
  await a.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.chorus ?? "[]").some(work => work.id === id && work.live.length === 0), first.sound.id);
  check(JSON.parse(await stageData(b, "chorus")).some(work => work.id === first.sound.id && work.live.includes(first.sound.id)),
    "the disconnected browser actually misses a real final withdrawal");
  await closeDialog(a, "#chorus-journal");
  await b.reload();await ready(b);
  await b.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.chorus ?? "[]").some(work => work.id === id && work.live.length === 0)
    && JSON.parse(document.getElementById("planet-stage").dataset.chorusGardens ?? "[]").every(work => work.workId !== id), first.sound.id);
  const recovered = await journal(b, first.sound.id);
  check((await recovered.locator("[data-source]").count()) === 3 && (await recovered.textContent()).includes("resting") && (await recovered.textContent()).includes("withdrawn, remembered here"),
    "a real reconnect clears the missed source and active sculpture while preserving the complete authored work in its archive");
  await closeDialog(b, "#chorus-journal");

  const originalBird = before.sounds.find(source => source.soundId === "evening-forest");
  assert.ok(originalBird, "This scratch fixture retains its real historical Reading Nook bird sound");
  await journal(a, originalBird.id);
  const travelPosts = ada.posts, farFrom = await at(a);
  await a.locator(`#chorus-journal [data-record-action="reply:${originalBird.id}"]`).click();
  await a.locator("#chorus-journal").waitFor({ state: "hidden" });
  await a.waitForFunction(() => document.getElementById("planet-stage").dataset.walkingIntent === "true");
  check(await a.locator("canvas.planet-canvas").evaluate(canvas => document.activeElement === canvas),
    "answering a distant saved sound closes the real journal before starting its walk and returns keyboard focus to the canvas");
  await a.waitForFunction(from => {
    const p = document.getElementById("planet-stage").dataset.at.split(",").map(Number);return Math.hypot(p[0] - from[0], p[1] - from[1]) > .15;
  }, farFrom);
  await a.keyboard.press("s");await a.waitForFunction(() => document.getElementById("planet-stage").dataset.walkingIntent === "false");
  await a.locator("#planet-reply-cancel").click();await a.locator("#planet-reply-intent").waitFor({ state: "hidden" });
  check(ada.posts === travelPosts, "a quick manual key and Cancel stop the distant reply intent without publishing or changing the historical source");
  await travel(a, "green");

  // A second short performance uses the same two people and shared room,
  // reached through ordinary place buttons rather than a seeded scene.
  await a.locator("#planet-sound").click();
  assert.equal(await stageData(a, "soundOn"), "false");
  await travel(a, "stage");await travel(b, "stage");
  await a.locator("canvas.planet-canvas").focus();await a.keyboard.down("w");await a.waitForTimeout(1200);await a.keyboard.up("w");await a.waitForTimeout(220);
  const guarded = await a.evaluate(async () => {
    const { planetDistance } = await import("/shared/planet.js"), [x, z] = document.getElementById("planet-stage").dataset.at.split(",").map(Number);
    return { x, z, distance: planetDistance({ x, z }, { x: 10, z: -9 }) };
  });
  check(guarded.distance >= 1.49 && guarded.distance <= 1.8 && guarded.z > -9,
    "holding real movement toward the beat flower stops the avatar outside its physical base instead of crossing the sculpture", guarded);
  await travel(a, "stage");
  await b.locator("canvas.planet-canvas").focus();await b.keyboard.down("a");await b.waitForTimeout(350);await b.keyboard.up("a");
  await openStudio(ada);const stageFirst = await leave(ada, "chorus-chords");
  await Promise.all([waitWork(a, stageFirst.sound.id, false), waitWork(b, stageFirst.sound.id, false)]);
  await openStudio(bo);const stageAnswer = await leave(bo, "chorus-pulse");
  await Promise.all([waitWork(a, stageFirst.sound.id, true), waitWork(b, stageFirst.sound.id, true)]);
  const stageWork = (await snapshot(ada)).chorus.find(work => work.id === stageFirst.sound.id);
  check(stageWork.placeId === "stage" && stageWork.variant === "ensemble" && stageWork.duet && stageAnswer.sound.replyToId === stageFirst.sound.id,
    "the same friends can make a second bar-based ensemble at the actual Pocket Jam Stage without changing rooms");
  await a.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.chorusResidents ?? "[]")
    .some(resident => resident.id === "jam-neighbour" && resident.workId === id && resident.variant === "ensemble"), stageFirst.sound.id);
  await shot(a, "chorus-creation-pocket-jam");

  await travel(a, "reading");await travel(b, "reading");
  await a.locator("#chorus-our-works").click();await a.locator("#chorus-new-work").click();await a.locator("#chorus-studio").waitFor({ state: "visible" });
  check(!(await a.locator("#chorus-answering").textContent()).startsWith("Answering"), "an existing place offers a clear way to begin a new work instead of forcing a reply to its old sound");
  await a.locator('#chorus-studio [data-listen="trickle"]').click();
  await a.locator('#chorus-studio [data-listen="trickle"]').filter({ hasText: "Stop" }).waitFor();
  // Listen to the environmental ingredient before committing it. This also
  // gives the real one-second server write limit room after the stage visit.
  await a.waitForTimeout(1100);
  const water = await leave(ada, "trickle");
  await Promise.all([waitWork(a, water.sound.id, false), waitWork(b, water.sound.id, false)]);
  const readingSample = () => b.evaluate(async ({ sources, water }) => {
    const { planetDistance } = await import("/shared/planet.js"), [x, z] = document.getElementById("planet-stage").dataset.at.split(",").map(Number);
    const { coastlineAt } = await import("/client/planet-coast.js");
    return { x, z, coast: coastlineAt(x), water: planetDistance({ x, z }, water), oldBird: Math.min(...sources.filter(source => source.soundId === "evening-forest").map(source => planetDistance({ x, z }, source))) };
  }, { sources: before.sounds, water: water.sound });
  const readingWalk = [await readingSample()];
  const readingStep = async key => {
    await b.locator("canvas.planet-canvas").focus();await b.keyboard.down(key);await b.waitForTimeout(65);await b.keyboard.up(key);
    // Read a fresh actual 12-frame position sample after each bounded step.
    await b.waitForTimeout(240);const position = await readingSample();readingWalk.push(position);return position;
  };
  let readingDistances = readingWalk[0];
  // The shore is immediately south/west of the porch. Walk north along its
  // edge before going west, keeping outside the nook's real side wall.
  for (let step = 0; step < 9 && readingDistances.z > 9.95; step++) readingDistances = await readingStep("w");
  for (let step = 0; step < 19 && readingDistances.oldBird <= 4.15 && readingDistances.water < 3.9; step++) readingDistances = await readingStep("a");
  console.log("Reading Nook actual walking samples: " + JSON.stringify(readingWalk));
  assert.ok(readingDistances.water <= 4 && readingDistances.oldBird > 4,
    "A normal short walk leaves room for a new bird sound while staying close enough to answer the water: " + JSON.stringify(readingDistances));
  await openStudio(bo);const bird = await leave(bo, "evening-forest");
  await Promise.all([waitWork(a, water.sound.id, true), waitWork(b, water.sound.id, true)]);
  const habitat = (await snapshot(ada)).chorus.find(work => work.id === water.sound.id);
  check(habitat.placeId === "reading" && habitat.variant === "habitat" && habitat.duet && bird.sound.replyToId === water.sound.id,
    "water answered by a friend's bird creates a different shared canopy at the actual Reading Nook", readingDistances);
  await a.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.chorusResidents ?? "[]")
    .some(resident => resident.id === "reading-neighbour" && resident.workId === id && resident.variant === "habitat"), water.sound.id);
  const ranges = await a.evaluate(async () => {
    const { planetHearingRadius } = await import("/client/planet-audio.js");
    return { reading: planetHearingRadius({ x: -13, z: 7 }), stage: planetHearingRadius({ x: 10, z: -9 }) };
  });
  check(ranges.reading === 6 && ranges.stage === 18 && await stageData(a, "soundOn") === "false" && await stageData(b, "soundOn") === "false",
    "the quiet nook has a smaller real playback radius than the stage and shared transformations do not undo either visitor's mute", ranges);
  await shot(a, "chorus-creation-reading-canopy");
  await shot(b, "chorus-creation-reading-canopy-phone");
  assert.deepEqual((await snapshot(ada, "/scene/seaside")).sounds, coast);
  assert.deepEqual((await snapshot(ada)).sounds.filter(sound => !made.some(item => item.sound.id === sound.id)).map(sound => sound.id).sort(), baselineIds);
  check(true, "the complete new creation path preserves every pre-existing planet and coastal contribution");
  check(errors.length === 0, "no runtime browser errors", errors);
}

try { await run(); }
catch (error) {
  failed = true;
  for (const { page, name } of people) if (!page.isClosed()) await shot(page, "failure-" + name.replaceAll(" ", "-")).catch(() => {});
  throw error;
} finally {
  releaseHeld?.();
  const cleanupErrors = [];
  await Promise.all(people.map(({ page }) => page.close().catch(() => {})));
  for (const { who, sound } of made) {
    await delay(1100);
    try {
      const response = await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
      assert.ok(response.ok() && (await response.json()).ok, "Cleanup position must be admitted");
      const removal = await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`), result = await removal.json();
      assert.ok((removal.ok() && result.ok) || result.code === "gone", `Cleanup soft-removal: ${JSON.stringify(result)}`);
    } catch (error) { cleanupErrors.push(`${sound.id}: ${error.message}`); }
  }
  if (made.length) {
    try {
      const end = await snapshot(made[0].who), ids = new Set(made.map(item => item.sound.id));
      assert.ok(!end.sounds.some(sound => ids.has(sound.id)), "Final snapshot must contain none of this test's live sources");
      const history = end.chorus.find(work => work.id === made[0].sound.id);
      assert.ok(history && history.liveSources.length === 0 && history.sources.every(source => source.removedAt), "The work must remain in the real archive with ended-source metadata");
      check(true, "normal API cleanup leaves the complete work archived and no test sound playing");
    } catch (error) { cleanupErrors.push(error.message); }
  }
  await browser.close();
  if (out) writeFileSync(`${out}/results.json`, JSON.stringify({ type: "automated developer check", mode: process.env.CHORUS_READING_ART_ONLY === "1" ? "targeted reading art" : "complete three-place creation",
    ...(process.env.CHORUS_READING_ART_ONLY !== "1" ? { transportFixture: "The missed-both-events case retains native presence but drops the two real sound frames before the production message handler. It then closes that transport and opens a fresh native connection using the production handlers. All HTTP acknowledgements, event data and snapshots are real; this is logical frame loss, not a claim to reproduce native network failure or retry timing." } : {}),
    failed, checks: results, errors, cleanupErrors }, null, 2) + "\n");
  if (cleanupErrors.length) {
    console.error("Cleanup failed: " + cleanupErrors.join(" | "));
    if (!failed) throw new Error("Creation test cleanup failed");
  }
}
