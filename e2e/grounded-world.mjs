#!/usr/bin/env node
// Rendered developer inspection of real support and light, not a human
// playtest or an artistic listening verdict. Only the independent 18932
// candidate may receive writes; frozen 18930 remains a quiet GET-only view.
// APP_URL=http://localhost:18932 SCRATCH_DB=.cache/grounding/browser/history.db
// node e2e/grounded-world.mjs .cache/grounding/browser-artifacts
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";

const address=new URL(process.env.APP_URL??"");
assert.equal(address.protocol,"http:");assert.ok(["localhost","127.0.0.1","[::1]"].includes(address.hostname));
assert.ok(["18930","18932"].includes(address.port),"Never run this writing inspection on the user's preview");
assert.equal(address.pathname,"/");assert.ok(!address.search&&!address.hash&&!address.username&&!address.password);
const base=address.origin, baseline=address.port==="18930", out=process.argv[2];assert.ok(out);mkdirSync(out,{recursive:true});
let database;
if(!baseline){
    assert.ok(process.env.SCRATCH_DB);
    assert.equal(realpathSync(resolve(process.env.SCRATCH_DB)),resolve(".cache/grounding/browser/history.db"));
    database=new DatabaseSync(resolve(process.env.SCRATCH_DB),{readOnly:true});
}
const stored=()=>database.prepare("SELECT * FROM placed_sounds ORDER BY id").all();
const history=database?stored():null;
const report={kind:"rendered-grounding-developer-inspection",base,baselineReadOnly:baseline,checks:[],frames:[],performanceSamples:[],stairs:[],errors:[],writes:[],atmosphereReceipts:[],passed:false};
const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);console.log("ok "+label);};
const browser=await chromium.launch({channel:"chrome",args:["--use-angle=metal","--enable-gpu"]});
let page,context,initialEnvironment,lastAtmosphereWrite=0;
const state=()=>page.locator("#planet-stage").evaluate(stage=>{
    const json=name=>stage.dataset[name]?JSON.parse(stage.dataset[name]):null;
    return {ground:json("groundSafety"),support:json("support"),lighting:json("lighting"),contact:json("contactShade"),
        minute:Number(stage.dataset.minute),weather:stage.dataset.weather,soundOn:stage.dataset.soundOn,
        residents:json("residentLife"),calls:Number(stage.dataset.calls),triangles:Number(stage.dataset.triangles),
        width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1};
});
async function shot(name){const actual=await state();report.frames.push({name,...actual});await page.screenshot({path:`${out}/${name}.png`,fullPage:true});return actual;}
async function samplePerformance(name){
    const actual=await page.locator("#planet-stage").evaluate(stage=>new Promise(resolve=>{
        const start=performance.now(),first=JSON.parse(stage.dataset.groundSafety).frame;
        setTimeout(()=>{const elapsed=performance.now()-start,frames=JSON.parse(stage.dataset.groundSafety).frame-first;
            resolve({elapsedMs:elapsed,renderedFrames:frames,observedFramesPerSecond:frames/(elapsed/1000),calls:Number(stage.dataset.calls),triangles:Number(stage.dataset.triangles),width:innerWidth,height:innerHeight});},1200);
    }));
    report.performanceSamples.push({name,...actual});
}
async function travel(id){
    const direct=page.locator(`#chorus-travel [data-place="${id}"]`);
    if(await direct.count())await direct.click();
    else{await page.locator("#planet-tools").click();await page.locator(`#planet-destinations [data-zone="${id}"]`).click();}
    await page.waitForFunction(()=>!document.querySelector("dialog:modal"));await page.waitForTimeout(220);
}
async function atmosphere(time,weather){
    assert.ok(!baseline,"Frozen baseline never changes the shared world");
    await page.locator("#planet-tools").click();await page.locator("#planet-environment-settings").click();
    await page.locator(`[name="environment-weather"][value="${weather}"]`).check();
    await page.locator(`[data-time="${time}"]`).click();await page.locator("#environment-running").uncheck();
    // Respect the real 1s shared-atmosphere rate limit, rather than disabling
    // it or mistaking an automated sub-second sequence for a light failure.
    const remaining=1100-(Date.now()-lastAtmosphereWrite);if(remaining>0)await page.waitForTimeout(remaining);
    const applied=page.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname.endsWith("/environment"));
    await page.locator("#environment-apply").click();const receipt=await (await applied).json();lastAtmosphereWrite=Date.now();
    report.atmosphereReceipts.push(receipt);assert.equal(receipt.ok,true,JSON.stringify(receipt));
    await page.locator("#environment-dialog").getByRole("button",{name:"Close",exact:true}).click();
    await page.waitForFunction(({minute,weather})=>{const s=document.getElementById("planet-stage");return Math.abs(Number(s.dataset.minute)-minute)<.1&&s.dataset.weather===weather;},{minute:{day:840,dusk:1110,night:1320,dawn:360}[time],weather});
}
try{
    context=await browser.newContext({viewport:{width:1920,height:1080},hasTouch:true});
    await context.addInitScript(()=>{
        window.__groundingAudioStarts=0;
        const Native=window.AudioContext;
        window.AudioContext=class extends Native{createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{window.__groundingAudioStarts++;return start(...args);};return source;}};
    });
    if(baseline)await context.route("**/*",route=>["GET","HEAD"].includes(route.request().method())?route.continue():route.abort());
    page=await context.newPage();page.setDefaultTimeout(15_000);
    page.on("pageerror",error=>report.errors.push(error.message));
    page.on("console",message=>{if(message.type()==="error")report.errors.push(message.text());});
    page.on("request",request=>{if(!["GET","HEAD"].includes(request.method()))report.writes.push({method:request.method(),path:new URL(request.url()).pathname});});
    await page.goto(base+"/planet");await page.locator("#planet-observe").click();
    await page.waitForFunction(()=>document.getElementById("planet-stage").dataset.groundSafety&&!document.querySelector("dialog:modal"));
    initialEnvironment=await page.evaluate(()=>JSON.parse(document.getElementById("planet-boot").textContent).snapshot.environment);
    report.initialEnvironment=initialEnvironment;
    for(const place of ["green","tea","stage","reading","conservatory","pool","observatory"]){await travel(place);await shot(place+"-desktop");}
    await travel("tea");await samplePerformance("cafe-desktop");
    await page.setViewportSize({width:390,height:844});
    for(const place of ["green","tea"]){await travel(place);const frame=await shot(place+"-phone");check(!frame.overflow,place+" fits the 390×844 viewport");}
    await samplePerformance("cafe-phone-viewport");
    await page.setViewportSize({width:1920,height:1080});
    if(baseline){check(report.writes.length===0,"Frozen compiled baseline remained GET-only");}
    else{
        const frame=await state();
        check(frame.lighting.span===22&&frame.lighting.texelMetres<.011,"Actual close view uses the new fine shadow frustum");
        check(frame.contact.fixed>150&&frame.contact.draws<=2,"Furniture, tree roots and moving feet share two bounded contact batches");
        check(frame.support&&Number.isFinite(frame.support.height),"Actual actor support is a finite visible surface");
        await page.reload();await page.locator("#planet-nickname").fill("Grounding review");
        await page.locator("#planet-enter").click();await page.getByRole("button",{name:"Explore quietly",exact:true}).click();
        await page.waitForFunction(()=>!document.querySelector("dialog:modal"));
        await travel("green");
        const before=await state();await page.locator(".planet-canvas").focus();
        await page.keyboard.down("w");await page.keyboard.down("Shift");await page.waitForTimeout(650);await page.keyboard.up("w");await page.keyboard.up("Shift");
        const moved=await state();check(Math.hypot(moved.ground.x-before.ground.x,moved.ground.z-before.ground.z)>.8,"Actual run key moves the character on supported ground");
        await page.locator("#planet-jump").click();
        await page.waitForFunction(()=>Number(document.getElementById("planet-stage").dataset.jumpHeight)>.15);
        await shot("green-jump-desktop");await page.waitForFunction(()=>document.getElementById("planet-stage").dataset.grounded==="true");
        check((await state()).ground.cameraRadius>22,"Run and jump leave the actual camera outside the globe");
        await travel("tea");await shot("cafe-character-desktop");
        check((await state()).support.kind==="floor","Café arrival uses the real terrace plane");
        // Observe every actual render through the real input path. Do not
        // teleport the player to a succession of manufactured floor samples.
        await page.evaluate(()=>{
            const stage=document.getElementById("planet-stage"),samples=[];
            const take=()=>samples.push(JSON.parse(stage.dataset.groundSafety));take();
            const observer=new MutationObserver(take);observer.observe(stage,{attributes:true,attributeFilter:["data-ground-safety"]});
            window.__groundingStairs={stop:()=>{observer.disconnect();return samples;}};
        });
        await page.locator(".planet-canvas").focus();await page.keyboard.down("s");
        try{await page.waitForFunction(()=>JSON.parse(document.getElementById("planet-stage").dataset.groundSafety).z>-.1,{},{timeout:4000});}
        finally{await page.keyboard.up("s");report.stairs=await page.evaluate(()=>window.__groundingStairs.stop());}
        const treads=new Set(report.stairs.filter(sample=>sample.supportId?.startsWith("cafe-entrance-step-")).map(sample=>sample.supportId));
        check(treads.size===5,"Real continuous walking crosses all five visible café steps");
        check(report.stairs.every(sample=>sample.feetRadius>=22&&sample.signedFeetRadius>=22&&sample.cameraRadius>22),"Every rendered stair sample retains outward feet and camera");
        check(report.stairs.slice(1).every((sample,index)=>Math.abs(sample.feetRadius-report.stairs[index].feetRadius)<.25),"Rendered stair transitions have no ground-fallback drop");
        await shot("cafe-entrance-desktop");await travel("tea");
        await page.locator("#planet-view").click();await page.waitForFunction(()=>document.getElementById("planet-stage").dataset.view==="first");
        await shot("cafe-first-person-desktop");await page.locator("#planet-view").click();
        await page.locator("#planet-tools").click();await page.locator("#chorus-overview").click();
        await page.locator("#planet-tools-close").click();
        await page.waitForFunction(()=>Number(document.getElementById("planet-stage").dataset.cameraDistance)>=24);
        const overview=await shot("cafe-overview-desktop");check(overview.lighting.span===64,"Overview covers the whole globe instead of the close shadow crop");
        await travel("tea");await atmosphere("dusk","clear");await shot("cafe-dusk-desktop");
        await atmosphere("night","clear");await shot("cafe-night-desktop");
        await page.setViewportSize({width:390,height:844});await shot("cafe-night-phone");
        const at=await state(),arrow=page.getByRole("button",{name:"Move left",exact:true}),box=await arrow.boundingBox();assert.ok(box);
        const touch=await context.newCDPSession(page);
        await touch.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});
        await page.waitForTimeout(500);await touch.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await touch.detach();
        const after=await state();check(Math.hypot(after.ground.x-at.ground.x,after.ground.z-at.ground.z)>.1,"Touch walking still operates with supported figures");
        await page.setViewportSize({width:1920,height:1080});await atmosphere("day","rain");await travel("conservatory");await shot("conservatory-rain-desktop");
        await atmosphere("day","clear");await travel("pool");await shot("coast-character-desktop");
        check((await state()).ground.cameraRadius>22,"Far-shore lighting keeps the actual coast camera outside the planet");
        check((await state()).soundOn==="false"&&await page.evaluate(()=>window.__groundingAudioStarts)===0,"Light, travel, jump and weather never enable local listening");
        assert.deepEqual(stored(),history);check(true,"Every pre-existing sound/history row is byte-for-byte retained");
        check(report.writes.every(request=>!request.path.endsWith("/sounds")&&!/\/sounds\//.test(request.path)),"No source is created, moved or removed during the visual inspection");
    }
    assert.deepEqual(report.errors,[]);check(true,"The actual GPU compiled/rendered without browser or shader errors");
    report.passed=true;
}catch(error){report.failure=error.stack??String(error);if(page&&!page.isClosed())await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();database?.close();writeFileSync(`${out}/results.json`,JSON.stringify(report,null,2)+"\n");}
