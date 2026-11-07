#!/usr/bin/env node
// Developer automation on a scratch world. Two independent cookie identities,
// visible nearby chat, real walking/locked doors, private stays and resident.
// APP_URL=http://localhost:18891 node e2e/planet-social-restrooms.mjs [shots-dir]
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base = process.env.APP_URL ?? "http://localhost:8080", address = new URL(base), out = process.argv[2];
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "Use a local scratch world");
assert.notEqual(address.port, "18861", "Never write tests into the working preview");
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const people = [], errors = [], checks = [], privateSounds = [];
let failed = false;
const check = (ok, label) => {assert.ok(ok, label);checks.push(label);console.log("ok  " + label);};
const shot = async (page, label) => {if(out) await page.screenshot({path:`${out}/${label}.png`,fullPage:true});};
const at = page => page.locator("#planet-stage").evaluate(stage => stage.dataset.at.split(",").map(Number));
async function snapshot(who, path = "/planet") {
    const res = await who.context.request.get(base + path);assert.ok(res.ok());
    const match = (await res.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);assert.ok(match);return JSON.parse(match[1]).snapshot;
}
async function person(name, avatar, sound) {
    const context = await browser.newContext({viewport:{width:1920,height:1080},hasTouch:true});
    await context.addInitScript(() => {
        window.__socialAudioStarts = [];
        const Context = window.AudioContext;
        window.AudioContext = class extends Context {createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{window.__socialAudioStarts.push({loop:source.loop,duration:source.buffer?.duration,args});return start(...args);};return source;}};
    });
    const page = await context.newPage();page.setDefaultTimeout(18_000);
    const who = {context,page,name,lastMoveAt:0};people.push(who);
    page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
    page.on("request", request => {if(request.method()==="POST"&&/\/move$/.test(new URL(request.url()).pathname))who.lastMoveAt=Date.now();});
    await page.goto(base+"/planet");await page.locator("#planet-join").waitFor({state:"visible"});
    await page.fill('#planet-join-form input[name="nickname"]',name);await page.check(`#planet-join-form input[value="${avatar}"]`,{force:true});await page.click("#planet-enter");
    await page.locator("#chorus-welcome").getByRole("button",{name:sound?"Enter with sound":"Explore quietly",exact:true}).click();
    await page.waitForFunction(()=>!!document.getElementById("planet-stage").dataset.at&&!document.querySelector("dialog:modal"));
    const snap=await snapshot(who);who.id=snap.you.id;who.sessionId=snap.sessionId;return who;
}
async function go(who, place) {
    await who.page.click("#planet-tools");await who.page.locator("#planet-tools-panel").waitFor({state:"visible"});
    await who.page.click(`#planet-destinations [data-zone="${place}"]`);await who.page.waitForFunction(()=>!document.getElementById("planet-tools-panel").open);await who.page.waitForTimeout(300);
}
async function walk(who,key,ms) {
    await who.page.locator("canvas.planet-canvas").focus();await who.page.keyboard.down(key);try{await who.page.waitForTimeout(ms);}finally{await who.page.keyboard.up(key);}await who.page.waitForTimeout(250);
}
async function inside(page,id,value=true) {await page.waitForFunction(({id,value})=>{const card=document.getElementById("planet-restroom-card");return card.dataset.hut===id&&card.dataset.inside===String(value);},{id,value});}
async function closedDoor(page,id) {await page.waitForFunction(id=>JSON.parse(document.getElementById("planet-stage").dataset.huts??"[]").some(door=>door.id===id&&door.taken&&Math.abs(door.angle)<.12),id);}
async function rejectedAdmission(who,id,x,z) {
    for(let i=0;i<4;i++){
        while(Date.now()-who.lastMoveAt<140)await who.page.waitForTimeout(140-(Date.now()-who.lastMoveAt));
        const response=await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`,{data:{x,z,yaw:Math.PI}}),result=await response.json();
        if(result.code==="hut_taken"){check(result.hutId===id&&result.position.z>=7,`${id}: server rejects a second occupant and returns a safe outside position`);return;}
        await who.page.waitForTimeout(130);
    }
    assert.fail("No authoritative occupied-door rejection received");
}
async function waitAbsent(who,id) {
    for(let i=0;i<20;i++){if(!(await snapshot(who)).sounds.some(sound=>sound.id===id))return true;await who.page.waitForTimeout(150);}
    return false;
}
async function startStay(who,soundId,hutId) {
    const before=await who.page.evaluate(()=>window.__socialAudioStarts.length);
    const response=who.page.waitForResponse(res=>res.request().method()==="POST"&&new URL(res.url()).pathname===`/api/sessions/${who.sessionId}/sounds`);
    await who.page.click("#planet-stay-action");const res=await response,result=await res.json();assert.ok(res.ok()&&result.ok,JSON.stringify(result));
    check(result.sound.soundId===soundId&&result.sound.whileIn===hutId,`${hutId}: visible stay action creates the correct server-confirmed private sound`);privateSounds.push(result.sound.id);
    await who.page.waitForFunction(before=>window.__socialAudioStarts.length>before,before);
    const starts=await who.page.evaluate(before=>window.__socialAudioStarts.slice(before),before);
    check(starts.some(node=>node.duration>0&&(soundId!=="toilet-flush"||!node.loop)),`${hutId}: actual decoded browser audio starts with the correct event/texture role`);
    return result.sound.id;
}
const ordinary = snap => snap.sounds.filter(sound=>!sound.whileIn).map(({id,soundId,byId,x,z,at,replyToId,removedAt})=>({id,soundId,byId,x,z,at,replyToId,removedAt})).sort((a,b)=>a.id.localeCompare(b.id));
let initialPlanet,initialCoast;
try {
    const ada=await person("Room Ada","cat",true),bo=await person("Room Bo","dog",false),a=ada.page,b=bo.page;
    initialPlanet=ordinary(await snapshot(ada));initialCoast=ordinary(await snapshot(ada,"/scene/seaside"));
    check(ada.id!==bo.id,"Two real independent cookie identities are used");
    await a.waitForFunction(()=>document.getElementById("planet-talk").textContent.includes("1 nearby"));
    check(await a.locator("#planet-talk").isVisible(),"A nearby Talk action is visible in the world without opening settings");
    await a.locator("canvas.planet-canvas").focus();await a.keyboard.press("t");await a.locator("#planet-chat:not([hidden])").waitFor();
    check(await a.locator("#planet-chat-input").evaluate(input=>input===document.activeElement),"T opens chat and focuses its input");
    const beforeTyping=await at(a);await a.fill("#planet-chat-input","wasd hello from the green");await a.keyboard.press("w");await a.waitForTimeout(250);
    const afterTyping=await at(a);check(Math.hypot(beforeTyping[0]-afterTyping[0],beforeTyping[1]-afterTyping[1])<.025,"Typing movement letters in chat does not move the player");
    await a.fill("#planet-chat-input","Meet by the restroom?");await a.click("#planet-chat-submit");
    await b.locator(`.planet-speech[data-speaker="${ada.id}"]`).waitFor({state:"visible"});
    check((await b.locator("#planet-chat-log").textContent()).includes("Meet by the restroom?"),"A nearby friend's real message appears over its speaker and in the accessible log");
    await shot(b,"nearby-chat-desktop");await a.keyboard.press("Escape");
    check(await a.locator("#planet-chat").evaluate(form=>form.hidden),"Escape closes chat and returns to walking");
    await go(bo,"observatory");await a.click("#planet-talk");await a.fill("#planet-chat-input","This message stays nearby");await a.click("#planet-chat-submit");await a.waitForTimeout(500);
    check(!(await b.locator("#planet-chat-log").textContent()).includes("This message stays nearby"),"A player beyond twelve metres does not receive the message");await a.keyboard.press("Escape");
    for(const who of[ada,bo])await go(who,"restrooms");
    check(await a.locator("#planet-talk").evaluate(button=>{const r=button.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===button;}),"Talk remains reachable while restroom controls are open");
    await a.locator("#planet-enter-room:not([hidden])").waitFor({state:"visible"});await a.click("#planet-enter-room");await inside(a,"planet-toilet");
    await a.waitForFunction(()=>Number(document.getElementById("planet-stage").dataset.at.split(",")[1])<5.7);await closedDoor(a,"planet-toilet");await closedDoor(b,"planet-toilet");
    check(await a.locator("#planet-stay-action").isVisible()&&await a.locator("#planet-leave-room").isVisible(),"Entering reveals Flush and Walk outside controls directly in the world");
    await b.waitForFunction(()=>document.getElementById("planet-enter-room").disabled);await walk(bo,"a",150);await walk(bo,"w",1200);
    const blocked=await at(b);check(blocked[1]>=7,"A second player's actual walk is stopped outside the occupied door");await rejectedAdmission(bo,"planet-toilet",13.5,5.5);
    const flush=await startStay(ada,"toilet-flush","planet-toilet");
    check(await b.evaluate(()=>window.__socialAudioStarts.length)===0,"A friend's flush does not override a quiet browser's sound choice");await shot(b,"restroom-occupied-desktop");
    await a.click("#planet-leave-room");await inside(a,"planet-toilet",false);await b.waitForFunction(()=>!document.getElementById("planet-enter-room").disabled);
    check(await waitAbsent(ada,flush),"Walking out releases the real lock and the stay sound is removed by the server");
    await b.click("#planet-enter-room");await inside(b,"planet-toilet");await b.click("#planet-leave-room");await inside(b,"planet-toilet",false);
    check(true,"The waiting friend can enter after the occupant leaves");
    await go(ada,"restrooms");await a.click("#planet-switch-room");await a.waitForFunction(()=>document.getElementById("planet-restroom-card").dataset.hut==="planet-shower");
    await a.waitForFunction(()=>document.getElementById("planet-stage").dataset.walkingIntent==="false");
    check(await a.locator("#planet-switch-room").textContent()==="Go to restroom","A visible room switch helps players discover the shower and restroom");
    await a.click("#planet-enter-room");await inside(a,"planet-shower");const shower=await startStay(ada,"shower","planet-shower");
    await a.setViewportSize({width:390,height:844});await a.waitForTimeout(700);
    const phoneCard=await a.locator("#planet-restroom-card").boundingBox(),phoneAction=await a.locator("#planet-leave-room").boundingBox();
    check(phoneCard&&phoneCard.x>=0&&phoneCard.x+phoneCard.width<=391&&phoneCard.y>=0&&phoneCard.y+phoneCard.height<=845&&phoneAction.height>=44,"390×844 room controls fit and the exit remains a finger-sized action");
    await shot(a,"shower-phone");await a.locator("#planet-restroom-dismiss").tap();check(!await a.locator("#planet-restroom-card").isVisible(),"Touch users can dismiss the room panel");await a.locator("#planet-restroom-reopen").tap();await a.locator("#planet-leave-room").tap();await inside(a,"planet-shower",false);
    check(await waitAbsent(ada,shower),"Leaving the shower ends its shared private sound");
    await a.locator("#planet-talk").tap();await a.fill("#planet-chat-input","Phone chat works");await a.locator("#planet-chat-submit").tap();await a.locator("#planet-chat-close").tap();
    check(await a.locator("#planet-chat").evaluate(form=>form.hidden),"Touch users can open, send and close chat");
    await a.setViewportSize({width:1920,height:1080});await go(ada,"restrooms");await go(bo,"restrooms");
    await a.click("#planet-invite-resident");await a.waitForFunction(()=>JSON.parse(document.getElementById("planet-stage").dataset.npcRoutines??"[]").some(npc=>npc.phase==="occupied"&&npc.occupying),undefined,{timeout:15000});
    await closedDoor(b,"planet-toilet");await rejectedAdmission(bo,"planet-toilet",13.5,5.5);
    check(await b.locator("#planet-restroom-live").textContent().then(text=>text.includes("Rowan")),"Both browsers see the actual resident and occupied-door explanation");
    await a.waitForFunction(()=>JSON.parse(document.getElementById("planet-stage").dataset.npcRoutines??"[]").some(npc=>npc.phase==="flushing"&&npc.flushId),undefined,{timeout:10000});
    await a.waitForFunction(()=>Number(document.getElementById("planet-stage").dataset.npcFlushVoices)>0);
    check(true,"The authoritative resident visit reaches a real flush token and actual nearby browser audio");await shot(a,"resident-flush-desktop");
    await b.waitForFunction(()=>!document.getElementById("planet-enter-room").disabled,undefined,{timeout:12000});
    check(true,"The resident releases the same lock on exit");
    const final=await snapshot(ada);check(!final.online.some(person=>person.name.includes("Rowan")),"The resident is never counted as a real online player");
    assert.deepEqual(ordinary(final),initialPlanet);assert.deepEqual(ordinary(await snapshot(ada,"/scene/seaside")),initialCoast);check(true,"Original ordinary sounds and coastal history remain unchanged");
    check(errors.length===0,"No browser page errors");
} catch(error) {failed=true;process.exitCode=1;console.error(error);for(const who of people)await shot(who.page,`failure-${who.name.replaceAll(" ","-")}`).catch(()=>{});}
finally {
    // Cleanup only this test's ephemeral positions/private stays, not a world.
    for(const who of people){if(!who.sessionId)continue;await who.page.goto("about:blank").catch(()=>{});await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`,{data:{x:0,z:3,yaw:Math.PI}}).catch(()=>{});}
    await new Promise(resolve=>setTimeout(resolve,250));
    for(const who of people){if(!who.sessionId)continue;try{const final=await snapshot(who);assert.ok(!final.sounds.some(sound=>privateSounds.includes(sound.id)));}catch(error){failed=true;process.exitCode=1;console.error("Cleanup",error.message);}}
    if(out)writeFileSync(`${out}/results.json`,JSON.stringify({kind:"automated-developer-browser-test",base,checks,failed,errors,privateSounds,physicalPhone:false,humanListening:false},null,2));
    await browser.close();
}
