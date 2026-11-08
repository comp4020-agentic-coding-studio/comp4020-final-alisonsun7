#!/usr/bin/env node
// Real browser/developer evidence. No fabricated clock, audio, human playtest
// or source is used. The writing path requires its exact fresh scratch DB.
// APP_URL=http://localhost:18942 SCRATCH_DB=.cache/waterlife/browser/history.db
// node e2e/waters-answer.mjs .cache/waterlife/browser-artifacts
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
const address=new URL(process.env.APP_URL??"");
assert.equal(address.protocol,"http:");assert.ok(["localhost","127.0.0.1","[::1]"].includes(address.hostname));
assert.ok(["18940","18942"].includes(address.port),"Never write to the user's preview");
assert.equal(address.pathname,"/");assert.ok(!address.search&&!address.hash&&!address.username&&!address.password);
const base=address.origin,baseline=address.port==="18940",out=process.argv[2];assert.ok(out);mkdirSync(out,{recursive:true});
let db;
if(!baseline){assert.ok(process.env.SCRATCH_DB);assert.equal(realpathSync(resolve(process.env.SCRATCH_DB)),resolve(".cache/waterlife/browser/history.db"));db=new DatabaseSync(resolve(process.env.SCRATCH_DB),{readOnly:true});assert.equal(db.prepare("SELECT count(*) AS n FROM placed_sounds").get().n,0,"Use a fresh isolated writing database; retain failed-run data separately");}
const report={kind:"waters-answer-browser-developer-inspection",base,baselineReadOnly:baseline,checks:[],captures:[],sources:[],errors:[],requests:[],passed:false};
const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);console.log("ok "+label);};
const browser=await chromium.launch({channel:"chrome",args:["--use-angle=metal","--enable-gpu"]});
const people=[];
const rows=()=>db.prepare("SELECT * FROM placed_sounds ORDER BY id").all();
async function state(page){return page.locator("#planet-stage").evaluate(stage=>{const json=name=>JSON.parse(stage.dataset[name]??"null");return{ground:json("groundSafety"),water:json("waterlife"),scenery:json("waterlifeScenery"),watched:json("watchedWaterlife"),soundOn:stage.dataset.soundOn,serverNow:Number(stage.dataset.serverNow),starts:window.__waterStarts,contexts:window.__waterContexts,watching:stage.dataset.watchingSound,viewport:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth>innerWidth+1};});}
async function settled(page){const frame=await page.locator("#planet-stage").evaluate(stage=>JSON.parse(stage.dataset.groundSafety).frame);await page.waitForFunction(previous=>JSON.parse(document.getElementById("planet-stage").dataset.groundSafety).frame>previous+1,frame);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function shot(who,name){await settled(who.page);const actual=await state(who.page);report.captures.push({name,identity:who.name,...actual});await who.page.screenshot({path:`${out}/${name}.png`,fullPage:false});return actual;}
async function reach(page,selector){return page.locator(selector).evaluate(element=>{const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{visible:getComputedStyle(element).display!=="none"&&r.width>=44&&r.height>=44,inside:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,unobstructed:!!hit&&element.contains(hit),width:r.width,height:r.height};});}
async function contextPage(name){
    const context=await browser.newContext({viewport:{width:1920,height:1080},hasTouch:true});
    await context.addInitScript(()=>{window.__waterStarts=0;window.__waterContexts=0;const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(...args){super(...args);window.__waterContexts++;}createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{window.__waterStarts++;return start(...args);};return source;}};});
    if(baseline)await context.route("**/*",route=>["GET","HEAD"].includes(route.request().method())?route.continue():route.abort());
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on("pageerror",error=>report.errors.push(name+": "+error.message));page.on("console",message=>{if(message.type()==="error")report.errors.push(name+": "+message.text());});
    page.on("request",request=>{if(!["GET","HEAD"].includes(request.method()))report.requests.push({name,method:request.method(),path:new URL(request.url()).pathname});});
    const who={name,page,context,lastWrite:0};people.push(who);await page.goto(base+"/planet");return who;
}
async function ready(page){await page.waitForFunction(()=>!!document.getElementById("planet-stage").dataset.groundSafety&&!document.querySelector("dialog:modal"));}
async function join(who){await who.page.locator("#planet-nickname").fill(who.name);await who.page.locator("#planet-enter").click();await who.page.getByRole("button",{name:"Explore quietly",exact:true}).click();await ready(who.page);const boot=await who.page.evaluate(()=>JSON.parse(document.getElementById("planet-boot").textContent));who.id=boot.snapshot.you.id;who.sessionId=boot.snapshot.sessionId;}
async function travel(who,id){const direct=who.page.locator(`#chorus-travel [data-place="${id}"]`);if(await direct.count())await direct.click();else{await who.page.locator("#planet-tools").click();await who.page.locator(`#planet-destinations [data-zone="${id}"]`).click();}await ready(who.page);await who.page.waitForTimeout(200);}
async function shared(who){if(await who.page.locator("#planet-shared").isVisible())await who.page.locator("#planet-shared").click();else{await who.page.locator("#planet-tools").click();await who.page.locator("#planet-open-soundscape").click();}await who.page.locator("#planet-soundscape").waitFor({state:"visible"});}
async function closeShared(who){await who.page.locator("#planet-soundscape").getByRole("button",{name:"Close",exact:true}).click();await ready(who.page);}
async function publish(who,id,parent){
    if(parent){await shared(who);await who.page.locator(`#planet-soundscape [data-id="${parent.id}"] [data-planet-reply]`).click();}
    else await who.page.locator("#planet-place").click();
    await who.page.locator("#chorus-studio").waitFor({state:"visible"});
    if(!await who.page.locator(`#chorus-studio [data-leave="${id}"]`).count()){
        await who.page.getByRole("button",{name:"Explore every sound",exact:true}).click();await who.page.locator("#sound-palette").waitFor({state:"visible"});
        await who.page.locator('#sound-palette input[type="search"]').fill({"pond-frogs":"Pond frogs","pond-bubbles":"Pond bubbles","whale-song":"Whale song"}[id]);
    }
    await who.page.waitForTimeout(Math.max(0,1100-(Date.now()-who.lastWrite)));
    const response=who.page.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname===`/api/sessions/${who.sessionId}/sounds`);
    const button=who.page.locator(`#chorus-studio [data-leave="${id}"]`);
    if(await button.isVisible())await button.click();else await who.page.locator(`#sound-palette button[data-sound="${id}"]`).click();
    const result=await (await response).json();assert.ok(result.ok,JSON.stringify(result));who.lastWrite=Date.now();await ready(who.page);
    const source=result.sound;assert.equal(source.byId,who.id);if(parent)assert.equal(source.replyToId,parent.id);report.sources.push(source);return source;
}
async function water(who,source){await who.page.waitForFunction(id=>JSON.parse(document.getElementById("planet-stage").dataset.waterlife??"[]").some(row=>row.sourceId===id&&row.visible),source.id);return(await state(who.page)).water.find(row=>row.sourceId===source.id);}
async function watchClear(who){
    await settled(who.page);const actual=await who.page.locator("#planet-stage").evaluate(stage=>{const focus=JSON.parse(stage.dataset.watchedWaterlife??"null"),r=stage.getBoundingClientRect();if(!focus?.visible)return false;const hit=document.elementFromPoint(r.x+focus.x,r.y+focus.y);return hit?.matches("canvas.planet-canvas")||hit?.closest(".planet-person-label");});
    check(!!actual,"The actual animal focus is clear of contextual cards");
}
async function watch(who,source,label){await shared(who);const button=who.page.locator(`#planet-soundscape [data-id="${source.id}"]`).getByRole("button",{name:label,exact:true});await button.click();await ready(who.page);await who.page.waitForFunction(id=>{const focus=JSON.parse(document.getElementById("planet-stage").dataset.watchedWaterlife??"null");return focus?.sourceId===id&&focus.visible;},source.id);check((await state(who.page)).ground.cameraRadius>22,"Watching stays outside the planet");await watchClear(who);}
async function remove(who,source){
    assert.equal(source.byId,who.id);await travel(who,"pool");await who.page.waitForTimeout(Math.max(0,1100-(Date.now()-who.lastWrite)));await shared(who);
    const response=who.page.waitForResponse(response=>response.request().method()==="DELETE"&&new URL(response.url()).pathname.endsWith("/sounds/"+source.id));
    await who.page.locator(`#planet-soundscape [data-id="${source.id}"] [data-planet-remove]`).click();const result=await(await response).json();assert.ok(result.ok);who.lastWrite=Date.now();await closeShared(who);
}
try{
    const a=await contextPage("Water Ada");await a.page.locator("#planet-observe").click();await ready(a.page);
    if(baseline){
        for(const place of ["green","pool"]){await travel(a,place);const hidden=!await a.page.locator("#planet-place").isVisible();check(hidden,"Frozen "+place+" actually hides Share behind its contextual card");await shot(a,"before-"+place+"-desktop");}
        await a.page.setViewportSize({width:390,height:844});await shot(a,"before-pool-phone");check(report.requests.length===0,"Frozen baseline stayed GET-only");
    }else{
        check((await reach(a.page,"#planet-place")).unobstructed,"Share remains visible beside the expanded Green work card");
        if(await a.page.locator("#chorus-minimise").isVisible())await a.page.locator("#chorus-minimise").click();
        check((await reach(a.page,"#planet-place")).unobstructed,"Collapsing a work cannot hide Share");await shot(a,"green-entry-desktop");
        await a.page.locator("#planet-place").click();await join(a);await travel(a,"pool");
        check((await reach(a.page,"#planet-place")).unobstructed,"The water discovery card cannot hide Share");
        await a.page.locator("#planet-place").click();
        await a.page.locator('#chorus-studio [data-listen="pond-bubbles"]').click();await a.page.waitForFunction(()=>window.__waterStarts>0);
        check((await state(a.page)).soundOn==="false"&&rows().length===0,"A real private bubble audition starts audio but never unmutes or publishes");
        await a.page.locator("#chorus-studio").getByRole("button",{name:"Cancel",exact:true}).click();await ready(a.page);
        const bubbles=await publish(a,"pond-bubbles");const first=await water(a,bubbles);await watch(a,bubbles,"Watch the fish");await a.page.waitForFunction(id=>JSON.parse(document.getElementById("planet-stage").dataset.waterlife).some(row=>row.sourceId===id&&row.bubbles>.65),bubbles.id);await shot(a,"fish-bubbles-desktop");
        const b=await contextPage("Water Bo");await join(b);await travel(b,"pool");check(a.id!==b.id&&JSON.stringify(await a.context.cookies())!==JSON.stringify(await b.context.cookies()),"Two real independent cookie identities take part");
        const second=await water(b,bubbles);assert.equal(first.anchorX,second.anchorX);assert.equal(first.anchorZ,second.anchorZ);assert.equal(second.byId,a.id);
        check((await state(b.page)).starts===0&&(await state(b.page)).soundOn==="false","A late friend's arrival sees the same fish while staying silent");
        const frogs=await publish(b,"pond-frogs",bubbles);await water(a,frogs);await water(b,frogs);await watch(b,frogs,"Watch the frogs");
        await b.page.waitForFunction(id=>JSON.parse(document.getElementById("planet-stage").dataset.waterlife).some(row=>row.sourceId===id&&row.throat>.7),frogs.id,{timeout:22000});await shot(b,"friends-frogs-desktop");check(rows().find(row=>row.id===frogs.id).placed_by===b.id,"The friend's audible reply retains the real second author");
        await a.page.setViewportSize({width:390,height:844});await travel(a,"pool");
        const entry=await reach(a.page,"#planet-place");check(entry.visible&&entry.inside&&entry.unobstructed&&!(await state(a.page)).overflow,"Share is an unobstructed 44px phone target with no horizontal overflow");
        await a.page.locator("#planet-listening-settings").tap();await a.page.locator("#chorus-volume").waitFor({state:"visible"});
        await a.page.keyboard.press("Escape");await ready(a.page);check(await a.page.locator("#planet-listening-settings").evaluate(button=>button===document.activeElement),"Escape returns focus to the actual listening-settings opener");
        await watch(a,bubbles,"Watch the fish");await shot(a,"friends-fish-phone");
        const exit=await reach(a.page,"#planet-watch-exit");check(exit.visible&&exit.inside&&exit.unobstructed,"The phone has a reachable 44px Back to exploring action");
        await a.page.locator("#planet-watch-exit").tap();await a.page.waitForFunction(()=>!document.getElementById("planet-stage").dataset.watchingSound);check(await a.page.locator("canvas.planet-canvas").evaluate(canvas=>canvas===document.activeElement),"Leaving Watch restores keyboard focus to the world");
        await travel(a,"pool");await a.page.setViewportSize({width:1920,height:1080});const whale=await publish(a,"whale-song");await water(a,whale);await watch(a,whale,"Watch the whale");await a.page.waitForFunction(id=>JSON.parse(document.getElementById("planet-stage").dataset.waterlife).some(row=>row.sourceId===id&&row.action==="breathing"&&row.spray>.35),whale.id,{timeout:45000});
        await shot(a,"whale-breath-desktop");check(true,"A real server-timed breath produces spray above the water");
        const firstBreath=await state(a.page);report.firstWhale=firstBreath.water.find(row=>row.sourceId===whale.id);
        await a.page.waitForFunction(id=>JSON.parse(document.getElementById("planet-stage").dataset.waterlife).some(row=>row.sourceId===id&&row.action==="leaping"&&row.height>2.2),whale.id,{timeout:65000});
        const leap=await shot(a,"whale-leap-desktop");check(leap.watched?.visible&&leap.water.find(row=>row.sourceId===whale.id).height>2.2,"An actual server-timed whole whale leap is visible without clock injection");
        await a.page.setViewportSize({width:390,height:844});await watchClear(a);await shot(a,"whale-phone");check(!(await state(a.page)).overflow,"Whale watching keeps the phone viewport inside its bounds");
        check((await state(b.page)).starts===0&&(await state(b.page)).soundOn==="false","A friend's bubbles, frogs and whale never enable local listening");
        await a.page.setViewportSize({width:1920,height:1080});
        for(const [who,source] of [[a,whale],[b,frogs],[a,bubbles]]){await remove(who,source);for(const other of [a,b])await other.page.waitForFunction(id=>!JSON.parse(document.getElementById("planet-stage").dataset.waterlife).some(row=>row.sourceId===id),source.id);}
        check(rows().length===3&&rows().every(row=>row.removed_at!==null),"Withdrawing all three stops their shared actors and retains durable sound history");
        const persisted=db.prepare("SELECT sound_id,parent_id FROM sound_replies WHERE sound_id=?").get(frogs.id);report.replyRow=persisted;assert.equal(persisted.parent_id,bubbles.id);
        check((await state(a.page)).scenery.reduce((n,row)=>n+row.count,0)===5,"Only explicitly labelled scenery fish remain after withdrawal");
        await a.page.reload();await ready(a.page);{const back=(await state(a.page)).water,gone=[whale,frogs,bubbles].map(source=>source.id);check(!back.some(row=>gone.includes(row.sourceId))&&back.every(row=>row.origin==="example"&&row.sourceId.startsWith("@world:")),"Returning to the world cannot revive withdrawn animals; only the labelled world examples remain (ADR 038)");}
        check(report.sources.length===3,"Exactly the three explicit Leave actions create sound sources");
    }
    assert.deepEqual(report.errors,[]);check(true,baseline?"Native GPU rendered the frozen baseline without browser/shader errors":"Native GPU and audio decode completed without browser/shader errors");report.passed=true;
}catch(error){report.failure=error.stack??String(error);for(const who of people)if(!who.page.isClosed())await who.page.screenshot({path:`${out}/failure-${who.name.replaceAll(" ","-")}.png`,fullPage:false}).catch(()=>{});throw error;}
finally{await browser.close();db?.close();writeFileSync(`${out}/results.json`,JSON.stringify(report,null,2)+"\n");}
