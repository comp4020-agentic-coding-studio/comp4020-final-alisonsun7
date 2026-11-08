#!/usr/bin/env node
// Inspect the promoted local application without joining or sending writes.
// APP_URL=http://localhost:18861 node e2e/chorus-read-only.mjs [artifacts]
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base=process.env.APP_URL ?? "http://localhost:18861", url=new URL(base);
assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
const out=process.argv[2]??".cache/answers/promoted";mkdirSync(out,{recursive:true});
const report={kind:"read-only-promoted-browser-inspection",base,viewports:[],writes:[],errors:[],passed:false};
const browser=await chromium.launch({channel:"chrome",args:["--use-angle=metal","--enable-gpu"]});
try{
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  await context.route("**/*",route=>{const request=route.request();if(!["GET","HEAD"].includes(request.method())){report.writes.push({method:request.method(),path:new URL(request.url()).pathname});return route.abort();}return route.continue();});
  // Compare with this world's current sources, not a historical release's
  // fixed count. The owner may have continued creating since that release.
  const initial=await context.request.get(base+"/planet");assert.equal(initial.status(),200);
  const baseline=JSON.parse((await initial.text()).match(/id="planet-boot"[^>]*>([\s\S]*?)<\/script>/)[1]).snapshot;
  const sourceIds=snapshot=>snapshot.sounds.filter(source=>!source.whileIn&&!source.removedAt).map(source=>source.id).sort();
  report.expectedSourceIds=sourceIds(baseline);
  const page=await context.newPage();page.on("pageerror",error=>report.errors.push(error.message));
  await page.goto(base+"/planet");await page.locator("#planet-observe").click();
  await page.waitForFunction(()=>!!document.getElementById("planet-stage").dataset.chorusGardens&&!document.querySelector("dialog:modal"));
  report.actual=await page.evaluate(()=>{const boot=JSON.parse(document.getElementById("planet-boot").textContent),stage=document.getElementById("planet-stage");return {joined:boot.joined,presentation:stage.dataset.presentation,soundOn:stage.dataset.soundOn,sourceCount:boot.snapshot.sounds.filter(source=>!source.whileIn&&!source.removedAt).length,forms:JSON.parse(stage.dataset.chorusGardens),brand:document.title};});
  assert.equal(report.actual.joined,false);assert.equal(report.actual.presentation,"3d");assert.equal(report.actual.soundOn,"false");
  const actualIds=await page.evaluate(()=>JSON.parse(document.getElementById("planet-boot").textContent).snapshot.sounds.filter(s=>!s.whileIn&&!s.removedAt).map(s=>s.id).sort());
  assert.deepEqual(actualIds,report.expectedSourceIds);assert.equal(report.actual.sourceCount,report.expectedSourceIds.length);
  await page.screenshot({path:`${out}/promoted-green-desktop.png`,fullPage:true});report.viewports.push({width:1920,height:1080});
  await page.locator("#chorus-our-works").click();await page.locator("#chorus-journal").waitFor({state:"visible"});
  report.authorMarks=await page.locator("#chorus-journal .chorus-source-author[data-author] .chorus-author-mark[data-shape]").count();assert.ok(report.authorMarks>0);
  await page.screenshot({path:`${out}/promoted-record-desktop.png`,fullPage:true});
  await page.locator("#chorus-journal").getByRole("button",{name:"Back to the world",exact:true}).click();
  await page.locator("#planet-tools").click();await page.locator('#planet-destinations [data-zone="pool"]').click();
  await page.waitForFunction(()=>!document.querySelector("dialog:modal")&&document.getElementById("planet-area").textContent==="Tide pools");
  await page.locator("#sound-discovery-create").waitFor({state:"visible"});
  await page.screenshot({path:`${out}/promoted-pool-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`${out}/promoted-pool-phone.png`,fullPage:true});report.viewports.push({width:390,height:844});
  const readme=await context.request.get(base+"/readme/");assert.equal(readme.status(),200);
  const rendered=await readme.text();assert.ok(!rendered.includes('href="http://localhost:18861/planet"'));
  report.notes=[];
  for(const slug of ["chorus-audio","promise-evidence-map","human-playtest","little-chorus"]){const route="/project-notes/"+slug,response=await context.request.get(base+route);assert.equal(response.status(),200);report.notes.push(route);}
  await page.goto(base+"/project-notes/promise-evidence-map");assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.equal((await context.request.get(base+"/project-notes/constructor")).status(),404);
  assert.deepEqual(report.writes,[]);assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await browser.close();writeFileSync(`${out}/results.json`,JSON.stringify(report,null,2)+"\n");}
console.log(JSON.stringify(report));
