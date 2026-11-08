#!/usr/bin/env node
// The retired comparison links enter the real retained 3D world. Use a scratch
// localhost server: this path joins its own identity and reports movement.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base=process.env.APP_URL;
assert.ok(base,"Set APP_URL to an isolated local candidate");
const address=new URL(base);
assert.ok(["localhost","127.0.0.1","[::1]"].includes(address.hostname)&&address.port!=="18861","Never run the writing path on the user's preview");
const out=process.argv[2];if(out)mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:"chrome",args:["--use-angle=metal","--enable-gpu"]});
const errors=[];
const check=(value,label)=>{assert.ok(value,label);console.log("ok "+label);};
const boot=page=>page.locator("#planet-boot").evaluate(element=>JSON.parse(element.textContent));
const ready=page=>page.waitForFunction(()=>!!document.getElementById("planet-stage").dataset.groundSafety&&!document.querySelector("dialog:modal"));
const sources=snapshot=>snapshot.sounds.map(source=>({id:source.id,byId:source.byId,x:source.x,z:source.z}));
try{
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:"reduce"});
  const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(15000);
  await page.goto(base+"/planet?view=2d");
  check(new URL(page.url()).pathname==="/planet"&&!new URL(page.url()).searchParams.has("view"),"An old 2D link canonicalises to the existing 3D route");
  await page.locator("#planet-nickname").fill("Retained 3D visitor");await page.locator("#planet-enter").click();
  await page.getByRole("button",{name:"Explore quietly",exact:true}).click();await ready(page);
  const first=await boot(page);
  check(first.view==="3d"&&first.snapshot.you,"Joining through the old link still yields a real identity in 3D");
  check(await page.locator(".planet-presentations").count()===0,"Neither the header nor drawer advertises removed versions");
  await page.locator("#planet-view").click();await page.waitForFunction(()=>document.getElementById("planet-stage").dataset.view==="first");
  await page.locator("#planet-view").click();await page.waitForFunction(()=>document.getElementById("planet-stage").dataset.view==="third");
  check(true,"Both retained 3D cameras still work");
  await page.evaluate(()=>sessionStorage.setItem("chorus-presentation-handoff",JSON.stringify({view:"2.5d",who:"retired",at:{x:4,z:3,yaw:1},now:Date.now()})));
  await page.goto(base+"/planet?view=2.5d&zone=tea");await ready(page);
  const returned=await boot(page);
  check(returned.snapshot.you.id===first.snapshot.you.id&&returned.snapshot.sessionId===first.snapshot.sessionId,"The retired 2.5D link retains the cookie identity and room");
  assert.deepEqual(sources(returned.snapshot),sources(first.snapshot));
  check(await page.evaluate(()=>sessionStorage.getItem("chorus-presentation-handoff")!==null),"An obsolete tab handoff is ignored rather than migrating a position");
  check(await page.locator("#planet-stage").getAttribute("data-sound-on")==="false","A new document keeps the quiet listening choice");
  const retired=await Promise.all(["flat-world","flat-art","presentation-handoff"].map(id=>context.request.get(base+"/client/"+id+".js")));
  check(retired.every(response=>response.status()===404),"Removed renderer and handoff modules have no runtime endpoint");
  await page.close();await context.close();

  const phoneContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:"reduce"});
  const phone=await phoneContext.newPage();phone.on("pageerror",error=>errors.push(error.message));
  await phone.goto(base+"/planet/flat?zone=pool");await phone.locator("#planet-observe").click();await ready(phone);
  check((await boot(phone)).view==="3d"&&new URL(phone.url()).searchParams.get("zone")==="pool","The legacy flat alias takes a phone visitor to the requested place in 3D");
  check(await phone.locator(".planet-presentations").count()===0&&await phone.locator("#planet-place").isVisible(),"The phone keeps a visible sound entrance with no obsolete style picker");
  check(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"The retained header fits the phone width");
  if(out)await phone.screenshot({path:out+"/3d-only-phone.png"});
  assert.deepEqual(errors,[]);check(true,"The retained 3D documents start without runtime errors");
}finally{await browser.close();}
