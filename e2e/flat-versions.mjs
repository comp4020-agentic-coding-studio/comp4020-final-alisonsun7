#!/usr/bin/env node
// Developer automation, not a novice playtest or an artistic listening verdict.
// One shared planet, two independent browser identities and two presentations.
// APP_URL=http://localhost:18896 node e2e/flat-versions.mjs [screenshots-directory]
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.APP_URL;
assert.ok(base, "Set APP_URL explicitly to an isolated local scratch world");
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "Use a local scratch world");
assert.notEqual(address.port, "18861", "Never write tests into the player's working preview");
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const people = [], made = [], checks = [], errors = [], metrics = [], privateSounds = [], phoneProbes = [];
mkdirSync(".cache", { recursive: true });
// Private recovery credentials stay in ignored local cache, never beside
// deliverable screenshots/results. Successful cleanup removes this file.
const recoveryPath = `.cache/flat-versions-recovery-${crypto.randomUUID()}.json`;
const saveRecovery = () => writeFileSync(recoveryPath, JSON.stringify({ base,
  identities: people.map(({ name, id, sessionId, cookies }) => ({ name, id, sessionId, cookies })),
  sounds: made.map(({ sound }) => sound),
}, null, 2), { mode: 0o600 });
let failed = false, initialPlanet, initialCoast;
const check = (condition, label, detail) => {
  assert.ok(condition, label);
  checks.push({ label, ...(detail === undefined ? {} : { detail }) });
  console.log("ok  " + label);
};
const shot = async (page, name) => {
  if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
const stageData = (page, key) => page.locator("#planet-stage").evaluate((stage, key) => stage.dataset[key], key);
const at = async page => (await stageData(page, "at")).split(",").map(Number);
const ordinary = snapshot => snapshot.sounds.filter(source => !source.whileIn)
  .map(({ id, soundId, byId, x, z, at, replyToId, removedAt }) => ({ id, soundId, byId, x, z, at, replyToId, removedAt }))
  .sort((a, b) => a.id.localeCompare(b.id));
async function snapshot(who, path = "/planet") {
  const response = await who.context.request.get(base + path);
  assert.ok(response.ok(), `Snapshot HTTP ${response.status()}`);
  const match = (await response.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, "Read the real server boot snapshot");
  return JSON.parse(match[1]).snapshot;
}
async function ready(page, presentation) {
  await page.waitForFunction(presentation => {
    const stage = document.getElementById("planet-stage");
    return stage?.dataset.presentation === presentation && !!stage.dataset.at && !document.querySelector("dialog:modal");
  }, presentation);
}
async function person(name, avatar, presentation, sound) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true });
  await context.addInitScript(() => {
    // Wrap actual nodes only: do not fabricate samples, decoded audio or state.
    window.__flatAudioStarts = [];
    const Context = window.AudioContext;
    window.AudioContext = class extends Context {
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => {
          window.__flatAudioStarts.push({ loop: source.loop, duration: source.buffer?.duration, args, at: this.currentTime });
          return start(...args);
        };
        return source;
      }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const who = { context, page, name, presentation, lastMoveAt: 0, lastWriteAt: 0, posts: 0 };
  people.push(who);
  page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
  page.on("request", request => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (/\/move$/.test(path)) who.lastMoveAt = Date.now();
    if (/\/sounds$/.test(path)) who.posts++;
  });
  await page.goto(`${base}/planet?view=${presentation}`);
  await page.locator("#planet-join").waitFor({ state: "visible" });
  await page.fill('#planet-join-form input[name="nickname"]', name);
  await page.check(`#planet-join-form input[value="${avatar}"]`, { force: true });
  await page.click("#planet-enter");
  await page.locator("#chorus-welcome").getByRole("button", { name: sound ? "Enter with sound" : "Explore quietly", exact: true }).click();
  await ready(page, presentation);
  const initial = await snapshot(who);
  who.id = initial.you.id;who.sessionId = initial.sessionId;
  who.cookies = await context.cookies();saveRecovery();
  return who;
}
async function walk(who, key, ms) {
  await who.page.locator("canvas.planet-canvas").focus();
  await who.page.keyboard.down(key);
  try { await who.page.waitForTimeout(ms); }
  finally { await who.page.keyboard.up(key); }
  await who.page.waitForTimeout(260);
}
async function newWork(who) {
  await who.page.click("#chorus-our-works");
  await who.page.click("#chorus-new-work");
  await who.page.locator("#chorus-studio").waitFor({ state: "visible" });
}
async function leave(who, soundId) {
  await who.page.waitForTimeout(Math.max(0, 1100 - (Date.now() - who.lastWriteAt)));
  const [response] = await Promise.all([
    who.page.waitForResponse(response => response.request().method() === "POST"
      && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds`),
    who.page.locator(`#chorus-studio [data-leave="${soundId}"]`).click(),
  ]);
  const result = await response.json();
  assert.ok(response.ok() && result.ok && result.sound, JSON.stringify(result));
  who.lastWriteAt = Date.now();made.push({ who, sound: result.sound });
  saveRecovery();
  await who.page.locator("#chorus-studio").waitFor({ state: "hidden" });
  return result.sound;
}
async function work(page, id, duet) {
  await page.waitForFunction(({ id, duet }) => {
    const stage = document.getElementById("planet-stage"), dock = document.getElementById("chorus-work");
    const shared = JSON.parse(stage.dataset.chorus ?? "[]").find(work => work.id === id);
    return dock?.dataset.work === id && shared?.duet === duet && dock.dataset.duet === String(duet);
  }, { id, duet });
  return (JSON.parse(await stageData(page, "chorus"))).find(work => work.id === id);
}
async function hit(page, selector) {
  return page.locator(selector).evaluate(element => {
    const r = element.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { selector: element.id || element.getAttribute("aria-label") || element.textContent,
      x: r.x, y: r.y, width: r.width, height: r.height,
      interceptor: target?.closest("button,a,form,aside")?.id ?? target?.tagName ?? null,
      usable: !element.matches(":disabled") && r.width >= 44 && r.height >= 44 && r.x >= 0 && r.y >= 0
        && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && !!target && element.contains(target) };
  });
}
async function switchView(who, presentation, phone = false) {
  const nav = who.page.locator(`#planet-presentations a[data-presentation="${presentation}"]`);
  if (await nav.isVisible()) await nav.click();
  else {
    await who.page.click("#planet-tools");
    const link = who.page.locator(`#planet-presentations-settings a[data-presentation="${presentation}"]`);
    const target = await hit(who.page, `#planet-presentations-settings a[data-presentation="${presentation}"]`);
    metrics.push({ context: `switch ${presentation}`, ...target });
    assert.ok(target.usable, "Phone comparison link is reachable and finger-sized");
    if (phone) await link.tap();else await link.click();
  }
  await ready(who.page, presentation);
  who.presentation = presentation;
}
async function chat(who, text, touch = false) {
  if (touch) await who.page.locator("#planet-talk").tap();
  else { await who.page.locator("canvas.planet-canvas").focus();await who.page.keyboard.press("t"); }
  await who.page.locator("#planet-chat:not([hidden])").waitFor();
  await who.page.fill("#planet-chat-input", text);
  const submitTarget = await hit(who.page, "#planet-chat-submit");
  assert.ok(submitTarget.usable, `Chat submit must be uncovered before sending: ${JSON.stringify(submitTarget)}`);
  const [response] = await Promise.all([
    who.page.waitForResponse(response => response.request().method() === "POST" && /\/say$/.test(new URL(response.url()).pathname)),
    who.page.click("#planet-chat-submit"),
  ]);
  assert.ok(response.ok() && (await response.json()).ok, "Real nearby chat is server-confirmed");
}
async function restrooms(who) {
  await who.page.locator("#planet-tools").tap();
  await who.page.locator('#planet-destinations [data-zone="restrooms"]').tap();
  await who.page.waitForFunction(() => !document.getElementById("planet-tools-panel").open
    && document.getElementById("planet-restroom-card").dataset.hut === "planet-toilet");
}
async function inside(who, value) {
  await who.page.waitForFunction(value => document.getElementById("planet-restroom-card").dataset.inside === String(value)
    && document.getElementById("planet-stage").dataset.walkingIntent === "false", value);
}
async function privateVisit(who, friend) {
  await who.page.locator("#planet-enter-room").tap();await inside(who, true);
  await friend.page.waitForFunction(() => document.getElementById("planet-enter-room").disabled);
  const [response] = await Promise.all([
    who.page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds`),
    who.page.locator("#planet-stay-action").tap(),
  ]);
  const result = await response.json();assert.ok(response.ok() && result.ok, JSON.stringify(result));
  privateSounds.push(result.sound.id);
  check(result.sound.soundId === "toilet-flush" && result.sound.whileIn === "planet-toilet",
    `${who.presentation} can walk inside, lock the shared room and start the actual private Flush from the world`);
  let rejected = false;
  for (let attempt = 0; attempt < 4 && !rejected; attempt++) {
    while (Date.now() - friend.lastMoveAt < 140) await friend.page.waitForTimeout(140 - (Date.now() - friend.lastMoveAt));
    const gate = await friend.context.request.post(`${base}/api/sessions/${friend.sessionId}/move`, { data: { x: 13.5, z: 5.5, yaw: Math.PI } });
    const answer = await gate.json();rejected = answer.code === "hut_taken" && answer.hutId === "planet-toilet" && answer.position.z >= 7;
    if (!rejected) await friend.page.waitForTimeout(150);
  }
  check(rejected, `${who.presentation} private occupancy is enforced by the server against the other real identity`);
  await shot(who.page, `${who.presentation.replace(".", "-")}-restroom-phone`);
  await who.page.locator("#planet-leave-room").tap();await inside(who, false);
  await friend.page.waitForFunction(() => !document.getElementById("planet-enter-room").disabled);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!(await snapshot(who)).sounds.some(source => source.id === result.sound.id)) break;
    await who.page.waitForTimeout(150);
  }
  check(!(await snapshot(who)).sounds.some(source => source.id === result.sound.id),
    `${who.presentation} walking outside releases the lock and ends its private sound on the server`);
}

try {
  const ada = await person("Flat Ada", "cat", "2d", true), bo = await person("Depth Bo", "dog", "2.5d", false), a = ada.page, b = bo.page;
  initialPlanet = ordinary(await snapshot(ada));initialCoast = ordinary(await snapshot(ada, "/scene/seaside"));
  const aCookie = (await ada.context.cookies()).find(cookie => cookie.name === "soac_session");
  const bCookie = (await bo.context.cookies()).find(cookie => cookie.name === "soac_session");
  check(ada.id !== bo.id && aCookie.value !== bCookie.value, "2D and 2.5D are played by two genuinely independent browser identities");
  check(ada.sessionId === bo.sessionId, "Both visual versions join the existing planet room rather than creating forked histories");
  check(await stageData(a, "soundOn") === "true" && await stageData(b, "soundOn") === "false", "Each presentation respects its own explicit sounding or quiet entrance");

  const start = await at(b);
  await walk(bo, "d", 240);
  const moved = await at(b);
  check(Math.hypot(moved[0] - start[0], moved[1] - start[1]) > .2, "2.5D keyboard movement changes the actual shared ground position");
  const aStart = await at(a);
  await walk(ada, "a", 150);
  const aMoved = await at(a);
  check(Math.hypot(aMoved[0] - aStart[0], aMoved[1] - aStart[1]) > .15, "2D keyboard movement changes the actual shared ground position");

  await newWork(ada);
  const still = await at(a), postsBeforeCancel = ada.posts;
  await a.keyboard.press("w");await a.waitForTimeout(180);
  const afterModalKey = await at(a);
  check(Math.hypot(afterModalKey[0] - still[0], afterModalKey[1] - still[1]) < .02, "Movement shortcuts stay paused while the sound chooser is open");
  await a.locator('#chorus-studio [data-listen="chorus-chords"]').click();
  await a.waitForFunction(() => window.__flatAudioStarts.some(source => source.duration > 0));
  assert.deepEqual(ordinary(await snapshot(ada)), initialPlanet);
  check(ada.posts === postsBeforeCancel, "A real decoded private audition leaves the shared world untouched");
  await a.getByRole("button", { name: "Cancel", exact: true }).click();
  await a.waitForTimeout(150);
  check(ada.posts === postsBeforeCancel && !await a.locator("#chorus-studio").isVisible(), "Cancelling the audition creates no sound and returns to the world");

  await newWork(ada);
  const root = await leave(ada, "chorus-chords");
  await Promise.all([work(a, root.id, false), work(b, root.id, false)]);
  await a.waitForFunction(() => Number(document.getElementById("planet-stage").dataset.voices) > 0);
  check(await a.evaluate(() => window.__flatAudioStarts.some(source => source.loop && source.duration > 0)), "A sounding 2D visitor starts an actual decoded world voice after explicitly publishing");
  check(await b.evaluate(() => window.__flatAudioStarts.length) === 0, "A friend's new contribution does not start audio in the quiet 2.5D browser");
  await b.click("#chorus-primary");
  check((await b.locator("#chorus-answering").textContent()).includes("Flat Ada"), "The 2.5D response chooser identifies the actual 2D friend being answered");
  const answer = await leave(bo, "chorus-pulse");
  const [left, right] = await Promise.all([work(a, root.id, true), work(b, root.id, true)]);
  assert.deepEqual(left, right);
  check(answer.replyToId === root.id && answer.byId !== root.byId && left.variant === "ensemble" && left.live.includes(answer.id),
    "A real cross-person answer produces the same shared ensemble in both presentations", { root: root.id, answer: answer.id });
  const rendered = await Promise.all([a, b].map(async page => {
    await page.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.chorusGardens ?? "[]")
      .some(form => form.workId === id && form.duet && form.open === 1), root.id);
    const form = JSON.parse(await stageData(page, "chorusGardens")).find(form => form.workId === root.id);
    return { workId: form.workId, variant: form.variant, duet: form.duet, sourceIds: form.sourceIds, contributors: form.contributors, open: form.open };
  }));
  assert.deepEqual(rendered[0], rendered[1]);
  check(rendered[0].variant === "ensemble" && rendered[0].sourceIds.includes(root.id) && rendered[0].sourceIds.includes(answer.id)
    && new Set(rendered[0].contributors).size === 2, "Both real renderers open the same full shared form from the actual two source IDs and participant IDs");
  check(await stageData(b, "soundOn") === "false" && await b.evaluate(() => window.__flatAudioStarts.length) === 0,
    "The shared transformation preserves the quiet visitor's local mute");
  await shot(a, "2d-green-desktop");await shot(b, "2-5d-green-desktop");

  await chat(ada, "Our two views made the same chorus.");
  await b.locator(`.planet-speech[data-speaker="${ada.id}"]`).waitFor({ state: "visible" });
  check((await b.locator("#planet-chat-log").textContent()).includes("Our two views made the same chorus."), "Nearby chat crosses from the 2D player to the 2.5D player with the real speaker identity");
  const chatStill = await at(a);await a.fill("#planet-chat-input", "wasd");await a.keyboard.press("w");await a.waitForTimeout(180);
  const chatAfter = await at(a);
  check(Math.hypot(chatStill[0] - chatAfter[0], chatStill[1] - chatAfter[1]) < .02, "Typing movement letters in chat does not move the 2D player");
  await a.keyboard.press("Escape");

  const beforeSwitch = ordinary(await snapshot(ada)), originalIdentity = ada.id;
  await switchView(ada, "2.5d");
  const switched = await snapshot(ada);
  assert.deepEqual(ordinary(switched), beforeSwitch);
  check(switched.you.id === originalIdentity && switched.sessionId === ada.sessionId, "Switching from 2D to 2.5D keeps the same identity, room and all authored sound coordinates");
  check(await stageData(a, "soundOn") === "false", "A presentation switch does not silently start audio in the new document");
  await work(a, root.id, true);
  await switchView(ada, "2d");await work(a, root.id, true);
  check((await snapshot(ada)).you.id === originalIdentity, "The return to 2D preserves the same participant rather than creating another contributor");

  for (const who of [ada, bo]) {
    const page = who.page;
    await page.setViewportSize({ width: 390, height: 844 });await page.waitForTimeout(300);
    phoneProbes.push(await page.evaluate(() => {
      const element = document.elementFromPoint(24, 140), rect = element?.getBoundingClientRect();
      return { presentation: document.getElementById("planet-stage").dataset.presentation, element: element?.outerHTML,
        rect: rect?.toJSON(), display: element ? getComputedStyle(element).display : null, text: element?.textContent };
    }));
    for (const selector of ["#chorus-primary", "#chorus-minimise", "#planet-talk", "#planet-run", "#planet-jump"]) {
      const target = await hit(page, selector);metrics.push({ context: who.presentation, ...target });
      check(target.usable, `${who.presentation} at 390×844 keeps ${selector} finger-sized and unobstructed`);
    }
    await page.locator("#chorus-minimise").tap();
    const reopen = await hit(page, "#chorus-reopen");metrics.push({ context: who.presentation, ...reopen });
    check(reopen.usable && !await page.locator("#planet-nearby-sound").isVisible(), `${who.presentation} can minimise the work and explicitly reopen it without a second large panel`);
    await shot(page, `${who.presentation.replace(".", "-")}-green-phone`);
    await page.locator("#chorus-reopen").tap();
    await page.locator("#chorus-primary").tap();
    const listen = page.locator("#chorus-studio [data-listen]").first(), leaveButton = page.locator("#chorus-studio [data-leave]").first();
    const listenTarget = await listen.evaluate(element => { const r = element.getBoundingClientRect();return { w: r.width, h: r.height, y: r.y, bottom: r.bottom }; });
    check(listenTarget.w >= 44 && listenTarget.h >= 44 && listenTarget.y >= 0 && listenTarget.bottom <= 844 && await leaveButton.isVisible(), `${who.presentation} phone chooser starts with a reachable audition and explicit contribution`);
    await shot(page, `${who.presentation.replace(".", "-")}-chooser-phone`);
    await page.getByRole("button", { name: "Cancel", exact: true }).tap();
    const beforeTouch = await at(page), moveButton = page.locator(".planet-move-right"), box = await moveButton.boundingBox();
    assert.ok(box, "Actual on-screen touch movement control exists");
    const touch = await who.context.newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] });
    await page.waitForTimeout(260);
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });await touch.detach();
    const afterTouch = await at(page);
    check(Math.hypot(afterTouch[0] - beforeTouch[0], afterTouch[1] - beforeTouch[1]) > .2, `${who.presentation} touch direction changes the actual player position`);
    await chat(who, `${who.presentation} phone view ready`, true);await page.locator("#planet-chat-close").tap();
    check(await page.locator("#planet-chat").evaluate(form => form.hidden), `${who.presentation} touch chat can open, send and close`);
  }
  await restrooms(ada);await restrooms(bo);
  await privateVisit(ada, bo);await privateVisit(bo, ada);
  await switchView(bo, "2d", true);await switchView(bo, "2.5d", true);
  check((await snapshot(bo)).you.id === bo.id, "Phone Tools can switch both presentations without losing identity");
  check(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
    && await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Both phone presentations fit the viewport without horizontal document overflow");
  check(errors.length === 0, "Both presentations complete the real shared path without browser page errors");
} catch (error) {
  failed = true;process.exitCode = 1;console.error(error);
  for (const who of people) await shot(who.page, `failure-${who.name.replaceAll(" ", "-")}`).catch(() => {});
} finally {
  let cleanupFailed = false;
  // Stop the page's position pump before API cleanup; only remove this run's
  // own rows, and verify the pre-existing world rather than clearing the DB.
  for (const who of people) await who.page.goto("about:blank").catch(() => {});
  for (const who of people) if (who.sessionId) {
    await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: 0, z: 3, yaw: Math.PI } }).catch(() => {});
  }
  for (const { who, sound } of [...made].reverse()) {
    try {
      await new Promise(resolve => setTimeout(resolve, Math.max(1100, 150 - (Date.now() - who.lastMoveAt))));
      const moved = await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
      assert.ok(moved.ok() && (await moved.json()).ok, "Move beside only own test sound for cleanup");
      const removed = await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`);
      assert.ok(removed.ok() && (await removed.json()).ok, `Soft-remove own fixture ${sound.id}`);
    } catch (error) { cleanupFailed = true;failed = true;process.exitCode = 1;console.error("Cleanup", error.message); }
  }
  if (people[0] && initialPlanet && initialCoast) {
    try {
      assert.deepEqual(ordinary(await snapshot(people[0])), initialPlanet);
      assert.deepEqual(ordinary(await snapshot(people[0], "/scene/seaside")), initialCoast);
      assert.ok(!(await snapshot(people[0])).sounds.some(source => privateSounds.includes(source.id)), "No private test sound remains");
      checks.push({ label: "Only this run's ordinary sounds were soft-removed; existing planet and coastal histories remain exact" });
    } catch (error) { cleanupFailed = true;failed = true;process.exitCode = 1;console.error("Cleanup snapshot", error.message); }
  }
  if (out) writeFileSync(`${out}/results.json`, JSON.stringify({ kind: "automated-developer-browser-test", base, checks, failed, errors, metrics,
    made: made.map(({ sound }) => ({ id: sound.id, soundId: sound.soundId, authorId: sound.byId, replyToId: sound.replyToId, x: sound.x, z: sound.z })),
    privateSounds, phoneProbes, realUnfamiliarPairs: false, physicalPhone: false, humanListening: false }, null, 2));
  await browser.close();
  if (!cleanupFailed) rmSync(recoveryPath, { force: true });
}
