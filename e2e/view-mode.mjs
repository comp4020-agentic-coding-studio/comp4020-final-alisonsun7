#!/usr/bin/env node
// Silent legacy-renderer integration fixture: no joining, POSTs or DB changes.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const base=process.env.APP_URL??'http://localhost:18881';
const address=new URL(base);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(address.hostname));
assert.notEqual(address.port,'18861','Use an isolated scratch server.');
const out=process.argv[2];if(out)mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-gpu']});
const errors=[],checks=[];let posts=0;
const check=(condition,message)=>{assert.ok(condition,message);checks.push(message);console.log('ok  '+message);};
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST')posts++;});
  await page.goto(base+'/about');
  await page.evaluate(async()=>{
    const [{WorldView},{SCENES},THREE]=await Promise.all([import('/client/world.js'),import('/shared/catalog.js'),import('/vendor/three.module.min.js')]);
    document.body.replaceChildren();document.body.className='scene-page';document.body.style.cssText='margin:0;width:100vw;height:100vh;overflow:hidden';
    const host=document.createElement('div');host.id='stage';host.style.cssText='position:relative;width:100vw;height:100vh';document.body.append(host);
    localStorage.removeItem('soac-view-mode');window.fixtureThree=THREE;window.fixtureScene=SCENES.find(scene=>scene.id==='seaside');
    if(!window.fixtureScene)throw new Error('The legacy seaside scene is unavailable');
    window.viewWorld=new WorldView(host,window.fixtureScene,'weekday',{startZone:'boardwalk'});
    window.viewWorld.setSelf({id:'fixture-self',name:'Fixture walker',avatar:'dog'});
  });
  await page.waitForFunction(()=>window.viewWorld.scene3.environment&&!document.querySelector('.world-loading'));
  check(await page.evaluate(()=>window.viewWorld.viewMode==='first'&&!window.viewWorld.self.sprite.visible),'first person remains the default and hides only the actual self body');
  await page.evaluate(()=>window.viewWorld.setViewMode('third'));
  await page.waitForFunction(()=>window.viewWorld.self.sprite.visible);
  check(await page.evaluate(()=>{const w=window.viewWorld;return w.self.person.id==='fixture-self'&&w.self.sprite.userData.figure.seed==='fixture-self'&&w.self.sprite.userData.figure.role==='player'&&w.self.sprite.isGroup&&localStorage.getItem('soac-view-mode')==='third';}),'third person shows a real identity-seeded 3D player and remembers the choice');
  const before=await page.evaluate(()=>({x:window.viewWorld.x,z:window.viewWorld.z,yaw:window.viewWorld.yaw,pitch:window.viewWorld.pitch,facing:window.viewWorld.self.sprite.rotation.y}));
  await page.evaluate(()=>{window.viewWorld.setLookMode('follow');window.viewWorld.focusCanvas();});
  await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(800,500,{steps:6});await page.mouse.up();
  const dragged=await page.evaluate(()=>({x:window.viewWorld.x,z:window.viewWorld.z,yaw:window.viewWorld.yaw,pitch:window.viewWorld.pitch,facing:window.viewWorld.self.sprite.rotation.y}));
  check(dragged.yaw<before.yaw&&dragged.pitch<before.pitch,'third-person Follow pointer preserves both look directions');
  check(Math.hypot(dragged.x-before.x,dragged.z-before.z)<.01&&Math.abs(dragged.facing-before.facing)<.01,'orbiting alone does not walk or spin the stationary player');
  await page.keyboard.down('w');await page.waitForTimeout(180);await page.keyboard.up('w');
  const walked=await page.evaluate(()=>({x:window.viewWorld.x,z:window.viewWorld.z,pose:window.viewWorld.self.sprite.pose}));
  check(Math.hypot(walked.x-dragged.x,walked.z-dragged.z)>.2,'third-person W walks through the same movement controller');
  await page.evaluate(()=>window.viewWorld.setLookMode('scene'));
  const reversed=await page.evaluate(()=>({yaw:window.viewWorld.yaw,pitch:window.viewWorld.pitch}));
  await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(760,480,{steps:4});await page.mouse.up();
  check(await page.evaluate(p=>window.viewWorld.yaw>p.yaw&&window.viewWorld.pitch>p.pitch,reversed),'Drag the scene remains reversed on both axes in third person');
  if(out)await page.screenshot({path:out+'/third-person-player.png'});
  await page.evaluate(()=>{
    const w=window.viewWorld,T=window.fixtureThree;w.correctPosition({x:0,z:-30,yaw:0});w.pitch=0;
    const wall=new T.Mesh(new T.BoxGeometry(4,3,.2),new T.MeshStandardMaterial({color:0xa67453}));wall.position.set(0,1.5,-28);w.built.root.add(wall);w.built.occluders.push(wall);window.fixtureWall=wall;
  });
  await page.waitForTimeout(100);
  check(await page.evaluate(()=>{const w=window.viewWorld;return w.cameraDistance<1.9&&w.cameraDistance>.7&&w.camera.position.z<-28.1&&w.x===0&&w.z===-30;}),'an actual wall shortens the camera boom without moving the player through it');
  if(out)await page.screenshot({path:out+'/third-person-wall.png'});
  await page.evaluate(()=>{const w=window.viewWorld,wall=window.fixtureWall;w.built.occluders.splice(w.built.occluders.indexOf(wall),1);wall.removeFromParent();wall.geometry.dispose();wall.material.dispose();});
  await page.evaluate(async()=>{
    const {HUTS}=await import('/shared/huts.js');const h=HUTS.find(h=>h.kind.endsWith('toilet'));window.fixtureHut=h;
    const frame={id:'fixture-npc',label:'Routine neighbour',avatar:'cat',x:(h.door.x0+h.door.x1)/2,z:h.z1-1.3,yaw:0,phase:'occupied',hutId:h.id,phaseStartedAt:new Date().toISOString(),occupying:true};window.fixtureRoutine=frame;
    window.viewWorld.setNpcRoutines([frame],new Date().toISOString());
  });
  await page.waitForTimeout(500);
  check(await page.evaluate(()=>{const w=window.viewWorld,h=window.fixtureHut,s=JSON.parse(document.getElementById('stage').dataset.huts)[h.id];return !w.npcRoutines.get('fixture-npc').sprite.visible&&s.taken&&s.locked&&s.light==='red'&&s.open<.15;}),'an occupied NPC is hidden and the actual private door is red, closed and locked');
  await page.evaluate(()=>{const h=window.fixtureHut;window.fixtureRoutine={...window.fixtureRoutine,x:(h.door.x0+h.door.x1)/2,z:h.z1+.4,phase:'entering'};window.viewWorld.setNpcRoutines([window.fixtureRoutine],new Date().toISOString());});
  await page.waitForTimeout(400);
  check(await page.evaluate(()=>{const s=JSON.parse(document.getElementById('stage').dataset.huts)[window.fixtureHut.id];return s.taken&&s.locked&&s.light==='red'&&s.open>.7;}),'NPC entry opens the visible door while preserving the reserved red lock');
  await page.evaluate(()=>window.viewWorld.setNpcRoutines([]));
  await page.evaluate(()=>{
    const w=window.viewWorld,cafe=window.fixtureScene.zones.find(z=>z.id==='counter').spawn,outside=window.fixtureScene.zones.find(z=>z.id==='boardwalk').spawn,now=new Date().toISOString();
    w.setEnvironment({weather:'clear',minuteOfDay:1320,clockRunning:false,revision:5,updatedAt:now},now);
    w.setOthers([{id:'inside-fixture',name:'Inside fixture',avatar:'cat',x:cafe.x,z:cafe.z,yaw:0},{id:'outside-fixture',name:'Outside fixture',avatar:'dog',x:outside.x,z:outside.z,yaw:0}]);
    w.correctPosition({...cafe});
  });
  await page.waitForTimeout(1400);
  check(await page.evaluate(()=>{const w=window.viewWorld;return w.others.get('inside-fixture').sprite.userData.interiorLight>.1&&w.others.get('outside-fixture').sprite.userData.interiorLight===0;}),'night readability is local to indoor figures and never brightens outdoor figures');
  check(await page.evaluate(()=>{const w=window.viewWorld;return [...w.others.values()].every(o=>o.sprite.userData.figure.role==='player'&&o.label.textContent.includes('PLAYER'))&&w.npcLabels.every(n=>n.label.dataset.role==='npc'&&n.label.textContent.includes('NPC'));}),'actual player names and NPC labels use different text and role accessories');
  if(out)await page.screenshot({path:out+'/third-person-night-room.png'});
  await page.evaluate(()=>window.viewWorld.setViewMode('first'));
  check(await page.evaluate(()=>window.viewWorld.viewMode==='first'&&!window.viewWorld.self.sprite.visible&&localStorage.getItem('soac-view-mode')==='first'),'switching back restores first person and remembers it');
  await page.setViewportSize({width:375,height:812});await page.evaluate(()=>window.viewWorld.setViewMode('third'));await page.waitForTimeout(200);
  check(await page.evaluate(()=>Math.abs(window.viewWorld.camera.aspect-375/812)<.001&&Number.isFinite(window.viewWorld.camera.position.x)),'the orbit camera also resizes to a phone viewport');
  if(out)await page.screenshot({path:out+'/third-person-phone.png'});
  check(posts===0,'view, identity, labels and routine fixtures never post or modify shared data');
  check(errors.length===0,'no page errors: '+errors.join(' | '));
  if(out)writeFileSync(out+'/checks.json',JSON.stringify({checks,errors,posts},null,2)+'\n');
}finally{await browser.close();}
