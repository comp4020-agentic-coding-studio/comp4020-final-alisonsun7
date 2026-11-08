#!/usr/bin/env node
// Actual local UI walking regression; no contribution or environment writes.
// APP_URL=http://localhost:18912 node e2e/coast-walk.mjs [artifact-directory]
// EXPECT_BROKEN=1 labels an observed baseline regression. It does not turn a
// failing product check into a pass: an observed broken baseline still exits 1.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.APP_URL;
assert.ok(base, "Set APP_URL to an explicitly independent local scratch world");
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "Only local scratch worlds are accepted");
assert.ok(["18910", "18912"].includes(address.port), "Coast walking is reserved for baseline 18910 / candidate 18912, never the player's 18861 world");
const expectedBroken = process.env.EXPECT_BROKEN === "1";
if (expectedBroken) assert.equal(address.port, "18910", "Expected-broken mode belongs only to the isolated baseline");
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const R = 22, checks = [], routes = [], errors = [], writes = [];
let browser, context, page, touchSession, initialPlanet, initialCoast, failed = false, failure;
let observedRegression = false, status = "not-run";
const check = (condition, label, detail) => {
    assert.ok(condition, label);checks.push({ label, ...(detail === undefined ? {} : { detail }) });console.log("ok  " + label);
};
const shot = async name => { if (out && page && !page.isClosed()) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const probe = () => page.locator("#planet-stage").evaluate(stage => JSON.parse(stage.dataset.groundSafety));
const violations = sample => {
    const reasons = [];
    for (const key of ["x", "z", "feetRadius", "signedFeetRadius", "cameraRadius", "zoom"])
        if (!Number.isFinite(sample[key])) reasons.push(`${key} is not finite`);
    if (sample.signedFeetRadius < R - .001) reasons.push("feet have crossed the signed ground hemisphere");
    if (sample.feetRadius < R - .001) reasons.push("feet are inside the globe");
    if (sample.cameraRadius < R + .1) reasons.push("camera/near-plane origin is inside the globe clearance");
    if (Number.isFinite(sample.shoreline) && sample.z > sample.shoreline + .12) reasons.push("the land route has crossed the actual sea boundary");
    return reasons;
};
async function snapshot(path) {
    const response = await context.request.get(base + path);assert.ok(response.ok());
    const match = (await response.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);
    assert.ok(match);return JSON.parse(match[1]).snapshot;
}
const sources = state => state.sounds.map(sound => ({ ...sound })).sort((a, b) => a.id.localeCompare(b.id));
async function observatory() {
    await page.locator("#planet-tools").click();
    await page.locator('#planet-destinations [data-zone="observatory"]').click();
    await page.waitForFunction(() => {
        const stage = document.getElementById("planet-stage");
        if (!stage?.dataset.groundSafety || document.querySelector("dialog:modal")) return false;
        const actual = JSON.parse(stage.dataset.groundSafety);
        return Math.abs(actual.x - 55) < .01 && actual.z < -3;
    });
}
async function camera(view, zoom) {
    for (let attempt = 0; attempt < 20; attempt++) {
        const current = await probe();
        if (Math.abs(current.zoom - zoom) < .11) break;
        const previous = current.zoom;
        await page.locator(previous > zoom ? "#planet-zoom-in" : "#planet-zoom-out").click();
        await page.waitForFunction(previous => JSON.parse(document.getElementById("planet-stage").dataset.groundSafety).zoom !== previous, previous);
    }
    assert.ok(Math.abs((await probe()).zoom - zoom) < .11, `Reach actual requested zoom ${zoom} through its UI`);
    if ((await probe()).view !== view) await page.locator("#planet-view").click();
    await page.waitForFunction(view => JSON.parse(document.getElementById("planet-stage").dataset.groundSafety).view === view, view);
}
async function beginSampling(label) {
    await page.evaluate(async () => {
        // Read the actual application's pure geometry functions; do not
        // recreate its shoreline or inject a player/camera position.
        const { coastlineAt } = await import("/client/planet-coast.js");
        const { planetDistance, PLANET_HALF } = await import("/shared/planet.js");
        window.__coastGeometry = { coastlineAt, planetDistance, cafeAntipode: { x: PLANET_HALF - 9, z: 7 } };
    });
    await page.evaluate(label => {
        const stage = document.getElementById("planet-stage"), began = performance.now(), samples = [];
        let lastFrame = null;
        const take = () => {
            const sample = JSON.parse(stage.dataset.groundSafety);
            if (sample.frame === lastFrame) return;
            lastFrame = sample.frame;samples.push({ ...sample, elapsedMs: performance.now() - began,
                shoreline: window.__coastGeometry.coastlineAt(sample.x),
                cafeAntipodeDistance: window.__coastGeometry.planetDistance(sample, window.__coastGeometry.cafeAntipode),
            });
        };
        take();
        // Every actual render writes one matching-frame diagnostic attribute.
        // Observe it directly, rather than deducing camera position from a
        // screenshot or injecting a replacement player/camera state.
        const observer = new MutationObserver(take);observer.observe(stage, { attributes: true, attributeFilter: ["data-ground-safety"] });
        window.__coastMonitor = { label, samples, stop: () => { take();observer.disconnect();return samples; } };
    }, label);
}
async function holdBack(touch) {
    if (!touch) { await page.locator("canvas.planet-canvas").focus();await page.keyboard.down("s");return; }
    const button = page.locator(".planet-move-back"), rect = await button.boundingBox();assert.ok(rect && rect.width >= 44 && rect.height >= 44);
    await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
}
async function release() {
    if (!page || page.isClosed()) return;
    for (const key of ["s", "d"]) await page.keyboard.up(key).catch(() => {});
    if (touchSession) await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {});
}
async function walk(profile) {
    await page.setViewportSize(profile.viewport);
    await observatory();await camera(profile.view, profile.zoom);
    const route = { ...profile, start: await probe(), goal: { zGreaterThan: 5 }, samples: [], reachedGoal: false, safe: false };
    routes.push(route);await shot(`${profile.id}-start`);await beginSampling(profile.id);
    const began = Date.now();let firstBad;
    try {
        await holdBack(profile.touch);
        // The key/finger stays down until actual movement reaches the coast,
        // a measured regression is captured, or the explicit time bound ends.
        // There is no assumption that a fixed 4500ms means a given distance.
        while (Date.now() - began < 15_000) {
            await page.waitForTimeout(75);
            const observed = await page.evaluate(() => window.__coastMonitor.samples);
            firstBad ??= observed.find(sample => violations(sample).length);
            const actual = await probe();route.end = actual;
            if (actual.z > 5) { route.reachedGoal = true;break; }
            // Preserve some real walking even if the baseline starts inside
            // an antipodal phantom floor. The product assertion still fails.
            if (firstBad && Date.now() - began > 500 && Math.abs(actual.z - route.start.z) > .2) break;
        }
    }
    finally {
        await release();
        route.samples = await page.evaluate(() => window.__coastMonitor.stop());route.end = await probe();
        route.elapsedMs = Date.now() - began;
    }
    const bad = route.samples.filter(sample => violations(sample).length);
    route.violationCount = bad.length;route.firstViolation = bad[0] ? { ...bad[0], reasons: violations(bad[0]) } : null;
    route.safe = bad.length === 0;
    await shot(`${profile.id}-end`);
    if (bad.length) {
        observedRegression = true;await shot(`${profile.id}-failure`);
        assert.fail(`Actual ${profile.id} crossed the ground/camera envelope: ${JSON.stringify(route.firstViolation)}`);
    }
    check(route.samples.length >= 6 && route.reachedGoal, `${profile.id} reaches z > 5 by actual sustained ${profile.touch ? "touch" : "S-key"} movement within its time bound`, { samples: route.samples.length, start: route.start, end: route.end });
    check(route.safe, `${profile.id}: every observed render keeps the real signed ground and camera outside the globe`);
}

async function farShoreLeg() {
    // Continue from the first route's real z>5 endpoint. Strafe east with D,
    // then continue south with S into the café-antipode coastline. No travel
    // shortcut or precise wall/point teleport substitutes for these inputs.
    const id = "desktop-third-default-cafe-antipode", route = {
        id, viewport: { width: 1920, height: 1080 }, view: "third", zoom: 8,
        start: await probe(), legs: [], samples: [], safe: false, reachedGoal: false,
    };
    routes.push(route);await shot(`${id}-start`);await beginSampling(id);
    let firstBad;
    try {
        for (const [key, axis, threshold] of [["d", "x", 60], ["s", "z", 7.15]]) {
            const leg = { key, goal: { axis, greaterThan: threshold }, start: await probe(), reachedGoal: false };
            route.legs.push(leg);const began = Date.now();
            await page.locator("canvas.planet-canvas").focus();
            try {
                await page.keyboard.down(key);
                while (Date.now() - began < 12_000) {
                    await page.waitForTimeout(75);
                    const observed = await page.evaluate(() => window.__coastMonitor.samples);
                    firstBad ??= observed.find(sample => violations(sample).length);
                    const actual = await probe();leg.end = actual;
                    if (firstBad) break;
                    if (actual[axis] > threshold) { leg.reachedGoal = true;break; }
                }
            }
            finally { await release();leg.elapsedMs = Date.now() - began;leg.end = await probe(); }
            if (firstBad || !leg.reachedGoal) break;
        }
    }
    finally {
        await release();route.samples = await page.evaluate(() => window.__coastMonitor.stop());route.end = await probe();
    }
    const bad = route.samples.filter(sample => violations(sample).length);
    route.violationCount = bad.length;route.firstViolation = bad[0] ? { ...bad[0], reasons: violations(bad[0]) } : null;
    route.safe = bad.length === 0;route.reachedGoal = route.legs.length === 2 && route.legs.every(leg => leg.reachedGoal);
    route.closestCafeAntipodeMetres = Math.min(...route.samples.map(sample => sample.cafeAntipodeDistance));
    await shot(`${id}-end`);
    if (bad.length) {
        observedRegression = true;await shot(`${id}-failure`);
        assert.fail(`Actual far-shore walk crossed the ground/camera envelope: ${JSON.stringify(route.firstViolation)}`);
    }
    check(route.reachedGoal && route.end.x > 60 && route.end.z > 7.15,
        "The default desktop walk continues by real D then S to the far shore beyond x60/z7 without a wall shortcut", route.legs);
    check(route.samples.length >= 6 && route.safe && route.closestCafeAntipodeMetres < 1,
        "Every far-shore render stays on land and outside the globe while actually passing within one metre of the café antipode",
        { samples: route.samples.length, closestCafeAntipodeMetres: route.closestCafeAntipodeMetres, end: route.end });
}

try {
    browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
    context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true });page = await context.newPage();
    page.setDefaultTimeout(20_000);touchSession = await context.newCDPSession(page);
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
        const path = new URL(request.url()).pathname;
        if ((request.method() === "POST" || request.method() === "DELETE") && (/\/sounds(?:\/|$)/.test(path) || /\/environment$/.test(path)))
            writes.push({ method: request.method(), path });
    });
    await page.goto(base + "/planet");
    await page.fill('#planet-join-form input[name="nickname"]', "Coast Walker");
    await page.locator("#planet-enter").click();
    await page.locator("#chorus-welcome").getByRole("button", { name: "Explore quietly", exact: true }).click();
    await page.waitForFunction(() => !!document.getElementById("planet-stage")?.dataset.groundSafety && !document.querySelector("dialog:modal"));
    const first = await probe();
    assert.ok(["frame", "x", "z", "feetRadius", "signedFeetRadius", "cameraRadius", "view", "zoom"].every(key => Object.hasOwn(first, key)), "Both baseline and candidate must expose matching real render diagnostics");
    initialPlanet = sources(await snapshot("/planet"));initialCoast = sources(await snapshot("/scene/seaside"));
    const profiles = [
        { id: "desktop-third-default", viewport: { width: 1920, height: 1080 }, view: "third", zoom: 8, touch: false },
        { id: "desktop-third-close", viewport: { width: 1920, height: 1080 }, view: "third", zoom: 4.2, touch: false },
        { id: "desktop-third-far", viewport: { width: 1920, height: 1080 }, view: "third", zoom: 28, touch: false },
        { id: "desktop-first", viewport: { width: 1920, height: 1080 }, view: "first", zoom: 8, touch: false },
        { id: "phone-third-close", viewport: { width: 390, height: 844 }, view: "third", zoom: 4.2, touch: true },
        { id: "phone-third-far", viewport: { width: 390, height: 844 }, view: "third", zoom: 28, touch: true },
        { id: "phone-first", viewport: { width: 390, height: 844 }, view: "first", zoom: 8, touch: true },
    ];
    for (const profile of profiles) {
        await walk(profile);
        if (profile.id === "desktop-third-default") await farShoreLeg();
    }
    check(await page.locator("#planet-stage").getAttribute("data-sound-on") === "false", "The walk, view and touch actions preserve an explicitly quiet visit");
    check(errors.length === 0 && writes.length === 0, "No page errors, contribution mutations or environment mutations occur");
    if (expectedBroken) assert.fail("Expected a real baseline geometry regression, but none was observed; do not claim the old bug reproduced");
    status = "passed";
}
catch (error) {
    failed = true;failure = error?.stack ?? String(error);process.exitCode = 1;
    status = observedRegression ? (expectedBroken ? "observed-broken-baseline" : "failed-ground-envelope") : "failed";
    console.error(error);
    if (expectedBroken && observedRegression) console.error("Expected regression observed. The product assertion remains failed; exit code is 1.");
    await shot("coast-failure").catch(() => {});
}
finally {
    await release();
    if (context && initialPlanet && initialCoast) {
        try {
            assert.deepEqual(sources(await snapshot("/planet")), initialPlanet);
            assert.deepEqual(sources(await snapshot("/scene/seaside")), initialCoast);
            check(writes.length === 0, "All original planet/coastal live sources remain exact with zero source/environment writes");
        }
        catch (error) { failed = true;process.exitCode = 1;status = "failed-preservation";console.error("Preservation:", error.message); }
    }
    if (out) writeFileSync(`${out}/results.json`, JSON.stringify({ kind: "automated-developer-browser-regression", base, status, passed: !failed && status === "passed", expectedBroken,
        observedRegression, expectedRegressionObserved: expectedBroken && observedRegression, failure, checks, errors, writes, routes,
        physicalPhone: false, humanVisualAcceptance: false, humanListening: false,
        limitations: ["Diagnostics observe actual rendered camera/feet vectors; they do not establish artistic quality.", "Phone coverage uses a touch-enabled Chrome viewport and real injected touch input, not a physical device.", "A matching expected-broken baseline is still a failed product assertion and exits 1."],
    }, null, 2));
    if (page && !page.isClosed()) await page.goto("about:blank").catch(() => {});
    if (browser) await browser.close();
}
