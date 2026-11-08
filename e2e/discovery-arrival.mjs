#!/usr/bin/env node
// Visual developer check on a retained-history CLONE, never the working world.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const base=process.env.APP_URL,out=process.argv[2];
assert.equal(base,'http://localhost:18899','Only the isolated visual-review clone is allowed');
assert.ok(out);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-gpu']});
const context=await browser.newContext({viewport:{width:1920,height:1080},hasTouch:true});
const page=await context.newPage(),errors=[],checks=[],arrivals=[];
page.on('pageerror',e=>errors.push(e.message));let posts=0,failed=false;
page.on('request',r=>{if(r.method()==='POST'&&/\/sounds$/.test(new URL(r.url()).pathname))posts++;});
const snapshot=async()=>{const r=await context.request.get(base+'/planet');return JSON.parse((await r.text()).match(/id="planet-boot"[^>]*>([\s\S]*?)<\/script>/)[1]).snapshot;};
const sources=s=>s.sounds.filter(s=>!s.whileIn).sort((a,b)=>a.id.localeCompare(b.id));
try{
 const before=sources(await snapshot());await page.goto(base+'/planet');
 await page.fill('#planet-join-form input[name="nickname"]','Arrival viewer');
 await page.locator('#planet-enter').click();await page.getByRole('button',{name:'Explore quietly',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('dialog:modal'));
 await page.locator('#planet-tools').click();await page.locator('#planet-destinations [data-zone="conservatory"]').click();
 await page.waitForFunction(()=>!document.querySelector('dialog:modal')&&document.getElementById('planet-area').textContent==='Rain conservatory');
 await page.waitForFunction(()=>document.getElementById('planet-stage').dataset.at?.startsWith('-2.000,12.000'));
 for(const [kind,width,height] of [['desktop',1920,1080],['phone',390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(350);
  arrivals.push({kind,at:await page.locator('#planet-stage').getAttribute('data-at')});
  assert.ok(await page.locator('#sound-discovery-create').isVisible());
  await page.screenshot({path:`${out}/conservatory-arrival-${kind}.png`,fullPage:true});
 }
 checks.push('The explicit conservatory visit arrives on the inland approach, facing the open structure, in both rating viewports');
 assert.equal(posts,0);assert.deepEqual(sources(await snapshot()),before);
 checks.push('Visiting and resizing publish no sounds and preserve every original live source');
 assert.deepEqual(errors,[]);checks.push('No browser page errors');
}catch(e){failed=true;process.exitCode=1;console.error(e);await page.screenshot({path:`${out}/failure.png`,fullPage:true});}
finally{writeFileSync(`${out}/results.json`,JSON.stringify({kind:'automated-developer-visual-check',failed,checks,errors,arrivals,physicalPhone:false,humanListening:false},null,2));await browser.close();}
