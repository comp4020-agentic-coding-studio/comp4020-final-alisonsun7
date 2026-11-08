#!/usr/bin/env node
// Actual developer UI verification, not human listening or a friend study.
// Reserved independent world only:
// APP_URL=http://localhost:18912 SCRATCH_DB=.cache/motion/browser/history.db
// node e2e/sounds-in-motion.mjs .cache/motion/sounds-in-motion-artifacts
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";

assert.ok(process.env.APP_URL, "Set the explicitly isolated motion-test APP_URL");
const address = new URL(process.env.APP_URL);
assert.equal(address.protocol, "http:");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "Use only a local independent world");
assert.equal(address.port, "18912", "This writing check is reserved for port 18912, never the player's 18861 preview");
assert.equal(address.pathname, "/");assert.equal(address.search, "");assert.equal(address.hash, "");
assert.ok(!address.username && !address.password);
const base = address.origin;
assert.ok(process.env.SCRATCH_DB, "Set the independent motion-test SCRATCH_DB");
const databasePath = realpathSync(resolve(process.env.SCRATCH_DB));
assert.equal(databasePath, resolve(".cache/motion/browser/history.db"), "Only the dedicated motion-test database may be read for history evidence");
const database = new DatabaseSync(databasePath, { readOnly: true });
const storedRows = () => database.prepare("SELECT * FROM placed_sounds ORDER BY id").all().map(row => ({ ...row }));
const storedSource = id => database.prepare("SELECT * FROM placed_sounds WHERE id=?").get(id);
const initialStored = storedRows();
const out = process.argv[2];if (out) mkdirSync(out, { recursive: true });
mkdirSync(".cache/motion", { recursive: true });
const recoveryPath = `.cache/motion/sounds-in-motion-recovery-${crypto.randomUUID()}.json`;
const people = [], made = new Map(), pending = new Set(), checks = [], errors = [], targetRects = [], cleanupErrors = [];
const historyEvidence = { database: ".cache/motion/browser/history.db", mode: "read-only SQLite", initialRows: initialStored.length,
  initialRowsPreserved: false, onlyAcknowledgedOwnRowsAdded: false, fixtureTombstones: [] };
let browser, failed = false, failure, initialPlanet, initialCoast;
const began = Date.now();
const check = (condition, label, detail) => {
  assert.ok(condition, label);checks.push({ label, elapsedMs: Date.now() - began, ...(detail === undefined ? {} : { detail }) });console.log("ok  " + label);
};
const shot = async (page, name) => { if (out && !page.isClosed()) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const dataset = (page, key) => page.locator("#planet-stage").evaluate((element, key) => element.dataset[key], key);
const state = async (page, key) => JSON.parse(await dataset(page, key) ?? "[]");
// Snapshot.sounds contains living sources, not durable removal tombstones.
const liveSources = snap => snap.sounds.filter(source => !source.whileIn && !source.removedAt).map(source => ({ ...source })).sort((a, b) => a.id.localeCompare(b.id));
const saveRecovery = () => writeFileSync(recoveryPath, JSON.stringify({ base,
  identities: people.map(({ name, id, sessionId, cookies }) => ({ name, id, sessionId, cookies })),
  acknowledgedSounds: [...made.values()].map(({ sound }) => sound),
}, null, 2), { mode: 0o600 });
function assertStored(row, who, sound) {
  assert.ok(row, `Keep actual source ${sound.id} in the independent database`);
  assert.equal(row.id, sound.id);assert.equal(row.session_id, who.sessionId);
  assert.equal(row.sound_id, sound.soundId);assert.equal(row.placed_by, sound.byId);assert.equal(sound.byId, who.id);
  assert.equal(row.x, sound.x);assert.equal(row.z, sound.z);assert.equal(row.placed_at, sound.at);assert.equal(row.while_in, null);
}
async function snapshot(who, path = "/planet") {
  const response = await who.context.request.get(base + path);assert.ok(response.ok(), `Actual snapshot HTTP ${response.status()}`);
  const match = (await response.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, "Read the actual server boot snapshot");return JSON.parse(match[1]).snapshot;
}
async function ready(page) {
  await page.waitForFunction(() => !!document.getElementById("planet-stage")?.dataset.groundSafety && !document.querySelector("dialog:modal")
    && !document.getElementById("chorus-primary")?.disabled);
}
async function quietPerson(name, avatar) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true });
  await context.addInitScript(() => {
    // Observe native node starts; no autoplay-policy override or fabricated audio.
    window.__motionStarts = 0;window.__motionContexts = 0;
    const Context = window.AudioContext;
    window.AudioContext = class extends Context {
      constructor(...args) { super(...args);window.__motionContexts++; }
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => { window.__motionStarts++;return start(...args); };return source;
      }
    };
  });
  const page = await context.newPage();page.setDefaultTimeout(20_000);
  const who = { context, page, name, posts: 0, lastMoveAt: 0, lastWriteAt: 0 };people.push(who);
  page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
  page.on("request", request => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (/\/sounds$/.test(path)) who.posts++;
    if (/\/move$/.test(path)) who.lastMoveAt = Date.now();
  });
  page.on("response", response => {
    if (response.request().method() !== "POST" || !/\/sounds$/.test(new URL(response.url()).pathname)) return;
    const receipt = response.json().then(result => {
      if (result.ok && result.sound && !result.sound.whileIn) { made.set(result.sound.id, { who, sound: result.sound });saveRecovery(); }
    }).catch(() => {});
    pending.add(receipt);void receipt.finally(() => pending.delete(receipt));
  });
  await page.goto(base + "/planet");
  await page.fill('#planet-join-form input[name="nickname"]', name);
  await page.check(`#planet-join-form input[value="${avatar}"]`, { force: true });
  await page.locator("#planet-enter").click();
  await page.locator("#chorus-welcome").getByRole("button", { name: "Explore quietly", exact: true }).click();
  await ready(page);
  const joined = await snapshot(who);who.id = joined.you.id;who.sessionId = joined.sessionId;who.cookies = await context.cookies();saveRecovery();return who;
}
async function travel(who, place) {
  const page = who.page;await page.bringToFront();
  const direct = page.locator(`#chorus-travel [data-place="${place}"]`);
  if (await direct.count()) await direct.click();
  else { await page.locator("#planet-tools").click();await page.locator(`#planet-destinations [data-zone="${place}"]`).click(); }
  await page.waitForFunction(async id => {
    const { PLANET_PLACES } = await import("/shared/planet.js"), place = PLANET_PLACES.find(place => place.id === id);
    const position = JSON.parse(document.getElementById("planet-stage").dataset.groundSafety ?? "null");
    const front = place.kind === "green" ? 2.2 : place.kind === "tea" ? 3 : place.kind === "conservatory" ? -4 : ["stage", "reading"].includes(place.kind) ? 4 : 0;
    return !document.querySelector("dialog:modal") && position && Math.hypot(position.x - place.x - (place.kind === "green" ? 1.8 : 0), position.z - place.z - front) < .03;
  }, place);
}
async function discovery(page) {
  if (await page.locator("#sound-discovery-reopen").isVisible()) await page.locator("#sound-discovery-reopen").click();
  await page.locator("#sound-discovery").waitFor({ state: "visible" });
}
async function share(who) {
  // The contextual discovery card intentionally replaces the large Share button.
  if (await who.page.locator("#sound-discovery").isVisible()) await who.page.locator("#sound-discovery-close").click();
  // In an activity area such as Reading Nook, the visible work action replaces
  // that standalone Share button at every viewport. Use the player's actual
  // control rather than clicking the deliberately hidden duplicate.
  const reopen = who.page.locator("#chorus-reopen");
  if (await reopen.isVisible()) await reopen.click();
  const primary = who.page.locator("#chorus-primary");
  if (await primary.isVisible()) await primary.click();
  else await who.page.locator("#planet-place").click();
  await who.page.locator("#chorus-studio").waitFor({ state: "visible" });
}
async function leave(who, soundId, fullLibrary = false) {
  await who.page.waitForTimeout(Math.max(0, 1100 - (Date.now() - who.lastWriteAt)));
  const dialog = fullLibrary ? "#sound-palette" : "#chorus-studio";
  const selector = fullLibrary ? `${dialog} [data-sound="${soundId}"]` : `${dialog} [data-leave="${soundId}"]`;
  const [response] = await Promise.all([
    who.page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds`),
    who.page.locator(selector).click(),
  ]);
  const result = await response.json();
  if (result.ok && result.sound && !result.sound.whileIn) { made.set(result.sound.id, { who, sound: result.sound });saveRecovery(); }
  assert.ok(response.ok() && result.ok && result.sound, `Explicit actual Leave ${soundId}: ${JSON.stringify(result)}`);
  assert.equal(result.sound.soundId, soundId);assert.equal(result.sound.byId, who.id);who.lastWriteAt = Date.now();
  assertStored(storedSource(result.sound.id), who, result.sound);
  await who.page.locator(dialog).waitFor({ state: "hidden" });return result.sound;
}
async function remove(who, sound) {
  assert.ok(made.get(sound.id)?.who === who && sound.byId === who.id, "Only this run's acknowledged own source is a removal target");
  await who.page.waitForTimeout(Math.max(0, 1100 - (Date.now() - who.lastWriteAt)));
  if(await who.page.locator("#planet-shared").isVisible())await who.page.locator("#planet-shared").click();
  else {await who.page.locator("#planet-tools").tap();await who.page.locator("#planet-open-soundscape").tap();}
  const [response] = await Promise.all([
    who.page.waitForResponse(response => response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds/${sound.id}`),
    who.page.locator(`#planet-soundscape [data-id="${sound.id}"] [data-planet-remove]`).click(),
  ]);
  assert.ok(response.ok() && (await response.json()).ok, "Actual UI source withdrawal acknowledged");who.lastWriteAt = Date.now();
  await who.page.locator("#planet-soundscape").getByRole("button", { name: "Close", exact: true }).click();
  await who.page.locator("#planet-soundscape").waitFor({ state: "hidden" });
}
async function effect(page, key, sourceId, present = true) {
  await page.waitForFunction(({ key, sourceId, present }) => {
    const rows = JSON.parse(document.getElementById("planet-stage").dataset[key] ?? "[]");
    return rows.some(row => row.sourceId === sourceId && (key !== "soundVessels" || row.visible)) === present;
  }, { key, sourceId, present });
  return page.locator("#planet-stage").evaluate((stage, { key, sourceId }) => ({
    serverNow: Number(stage.dataset.serverNow), source: JSON.parse(stage.dataset[key] ?? "[]").find(row => row.sourceId === sourceId),
  }), { key, sourceId });
}
async function reachable(page, selector) {
  const result = await page.locator(selector).evaluate(element => {
    const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { selector: element.id, x: r.x, y: r.y, width: r.width, height: r.height,
      interceptor: hit?.closest("button,input,aside,form")?.id ?? hit?.tagName,
      usable: !element.matches(":disabled") && r.width >= 44 && r.height >= 44 && r.left >= 0 && r.top >= 0
        && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && !!hit && element.contains(hit) };
  });targetRects.push(result);return result;
}
async function quiet(pages) {
  return Promise.all(pages.map(page => page.locator("#planet-stage").evaluate(stage => ({
    on: stage.dataset.soundOn, voices: Number(stage.dataset.voices), starts: window.__motionStarts, contexts: window.__motionContexts,
  }))));
}
async function watch(who, horn, touch = false) {
  const page = who.page;await travel(who, "pool");await discovery(page);
  await page.locator("#sound-discovery-watch").waitFor({ state: "visible" });
  const metrics = await reachable(page, "#sound-discovery-watch");assert.ok(metrics.usable, "Watch the boat is an unobstructed 44px target");
  const before = JSON.parse(await dataset(page, "groundSafety")), stored = { ...storedSource(horn.id) }, posts = who.posts;
  if (touch) await page.locator("#sound-discovery-watch").tap();else await page.locator("#sound-discovery-watch").click();
  await page.waitForFunction(before => {
    const at = JSON.parse(document.getElementById("planet-stage").dataset.groundSafety ?? "null");
    return at && Math.hypot(at.x - before.x, at.z - before.z) > 1;
  }, before);
  const actual = await page.evaluate(async () => {
    const state = JSON.parse(document.getElementById("planet-stage").dataset.groundSafety), { PLANET_RADIUS } = await import("/shared/planet.js");
    const { coastlineAt } = await import("/client/planet-coast.js"), { buildPlanet } = await import("/client/planet-build.js");
    // Read the actual production collision/floor rules; this extra unrendered
    // geometry is disposed immediately and cannot move the live world.
    const geometry = buildPlanet();
    try { return { ...state, planetRadius: PLANET_RADIUS, shore: coastlineAt(state.x), canStand: geometry.canStand(state.x, state.z, new Set()) }; }
    finally { geometry.dispose(); }
  });
  assert.ok(actual.canStand && actual.z < actual.shore && actual.signedFeetRadius >= actual.planetRadius - .05 && actual.cameraRadius > actual.planetRadius,
    "Watch reaches actual walkable shore with outward feet and camera above the ground: " + JSON.stringify(actual));
  assert.deepEqual({ ...storedSource(horn.id) }, stored, "Watch does not rewrite the source or any stored metadata");
  const current = (await snapshot(who)).sounds.find(source => source.id === horn.id);
  assert.equal(current.x, horn.x);assert.equal(current.z, horn.z);assert.equal(current.byId, horn.byId);assert.equal(who.posts, posts);
  await page.waitForFunction(id=>{const frame=JSON.parse(document.getElementById("planet-stage").dataset.watchedVessel??"null");return frame?.sourceId===id&&frame.visible;},horn.id);
  const unobstructed=await page.evaluate(()=>{const p=JSON.parse(document.getElementById("planet-stage").dataset.watchedVessel),stage=document.getElementById("planet-stage"),r=stage.getBoundingClientRect(),hit=document.elementFromPoint(r.x+p.x,r.y+p.y);return !!hit&&hit.matches("canvas.planet-canvas");});
  assert.ok(unobstructed,"The watched ferry projects into unobstructed world space, clear of the phone/desktop HUD");
  return { metrics, actual };
}

try {
  browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
  const ada = await quietPerson("Motion Ada", "cat"), a = ada.page;
  initialPlanet = liveSources(await snapshot(ada));initialCoast = liveSources(await snapshot(ada, "/scene/seaside"));
  assert.equal(initialPlanet.length, 0, "Start from the dedicated fresh or cleaned motion-test world");
  await travel(ada, "pool");await share(ada);
  const choices = await a.locator("#chorus-studio [data-leave]").evaluateAll(buttons => buttons.map(button => button.dataset.leave));
  check(choices.length === 3 && choices.includes("harbour-boat"), "Tide pools Share offers three real curated choices including the passing ferry", choices);
  const shipHint = await a.locator('#chorus-studio [data-sound="harbour-boat"] .chorus-choice-outcome').textContent();
  check(/ferry|boat/i.test(shipHint), "The horn choice explains its visible ferry consequence before publishing", shipHint);
  const horn = await leave(ada, "harbour-boat"), first = await effect(a, "soundVessels", horn.id);
  check(first.source.byId === ada.id && first.source.by === ada.name && first.source.sourceX === horn.x && first.source.sourceZ === horn.z,
    "An explicit real horn creates a ferry retaining the actual author and original sound position", first.source);
  await a.waitForFunction(({ id, before, serverNow }) => {
    const stage = document.getElementById("planet-stage"), source = JSON.parse(stage.dataset.soundVessels ?? "[]").find(source => source.sourceId === id && source.visible);
    return source && Number(stage.dataset.serverNow) - serverNow >= 1200 && Math.hypot(source.x - before.x, source.z - before.z) > .05;
  }, { id: horn.id, before: first.source, serverNow: first.serverNow });
  check(true, "The ferry changes actual rendered position over more than one second of server time");

  // A genuinely new cookie identity arrives after the authored result exists.
  const bo = await quietPerson("Motion Bo", "dog"), b = bo.page;await travel(bo, "pool");
  check(ada.id !== bo.id && ada.cookies.find(cookie => cookie.name === "soac_session")?.value !== bo.cookies.find(cookie => cookie.name === "soac_session")?.value,
    "A later friend enters with an independent real cookie identity");
  const samples = await Promise.all([effect(a, "soundVessels", horn.id), effect(b, "soundVessels", horn.id)]);
  const consistency = await a.evaluate(async rows => {
    const { planetDistance } = await import("/shared/planet.js");
    return { clockDeltaMs: Math.abs(rows[0].serverNow - rows[1].serverNow), poseDeltaMetres: planetDistance(rows[0].source, rows[1].source),
      anchorsMatch: rows[0].source.anchorX === rows[1].source.anchorX && rows[0].source.anchorZ === rows[1].source.anchorZ };
  }, samples);
  check(samples.every(sample => sample.source.sourceId === horn.id && sample.source.byId === ada.id && sample.source.by === ada.name)
    && consistency.anchorsMatch && consistency.clockDeltaMs < 2000 && consistency.poseDeltaMetres < .2 + consistency.clockDeltaMs / 1000,
    "Late arrival sees the same authored ferry and server-time trajectory, allowing actual frame-sampling skew", consistency);
  check((await quiet([a, b])).every(state => state.on === "false" && state.voices === 0 && state.starts === 0 && state.contexts === 0),
    "Both independent visits remain genuinely quiet while the shared ferry moves");

  const desktopWatch = await watch(ada, horn);check(true, "Desktop Watch reaches a safe real shore without moving the horn or publishing another source", desktopWatch.actual);
  await shot(a, "motion-ferry-watch-desktop");
  await a.setViewportSize({ width: 390, height: 844 });
  const phoneWatch = await watch(ada, horn, true);check(phoneWatch.metrics.usable, "At 390×844, touch Watch has a visible unobstructed 44px target and reaches the real shore", phoneWatch);
  await shot(a, "motion-ferry-watch-phone");
  await travel(ada, "pool");await remove(ada, horn);
  await Promise.all([effect(a, "soundVessels", horn.id, false), effect(b, "soundVessels", horn.id, false)]);
  check((await Promise.all([snapshot(ada), snapshot(bo)])).every(snap => !snap.sounds.some(source => source.id === horn.id)),
    "Actual UI withdrawal removes the live horn and its ferry in both open browser sessions");

  await a.setViewportSize({ width: 1920, height: 1080 });await travel(ada, "reading");await travel(bo, "reading");
  await share(ada);await a.locator("#chorus-studio").getByRole("button", { name: "Explore every sound", exact: true }).click();
  await a.locator("#sound-palette").waitFor({ state: "visible" });await a.locator('#sound-palette input[type="search"]').fill("Breeze");
  const breezeCard = a.locator('#sound-palette [data-sound="gentle-breeze"]').locator("xpath=..");
  check(/pinwheel/i.test(await breezeCard.locator(".palette-response").textContent()), "The searchable full library explains the breeze's paper-pinwheel consequence");
  const breeze = await leave(ada, "gentle-breeze", true);
  const wheels = await Promise.all([effect(a, "soundPinwheels", breeze.id), effect(b, "soundPinwheels", breeze.id)]);
  check(wheels.every(sample => sample.source.byId === ada.id && sample.source.by === ada.name && sample.source.sourceX === breeze.x && sample.source.sourceZ === breeze.z)
    && wheels[0].source.x === wheels[1].source.x && wheels[0].source.z === wheels[1].source.z,
    "The real breeze creates the same source-attributed paper pinwheel for both friends", wheels);
  await a.waitForFunction(({ id, angle, serverNow }) => {
    const stage = document.getElementById("planet-stage"), wheel = JSON.parse(stage.dataset.soundPinwheels ?? "[]").find(source => source.sourceId === id);
    return wheel && Number(stage.dataset.serverNow) - serverNow >= 1000 && Math.abs(Math.atan2(Math.sin(wheel.angle - angle), Math.cos(wheel.angle - angle))) > .3;
  }, { id: breeze.id, angle: wheels[0].source.angle, serverNow: wheels[0].serverNow });
  check(true, "The source-derived pinwheel visibly turns over server time");await shot(a, "motion-reading-pinwheel-desktop");
  await b.reload();await ready(b);await effect(b, "soundPinwheels", breeze.id);
  check((await quiet([a, b])).every(state => state.on === "false" && state.voices === 0 && state.starts === 0 && state.contexts === 0),
    "A friend's contribution and a document reload never enable either quiet visitor's audio");
  await remove(ada, breeze);await Promise.all([effect(a, "soundPinwheels", breeze.id, false), effect(b, "soundPinwheels", breeze.id, false)]);
  check((await Promise.all([snapshot(ada), snapshot(bo)])).every(snap => !snap.sounds.some(source => source.id === breeze.id)),
    "Withdrawing the real breeze removes its pinwheel and live source from both sessions");
  check(errors.length === 0, "The actual motion and withdrawal path has no browser runtime errors", errors);
} catch (error) {
  failed = true;failure = error?.stack ?? String(error);process.exitCode = 1;console.error(error);
  for (const who of people) await shot(who.page, `motion-failure-${who.name.replaceAll(" ", "-")}`).catch(() => {});
} finally {
  await Promise.allSettled([...pending]);
  for (const who of people) await who.page.goto("about:blank").catch(() => {});
  for (const { who, sound } of [...made.values()].reverse()) {
    try {
      const row = storedSource(sound.id);assertStored(row, who, sound);if (row.removed_at) continue;
      await who.page.waitForTimeout(1100);
      while (Date.now() - who.lastMoveAt < 140) await who.page.waitForTimeout(140 - (Date.now() - who.lastMoveAt));
      const moved = await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
      assert.ok(moved.ok() && (await moved.json()).ok, "Cleanup approaches only the acknowledged own source");
      const removed = await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`);
      assert.ok(removed.ok() && (await removed.json()).ok, "Cleanup soft-removes only the acknowledged own source");
    } catch (error) { failed = true;process.exitCode = 1;cleanupErrors.push(error.message);console.error("Cleanup:", error.message); }
  }
  try {
    const ids = new Set(made.keys()), finalRows = storedRows();
    assert.deepEqual(finalRows.filter(row => !ids.has(row.id)), initialStored, "Every original stored sound row is unchanged");
    for (const { who, sound } of made.values()) {
      assert.ok(!initialStored.some(row => row.id === sound.id));const row = storedSource(sound.id);assertStored(row, who, sound);
      assert.ok(row.removed_at && Number.isFinite(Date.parse(row.removed_at)));assert.equal(row.removed_by, who.id);
      historyEvidence.fixtureTombstones.push({ id: row.id, soundId: row.sound_id, byId: row.placed_by, x: row.x, z: row.z, at: row.placed_at, removedAt: row.removed_at });
    }
    if (people[0] && initialPlanet && initialCoast) {
      const final = liveSources(await snapshot(people[0]));assert.ok(final.every(source => !ids.has(source.id)));
      assert.deepEqual(final, initialPlanet);assert.deepEqual(liveSources(await snapshot(people[0], "/scene/seaside")), initialCoast);
    }
    Object.assign(historyEvidence, { finalRows: finalRows.length, initialRowsPreserved: true, onlyAcknowledgedOwnRowsAdded: true });
    check(true, "Read-only scratch SQLite confirms original rows are intact and each acknowledged fixture retains a real source/author/position tombstone", historyEvidence);
    if (!cleanupErrors.length) rmSync(recoveryPath, { force: true });
  } catch (error) { failed = true;process.exitCode = 1;cleanupErrors.push(error.message);console.error("History verification:", error.message); }
  if (out) writeFileSync(`${out}/results.json`, JSON.stringify({ type: "automated-developer-browser-check", base, failed, failure, checks, errors, cleanupErrors,
    targetRects, historyEvidence, sources: [...made.values()].map(({ sound }) => sound),
    independentCookieIdentities: people.length === 2 && people[0].id !== people[1].id,
    humanListening: false, unfamiliarPairStudy: false, physicalPhone: false, nextDayReturn: false,
    limitations: ["Native audio starts and contexts are observed without an autoplay bypass; artistic sound quality is not judged.",
      "A document reload is not a server restart or a next-day revisit.", "390×844 touch emulation does not establish physical-device usability.",
      "Ground checks use the actual production geometry; screenshots still require visual inspection."],
  }, null, 2));
  if (browser) await browser.close();database.close();
}
