#!/usr/bin/env node
// A real production-page comparison and focused regression check. Scratch only.
// BASELINE_URL=http://localhost:18896 APP_URL=http://localhost:18898 node e2e/lived-in-3d.mjs <output>
// The baseline is an unjoined read-only observer: no identity, moves or sounds.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base = process.env.APP_URL, before = process.env.BASELINE_URL, out = process.argv[2];
assert.ok(base && out, "Provide an explicit scratch APP_URL and output directory");
for (const url of [base, before].filter(Boolean)) {
    const address = new URL(url);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "Local scratch worlds only");
    assert.notEqual(address.port, "18861", "Never run writes in the player's world");
}
assert.notEqual(base, before, "Baseline and candidate must use separate scratch servers");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const checks = [], errors = [], samples = [], contexts = [], made = [];
let failed = false, player, initial, initialCoast;
const check = (ok, label) => { assert.ok(ok, label); checks.push(label); console.log("ok  " + label); };
const ordinary = snap => snap.sounds.filter(s => !s.whileIn).map(({ id, soundId, x, z, byId, at, replyToId, removedAt }) => ({ id, soundId, x, z, byId, at, replyToId, removedAt })).sort((a,b) => a.id.localeCompare(b.id));
async function snapshot(who, path = "/planet") {
    const r = await who.context.request.get(who.url + path); assert.ok(r.ok());
    return JSON.parse((await r.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i)[1]).snapshot;
}
async function open(url, label, readonly = false) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, hasTouch: true });
    contexts.push(context); const page = await context.newPage(); page.setDefaultTimeout(20_000);
    const who = { url, label, context, page, writes: [], lastMoveAt: 0 };
    if (readonly) await page.route("**/*", route => {
        if (!["GET", "HEAD"].includes(route.request().method())) { who.writes.push(route.request().url());return route.abort(); }
        return route.continue();
    });
    page.on("pageerror", error => errors.push(`${label}: ${error.message}`));
    page.on("request", request => {if (request.method() === "POST" && /\/move$/.test(new URL(request.url()).pathname)) who.lastMoveAt = Date.now();});
    await page.goto(url + "/planet");await page.locator("#planet-join").waitFor({ state: "visible" });
    return who;
}
async function ready(page) { await page.waitForFunction(() => document.getElementById("planet-stage").dataset.at && !document.querySelector("dialog:modal")); }
async function go(who, id) {
    const page = who.page;await page.click("#planet-tools");await page.locator(`#planet-destinations [data-zone="${id}"]`).click();
    await page.waitForFunction(() => !document.getElementById("planet-tools-panel").open);await page.waitForTimeout(500);
}
async function shot(who, name) { await who.page.screenshot({ path: `${out}/${who.label}-${name}.png`, fullPage: true }); }
async function canvas(who, label) {
    const data = await who.page.locator("canvas.planet-canvas").evaluate((c,label) => {
        const r = c.getBoundingClientRect(), stage = document.getElementById("planet-stage"), gl = c.getContext("webgl2");
        return { label, width: c.width, height: c.height, cssWidth: r.width, cssHeight: r.height, reportedScale: Number(stage.dataset.renderScale ?? 0),
            samples: gl?.getParameter(gl.SAMPLES) ?? 0, nativeDpr: devicePixelRatio, at: stage.dataset.at, view: stage.dataset.view, camera: stage.dataset.cameraDistance,
            minute: stage.dataset.minute, weather: stage.dataset.weather, triangles: Number(stage.dataset.triangles), calls: Number(stage.dataset.calls) };
    },label);
    check(data.width > 0 && data.height > 0 && data.samples > 0, `${who.label} ${label}: the actual canvas uses multisampled WebGL`);
    if (who.label === "candidate") {
        check(data.width * data.height <= 6_000_000 && data.width >= data.cssWidth * 1.24 && data.reportedScale >= 1.25,
            `${label}: real render dimensions supersample ordinary DPR=1 without exceeding six million pixels`);
    }
    const cadence = await who.page.evaluate(() => new Promise(resolve => {
        const times = [];let last = performance.now();
        function frame(now) {times.push(now-last);last=now;if(times.length<41)requestAnimationFrame(frame);else {const sorted=times.slice(1).sort((a,b)=>a-b);resolve({frames:sorted.length,medianMs:sorted[20],p90Ms:sorted[36],maxMs:sorted.at(-1)});}}
        requestAnimationFrame(frame);
    }));
    samples.push({ ...data, cadence });console.log("frame sample " + JSON.stringify({ version: who.label, ...data, cadence }));
}
async function walk(who, key, ms) {
    await who.page.locator("canvas.planet-canvas").focus();await who.page.keyboard.down(key);
    try {await who.page.waitForTimeout(ms);}finally {await who.page.keyboard.up(key);}
    await who.page.waitForTimeout(250);
}
async function look(who, dy, dx = 0) {
    const r = await who.page.locator("canvas.planet-canvas").boundingBox(), x = r.x + r.width*.64, y = r.y + r.height*.4;
    await who.page.mouse.move(x,y);await who.page.mouse.down();await who.page.mouse.move(x+dx,y+dy,{steps:6});await who.page.mouse.up();await who.page.waitForTimeout(200);
}
async function observe(url, label) {
    const who=await open(url,label,true), snap=await snapshot(who);await who.page.click("#planet-observe");await ready(who.page);
    await go(who,"tea");await canvas(who,"cafe desktop 1920x1080");await shot(who,"cafe-desktop");
    await who.page.setViewportSize({width:390,height:844});await who.page.waitForTimeout(450);await canvas(who,"cafe phone 390x844");await shot(who,"cafe-phone");
    await who.page.setViewportSize({width:1920,height:1080});await go(who,"conservatory");await shot(who,"conservatory-desktop");
    await who.page.locator("canvas.planet-canvas").focus();await who.page.keyboard.press("v");
    if(label==="candidate") {
        // The controller updates this label in its render callback. Allow two
        // actual frames, rather than racing the keyboard event's completion.
        await who.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        check(await who.page.locator("#planet-view span").textContent()==="First person","Keyboard V reports the actual first-person view within the next rendering frames");
    }
    // Face an actual flower box and look down toward its soil. A forward
    // first-person view only shows the arch and is not evidence for this bug.
    await look(who,110,-250);await shot(who,"conservatory-soil-before-step");
    await walk(who,"d",350);await shot(who,"conservatory-soil-after-step");
    check(who.writes.length===0,`${label}: comparison uses an unjoined observer and sends no write requests`);
    assert.deepEqual(ordinary(await snapshot(who)),ordinary(snap));
    const observed = await who.page.locator("#planet-stage").evaluate(s=>({ at:s.dataset.at,roomFixtures:s.dataset.roomFixtures, residents:JSON.parse(s.dataset.chorusResidents??"[]")}));
    samples.push({version:label,kind:"read-only-observer",environment:snap.environment,observed});
    await who.context.close();return observed;
}
async function enter(who) {
    await who.page.fill('#planet-join-form input[name="nickname"]',"Village Reviewer");
    await who.page.check('#planet-join-form input[value="cat"]',{force:true});await who.page.click("#planet-enter");
    await who.page.locator("#chorus-welcome").getByRole("button",{name:"Explore quietly",exact:true}).click();await ready(who.page);
    const snap=await snapshot(who);who.id=snap.you.id;who.sessionId=snap.sessionId;return snap;
}
async function leaveEspresso(who) {
    await who.page.click("#planet-place");await who.page.locator("#chorus-studio").waitFor({state:"visible"});
    const [response]=await Promise.all([who.page.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname===`/api/sessions/${who.sessionId}/sounds`),who.page.locator('#chorus-studio [data-leave="espresso"]').click()]);
    const result=await response.json();assert.ok(response.ok()&&result.ok,JSON.stringify(result));made.push(result.sound);
    await who.page.locator("#chorus-studio").waitFor({state:"hidden"});return result.sound;
}
try {
    if (before) await observe(before,"baseline");
    const rendered=await observe(base,"candidate"), regulars=rendered.residents.filter(n=>n.id.startsWith("coffee-"));
    check(regulars.length===6&&regulars.every(n=>n.npc===true),"Six actual café figures are explicitly NPCs in the live production renderer");
    const fixtures=JSON.parse(rendered.roomFixtures??"{}");
    check(["restroom-toilet","restroom-toilet-seat","restroom-cistern","restroom-washbasin","restroom-mirror"].every(name=>fixtures.toilet?.includes(name)),"Actual scene contains a toilet, seat, cistern, washbasin and mirror");
    check(["shower-tray","shower-drain","shower-head","shower-changing-bench","shower-towel"].every(name=>fixtures.shower?.includes(name)),"Actual scene contains a shower tray, drain, head, changing bench and towel");
    player=await open(base,"playable");initial=ordinary(await enter(player));initialCoast=ordinary(await snapshot(player,"/scene/seaside"));
    const page=player.page;
    check(await page.locator("#planet-invite-resident, #planet-test-restroom").count()===0,"The player's world has no resident invitation or lock-test button");
    check(!(await snapshot(player)).online.some(p=>regulars.some(n=>n.id===p.id)||/Bean|Jun|Coco|Maple|Wren|Sol/.test(p.name)),"Café NPCs are absent from actual shared human presence");
    await go(player,"tea");
    const start=await page.locator("#planet-stage").getAttribute("data-at");await walk(player,"w",450);
    const end=await page.locator("#planet-stage").getAttribute("data-at");
    check(start!==end,"A real named player can walk from the terrace into the enlarged café");
    const inside=await page.evaluate(async()=>{const {planetLocal,PLANET_PLACES,PLANET_CAFE_SCALE}=await import("/shared/planet.js"),[x,z]=document.getElementById("planet-stage").dataset.at.split(",").map(Number);return {local:planetLocal({x,z},PLANET_PLACES.find(p=>p.id==="tea")),scale:PLANET_CAFE_SCALE};});
    check(Math.abs(inside.local.x)<2.3*inside.scale.x&&Math.abs(inside.local.z)<1.95*inside.scale.z,"The screenshot's real player position lies inside the enlarged café, rather than merely changing coordinates");
    samples.push({version:"candidate",kind:"walked-inside-cafe",...inside,at:end});
    await shot(player,"cafe-walked-inside-desktop");
    const espresso=await leaveEspresso(player);
    await page.waitForFunction(id=>{const s=document.getElementById("planet-stage"),c=JSON.parse(s.dataset.cafe??"{}");return c.steam&&c.sourceIds.includes(id)&&JSON.parse(s.dataset.residentResponses??"[]").some(r=>r.sourceId===id&&r.behavior==="chat");},espresso.id);
    check(true,"An explicitly authored espresso produces actual shared steam and a source-derived resident response");
    const accepted=(await snapshot(player)).sounds.find(s=>s.id===espresso.id);assert.equal(accepted.x,espresso.x);assert.equal(accepted.z,espresso.z);
    for (const old of initial) assert.deepEqual(ordinary(await snapshot(player)).find(s=>s.id===old.id),old);
    check(true,"Enlarging the café retains accepted contribution coordinates and all previous ordinary sources");
    await shot(player,"cafe-espresso-response-desktop");
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await shot(player,"cafe-espresso-response-phone");
    await page.setViewportSize({width:1920,height:1080});await go(player,"restrooms");
    await page.click("#planet-enter-room");await page.waitForFunction(()=>{const s=document.getElementById("planet-stage");return Number(s.dataset.at.split(",")[1])<5.7&&s.dataset.walkingIntent==="false";});
    await page.locator("canvas.planet-canvas").focus();await page.keyboard.press("v");await look(player,55);
    await page.click("#planet-restroom-dismiss");await shot(player,"restroom-fixtures-desktop");await page.click("#planet-restroom-reopen");await page.click("#planet-leave-room");
    await page.waitForFunction(()=>document.getElementById("planet-restroom-card").dataset.inside==="false");
    await page.click("#planet-switch-room");await page.waitForFunction(()=>{const s=document.getElementById("planet-stage"),c=document.getElementById("planet-restroom-card");return c.dataset.hut==="planet-shower"&&s.dataset.walkingIntent==="false";});
    await page.click("#planet-enter-room");await page.waitForFunction(()=>{const s=document.getElementById("planet-stage");return Number(s.dataset.at.split(",")[1])<5.7&&s.dataset.walkingIntent==="false";});
    await look(player,-125);await page.click("#planet-restroom-dismiss");await shot(player,"shower-fixtures-desktop");
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await shot(player,"shower-fixtures-phone");
    await page.click("#planet-restroom-reopen");await page.click("#planet-leave-room");await page.waitForFunction(()=>document.getElementById("planet-restroom-card").dataset.inside==="false");
    check(true,"Real player walks through both furnished rooms and can leave using the phone's visible room controls");
    check(errors.length===0,"No production-page JavaScript errors");
} catch (error) {
    failed=true;process.exitCode=1;console.error(error);
    if (player) await shot(player,"failure").catch(()=>{});
} finally {
    if (player?.sessionId) {
        try {
            await player.page.goto("about:blank");
            // Recover even a server-confirmed contribution whose ACK was lost.
            const owned=(await snapshot(player)).sounds.filter(s=>s.byId===player.id&&!s.whileIn&&!initial.some(old=>old.id===s.id));
            for (const source of owned) {
                await new Promise(resolve=>setTimeout(resolve,1100));
                const move=await player.context.request.post(`${base}/api/sessions/${player.sessionId}/move`,{data:{x:source.x,z:source.z,yaw:0}});assert.ok(move.ok()&&(await move.json()).ok);
                const removed=await player.context.request.delete(`${base}/api/sessions/${player.sessionId}/sounds/${source.id}`);assert.ok(removed.ok()&&(await removed.json()).ok);
            }
            assert.deepEqual(ordinary(await snapshot(player)),initial);assert.deepEqual(ordinary(await snapshot(player,"/scene/seaside")),initialCoast);
            check(true,"Only this fixture's ordinary contribution is soft-removed; previous planet and coastal sources are unchanged");
        } catch (error) {failed=true;process.exitCode=1;console.error("cleanup",error);}
    }
    writeFileSync(`${out}/results.json`,JSON.stringify({kind:"automated-developer-browser-comparison",base,before,checks,failed,errors,samples,made:made.map(s=>({id:s.id,x:s.x,z:s.z})),physicalPhone:false,humanListening:false,artisticVerdict:false},null,2));
    await browser.close();
}
