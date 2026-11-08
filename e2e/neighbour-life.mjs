#!/usr/bin/env node
// Actual developer browser observations, not a human playtest or listening verdict.
// Candidate writes are reserved for this exact independent world:
// APP_URL=http://localhost:18922 SCRATCH_DB=.cache/neighbours/browser/history.db
// node e2e/neighbour-life.mjs .cache/neighbours/browser-artifacts
// APP_URL=http://localhost:18920 checks the frozen baseline as a quiet observer
// only; it never joins, publishes, moves on the server or opens a database.
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";

assert.ok(process.env.APP_URL, "Set the explicitly isolated neighbours-test APP_URL");
const address = new URL(process.env.APP_URL);
assert.equal(address.protocol, "http:");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname));
assert.ok(["18920", "18922"].includes(address.port), "Use only frozen baseline 18920 or independent writing candidate 18922; never 18861");
assert.equal(address.pathname, "/");assert.equal(address.search, "");assert.equal(address.hash, "");
assert.ok(!address.username && !address.password);
const base = address.origin, baseline = address.port === "18920", out = process.argv[2];
let database;
if (!baseline) {
  assert.ok(process.env.SCRATCH_DB, "Set the dedicated independent neighbours database before any browser writes");
  const path = realpathSync(resolve(process.env.SCRATCH_DB));
  assert.equal(path, resolve(".cache/neighbours/browser/history.db"), "No other database is permitted for writing-browser evidence");
  database = new DatabaseSync(path, { readOnly: true });
}
if (out) mkdirSync(out, { recursive: true });
mkdirSync(".cache/neighbours", { recursive: true });
const storedRows = () => database.prepare("SELECT * FROM placed_sounds ORDER BY id").all().map(row => ({ ...row }));
const storedSource = id => database.prepare("SELECT * FROM placed_sounds WHERE id=?").get(id);
const initialStored = database ? storedRows() : null;
const recoveryPath = `.cache/neighbours/neighbour-life-recovery-${crypto.randomUUID()}.json`;
const people = [], made = new Map(), pending = new Set(), checks = [], errors = [], cleanupErrors = [], targets = [], samples = [];
const evidence = { baselineReadOnly: baseline, observation: null, consistency: null, attention: [], reducedMotion: [], history: null };
let browser, failed = false, failure, initialPlanet, initialCoast;
const began = Date.now();
const check = (condition, label, detail) => {
  assert.ok(condition, label);checks.push({ label, elapsedMs: Date.now() - began, ...(detail === undefined ? {} : { detail }) });console.log("ok  " + label);
};
const shot = async (page, name) => { if (out && !page.isClosed()) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const liveSources = snapshot => snapshot.sounds.filter(source => !source.whileIn && !source.removedAt).map(source => ({ ...source })).sort((a, b) => a.id.localeCompare(b.id));
const saveRecovery = () => {
  if (baseline) return;
  writeFileSync(recoveryPath, JSON.stringify({ base, identities: people.map(({ name, id, sessionId, cookies }) => ({ name, id, sessionId, cookies })),
    acknowledgedSounds: [...made.values()].map(({ sound }) => sound) }, null, 2), { mode: 0o600 });
};
function assertStored(row, who, sound) {
  assert.ok(row, `Keep actual source ${sound.id} in the independent database`);
  assert.equal(row.session_id, who.sessionId);assert.equal(row.sound_id, sound.soundId);assert.equal(row.placed_by, who.id);
  assert.equal(row.x, sound.x);assert.equal(row.z, sound.z);assert.equal(row.placed_at, sound.at);assert.equal(row.while_in, null);
}
async function snapshot(who, path = "/planet") {
  const response = await who.context.request.get(base + path);assert.ok(response.ok(), `Snapshot HTTP ${response.status()}`);
  const match = (await response.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, "Read the actual server boot snapshot");return JSON.parse(match[1]).snapshot;
}
async function contextPage(name) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true });
  await context.addInitScript(() => {
    // Only observe native audio. Do not bypass autoplay, start a context,
    // replace the clock or manufacture a decoded sound in a quiet visit.
    window.__neighbourStarts = 0;window.__neighbourContexts = 0;
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(...args) { super(...args);window.__neighbourContexts++; }
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => { window.__neighbourStarts++;return start(...args); };return source;
      }
    };
  });
  const page = await context.newPage();page.setDefaultTimeout(15_000);
  const who = { context, page, name, posts: 0, writes: [], lastMoveAt: 0, lastSoundAt: 0 };people.push(who);
  page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (["POST", "DELETE", "PUT", "PATCH"].includes(request.method())) who.writes.push({ method: request.method(), path });
    if (request.method() === "POST" && /\/move$/.test(path)) who.lastMoveAt = Date.now();
    if (request.method() === "POST" && /\/sounds$/.test(path)) who.posts++;
  });
  page.on("response", response => {
    if (baseline || response.request().method() !== "POST" || !/\/sounds$/.test(new URL(response.url()).pathname)) return;
    const receipt = response.json().then(result => {
      if (result.ok && result.sound && !result.sound.whileIn) { made.set(result.sound.id, { who, sound: result.sound });saveRecovery(); }
    }).catch(() => {});
    pending.add(receipt);void receipt.finally(() => pending.delete(receipt));
  });
  await page.goto(base + "/planet");return who;
}
async function quietPerson(name, avatar) {
  assert.ok(!baseline, "The baseline is an anonymous observer, never a writing identity");
  const who = await contextPage(name), page = who.page;
  await page.fill('#planet-join-form input[name="nickname"]', name);
  await page.check(`#planet-join-form input[value="${avatar}"]`, { force: true });
  await page.locator("#planet-enter").click();
  await page.locator("#chorus-welcome").getByRole("button", { name: "Explore quietly", exact: true }).click();
  await page.waitForFunction(() => !!document.getElementById("planet-stage")?.dataset.groundSafety && !document.querySelector("dialog:modal"));
  const joined = await snapshot(who);who.id = joined.you.id;who.sessionId = joined.sessionId;who.cookies = await who.context.cookies();saveRecovery();return who;
}
async function cafe(who, touch = false) {
  const page = who.page;await page.bringToFront();
  const direct = page.locator('#chorus-travel [data-place="tea"]');
  if (await direct.isVisible()) { if (touch) await direct.tap();else await direct.click(); }
  else {
    if (touch) await page.locator("#planet-tools").tap();else await page.locator("#planet-tools").click();
    if (touch) await page.locator('#planet-destinations [data-zone="tea"]').tap();else await page.locator('#planet-destinations [data-zone="tea"]').click();
  }
  await page.waitForFunction(async () => {
    const { PLANET_PLACES } = await import("/shared/planet.js"), place = PLANET_PLACES.find(place => place.id === "tea");
    const stage = document.getElementById("planet-stage"), at = JSON.parse(stage.dataset.groundSafety ?? "null");
    return !document.querySelector("dialog:modal") && at && Math.hypot(at.x - place.x, at.z - place.z - 3) < .03
      && document.getElementById("planet-area").textContent === "Tide & Coffee";
  });
}
async function frame(page) {
  return page.locator("#planet-stage").evaluate(async stage => {
    const { planetDistance } = await import("/shared/planet.js"), { bearingToward } = await import("/client/planet-locomotion.js");
    const rows = JSON.parse(stage.dataset.residentLife ?? "null"), bounds = stage.getBoundingClientRect();
    const unobstructed = point => {
      if (!point?.visible || point.x < 0 || point.y < 0 || point.x >= bounds.width || point.y >= bounds.height) return false;
      return !!document.elementFromPoint(bounds.x + point.x, bounds.y + point.y)?.matches("canvas.planet-canvas");
    };
    const residents = rows?.map(row => ({ ...row, unobstructed: unobstructed(row.screen), cueUnobstructed: unobstructed(row.cueScreen) })) ?? null;
    const coco = residents?.find(row => row.id === "coffee-reader"), maple = residents?.find(row => row.id === "coffee-company");
    const delta = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const paired = coco && maple && coco.partnerId === maple.id && maple.partnerId === coco.id
      && [coco.role, maple.role].sort().join(",") === "listening,speaking";
    const speaker = paired ? [coco, maple].find(row => row.role === "speaking") : null;
    return { wallNow: Date.now(), serverNow: Number(stage.dataset.serverNow), residents,
      quiet: { on: stage.dataset.soundOn, voices: Number(stage.dataset.voices), starts: window.__neighbourStarts, contexts: window.__neighbourContexts },
      pair: paired ? { ids: [coco.id, maple.id], distance: planetDistance(coco, maple),
        yawErrors: [delta(coco.yaw, bearingToward(coco, maple)), delta(maple.yaw, bearingToward(maple, coco))],
        visible: coco.screen?.visible && maple.screen?.visible, unobstructed: coco.unobstructed && maple.unobstructed,
        speakerCue: speaker ? { id: speaker.id, shown: speaker.cueVisible === true, visible: speaker.cueScreen?.visible === true, unobstructed: speaker.cueUnobstructed } : null,
        roles: [coco.role, maple.role] } : null };
  });
}
const isQuiet = sample => sample.quiet.on === "false" && sample.quiet.voices === 0 && sample.quiet.starts === 0 && sample.quiet.contexts === 0;
const rigValid = row => [row.rig?.head, row.rig?.left, row.rig?.right].every(rotation => Array.isArray(rotation) && rotation.length >= 3 && rotation.slice(0, 3).every(Number.isFinite));
const range = values => values.length ? Math.max(...values) - Math.min(...values) : 0;
async function share(who, touch = false) {
  const page = who.page;
  if (await page.locator("#sound-discovery").isVisible()) await page.locator("#sound-discovery-close").click();
  if (await page.locator("#planet-nearby-sound").isVisible()) await page.locator("#planet-nearby-close").click();
  if (await page.locator("#chorus-reopen").isVisible()) await page.locator("#chorus-reopen").click();
  const selector = await page.locator("#chorus-primary").isVisible() ? "#chorus-primary" : "#planet-place";
  if (touch) await page.locator(selector).tap();else await page.locator(selector).click();
  await page.locator("#chorus-studio").waitFor({ state: "visible" });
  return selector;
}
async function reachable(page, selector) {
  const result = await page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { selector: element.id || element.getAttribute("data-leave") || element.getAttribute("data-listen"), x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      interceptor: hit?.closest("button,input,aside,form")?.id ?? hit?.tagName,
      usable: !element.matches(":disabled") && rect.width >= 44 && rect.height >= 44 && rect.x >= 0 && rect.y >= 0
        && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 && !!hit && element.contains(hit) };
  });targets.push(result);return result;
}
async function leaveChatter(who) {
  await share(who);
  const choices = await who.page.locator("#chorus-studio [data-leave]").evaluateAll(buttons => buttons.map(button => button.dataset.leave));
  assert.deepEqual(choices, ["espresso", "cafe-chatter", "cafe-music"], "Use the actual ordinary café chooser");
  const [response] = await Promise.all([
    who.page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds`),
    who.page.locator('#chorus-studio [data-leave="cafe-chatter"]').click(),
  ]);
  const result = await response.json();assert.ok(response.ok() && result.ok && result.sound, `Actual Leave acknowledged: ${JSON.stringify(result)}`);
  assert.equal(result.sound.soundId, "cafe-chatter");assert.equal(result.sound.byId, who.id);
  made.set(result.sound.id, { who, sound: result.sound });saveRecovery();who.lastSoundAt = Date.now();
  assertStored(storedSource(result.sound.id), who, result.sound);
  await who.page.locator("#chorus-studio").waitFor({ state: "hidden" });return result.sound;
}
async function remove(who, sound) {
  assert.ok(made.get(sound.id)?.who === who && sound.byId === who.id, "Only this run's acknowledged own source can be withdrawn");
  await who.page.waitForTimeout(Math.max(0, 1100 - (Date.now() - who.lastSoundAt)));
  if (await who.page.locator("#planet-shared").isVisible()) await who.page.locator("#planet-shared").click();
  else { await who.page.locator("#planet-tools").tap();await who.page.locator("#planet-open-soundscape").tap(); }
  const action = who.page.locator(`#planet-soundscape [data-id="${sound.id}"] [data-planet-remove]`);
  assert.ok(await action.isEnabled(), "Withdraw beside the real source, without moving it to the test player");
  const [response] = await Promise.all([
    who.page.waitForResponse(response => response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds/${sound.id}`), action.click(),
  ]);
  assert.ok(response.ok() && (await response.json()).ok, "UI withdrawal acknowledged");who.lastSoundAt = Date.now();
  await who.page.locator("#planet-soundscape").getByRole("button", { name: "Close", exact: true }).click();
  await who.page.locator("#planet-soundscape").waitFor({ state: "hidden" });
}

try {
  browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
  if (baseline) {
    const observer = await contextPage("Baseline observer");
    await observer.page.locator("#planet-observe").click();
    await observer.page.locator("canvas.planet-canvas").waitFor({ state: "visible" });
    await observer.page.waitForFunction(() => !!document.getElementById("planet-stage")?.dataset.groundSafety);
    await shot(observer.page, "baseline-quiet-observer");
    assert.equal(observer.writes.length, 0, "The frozen baseline is observed without joining or writing");
    const actual = await frame(observer.page);
    evidence.baseline = actual;
    assert.ok(Array.isArray(actual.residents) && actual.residents.length === 12,
      "The running baseline lacks the residentLife capability: no claimed activity, rig or paired-conversation checks passed");
    throw new Error("This baseline-only mode is read-only. Run the actual writing path on guarded port 18922.");
  }

  const ada = await quietPerson("Neighbour Ada", "cat"), a = ada.page;
  initialPlanet = liveSources(await snapshot(ada));initialCoast = liveSources(await snapshot(ada, "/scene/seaside"));
  assert.equal(initialPlanet.length, 0, "The dedicated candidate starts with no public contributions");
  const bo = await quietPerson("Neighbour Bo", "dog"), b = bo.page;
  await cafe(ada);await cafe(bo);
  await Promise.all([a.waitForFunction(() => !!document.getElementById("planet-stage")?.dataset.residentLife), b.waitForFunction(() => !!document.getElementById("planet-stage")?.dataset.residentLife)]);
  const first = await frame(a);
  check(first.residents?.length === 12 && first.residents.every(rigValid), "The rendered candidate exposes twelve existing NPCs and their final actual head and arm rotations");
  check(ada.id !== bo.id && ada.cookies.find(cookie => cookie.name === "soac_session")?.value !== bo.cookies.find(cookie => cookie.name === "soac_session")?.value,
    "Two quiet visitors enter through the real join UI with independent browser-cookie identities");
  const online = (await snapshot(ada)).online;
  check(online.length === 2 && online.some(person => person.id === ada.id) && online.some(person => person.id === bo.id)
    && !online.some(person => first.residents.some(resident => resident.id === person.id)), "The twelve NPCs are not counted as the two real joined people", online.map(({ id, name }) => ({ id, name })));

  // Observe the actual native clock for one complete authored 48-second café
  // cycle. Do not seek to a favourable phase or manufacture a JavaScript clock.
  const observationStart = Date.now();let walkCaptured = false, conversationCaptured = false;
  while (Date.now() - observationStart < 49_500) {
    const current = await frame(a);samples.push(current);
    if (!walkCaptured && current.residents.some(row => row.id.startsWith("coffee-") && row.walking && row.unobstructed)) {
      await shot(a, "neighbours-walking-desktop");walkCaptured = true;
    }
    if (!conversationCaptured && current.pair?.visible && current.pair.unobstructed && current.pair.distance < 3 && current.pair.yawErrors.every(error => error < .45)
      && current.pair.speakerCue?.shown && current.pair.speakerCue.visible && current.pair.speakerCue.unobstructed) {
      await shot(a, "neighbours-conversation-desktop");conversationCaptured = true;
    }
    await a.waitForTimeout(350);
  }
  const movement = await a.evaluate(async rows => {
    const { planetDistance } = await import("/shared/planet.js");
    return rows[0].residents.filter(row => row.id.startsWith("coffee-")).map(({ id }) => {
      const points = rows.flatMap(frame => frame.residents.filter(row => row.id === id));let span = 0;
      for (const from of points) for (const to of points) span = Math.max(span, planetDistance(from, to));
      return { id, span, walkingSamples: points.filter(row => row.walking).length, blockedSamples: points.filter(row => row.blocked).length };
    });
  }, samples);
  const paired = samples.filter(sample => sample.pair && sample.pair.distance < 3 && sample.pair.yawErrors.every(error => error < .45));
  // A rig's visible flag is not evidence that a player can see its cue. Walls,
  // the café sign and the HUD may still hide its actual projected screen point.
  // Require a readable observed moment, not every cue behind a real occluder.
  const cueMoments = paired.filter(sample => sample.pair.visible && sample.pair.unobstructed
    && sample.pair.speakerCue?.shown && sample.pair.speakerCue.visible && sample.pair.speakerCue.unobstructed);
  const conversations = ["coffee-reader", "coffee-company"].map(id => {
    const rows = paired.flatMap(sample => sample.residents.filter(row => row.id === id));
    return { id, roles: [...new Set(rows.map(row => row.role))].sort(), headRange: range(rows.map(row => row.rig.head[0])),
      leftRange: range(rows.map(row => row.rig.left[0])), rightRange: range(rows.map(row => row.rig.right[0])) };
  });
  evidence.observation = { wallMs: Date.now() - observationStart, serverMs: samples.at(-1).serverNow - samples[0].serverNow,
    frameSamples: samples.length, movement, conversationSamples: paired.length, readableSpeakerCueSamples: cueMoments.length,
    conversations, walkCaptured, conversationCaptured };
  check(evidence.observation.serverMs >= 48_000 && movement.filter(row => row.span > .7 && row.walkingSamples > 0).length >= 2,
    "Over a real full café cycle, at least two existing NPCs walk more than 0.7 metres instead of staying at their sound stops", evidence.observation);
  check(paired.length > 0 && conversations.every(row => row.roles.join(",") === "listening,speaking" && row.headRange > .02 && Math.max(row.leftRange, row.rightRange) > .1),
    "Coco and Maple meet within three metres, face each other and exchange speaking/listening turns with different final head and hand poses", conversations);
  check(walkCaptured && conversationCaptured, "Both actual walking and a paired conversation project visibly into unobstructed desktop world space");
  check(cueMoments.length > 0 && conversationCaptured, "An actual speaking turn has a shown cue whose projected point and both partners are visible and clear of the café sign and HUD",
    cueMoments[0]?.pair);
  check(samples.every(isQuiet), "The complete unscripted NPC cycle creates no audio context or native audio start for a quiet visitor");

  const shared = await Promise.all([frame(a), frame(b)]);
  evidence.consistency = await a.evaluate(async frames => {
    const { planetDistance } = await import("/shared/planet.js");
    return { clockDeltaMs: Math.abs(frames[0].serverNow - frames[1].serverNow), rows: frames[0].residents.map(left => {
      const right = frames[1].residents.find(row => row.id === left.id);
      return { id: left.id, distance: right ? planetDistance(left, right) : Infinity, bothPresent: !!right };
    }) };
  }, shared);
  check(evidence.consistency.clockDeltaMs < 1500 && evidence.consistency.rows.every(row => row.bothPresent && row.distance <= .15 + 2 * evidence.consistency.clockDeltaMs / 1000),
    "Independent visits see the same server-time NPC trajectories, allowing measured frame-sampling skew", evidence.consistency);

  const chatter = await leaveChatter(ada), sourceAt = Date.parse(chatter.at);
  const attentionBegan = Date.now();
  while (Date.now() - attentionBegan < 7000) {
    const views = await Promise.all([frame(a), frame(b)]);
    evidence.attention.push(views);
    if (views.every(view => view.serverNow - sourceAt >= 2200 && view.serverNow - sourceAt <= 8000
      && view.residents.some(row => row.sourceId === chatter.id && row.attending === true))) break;
    await a.waitForTimeout(180);
  }
  const responded = evidence.attention.find(views => views.every(view => view.serverNow - sourceAt >= 2200 && view.serverNow - sourceAt <= 8000
    && view.residents.some(row => row.sourceId === chatter.id && row.attending === true)));
  check(!!responded && evidence.attention.flat().every(isQuiet), "After the real source settles, both visits visibly attend to that authored café sound within its initial six-second window without unmuting", responded);
  assertStored(storedSource(chatter.id), ada, chatter);
  check((await Promise.all([snapshot(ada), snapshot(bo)])).every(snap => snap.sounds.some(sound => sound.id === chatter.id && sound.byId === ada.id && sound.x === chatter.x && sound.z === chatter.z)),
    "The shared response refers to the actual acknowledged author and unchanged sound coordinates");
  await shot(a, "neighbours-real-chatter-desktop");
  await remove(ada, chatter);
  await Promise.all([a, b].map(page => page.waitForFunction(id => {
    const rows = JSON.parse(document.getElementById("planet-stage").dataset.residentLife ?? "[]");
    return rows.length === 12 && rows.every(row => row.sourceId !== id);
  }, chatter.id)));
  check((await Promise.all([snapshot(ada), snapshot(bo)])).every(snap => !snap.sounds.some(sound => sound.id === chatter.id)),
    "Withdrawing beside the source removes that real attention target and live contribution in both visits");

  await a.setViewportSize({ width: 390, height: 844 });await cafe(ada, true);
  const teaTarget = await reachable(a, '#chorus-travel [data-place="tea"]');
  check(teaTarget.usable, "At 390×844, touch travel to Tide & Coffee remains an unobstructed 44px target", teaTarget);
  const beforePosts = ada.posts;await share(ada, true);
  const phoneTargets = await Promise.all(['#chorus-studio [data-listen="cafe-chatter"]', '#chorus-studio [data-leave="cafe-chatter"]'].map(selector => reachable(a, selector)));
  check(phoneTargets.every(target => target.usable), "The touch café chooser starts with reachable audition and explicit contribution controls", phoneTargets);
  await shot(a, "neighbours-cafe-chooser-phone");
  await a.locator("#chorus-studio").getByRole("button", { name: "Cancel", exact: true }).tap();
  check(ada.posts === beforePosts && isQuiet(await frame(a)), "Touch cancellation publishes nothing and preserves the quiet visit");
  await a.setViewportSize({ width: 1920, height: 1080 });
  await Promise.all([a.emulateMedia({ reducedMotion: "reduce" }), b.emulateMedia({ reducedMotion: "reduce" })]);
  await a.waitForTimeout(800);
  const reducedBefore = await Promise.all([frame(a), frame(b)]);await a.waitForTimeout(1300);
  const reducedAfter = await Promise.all([frame(a), frame(b)]);
  evidence.reducedMotion = [reducedBefore, reducedAfter];
  const stationary = reducedBefore.every((view, index) => view.residents.every(before => {
    const after = reducedAfter[index].residents.find(row => row.id === before.id);
    return after && !before.walking && !after.walking && Math.hypot(after.x - before.x, after.z - before.z) < .0001
      && JSON.stringify(after.rig) === JSON.stringify(before.rig) && after.role === before.role;
  }));
  check(stationary && [...reducedBefore, ...reducedAfter].every(isQuiet), "Native reduced-motion preference keeps both later views stationary with stable actual conversation rigs and no audio");
  await shot(a, "neighbours-reduced-motion-desktop");
  await a.setViewportSize({ width: 390, height: 844 });await a.waitForTimeout(350);await shot(a, "neighbours-reduced-motion-phone");
  check(errors.length === 0, "The actual desktop, touch, sound-response, withdrawal and reduced-motion path has no browser runtime errors", errors);
} catch (error) {
  failed = true;failure = error?.stack ?? String(error);process.exitCode = 1;console.error(error);
  for (const who of people) await shot(who.page, `neighbours-failure-${who.name.replaceAll(" ", "-")}`).catch(() => {});
} finally {
  await Promise.allSettled([...pending]);
  for (const who of people) await who.page.goto("about:blank").catch(() => {});
  if (!baseline) {
    for (const { who, sound } of [...made.values()].reverse()) {
      try {
        const row = storedSource(sound.id);assertStored(row, who, sound);if (row.removed_at) continue;
        await who.page.waitForTimeout(1100);
        while (Date.now() - who.lastMoveAt < 140) await who.page.waitForTimeout(140 - (Date.now() - who.lastMoveAt));
        const moved = await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
        assert.ok(moved.ok() && (await moved.json()).ok, "Cleanup approaches only an acknowledged own source");
        const removed = await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`);
        assert.ok(removed.ok() && (await removed.json()).ok, "Cleanup soft-removes only an acknowledged own source");
      } catch (error) { failed = true;process.exitCode = 1;cleanupErrors.push(error.message);console.error("Cleanup:", error.message); }
    }
    try {
      const ids = new Set(made.keys()), rows = storedRows();
      assert.deepEqual(rows.filter(row => !ids.has(row.id)), initialStored, "Every original stored row remains exact");
      const tombstones = [];
      for (const { who, sound } of made.values()) {
        const row = storedSource(sound.id);assertStored(row, who, sound);
        assert.ok(row.removed_at && Number.isFinite(Date.parse(row.removed_at)));assert.equal(row.removed_by, who.id);
        tombstones.push({ id: sound.id, byId: sound.byId, soundId: sound.soundId, x: sound.x, z: sound.z, at: sound.at, removedAt: row.removed_at });
      }
      if (people[0]?.id && initialPlanet && initialCoast) {
        assert.deepEqual(liveSources(await snapshot(people[0])), initialPlanet);
        assert.deepEqual(liveSources(await snapshot(people[0], "/scene/seaside")), initialCoast);
      }
      evidence.history = { database: ".cache/neighbours/browser/history.db", mode: "read-only SQLite", initialRows: initialStored.length,
        finalRows: rows.length, originalRowsUnchanged: true, fixtures: tombstones };
      check(true, "Read-only scratch history confirms original sources remain exact and only acknowledged fixtures have retained author/position tombstones", evidence.history);
      if (!cleanupErrors.length) rmSync(recoveryPath, { force: true });
    } catch (error) { failed = true;process.exitCode = 1;cleanupErrors.push(error.message);console.error("History:", error.message); }
  } else if (people.some(who => who.writes.length)) { failed = true;process.exitCode = 1;cleanupErrors.push("Unexpected write in anonymous baseline observation"); }
  if (out) writeFileSync(`${out}/results.json`, JSON.stringify({ type: "automated-developer-browser-check", base, baseline, failed, failure, checks, errors, cleanupErrors,
    evidence, targets, samples, created: [...made.values()].map(({ sound }) => sound), independentCookieIdentities: people.length === 2 && people[0].id !== people[1].id,
    humanListening: false, unfamiliarPairStudy: false, physicalPhone: false, nextDayReturn: false,
    limitations: ["Actual native-clock animation and final rig rotations are observed; screenshots require visual inspection for naturalness.",
      "Quiet native audio observation does not establish artistic sound quality.", "390×844 touch emulation is not a physical-phone study.",
      "The baseline is an anonymous read-only capability negative, not a two-player activity run.", "No server restart, unfamiliar-pair study or next-day return is claimed."],
  }, null, 2));
  if (browser) await browser.close();database?.close();
}
