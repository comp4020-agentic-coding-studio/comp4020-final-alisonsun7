#!/usr/bin/env node
// Developer-operated browser automation against the historical scratch clone.
// No novice-playtest, listening-quality or next-day-return claim is made.
// APP_URL=http://localhost:18899 node e2e/chorus-placement-flow.mjs [artifacts]
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base=process.env.APP_URL;
assert.ok(base,"Set APP_URL to the explicitly isolated historical clone");
const address=new URL(base);
assert.ok(["localhost","127.0.0.1","[::1]"].includes(address.hostname),"Only a local scratch world is permitted");
assert.equal(address.port,"18899","This flow writes only to the designated 18899 historical clone, never 18861");
const run=crypto.randomUUID(), out=process.argv[2]??`.cache/chorus-placement-flow-${run}`;
mkdirSync(out,{recursive:true});mkdirSync(".cache",{recursive:true});
const recoveryPath=`.cache/chorus-placement-recovery-${run}.json`;
const browser=await chromium.launch({channel:"chrome",args:["--use-angle=metal","--enable-gpu"]});
const people=[], made=new Map(), pending=new Set(), checks=[], pageErrors=[], consoleErrors=[];
let initialPlanet,initialCoast,failed=false,failure;
const began=Date.now(), pause=ms=>new Promise(done=>setTimeout(done,ms));
const check=(condition,label,detail)=>{assert.ok(condition,label);checks.push({label,elapsedMs:Date.now()-began,...(detail===undefined?{}:{detail})});console.log("ok  "+label);};
const save=()=>writeFileSync(recoveryPath,JSON.stringify({base,identities:people.map(({name,id,sessionId,cookies})=>({name,id,sessionId,cookies})),sounds:[...made.values()].map(({sound})=>sound)},null,2),{mode:0o600});
const ordinary=snapshot=>snapshot.sounds.filter(sound=>!sound.whileIn).map(sound=>({...sound})).sort((a,b)=>a.id.localeCompare(b.id));
async function snapshot(who,path="/planet"){
  const response=await who.context.request.get(base+path);assert.ok(response.ok(),`Read-only snapshot ${response.status()}`);
  const match=(await response.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match,"Read the actual application snapshot");return JSON.parse(match[1]).snapshot;
}
const data=(page,key)=>page.locator("#planet-stage").evaluate((stage,key)=>stage.dataset[key],key);
const at=async page=>{const [x,z]=String(await data(page,"at")).split(",").map(Number);assert.ok([x,z].every(Number.isFinite));return {x,z,yaw:0};};
function distance(a,b){
  const normal=p=>{const lon=p.x/22,lat=p.z/22;return [Math.sin(lon)*Math.cos(lat),-Math.sin(lat),Math.cos(lon)*Math.cos(lat)];};
  const u=normal(a),v=normal(b),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  return 22*Math.atan2(Math.hypot(...cross),u.reduce((sum,value,i)=>sum+value*v[i],0));
}
async function shot(page,name){if(!page.isClosed())await page.screenshot({path:`${out}/${name}.png`,fullPage:true});}
async function closeStudio(page){await page.locator("#chorus-studio").getByRole("button",{name:"Cancel",exact:true}).click();await page.locator("#chorus-studio").waitFor({state:"hidden"});await page.waitForTimeout(100);}
async function ready(page){await page.waitForFunction(()=>!!document.getElementById("planet-stage")?.dataset.at&&!document.querySelector("dialog:modal")&&!document.getElementById("chorus-primary")?.disabled);}
async function beginWork(page){
  await page.locator("#chorus-our-works").click();await page.locator("#chorus-journal").waitFor({state:"visible"});
  await page.locator("#chorus-new-work").click();await page.locator("#chorus-studio").waitFor({state:"visible"});
  assert.ok((await page.locator("#chorus-answering").textContent()).includes("Listen to one ingredient"),"Begin a new work has no hidden reply parent");
}
async function moveApi(who,point){
  await pause(180);const response=await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`,{data:{x:point.x,z:point.z,yaw:point.yaw??0}});
  const result=await response.json();assert.ok(response.ok()&&result.ok,`Confirm the fixture's actual position: ${JSON.stringify(result)}`);
}
async function leaveUI(who,soundId){
  await pause(Math.max(0,1100-(Date.now()-(who.lastWriteAt??0))));
  const [response]=await Promise.all([who.page.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname===`/api/sessions/${who.sessionId}/sounds`),who.page.locator(`#chorus-studio [data-leave="${soundId}"]`).click()]);
  const result=await response.json();assert.ok(response.ok()&&result.ok&&result.sound,`Explicit Leave succeeds: ${JSON.stringify(result)}`);
  made.set(result.sound.id,{who,sound:result.sound});who.lastWriteAt=Date.now();save();
  await who.page.locator("#chorus-studio").waitFor({state:"hidden"});return result.sound;
}
async function register(who){const state=await snapshot(who);who.id=state.you.id;who.sessionId=state.sessionId;who.cookies=await who.context.cookies();save();return state;}

try{
  const context=await browser.newContext({viewport:{width:1920,height:1080},hasTouch:true});
  await context.addInitScript(()=>{
    window.__placementStarts=[];const Context=window.AudioContext;
    window.AudioContext=class extends Context{createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{window.__placementStarts.push({loop:source.loop,duration:source.buffer?.duration});return start(...args);};return source;}};
  });
  const page=await context.newPage();page.setDefaultTimeout(20_000);
  const actor={context,page,name:"Placement Ada",posts:0,lastWriteAt:0};people.push(actor);
  page.on("pageerror",error=>pageErrors.push(error.message));page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());});
  page.on("request",request=>{if(request.method()==="POST"&&/\/sounds$/.test(new URL(request.url()).pathname))actor.posts++;});
  page.on("response",response=>{
    if(response.request().method()!=="POST"||!/\/sounds$/.test(new URL(response.url()).pathname))return;
    const capture=response.json().then(result=>{if(result.ok&&result.sound&&!result.sound.whileIn){made.set(result.sound.id,{who:actor,sound:result.sound});save();}}).catch(()=>{});
    pending.add(capture);void capture.finally(()=>pending.delete(capture));
  });
  await page.goto(base+"/planet");await page.locator("#planet-join").waitFor({state:"visible"});
  await page.fill('#planet-join-form input[name="nickname"]',actor.name);await page.check('#planet-join-form input[value="cat"]',{force:true});await page.locator("#planet-enter").click();
  await page.locator("#chorus-welcome").getByRole("button",{name:"Explore quietly",exact:true}).click();await ready(page);
  const initial=await register(actor);initialPlanet=ordinary(initial);initialCoast=ordinary(await snapshot(actor,"/scene/seaside"));
  const greenIds=new Set(initial.chorus.filter(work=>work.placeId==="green").flatMap(work=>work.liveSources.map(source=>source.id)));
  check(greenIds.size===9,"The designated fixture really starts with nine historical Green sources",{greenSources:greenIds.size,stageSources:initial.chorus.filter(work=>work.placeId==="stage").flatMap(work=>work.liveSources).map(source=>({id:source.id,soundId:source.soundId}))});
  check(await data(page,"soundOn")==="false","Quiet entry does not enable world listening");
  await page.locator("#chorus-primary").click();await page.locator("#chorus-studio").waitFor({state:"visible"});
  check(/nick/i.test(await page.locator("#chorus-answering").textContent()),"The first real invitation answers Nick's existing work");
  const pulse=page.locator('#chorus-studio [data-leave="chorus-pulse"]');
  check(await pulse.isDisabled(),"The crowded historical corner explains its blocked Leave before a failed publication");
  const beforeListen=actor.posts;
  await page.locator('#chorus-studio [data-listen="chorus-pulse"]').click();
  await page.locator('#chorus-studio [data-listen="chorus-pulse"]').filter({hasText:"Stop"}).waitFor();
  check(await page.evaluate(()=>window.__placementStarts.some(source=>!source.loop&&source.duration>0))&&actor.posts===beforeListen,"A blocked ingredient still has a real decoded private audition, without publishing");
  await page.locator('#chorus-studio [data-find-room="chorus-pulse"]').click();
  await page.waitForFunction(()=>document.querySelector("#chorus-studio .chorus-feedback")?.textContent.includes("no safe space"));
  check(actor.posts===0&&await page.locator("#chorus-studio").evaluate(dialog=>dialog.open)&&await data(page,"soundOn")==="false","A genuinely full old work gives an honest no-space explanation without moving, publishing or unmuting");
  await shot(page,"placement-old-green-blocked");
  await page.locator("#chorus-try-another-place").click();
  await page.waitForFunction(()=>document.getElementById("planet-area")?.textContent==="Pocket jam stage"&&document.getElementById("chorus-studio")?.open&&document.getElementById("chorus-answering")?.textContent.includes("Listen to one ingredient"));
  check(await page.locator("#chorus-studio-title").textContent()==="What will you bring?"&&actor.posts===0,"The explicit next-place action opens a fresh Stage work without retaining Nick's parent or publishing");
  const firstChord=page.locator('#chorus-studio [data-leave="chorus-chords"]');
  if(await firstChord.isDisabled()){
    await page.locator('#chorus-studio [data-find-room="chorus-chords"]').click();
    await page.locator("#chorus-studio").waitFor({state:"hidden"});await page.locator("#chorus-studio").waitFor({state:"visible",timeout:20_000});
    assert.ok(await firstChord.isEnabled(),"The Stage has space for the new fixture without editing existing sources");
  }
  const root=await leaveUI(actor,"chorus-chords");
  check(root.byId===actor.id&&!root.replyToId,"The explicit Stage contribution begins this identity's actual new work");
  await ready(page);await beginWork(page);
  check(await page.locator('#chorus-studio [data-leave="chorus-chords"]').isDisabled(),"A second same-sound layer at the same position is correctly blocked");
  const beforeWalkPosts=actor.posts;
  await page.locator('#chorus-studio [data-find-room="chorus-chords"]').click();await page.locator("#chorus-walk-cancel").waitFor({state:"visible"});
  await page.locator("#chorus-walk-cancel").click();await page.locator("#chorus-walk-cancel").waitFor({state:"hidden"});
  await page.locator("#planet-tools").click();await page.locator("#planet-chat-toggle").click();await page.locator("#planet-chat-input").fill("Keep my cancelled walk cancelled.");
  const typingAt=await at(page);await page.waitForTimeout(2000);
  check(await page.locator("#planet-chat-input").inputValue()==="Keep my cancelled walk cancelled."&&await page.evaluate(()=>document.activeElement?.id)==="planet-chat-input"&&!await page.locator("#chorus-studio").evaluate(dialog=>dialog.open),"Cancelling the placement walk does not reopen a chooser or steal subsequent chat typing");
  check(actor.posts===beforeWalkPosts&&distance(typingAt,await at(page))<.04&&await data(page,"soundOn")==="false","Cancel and typing neither move the player, publish a sound nor change local mute");
  await page.locator("#planet-chat-close").click();await beginWork(page);
  assert.ok(await page.locator('#chorus-studio [data-leave="chorus-chords"]').isDisabled(),"The cancelled walk stopped before an eligible same-sound position");
  await page.locator('#chorus-studio [data-find-room="chorus-chords"]').click();
  await page.locator("#chorus-studio").waitFor({state:"hidden"});await page.locator("#chorus-studio").waitFor({state:"visible",timeout:20_000});
  const arrived=await at(page);
  check(distance(arrived,root)>=4&&await page.locator('#chorus-studio [data-leave="chorus-chords"]').isEnabled(),"An explicit safe walk reaches a position where the same sound can legally be left",{distanceFromOriginal:distance(arrived,root)});
  check(actor.posts===beforeWalkPosts&&await data(page,"soundOn")==="false","Arrival only reopens the choice; it never automatically leaves or unmutes a sound");
  await shot(page,"placement-stage-arrived");

  const peerContext=await browser.newContext(), peer={context:peerContext,name:"Placement Bo",lastWriteAt:0};people.push(peer);
  const joined=await peerContext.request.post(base+"/join",{headers:{accept:"application/json"},form:{nickname:peer.name,avatar:"dog"}});assert.ok(joined.ok());await register(peer);
  check(peer.id!==actor.id,"The remote availability change comes from a separate real cookie identity");
  const pulseChoice=page.locator('#chorus-studio [data-leave="chorus-pulse"]');assert.ok(await pulseChoice.isEnabled());
  await page.evaluate(()=>{window.__placementPulseButton=document.querySelector('#chorus-studio [data-leave="chorus-pulse"]');});
  await moveApi(peer,arrived);
  const added=await peerContext.request.post(`${base}/api/sessions/${peer.sessionId}/sounds`,{data:{soundId:"chorus-pulse",operationId:crypto.randomUUID()}}), addition=await added.json();
  assert.ok(added.ok()&&addition.ok&&addition.sound,`The remote fixture is server-confirmed: ${JSON.stringify(addition)}`);made.set(addition.sound.id,{who:peer,sound:addition.sound});peer.lastWriteAt=Date.now();save();
  const addAck=Date.now();await page.waitForFunction(()=>document.querySelector('#chorus-studio [data-leave="chorus-pulse"]')?.disabled);
  check(Date.now()-addAck<=1500&&await page.evaluate(()=>window.__placementPulseButton===document.querySelector('#chorus-studio [data-leave="chorus-pulse"]')),"A remote nearby addition disables the existing chooser's matching choice without closing or replacing it",{afterAckMs:Date.now()-addAck});
  await pause(1100);await moveApi(peer,addition.sound);
  const removed=await peerContext.request.delete(`${base}/api/sessions/${peer.sessionId}/sounds/${addition.sound.id}`), removal=await removed.json();assert.ok(removed.ok()&&removal.ok);
  const removeAck=Date.now();await page.waitForFunction(()=>document.querySelector('#chorus-studio [data-leave="chorus-pulse"]')&&!document.querySelector('#chorus-studio [data-leave="chorus-pulse"]').disabled);
  check(Date.now()-removeAck<=1500&&await page.evaluate(()=>window.__placementPulseButton===document.querySelector('#chorus-studio [data-leave="chorus-pulse"]')),"Remote withdrawal enables the same still-open choice automatically",{afterAckMs:Date.now()-removeAck});
  check(actor.posts===beforeWalkPosts&&await data(page,"soundOn")==="false"&&Number(await data(page,"voices"))===0,"Neither friend's action publishes this draft or overrides the quiet listener");
  const second=await leaveUI(actor,"chorus-chords");
  check(!second.replyToId&&second.byId===actor.id&&distance(root,second)>=4,"The second work appears only after a further explicit Leave at the safe position");
  assert.deepEqual(ordinary(await snapshot(actor)).filter(sound=>!made.has(sound.id)),initialPlanet);
  assert.deepEqual(ordinary(await snapshot(actor,"/scene/seaside")),initialCoast);
  check(pageErrors.length===0,"The placement, cancellation and remote-availability path has no browser page errors",{pageErrors,consoleErrors});
}catch(error){failed=true;failure={message:error.message,stack:error.stack};process.exitCode=1;console.error(error);for(const who of people)if(who.page)await shot(who.page,`failure-${who.name.replaceAll(" ","-")}`).catch(()=>{});
}finally{
  const cleanupErrors=[];await Promise.allSettled([...pending]);
  for(const who of people)for(const page of who.context.pages())await page.goto("about:blank").catch(()=>{});
  for(const {who,sound}of[...made.values()].reverse()){
    try{await pause(1100);const current=await snapshot(who);if(!current.sounds.some(source=>source.id===sound.id))continue;
      await moveApi(who,sound);const removed=await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`), result=await removed.json();assert.ok((removed.ok()&&result.ok)||result.code==="gone",`Cleanup only own fixture ${sound.id}: ${JSON.stringify(result)}`);
    }catch(error){cleanupErrors.push(`${sound.id}: ${error.message}`);}
  }
  if(people[0]&&initialPlanet&&initialCoast)try{assert.deepEqual(ordinary(await snapshot(people[0])),initialPlanet);assert.deepEqual(ordinary(await snapshot(people[0],"/scene/seaside")),initialCoast);check(true,"Cleanup preserves all nine historical Green sources and every pre-existing coastal source exactly");}catch(error){cleanupErrors.push(error.message);}
  if(cleanupErrors.length){failed=true;process.exitCode=1;console.error("Cleanup",cleanupErrors);}
  writeFileSync(`${out}/results.json`,JSON.stringify({kind:"automated-developer-placement-flow",base,failed,failure,checks,pageErrors,consoleErrors,cleanupErrors,made:[...made.values()].map(({sound})=>({id:sound.id,byId:sound.byId,soundId:sound.soundId,x:sound.x,z:sound.z,replyToId:sound.replyToId})),realUnfamiliarPairs:false,humanListening:false,physicalPhone:false,nextDayReturn:false,remotePeerUsesAuthenticatedHttp:true},null,2)+"\n");
  await browser.close();if(!cleanupErrors.length)rmSync(recoveryPath,{force:true});
}
