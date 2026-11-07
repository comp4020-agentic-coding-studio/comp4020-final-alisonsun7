#!/usr/bin/env node
// Actual UI developer automation. This is not a novice-pair study, a physical
// phone test, an artistic listening verdict or evidence of a next-day return.
// APP_URL=http://localhost:18898 node e2e/chorus-answers.mjs [artifact-directory]
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.APP_URL;
assert.ok(base, "Set APP_URL to an explicitly isolated local scratch world");
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "Use a local scratch server");
assert.notEqual(address.port, "18861", "Never write into the player's working preview");
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
mkdirSync(".cache", { recursive: true });
const recoveryPath = `.cache/chorus-answers-recovery-${crypto.randomUUID()}.json`;
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const people = [], made = new Map(), pendingResponses = new Set(), checks = [], errors = [], metrics = [], timings = [];
const beganAt = Date.now();
let initialPlanet, initialCoast, failed = false, failure, rootId;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const timestamp = label => { const time = { label, elapsedMs: Date.now() - beganAt, at: new Date().toISOString() };timings.push(time);return time; };
const check = (condition, label, detail) => {
  assert.ok(condition, label);checks.push({ label, elapsedMs: Date.now() - beganAt, ...(detail === undefined ? {} : { detail }) });console.log("ok  " + label);
};
const saveRecovery = () => writeFileSync(recoveryPath, JSON.stringify({ base,
  identities: people.map(({ name, id, sessionId, cookies }) => ({ name, id, sessionId, cookies })),
  sounds: [...made.values()].map(({ sound }) => sound),
}, null, 2), { mode: 0o600 });
const shot = async (page, name) => { if (out && !page.isClosed()) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const data = (page, key) => page.locator("#planet-stage").evaluate((stage, key) => stage.dataset[key], key);
const at = async page => (await data(page, "at")).split(",").map(Number);
const ordinary = state => state.sounds.filter(source => !source.whileIn)
  .map(({ id, soundId, byId, x, z, at, replyToId, removedAt }) => ({ id, soundId, byId, x, z, at, replyToId, removedAt }))
  .sort((a, b) => a.id.localeCompare(b.id));

async function snapshot(who, path = "/planet") {
  const response = await who.context.request.get(base + path);
  assert.ok(response.ok(), `Read-only snapshot HTTP ${response.status()}`);
  const match = (await response.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, "Read the actual server snapshot, not a test state substitute");return JSON.parse(match[1]).snapshot;
}
async function ready(page) {
  await page.waitForFunction(() => !!document.getElementById("planet-stage")?.dataset.at
    && !document.querySelector("dialog:modal") && !document.getElementById("chorus-primary")?.disabled);
}
async function closeDialog(page, selector) {
  await page.keyboard.press("Escape");
  await page.waitForFunction(selector => !document.querySelector(selector)?.open, selector);
  await page.waitForTimeout(100); // Native dialog close handlers are queued.
}
async function target(page, selector, allowDisabled = false) {
  return page.locator(selector).evaluate((element, allowDisabled) => {
    const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { id: element.id || element.getAttribute("aria-label") || element.textContent, x: r.x, y: r.y, width: r.width, height: r.height,
      disabled: element.matches(":disabled"), interceptor: hit?.closest("button,a,dialog,aside")?.id ?? hit?.tagName,
      usable: (allowDisabled || !element.matches(":disabled")) && r.width >= 44 && r.height >= 44 && r.left >= 0
        && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && !!hit && element.contains(hit) };
  }, allowDisabled);
}
async function person(name, avatar, sound, path = "/planet") {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true });
  await context.addInitScript(() => {
    // Observe actual browser nodes. No autoplay bypass, fake samples or
    // fabricated event payloads are used in this invitation flow.
    window.__answerStarts = [];
    const Context = window.AudioContext;
    window.AudioContext = class extends Context {
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => {
          window.__answerStarts.push({ loop: source.loop, duration: source.buffer?.duration, at: this.currentTime, args });
          return start(...args);
        };return source;
      }
    };
  });
  const page = await context.newPage();page.setDefaultTimeout(20_000);
  const who = { context, page, name, avatar, posts: 0, lastWriteAt: 0, lastMoveAt: 0 };people.push(who);
  page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
  page.on("request", request => {
    if (request.method() !== "POST") return;
    if (/\/sounds$/.test(new URL(request.url()).pathname)) who.posts++;
    if (/\/move$/.test(new URL(request.url()).pathname)) who.lastMoveAt = Date.now();
  });
  page.on("response", response => {
    if (response.request().method() !== "POST" || !/\/sounds$/.test(new URL(response.url()).pathname)) return;
    const pending = response.json().then(result => {
      if (result.ok && result.sound && !result.sound.whileIn) {
        made.set(result.sound.id, { who, sound: result.sound });saveRecovery();
      }
    }).catch(() => {});
    pendingResponses.add(pending);void pending.finally(() => pendingResponses.delete(pending));
  });
  timestamp(`${name}: opened ${new URL(path, base).pathname}`);
  await page.goto(new URL(path, base).href);
  await page.locator("#planet-join").waitFor({ state: "visible" });
  await page.fill('#planet-join-form input[name="nickname"]', name);
  await page.check(`#planet-join-form input[value="${avatar}"]`, { force: true });
  await page.locator("#planet-enter").click();
  await page.locator("#chorus-welcome").getByRole("button", { name: sound ? "Enter with sound" : "Explore quietly", exact: true }).click();
  const initial = await snapshot(who);who.id = initial.you.id;who.sessionId = initial.sessionId;
  who.cookies = await context.cookies();saveRecovery();timestamp(`${name}: completed welcome`);return who;
}
async function openStudio(who) {
  await who.page.locator("#chorus-primary").click();
  await who.page.locator("#chorus-studio").waitFor({ state: "visible" });
  assert.ok(await who.page.locator("#chorus-studio").evaluate(dialog => dialog.matches(":modal")));
}
async function listen(who, soundId) {
  const posts = who.posts, starts = await who.page.evaluate(() => window.__answerStarts.length);
  await who.page.locator(`#chorus-studio [data-listen="${soundId}"]`).click();
  await who.page.locator(`#chorus-studio [data-listen="${soundId}"]`).filter({ hasText: "Stop" }).waitFor();
  await who.page.waitForFunction(starts => window.__answerStarts.length > starts, starts);
  const real = await who.page.evaluate(starts => window.__answerStarts.slice(starts), starts);
  check(real.some(node => !node.loop && node.duration > 0) && who.posts === posts,
    `${who.name} can privately audition a decoded ${soundId} without publishing`, real);
}
async function leave(who, soundId) {
  await who.page.waitForTimeout(Math.max(0, 1100 - (Date.now() - who.lastWriteAt)));
  const [response] = await Promise.all([
    who.page.waitForResponse(response => response.request().method() === "POST"
      && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds`),
    who.page.locator(`#chorus-studio [data-leave="${soundId}"]`).click(),
  ]);
  const result = await response.json();
  if (result.sound) { made.set(result.sound.id, { who, sound: result.sound });saveRecovery(); }
  assert.ok(response.ok() && result.ok && result.sound, `Actual Leave must succeed: ${JSON.stringify(result)}`);
  who.lastWriteAt = Date.now();who.lastAckAt = Date.now();timestamp(`${who.name}: left ${soundId}`);
  await who.page.locator("#chorus-studio").waitFor({ state: "hidden" });return result.sound;
}
async function work(page, id, duet, variant) {
  await page.waitForFunction(({ id, duet, variant }) => {
    const stage = document.getElementById("planet-stage"), dock = document.getElementById("chorus-work");
    const form = JSON.parse(stage?.dataset.chorusGardens ?? "[]").find(work => work.workId === id);
    return form && form.duet === duet && form.variant === variant && form.open === Number(duet)
      && dock?.dataset.work === id && dock.dataset.duet === String(duet);
  }, { id, duet, variant });
  return JSON.parse(await data(page, "chorusGardens")).find(work => work.workId === id);
}
const visibleForm = form => ({ workId: form.workId, variant: form.variant, duet: form.duet, sourceIds: form.sourceIds,
  signature: form.signature, marks: form.marks, answers: form.answers, open: form.open });
async function sameForms(a, b, id, duet, variant) {
  const forms = await Promise.all([work(a, id, duet, variant), work(b, id, duet, variant)]);
  assert.deepEqual(visibleForm(forms[0]), visibleForm(forms[1]));return forms[0];
}
async function journal(page, id) {
  await page.locator("#chorus-our-works").click();await page.locator("#chorus-journal").waitFor({ state: "visible" });
  return page.locator(`#chorus-journal [data-work="${id}"]`);
}
async function assertRecord(page, id, sounds) {
  const record = page.locator(`#chorus-journal [data-work="${id}"]`);
  await record.waitFor({ state: "visible" });
  for (const { sound, live } of sounds) {
    const row = record.locator(`[data-source="${sound.id}"]`);
    await row.locator(`[data-live="${live}"]`).waitFor({ state: "visible" });
    assert.ok((await row.textContent()).includes(sound.by));
    assert.equal(await row.locator(".chorus-source-author").getAttribute("data-author"), sound.byId);
    assert.ok(await row.locator(".chorus-author-mark").getAttribute("data-shape"));
  }return record;
}

try {
  const ada = await person("Answer Ada", "cat", true), a = ada.page;
  await ready(a);initialPlanet = ordinary(await snapshot(ada));initialCoast = ordinary(await snapshot(ada, "/scene/seaside"));
  assert.ok(!(await snapshot(ada)).chorus.some(work => work.placeId === "green" && work.liveSources.length), "Use an empty scratch Green");
  check(await data(a, "soundOn") === "true", "An explicit Enter with sound enables the first visitor's local listening");
  await openStudio(ada);await listen(ada, "trickle");const water = await leave(ada, "trickle");rootId = water.id;
  const solo = await work(a, rootId, false, "lantern");
  check(solo.marks.length === 1 && solo.answers.length === 0 && solo.marks[0].authorId === ada.id,
    "The first real contribution has the author's mark and a complete solo form, without claiming a duet", visibleForm(solo));
  await a.waitForFunction(() => Number(document.getElementById("planet-stage").dataset.voices) > 0);
  check(await a.evaluate(() => window.__answerStarts.some(node => node.loop && node.duration > 0)), "The explicitly sounding visitor starts a real decoded spatial world voice");

  await a.locator("#chorus-invite").click();await a.locator("#chorus-invite-dialog").waitFor({ state: "visible" });
  const invite = await a.locator("#chorus-invite-url").inputValue(), invitation = new URL(invite);
  check(invitation.origin === address.origin && invitation.searchParams.get("work") === rootId,
    "Invite a friend provides an actual URL to this lasting work without needing clipboard permission", { path: invitation.pathname, work: invitation.searchParams.get("work") });
  await closeDialog(a, "#chorus-invite-dialog");

  const bo = await person("Answer Bo", "dog", false, invite), b = bo.page;
  const cookies = await Promise.all([ada.context.cookies(), bo.context.cookies()]);
  const token = values => values.find(cookie => cookie.name === "soac_session")?.value;
  check(ada.id !== bo.id && token(cookies[0]) && token(cookies[1]) && token(cookies[0]) !== token(cookies[1]), "The two browsers represent different real cookie identities");
  await b.locator("#chorus-journal").waitFor({ state: "visible" });
  await assertRecord(b, rootId, [{ sound: water, live: true }]);
  check(new URL(b.url()).searchParams.get("work") === rootId, "A new friend's join preserves the invitation and opens the real work record");
  await b.locator(`[data-record-action="visit:${rootId}"]`).click();await ready(b);
  await Promise.all([work(a, rootId, false, "lantern"), work(b, rootId, false, "lantern")]);
  check(await data(b, "soundOn") === "false" && await b.evaluate(() => window.__answerStarts.length) === 0,
    "Explore quietly remains silent while the friend visits the existing work");
  const beforeWalk = await at(b);await b.locator("canvas.planet-canvas").focus();await b.keyboard.down("d");
  try { await b.waitForTimeout(260); } finally { await b.keyboard.up("d"); }
  await b.waitForTimeout(220);const afterWalk = await at(b);
  check(Math.hypot(afterWalk[0] - beforeWalk[0], afterWalk[1] - beforeWalk[1]) > .2,
    "The invited friend can take a real nearby position before answering");
  await openStudio(bo);
  check((await b.locator("#chorus-answering").textContent()).includes("Answer Ada")
    && (await b.locator('[data-sound="evening-forest"] .chorus-choice-outcome').textContent()).includes("Watersong canopy"),
    "The answer chooser names the actual friend, original sound and possible shared result");
  await listen(bo, "evening-forest");const bird = await leave(bo, "evening-forest");
  const shared = await sameForms(a, b, rootId, true, "habitat");
  const answerVisibilityMs = Date.now() - bo.lastAckAt;
  check(answerVisibilityMs <= 1500, "The accepted answer automatically reaches both actual renderers within 1.5 seconds in this run", { answerVisibilityMs });
  check(bird.replyToId === water.id && shared.marks.length === 2 && new Set(shared.marks.map(mark => mark.authorId)).size === 2
    && shared.answers.some(answer => answer.parentId === water.id && answer.sourceId === bird.id),
    "A real cross-person answer opens the same two-author canopy and actual parent-to-answer light in both worlds", visibleForm(shared));
  check(await data(b, "soundOn") === "false" && Number(await data(b, "voices")) === 0,
    "A private audition and the friend's transformation never unmute the quiet visitor's world");
  await shot(a, "answers-canopy-desktop");
  await journal(b, rootId);await assertRecord(b, rootId, [{ sound: water, live: true }, { sound: bird, live: true }]);
  check((await b.locator(`#chorus-journal [data-source="${bird.id}"]`).textContent()).includes("answering Answer Ada"),
    "The lasting record identifies who answered whom and which real sounds remain live");
  await closeDialog(b, "#chorus-journal");

  // A third tab shares Ada's cookie. It must not become a third friend or
  // create an extra contribution merely by opening the same world.
  const sibling = await ada.context.newPage();sibling.setDefaultTimeout(20_000);
  sibling.on("pageerror", error => errors.push(`Ada shared-cookie tab: ${error.message}`));
  await sibling.goto(base + "/planet");await ready(sibling);
  await sibling.waitForFunction(() => document.getElementById("planet-stage").dataset.people === "2");
  const siblingBoot = await sibling.locator("#planet-boot").textContent();
  check(JSON.parse(siblingBoot).snapshot.you.id === ada.id && new Set((await snapshot(ada)).chorus.find(work => work.id === rootId).contributors.map(person => person.id)).size === 2,
    "An additional shared-cookie tab is the same participant and never a third co-author");
  await sibling.close();await a.bringToFront();

  // Withdrawal is a meaningful alternative, not a completed-button state.
  await journal(a, rootId);
  const [removed] = await Promise.all([
    a.waitForResponse(response => response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith(`/sounds/${water.id}`)),
    a.locator(`[data-record-action="remove:${water.id}"]`).click(),
  ]);
  assert.ok(removed.ok() && (await removed.json()).ok, "Actual UI withdrawal is server-confirmed");
  await assertRecord(a, rootId, [{ sound: water, live: false }, { sound: bird, live: true }]);
  await closeDialog(a, "#chorus-journal");
  const remaining = await sameForms(a, b, rootId, false, "lantern");
  check(remaining.marks.length === 1 && remaining.marks[0].authorId === bo.id && remaining.answers.length === 0,
    "Withdrawing the parent really removes its leaf and answering light from both worlds, retaining the child's solo sound");

  await b.setViewportSize({ width: 390, height: 844 });await b.waitForTimeout(250);
  for (const selector of ["#chorus-primary", "#chorus-our-works", "#planet-sound", "#planet-run", "#planet-jump"]) {
    const measure = await target(b, selector);metrics.push({ context: "phone world", ...measure });
    check(measure.usable, `At 390×844 ${selector} remains uncovered and at least 44 pixels`);
  }
  await shot(b, "answers-green-phone");await b.locator("#chorus-primary").tap();
  await b.locator("#chorus-studio").waitFor({ state: "visible" });
  for (const selector of ["#chorus-studio [data-listen]", "#chorus-studio [data-leave]"]) {
    const first = b.locator(selector).first(), exact = await first.evaluate(element => `[${element.hasAttribute("data-listen") ? "data-listen" : "data-leave"}="${element.dataset.listen ?? element.dataset.leave}"]`);
    const measure = await target(b, `#chorus-studio ${exact}`);metrics.push({ context: "phone first choice", ...measure });
    check(measure.usable, "The phone chooser's first Listen or Leave is visible, enabled and finger-sized");
  }
  await shot(b, "answers-chooser-phone");
  const beforeCancel = bo.posts, cancel = b.locator("#chorus-studio").getByRole("button", { name: "Cancel", exact: true });
  await cancel.focus();await b.keyboard.press("Enter");
  await b.waitForFunction(() => !document.getElementById("chorus-studio").open && document.activeElement?.matches("canvas.planet-canvas"));
  check(bo.posts === beforeCancel && await data(b, "soundOn") === "false", "Keyboard Cancel restores world focus without publishing or unmuting");

  await openStudio(ada);await listen(ada, "chorus-bells");const bells = await leave(ada, "chorus-bells");
  const relit = await sameForms(a, b, rootId, true, "lantern");
  check(bells.replyToId === bird.id && relit.signature !== shared.signature && relit.answers.some(answer => answer.parentId === bird.id && answer.sourceId === bells.id),
    "A different real answer grows a shared lantern from the remaining bird, giving the same work a new visible result", visibleForm(relit));
  check(relit.marks.find(mark => mark.authorId === ada.id).color === solo.marks[0].color
    && relit.marks.find(mark => mark.authorId === ada.id).shape === solo.marks[0].shape,
    "Ada's mark remains recognisable when her contribution and the shared result change");
  check(await data(b, "soundOn") === "false" && Number(await data(b, "voices")) === 0, "The second shared result still cannot change Bo's quiet preference");
  await shot(a, "answers-lantern-desktop");await shot(b, "answers-lantern-phone");

  const persisted = (await snapshot(bo)).chorus.find(work => work.id === rootId);await b.reload();
  await b.locator("#chorus-journal").waitFor({ state: "visible" });
  await assertRecord(b, rootId, [{ sound: water, live: false }, { sound: bird, live: true }, { sound: bells, live: true }]);
  const afterReload = (await snapshot(bo)).chorus.find(work => work.id === rootId);
  assert.deepEqual(afterReload, persisted);
  check((await snapshot(bo)).you.id === bo.id && await data(b, "soundOn") === "false",
    "Reload preserves the real participant and full source/withdrawal/reply record while requiring new explicit listening");
  await b.locator(`[data-record-action="visit:${rootId}"]`).tap();await ready(b);
  await sameForms(a, b, rootId, true, "lantern");
  check(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "The returned phone work fits the viewport without horizontal overflow");
  assert.deepEqual(ordinary(await snapshot(ada)).filter(source => !made.has(source.id)), initialPlanet);
  assert.deepEqual(ordinary(await snapshot(ada, "/scene/seaside")), initialCoast);
  check(errors.length === 0, "The complete invitation, response, revision and return path has no browser page errors", errors);
  timestamp("completed developer-operated path");
} catch (error) {
  failed = true;failure = { message: error.message, stack: error.stack };process.exitCode = 1;console.error(error);
  for (const who of people) await shot(who.page, `failure-${who.name.replaceAll(" ", "-")}`).catch(() => {});
} finally {
  const cleanupErrors = [];
  await Promise.allSettled([...pendingResponses]);
  // Stop all position pumps first. The private recovery file contains only
  // this run's identities and sources, never the user's working world.
  for (const who of people) for (const page of who.context.pages()) await page.goto("about:blank").catch(() => {});
  for (const { who, sound } of [...made.values()].reverse()) {
    try {
      await pause(1100);
      const current = await snapshot(who);
      if (!current.sounds.some(source => source.id === sound.id)) continue;
      const moved = await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
      assert.ok(moved.ok() && (await moved.json()).ok, "Cleanup moves beside only this run's own source");
      const removed = await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`), result = await removed.json();
      assert.ok((removed.ok() && result.ok) || result.code === "gone", `Soft-remove own fixture ${sound.id}: ${JSON.stringify(result)}`);
    } catch (error) { cleanupErrors.push(`${sound.id}: ${error.message}`); }
  }
  if (people[0] && initialPlanet && initialCoast) {
    try {
      const final = await snapshot(people[0]);
      assert.deepEqual(ordinary(final), initialPlanet);assert.deepEqual(ordinary(await snapshot(people[0], "/scene/seaside")), initialCoast);
      assert.ok(!final.sounds.some(source => made.has(source.id)), "No live source from this run remains");
      if (rootId) {
        const archived = final.chorus.find(work => work.id === rootId);
        assert.ok(archived && archived.liveSources.length === 0 && archived.sources.every(source => source.removedAt), "The actual archive retains the complete ended-source story");
      }
      check(true, "Public API cleanup removes only this run's sounds, retaining their archive and every pre-existing source");
    } catch (error) { cleanupErrors.push(error.message); }
  }
  if (cleanupErrors.length) { failed = true;process.exitCode = 1;console.error("Cleanup", cleanupErrors); }
  if (out) writeFileSync(`${out}/results.json`, JSON.stringify({ kind: "automated-developer-browser-test", base, failed, failure, checks, timings, metrics, errors, cleanupErrors,
    made: [...made.values()].map(({ sound }) => ({ id: sound.id, soundId: sound.soundId, byId: sound.byId, replyToId: sound.replyToId, x: sound.x, z: sound.z })),
    realUnfamiliarPairs: false, physicalPhone: false, humanListening: false, nextDayReturn: false,
    timingScope: "Elapsed times describe this scripted developer path, not unprompted-user acceptance targets.",
  }, null, 2) + "\n");
  await browser.close();if (!cleanupErrors.length) rmSync(recoveryPath, { force: true });
}
