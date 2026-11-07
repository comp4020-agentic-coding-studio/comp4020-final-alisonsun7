#!/usr/bin/env node
// Actual desktop/touch scene checks on an isolated local candidate only.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base = process.env.APP_URL ?? "http://localhost:8080", address = new URL(base), out = process.argv[2];
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname));
assert.notEqual(address.port, "18861", "Never use the player's preview for writes");
if (out)
    mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const people = [], made = [], checks = [], errors = [];
let failed = false, initial;
const hitRects = [];
const check = (ok, label) => { assert.ok(ok, label); checks.push(label); console.log("ok  " + label); };
const shot = async (page, name) => { if (out)
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
async function snapshot(who) { const r = await who.context.request.get(base + "/planet"); assert.ok(r.ok()); return JSON.parse((await r.text()).match(/<script\b[^>]*\bid="planet-boot"[^>]*>([\s\S]*?)<\/script>/i)[1]).snapshot; }
const ordinary = snap => snap.sounds.filter(s => !s.whileIn).map(({ id, soundId, x, z, byId, at, replyToId, removedAt }) => ({ id, soundId, x, z, byId, at, replyToId, removedAt })).sort((a, b) => a.id.localeCompare(b.id));
async function person(name, avatar) { const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true }), page = await context.newPage(); page.setDefaultTimeout(15000); const who = { context, page, name, lastMoveAt: 0 }; people.push(who); page.on("pageerror", e => errors.push(`${name}: ${e.message}`)); page.on("request", r => { if (r.method() === "POST" && /\/move$/.test(new URL(r.url()).pathname))
    who.lastMoveAt = Date.now(); }); await page.goto(base + "/planet"); await page.fill('#planet-join-form input[name="nickname"]', name); await page.check(`#planet-join-form input[value="${avatar}"]`, { force: true }); await page.click("#planet-enter"); await page.locator("#chorus-welcome").getByRole("button", { name: "Explore quietly", exact: true }).click(); await page.waitForFunction(() => !!document.getElementById("planet-stage").dataset.at && !document.querySelector("dialog:modal")); const s = await snapshot(who); who.id = s.you.id; who.sessionId = s.sessionId; return who; }
async function walk(who, key, ms) { await who.page.locator("canvas.planet-canvas").focus(); await who.page.keyboard.down(key); try {
    await who.page.waitForTimeout(ms);
}
finally {
    await who.page.keyboard.up(key);
} await who.page.waitForTimeout(300); }
async function cafe(who) { await who.page.locator('#chorus-travel [data-place="tea"]').click(); await who.page.waitForFunction(() => document.getElementById("planet-area").textContent === "Tide & Coffee"); await who.page.waitForTimeout(300); }
async function leave(who, id) { if (who.lastSoundAt)
    await who.page.waitForTimeout(Math.max(0, 1100 - (Date.now() - who.lastSoundAt))); await who.page.click("#planet-place"); await who.page.locator("#chorus-studio").waitFor({ state: "visible" }); assert.deepEqual(await who.page.locator("#chorus-studio [data-leave]").evaluateAll(b => b.map(e => e.dataset.leave)), ["espresso", "cafe-chatter", "cafe-music"]); const pending = who.page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/sessions/${who.sessionId}/sounds`); await who.page.locator(`#chorus-studio [data-leave="${id}"]`).click(); const r = await pending, result = await r.json(); assert.ok(r.ok() && result.ok, JSON.stringify(result)); who.lastSoundAt = Date.now(); made.push({ who, sound: result.sound }); await who.page.locator("#chorus-studio").waitFor({ state: "hidden" }); return result.sound; }
async function publishOpenStudio(who, soundId) {
    const pending = who.page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/sessions/${who.sessionId}/sounds`);
    await who.page.locator(`#chorus-studio [data-leave="${soundId}"]`).click();
    const response = await pending, result = await response.json();
    assert.ok(response.ok() && result.ok, JSON.stringify(result));
    who.lastSoundAt = Date.now();made.push({who, sound:result.sound});
    await who.page.locator("#chorus-studio").waitFor({state:"hidden"});
    return result.sound;
}
async function hit(page, selector) { return page.locator(selector).evaluate(b => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") === b; }); }
async function state(page, expected) { await page.waitForFunction(expected => { const c = JSON.parse(document.getElementById("planet-stage").dataset.cafe ?? "{}"); return Object.entries(expected).every(([k, v]) => c[k] === v); }, expected); return page.locator("#planet-stage").evaluate(e => JSON.parse(e.dataset.cafe)); }
try {
    const ada = await person("Scene Ada", "cat"), bo = await person("Scene Bo", "dog"), a = ada.page, b = bo.page;
    initial = ordinary(await snapshot(ada));
    check(ada.id !== bo.id, "Two actual independent browser identities use the same world");
    await a.locator("#chorus-our-works").click();await a.locator("#chorus-new-work").click();
    const root = await publishOpenStudio(ada,"chorus-chords");
    await b.waitForFunction(id=>document.getElementById("chorus-work").dataset.work===id,root.id);
    await a.click("#planet-tools");await a.locator("#chorus-volume").focus();await a.keyboard.press("Home");
    assert.equal(await a.locator("#chorus-volume").inputValue(),"0");await a.click("#planet-tools-close");
    await a.getByRole("button",{name:"Enable listening",exact:true}).click();
    await a.waitForFunction(()=>document.getElementById("planet-stage").dataset.soundOn==="true"&&document.getElementById("planet-stage").dataset.audioState==="running"&&Number(document.getElementById("planet-stage").dataset.voices)>0);
    check(Number(await a.locator("#chorus-volume").inputValue())>0,"Explicit Enable listening restores a zero work volume and starts the actual local audio context");
    await a.locator(".chorus-explanation summary").click();await a.locator("#chorus-focus").focus();
    await b.locator("#chorus-primary").click();await publishOpenStudio(bo,"chorus-pulse");
    await a.waitForFunction(()=>document.getElementById("chorus-work").dataset.duet==="true");
    check(await a.locator(".chorus-explanation").evaluate(details=>details.open)&&await a.locator("#chorus-focus").evaluate(button=>button===document.activeElement),"A real friend's reply preserves keyboard focus and the expanded What changed explanation");
    await a.locator("#chorus-minimise").waitFor();
    await shot(a, "green-expanded-desktop");
    await a.click("#chorus-minimise");
    check(await a.locator("#chorus-work").getAttribute("data-collapsed") === "true", "The main work panel minimises to one explicit reopen action");
    await shot(a, "green-collapsed-desktop");
    await cafe(bo);
    await walk(bo, "a", 500);
    const espresso = await leave(bo, "espresso");
    await state(b, { steam: true });
    await a.waitForFunction(id => JSON.parse(document.getElementById("planet-stage").dataset.soundCues ?? "[]").some(s => s.id === id), espresso.id);
    check(await a.locator("#chorus-work").getAttribute("data-collapsed") === "true" && await a.locator("#chorus-reopen").isVisible(), "An actual friend's SSE contribution does not reopen a minimised work panel");
    await a.click("#chorus-reopen");
    check(await a.locator("#chorus-primary").isVisible(), "The work can be explicitly reopened after a shared update");
    await a.setViewportSize({ width: 390, height: 844 });
    await a.waitForTimeout(400);
    await shot(a, "green-expanded-phone");
    check(await hit(a, "#chorus-minimise") && await hit(a, "#chorus-primary"), "390×844 expanded work actions fit and are touch reachable");
    await a.locator("#chorus-minimise").tap();
    await shot(a, "green-collapsed-phone");
    check(await hit(a, "#chorus-reopen") && await a.locator("#planet-stage").getAttribute("data-self-visible") === "true", "The phone's collapsed work leaves a reachable reopen and the actual third-person figure enabled");
    await a.setViewportSize({ width: 1920, height: 1080 });
    await cafe(ada);
    await walk(ada, "a", 950);
    const chatter = await leave(ada, "cafe-chatter");
    await state(a, { steam: true, company: true });
    await state(b, { steam: true, company: true });
    check(true, "Café's curated coffee and conversation choices activate shared steam and company for both browsers");
    await b.locator("#planet-nearby-close").waitFor({ state: "visible" });
    await b.click("#planet-nearby-close");
    check(!await b.locator("#planet-nearby-sound").isVisible() && await b.locator("#planet-nearby-reopen").isVisible(), "Outside the three core areas, nearby sound controls can be dismissed");
    const music = await leave(ada, "cafe-music");
    const left = await state(a, { steam: true, company: true, music: true }), right = await state(b, { steam: true, company: true, music: true });
    assert.deepEqual(left, right);
    check([espresso.id, chatter.id, music.id].every(id => left.sourceIds.includes(id)), "Both browsers derive identical café effects from the three real authored contributions");
    check(!await b.locator("#planet-nearby-sound").isVisible(), "A friend's later SSE addition does not force a dismissed nearby panel open");
    await b.click("#planet-nearby-reopen");
    check(await b.locator("#planet-nearby-sound").isVisible(), "The dismissed nearby panel has an explicit reachable reopen");
    await b.click("#planet-nearby-close");
    const pin = b.locator(`.planet-sound-pin[data-id="${espresso.id}"]`);
    await pin.waitFor({ state: "visible" });
    await pin.click();
    check(await b.locator("#planet-nearby-sound").isVisible() && await b.locator("#planet-nearby-sound").getAttribute("data-id") === espresso.id, "Selecting a real source pin reopens actions for that exact contribution");
    await shot(a, "cafe-desktop");
    await a.setViewportSize({ width: 390, height: 844 });
    await a.waitForTimeout(400);
    await shot(a, "cafe-phone");
    check(await hit(a, '#chorus-travel [data-place="tea"]') && await hit(a, "#planet-talk") && await a.locator("#planet-stage").getAttribute("data-self-visible") === "true", "Phone café navigation and Talk remain reachable with the real player enabled");
    hitRects.push(await a.locator("#planet-place").evaluate(button => { const r = button.getBoundingClientRect(), point = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { target: button.id, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, interceptor: point?.closest("button")?.id ?? point?.tagName }; }));
    check(await hit(a, "#planet-place"), "Phone Share a sound stays reachable above movement controls");
    await a.locator("#planet-place").tap();
    await a.locator("#chorus-studio").waitFor({ state: "visible" });
    check(await hit(a, '#chorus-studio [data-listen="espresso"]') && await hit(a, '#chorus-studio [data-leave="espresso"]'), "Phone café library opens on useful coffee choices with reachable audition and contribution actions");
    await shot(a, "cafe-library-phone");
    await a.getByRole("button", { name: "Cancel", exact: true }).click();
    check(errors.length === 0, "No browser page errors");
}
catch (error) {
    failed = true;
    process.exitCode = 1;
    console.error(error);
    for (const p of people)
        await shot(p.page, `failure-${p.name.replaceAll(" ", "-")}`).catch(() => { });
}
finally {
    for (const who of people)await who.page.goto("about:blank").catch(()=>{});
    for (const { who, sound } of [...made].reverse()) {
        try {
            await who.page.waitForTimeout(1100);
            while (Date.now() - who.lastMoveAt < 140)
                await who.page.waitForTimeout(140 - (Date.now() - who.lastMoveAt));
            const move=await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`,{data:{x:sound.x,z:sound.z,yaw:0}});assert.ok(move.ok()&&(await move.json()).ok);
            const r = await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`);
            assert.ok(r.ok() && (await r.json()).ok, `Remove own fixture ${sound.id}`);
        }
        catch (e) {
            failed = true;
            process.exitCode = 1;
            console.error("Cleanup", e.message);
        }
    }
    if (people[0] && initial) {
        try {
            const final = ordinary(await snapshot(people[0]));
            assert.deepEqual(final, initial);
            checks.push("Only own test contributions were soft-removed; original live sources remain exact");
        }
        catch (e) {
            failed = true;
            process.exitCode = 1;
            console.error("Cleanup snapshot", e.message);
        }
    }
    if (out)
        writeFileSync(`${out}/results.json`, JSON.stringify({ kind: "automated-developer-browser-test", base, checks, failed, errors, hitRects, created: made.map(({ sound }) => ({ id: sound.id, byId: sound.byId, soundId: sound.soundId, x: sound.x, z: sound.z })), physicalPhone: false, humanListening: false }, null, 2));
    await browser.close();
}
