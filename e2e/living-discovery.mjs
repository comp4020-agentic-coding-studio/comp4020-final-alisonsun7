#!/usr/bin/env node
// Developer UI automation on an explicitly isolated scratch world. This is
// not an unfamiliar-pair study, human listening approval or a physical phone.
// APP_URL=http://localhost:18898 SCRATCH_DB=.cache/discovery/browser/history.db
// node e2e/living-discovery.mjs [artifact-directory]
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";

const base = process.env.APP_URL;
assert.ok(base, "Set APP_URL to an explicitly isolated local scratch server");
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "Use a local scratch world");
assert.equal(address.port, "18898", "This writing test is reserved for the independent discovery-test database on port 18898");
assert.ok(process.env.SCRATCH_DB, "Set SCRATCH_DB to the independent discovery-test database for read-only history verification");
const databasePath = realpathSync(resolve(process.env.SCRATCH_DB));
assert.equal(databasePath, resolve(".cache/discovery/browser/history.db"), "Read only the explicitly isolated .cache/discovery/browser/history.db; never the player's database");
const database = new DatabaseSync(databasePath, { readOnly: true });
const storedRows = () => database.prepare("SELECT * FROM placed_sounds ORDER BY id").all().map(row => ({ ...row }));
const storedSource = id => database.prepare("SELECT * FROM placed_sounds WHERE id = ?").get(id);
const initialStored = storedRows();
const historyEvidence = { mode: "read-only SQLite", database: ".cache/discovery/browser/history.db", initialRows: initialStored.length, initialRowsPreserved: false, onlyOwnedRowsAdded: false, finalRows: null, fixtureTombstones: [] };
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
mkdirSync(".cache", { recursive: true });
const recoveryPath = `.cache/living-discovery-recovery-${crypto.randomUUID()}.json`;
const people = [], made = new Map(), pending = new Set(), checks = [], errors = [], targetRects = [];
const start = Date.now();
let browser, failed = false, failure, initialPlanet, initialCoast;
const check = (condition, label, detail) => {
    assert.ok(condition, label); checks.push({ label, elapsedMs: Date.now() - start, ...(detail === undefined ? {} : { detail }) });
    console.log("ok  " + label);
};
const shot = async (page, name) => { if (out && !page.isClosed()) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const dataset = (page, key) => page.locator("#planet-stage").evaluate((stage, key) => stage.dataset[key], key);
const state = async (page, key) => JSON.parse(await dataset(page, key) ?? "[]");
// Snapshot.sounds intentionally contains living sources only. Durable removal
// history is checked separately through the strictly scoped read-only DB.
const liveSources = snap => snap.sounds.filter(sound => !sound.whileIn).map(sound => ({ ...sound })).sort((a, b) => a.id.localeCompare(b.id));
const assertStoredSource = (row, who, sound) => {
    assert.ok(row, `Keep actual stored source ${sound.id}`);
    assert.equal(row.id, sound.id);assert.equal(row.session_id, who.sessionId);
    assert.equal(row.sound_id, sound.soundId);assert.equal(row.placed_by, sound.byId);
    assert.equal(row.placed_at, sound.at);assert.equal(row.x, sound.x);assert.equal(row.z, sound.z);
    assert.equal(row.while_in, null);
};
const saveRecovery = () => writeFileSync(recoveryPath, JSON.stringify({ base,
    identities: people.map(({ name, id, sessionId, cookies }) => ({ name, id, sessionId, cookies })),
    sounds: [...made.values()].map(({ sound }) => sound),
}, null, 2), { mode: 0o600 });
async function snapshot(who, path = "/planet") {
    const response = await who.context.request.get(base + path);assert.ok(response.ok(), `Snapshot HTTP ${response.status()}`);
    const match = (await response.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);
    assert.ok(match, "Read the actual server boot snapshot"); return JSON.parse(match[1]).snapshot;
}
async function quietPerson(name, avatar) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true });
    await context.addInitScript(() => {
        // Observe real native audio sources without changing autoplay policy,
        // fetches, decoded samples, network events or authoritative state.
        window.__discoveryAudioStarts = [];window.__discoveryActiveSources = new Set();
        const Context = window.AudioContext;
        window.AudioContext = class extends Context {
            createBufferSource() {
                const source = super.createBufferSource(), start = source.start.bind(source), stop = source.stop.bind(source);
                source.start = (...args) => {
                    window.__discoveryAudioStarts.push({ loop: source.loop, duration: source.buffer?.duration, at: this.currentTime, args });
                    window.__discoveryActiveSources.add(source);
                    return start(...args);
                };
                source.stop = (...args) => { window.__discoveryActiveSources.delete(source);return stop(...args); };
                source.addEventListener("ended", () => window.__discoveryActiveSources.delete(source));return source;
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
    await page.waitForFunction(() => !!document.getElementById("planet-stage")?.dataset.at && !document.querySelector("dialog:modal"));
    const current = await snapshot(who);who.id = current.you.id;who.sessionId = current.sessionId;
    who.cookies = await context.cookies();saveRecovery();return who;
}
async function place(who, id, title) {
    const page = who.page;
    if (id === "tea") await page.locator('#chorus-travel [data-place="tea"]').click();
    else {
        await page.locator("#planet-tools").click();
        await page.locator(`#planet-destinations [data-zone="${id}"]`).click();
    }
    await page.waitForFunction(title => !document.querySelector("dialog:modal") && document.getElementById("planet-area").textContent === title, title);
    await page.waitForTimeout(300);
}
async function examples(who, on) {
    await who.page.locator("#planet-tools").click();
    await who.page.locator("#planet-examples").setChecked(on);
    await who.page.locator("#planet-tools-close").click();
    await who.page.waitForFunction(() => !document.querySelector("dialog:modal"));
}
async function reachable(page, selector) {
    const result = await page.locator(selector).evaluate(element => {
        const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { selector: element.id, x: r.x, y: r.y, width: r.width, height: r.height,
            interceptor: hit?.closest("button,input,aside,form")?.id ?? hit?.tagName,
            usable: !element.matches(":disabled") && r.width >= 44 && r.height >= 44 && r.left >= 0 && r.top >= 0
                && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && !!hit && element.contains(hit) };
    });targetRects.push(result);return result.usable;
}
async function cafeState(page, sourceId, steam) {
    await page.waitForFunction(({ sourceId, steam }) => {
        const state = JSON.parse(document.getElementById("planet-stage").dataset.cafe ?? "{}");
        return state.steam === steam && (!sourceId || state.sourceIds?.includes(sourceId));
    }, { sourceId, steam });return state(page, "cafe");
}
async function wildlife(page, sourceId, kind, present) {
    await page.waitForFunction(({ sourceId, kind, present }) => {
        const rows = JSON.parse(document.getElementById("planet-stage").dataset.soundWildlife ?? "[]");
        return rows.some(row => row.sourceId === sourceId && row.kind === kind && row.origin === "player" && row.count === 2) === present;
    }, { sourceId, kind, present });
    return (await state(page, "soundWildlife")).find(row => row.sourceId === sourceId && row.kind === kind);
}
async function leave(who, soundId) {
    await who.page.waitForTimeout(Math.max(0, 1100 - (Date.now() - who.lastWriteAt)));
    const [response] = await Promise.all([
        who.page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds`),
        who.page.locator(`#chorus-studio [data-leave="${soundId}"]`).click(),
    ]);
    const result = await response.json();
    if (result.ok && result.sound) { made.set(result.sound.id, { who, sound: result.sound });saveRecovery(); }
    assert.ok(response.ok() && result.ok && result.sound, `Actual explicit Leave: ${JSON.stringify(result)}`);
    who.lastWriteAt = Date.now();await who.page.locator("#chorus-studio").waitFor({ state: "hidden" });return result.sound;
}
async function makeYours(who, id) {
    await who.page.locator("#sound-discovery-create").click();
    await who.page.locator("#chorus-studio").waitFor({ state: "visible" });
    assert.equal(await who.page.locator("#chorus-studio [data-leave]").first().getAttribute("data-leave"), id, "The locally demonstrated sound starts the curated choices");
}

try {
    browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
    const ada = await quietPerson("Discovery Ada", "cat"), bo = await quietPerson("Discovery Bo", "dog");
    const a = ada.page, b = bo.page;
    initialPlanet = liveSources(await snapshot(ada));initialCoast = liveSources(await snapshot(ada, "/scene/seaside"));
    assert.equal(initialPlanet.filter(source => !source.removedAt).length, 0, "Use a fresh or cleaned isolated world so real ingredients cannot mask the example comparison");
    check(ada.id !== bo.id && (await ada.context.cookies()).find(c => c.name === "soac_session")?.value !== (await bo.context.cookies()).find(c => c.name === "soac_session")?.value,
        "Two independent cookie identities enter the same actual planet");
    await a.waitForFunction(() => document.getElementById("planet-stage").dataset.people === "2");
    await Promise.all([place(ada, "tea", "Tide & Coffee"), place(bo, "tea", "Tide & Coffee")]);
    await a.locator("#sound-discovery-origin").filter({ hasText: "World example" }).waitFor();
    const demoCafe = await cafeState(a, null, true);
    await a.waitForFunction(() => JSON.parse(document.getElementById("planet-stage").dataset.residentResponses ?? "[]").some(row => row.origin === "example"));
    const exampleIds = (await state(a, "soundExamples")).map(row => row.id);
    check(exampleIds.length > 0 && demoCafe.sourceIds.some(id => exampleIds.includes(id)), "The labelled café world example drives real steam and a separately labelled NPC response");
    const quiet = await Promise.all([a, b].map(async page => ({ soundOn: await dataset(page, "soundOn"), voices: await dataset(page, "voices"), starts: await page.evaluate(() => window.__discoveryAudioStarts.length) })));
    check(quiet.every(row => row.soundOn === "false" && row.voices === "0" && row.starts === 0), "World examples remain silent in genuinely quiet browsers without an autoplay bypass", quiet);
    const beforeExample = await snapshot(ada);
    check(ada.posts + bo.posts === 0 && liveSources(beforeExample).length === initialPlanet.length && beforeExample.chorus.length === 0
        && beforeExample.online.length === 2 && !beforeExample.sounds.some(sound => exampleIds.includes(sound.id)),
        "World examples create no sound rows, shared works, invented authors or human presence");
    await shot(a, "discovery-cafe-desktop");

    await a.locator("#sound-discovery-close").click();
    check(!await a.locator("#sound-discovery").isVisible(), "The nearby explanation can be dismissed");
    await a.locator("#sound-discovery-reopen").click();
    check(await a.locator("#sound-discovery").isVisible(), "The explanation has an explicit reachable restore");
    const comparisonPosts = ada.posts;
    await a.locator("#sound-example-compare").click();
    await cafeState(a, null, false);
    await a.waitForFunction(() => !JSON.parse(document.getElementById("planet-stage").dataset.residentResponses ?? "[]").some(row => row.origin === "example"));
    check(ada.posts === comparisonPosts && (await state(a, "soundExamples")).length === 0, "A local comparison removes example steam and NPC effects without publishing or modifying the shared world");
    await examples(ada, true);
    await cafeState(a, null, true);
    const startsBeforeListen = await a.evaluate(() => window.__discoveryAudioStarts.length);
    await a.locator("#sound-discovery-listen").click();
    await a.waitForFunction(before => window.__discoveryAudioStarts.length > before, startsBeforeListen);
    check(ada.posts === comparisonPosts && await dataset(a, "soundOn") === "false" && await dataset(a, "voices") === "0",
        "An explicit private Listen starts a decoded example while preserving quiet shared listening and publishing nothing");

    await a.setViewportSize({ width: 390, height: 844 });await a.waitForTimeout(300);
    for (const selector of ["#sound-discovery-listen", "#sound-discovery-create", "#sound-example-compare", "#sound-discovery-close"])
        check(await reachable(a, selector), `390×844 ${selector} has a reachable 44px touch target`);
    await shot(a, "discovery-cafe-phone");
    await a.locator("#planet-talk").tap();
    check(await reachable(a, "#planet-chat-input") && await reachable(a, "#planet-chat-submit") && await reachable(a, "#planet-chat-close"), "The phone explanation does not obstruct chat input, Say or Close");
    await a.locator("#planet-chat-close").tap();
    await makeYours(ada, "espresso");
    const paused = await dataset(a, "at");
    await a.keyboard.down("w");await a.waitForTimeout(250);await a.keyboard.up("w");
    check(await dataset(a, "at") === paused, "A curated creation dialog prevents movement keys from moving the player behind it");
    await a.keyboard.press("Escape");await a.locator("#chorus-studio").waitFor({ state: "hidden" });
    await a.waitForFunction(() => window.__discoveryActiveSources.size === 0);
    check(ada.posts === comparisonPosts && await a.locator("canvas.planet-canvas").evaluate(canvas => canvas === document.activeElement), "Keyboard cancellation restores world focus and never publishes a demonstrated sound");
    await makeYours(ada, "espresso");const coffee = await leave(ada, "espresso");
    await Promise.all([cafeState(a, coffee.id, true), cafeState(b, coffee.id, true)]);
    await examples(ada, false);
    await a.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.residentResponses ?? "[]").some(row => row.sourceId === id && row.origin !== "example"), coffee.id);
    await b.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.residentResponses ?? "[]").some(row => row.sourceId === id && row.origin !== "example"), coffee.id);
    const realCoffee = await Promise.all([cafeState(a, coffee.id, true), cafeState(b, coffee.id, true)]);
    check(realCoffee.every(row => row.sourceIds.includes(coffee.id)) && !(await state(b, "soundExamples")).some(example => realCoffee[1].sourceIds.includes(example.id))
        && (await snapshot(bo)).sounds.some(source => source.id === coffee.id && source.byId === ada.id),
        "Only explicit Leave writes an actual authored coffee sound; both browsers keep its real steam and NPC response when examples are hidden locally");

    await a.setViewportSize({ width: 1920, height: 1080 });
    await examples(ada, true);
    await Promise.all([place(ada, "conservatory", "Rain conservatory"), place(bo, "conservatory", "Rain conservatory")]);
    await a.locator("#sound-discovery-origin").filter({ hasText: "World example" }).waitFor();
    await makeYours(ada, "evening-forest");const birds = await leave(ada, "evening-forest");
    const birdStates = await Promise.all([wildlife(a, birds.id, "bird", true), wildlife(b, birds.id, "bird", true)]);
    assert.deepEqual(birdStates[0], birdStates[1]);
    check(birdStates[0].origin === "player" && birdStates[0].count === 2 && !exampleIds.includes(birds.id), "A real forest-bird ingredient visibly creates the same two source-attributed birds for both independent identities", birdStates[0]);
    await examples(ada, false);await wildlife(a, birds.id, "bird", true);
    check(await dataset(a, "soundOn") === "false" && await dataset(b, "soundOn") === "false", "Hiding examples preserves real birds and neither a friend's addition nor the comparison unmutes either browser");
    await shot(a, "discovery-birds-desktop");

    await examples(ada, true);
    await Promise.all([place(ada, "pool", "Tide pools"), place(bo, "pool", "Tide pools")]);
    await a.locator("#sound-discovery-origin").filter({ hasText: "World example" }).waitFor();
    await makeYours(ada, "coastal-gulls");const gulls = await leave(ada, "coastal-gulls");
    const gullStates = await Promise.all([wildlife(a, gulls.id, "gull", true), wildlife(b, gulls.id, "gull", true)]);
    assert.deepEqual(gullStates[0], gullStates[1]);
    check(gullStates[0].kind !== birdStates[0].kind && gullStates[0].sourceId === gulls.id, "Seagull calls produce distinguishable gulls rather than reusing the forest-bird response", gullStates[0]);
    await shot(a, "discovery-pool-desktop");
    await a.setViewportSize({ width: 390, height: 844 });await a.waitForTimeout(300);
    await shot(a, "discovery-pool-phone");
    check(await reachable(a, "#sound-discovery-create") && await reachable(a, "#planet-talk"), "The 390×844 shore keeps contextual creation and Talk reachable beside the authored gull result");
    // The contextual Make it yours action deliberately replaces the large
    // Share button while the guide is open. Its explicit dismissal restores
    // the ordinary world action; testing both as simultaneously visible
    // would contradict that intentional progressive disclosure.
    await a.locator("#sound-discovery-close").click();
    check(await reachable(a, "#planet-place") && await reachable(a, "#planet-talk"), "Dismissing the phone shore guide restores reachable Share and Talk actions");
    await shot(a, "discovery-pool-phone-clear");

    await examples(ada, false);
    await place(ada, "conservatory", "Rain conservatory");
    // The compact phone intentionally hides the desktop soundscape header.
    // Return to its supported desktop alternative before using that action.
    await a.setViewportSize({ width: 1920, height: 1080 });
    await a.locator("#planet-shared").click();
    const [deleted] = await Promise.all([
        a.waitForResponse(response => response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/sessions/${ada.sessionId}/sounds/${birds.id}`),
        a.locator(`#planet-soundscape [data-id="${birds.id}"] [data-planet-remove]`).click(),
    ]);
    assert.ok(deleted.ok() && (await deleted.json()).ok);
    await a.locator("#planet-soundscape").getByRole("button", { name: "Close", exact: true }).click();
    await Promise.all([wildlife(a, birds.id, "bird", false), wildlife(b, birds.id, "bird", false)]);
    const afterRemoval = await Promise.all([snapshot(ada), snapshot(bo)]);
    check(afterRemoval.every(snap => !snap.sounds.some(source => source.id === birds.id)), "The acknowledged withdrawal removes the real bird source and its wildlife from both live browser snapshots");
    const removed = storedSource(birds.id);assertStoredSource(removed, ada, birds);
    check(!!removed.removed_at && Number.isFinite(Date.parse(removed.removed_at)) && removed.removed_by === ada.id,
        "Read-only scratch SQLite confirms the removed bird remains with its original author, position, sound and timestamp plus a real removal tombstone");
    check((await state(a, "soundExamples")).length === 0 && (await state(b, "soundExamples")).length > 0, "One visitor's example preference remains local after shared removal");
    check(errors.length === 0, "No browser page errors in the verified discovery path");
}
catch (error) {
    failed = true;failure = error?.stack ?? String(error);process.exitCode = 1;console.error(error);
    for (const who of people) await shot(who.page, `discovery-failure-${who.name.replaceAll(" ", "-")}`).catch(() => {});
}
finally {
    await Promise.allSettled([...pending]);
    for (const who of people) await who.page.goto("about:blank").catch(() => {});
    for (const { who, sound } of [...made.values()].reverse()) {
        try {
            const current = storedSource(sound.id);assertStoredSource(current, who, sound);
            if (current.removed_at) continue;
            await who.page.waitForTimeout(1100);
            while (Date.now() - who.lastMoveAt < 140) await who.page.waitForTimeout(140 - (Date.now() - who.lastMoveAt));
            const moved = await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`, { data: { x: sound.x, z: sound.z, yaw: 0 } });
            assert.ok(moved.ok() && (await moved.json()).ok, `Cleanup approaches only owned fixture ${sound.id}`);
            const removed = await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`);
            assert.ok(removed.ok() && (await removed.json()).ok, `Soft-remove only owned fixture ${sound.id}`);
        }
        catch (error) { failed = true;process.exitCode = 1;console.error("Cleanup:", error.message); }
    }
    if (people[0] && initialPlanet && initialCoast) {
        try {
            const final = liveSources(await snapshot(people[0])), ids = new Set(made.keys());
            assert.deepEqual(final.filter(source => !ids.has(source.id)), initialPlanet);
            assert.deepEqual(liveSources(await snapshot(people[0], "/scene/seaside")), initialCoast);
            assert.ok(final.every(source => !ids.has(source.id)), "No cleaned fixture remains in a live snapshot");
            const finalStored = storedRows();
            assert.deepEqual(finalStored.filter(row => !ids.has(row.id)), initialStored, "Every original placed_sounds row, including prior tombstones and the coastal world, remains exactly unchanged");
            for (const { who, sound } of made.values()) {
                assert.ok(!initialStored.some(row => row.id === sound.id), "Only this run's acknowledged new IDs are cleanup targets");
                const row = finalStored.find(row => row.id === sound.id);assertStoredSource(row, who, sound);
                assert.ok(row.removed_at && Number.isFinite(Date.parse(row.removed_at)), `Fixture ${sound.id} remains as a real soft-removed stored row`);
                assert.equal(row.removed_by, who.id);
                historyEvidence.fixtureTombstones.push({ id: row.id, soundId: row.sound_id, byId: row.placed_by, x: row.x, z: row.z, at: row.placed_at, removedAt: row.removed_at });
            }
            Object.assign(historyEvidence, { initialRowsPreserved: true, onlyOwnedRowsAdded: true, finalRows: finalStored.length });
            check(true, "Cleanup preserves every initial planet/coastal live source and every stored history row exactly; only acknowledged own fixtures receive soft-removal tombstones", historyEvidence);
            rmSync(recoveryPath, { force: true });
        }
        catch (error) { failed = true;process.exitCode = 1;console.error("History preservation:", error.message); }
    }
    if (out) writeFileSync(`${out}/results.json`, JSON.stringify({ kind: "automated-developer-browser-test", base, failed, failure, checks, errors, targetRects, historyEvidence,
        created: [...made.values()].map(({ sound }) => ({ id: sound.id, byId: sound.byId, soundId: sound.soundId, x: sound.x, z: sound.z })),
        independentCookieIdentities: people.length === 2 && people[0].id !== people[1].id,
        physicalPhone: false, unfamiliarPairPlaytest: false, humanListening: false, nextDayReturn: false,
        limitations: ["Seeded examples are explicitly local teaching material, never people or shared contribution history.", "Native audio node starts verify playback lifecycle, not pleasantness or what a person hears.", "390×844 is touch-browser emulation, not physical-phone evidence."],
    }, null, 2));
    if (browser) await browser.close();
    database.close();
}
