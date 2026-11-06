#!/usr/bin/env node
// Visual integration on an isolated, silent fixture; no DB writes or joining.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const base = process.env.APP_URL ?? 'http://localhost:8080';
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-gpu']});
const errors=[];
const check=(value,message)=>{assert.ok(value,message);console.log('ok  '+message);};
try {
  const page=await browser.newPage({viewport:{width:1280,height:840},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(base+'/about');
  await page.evaluate(async()=>{
    const [{WorldView},{Soundscape},{SCENES}]=await Promise.all([import('/client/world.js'),import('/client/soundscape.js'),import('/shared/catalog.js')]);
    document.body.replaceChildren();document.body.className='scene-page';
    document.body.style.cssText='margin:0;width:100vw;height:100vh;overflow:hidden';
    const host=document.createElement('div');host.style.cssText='position:relative;width:100vw;height:100vh;overflow:hidden';document.body.append(host);
    Object.assign(SCENES[0].zones.find(z=>z.id==='boardwalk').spawn,{x:-3,z:1.6,yaw:0.95});
    window.artWorld=new WorldView(host,SCENES[0],'weekday',{startZone:'boardwalk',onListen:l=>window.artSounds?.frame(l)});
    window.artSounds=new Soundscape(window.artWorld,host,{canChange:()=>true,onRemove:()=>{},onReply:()=>{},onConversation:()=>{}});
    const now=new Date().toISOString();
    window.artWorld.setEnvironment({weather:'clear',minuteOfDay:840,clockRunning:false,revision:1,updatedAt:now},now);
    window.artSounds.setAll([[-6,0],[-9,-1.2],[-12,-2.8]].map(([x,z],i)=>({id:'aligned-'+i,soundId:['beach-waves','coastal-gulls','bicycle-bell'][i],x,z,by:'Visual fixture',byId:'fixture',at:now})));
  });
  await page.waitForFunction(()=>window.artWorld.scene3.environment&&!document.querySelector('.world-loading'));
  await page.waitForTimeout(200);
  await page.evaluate(()=>{
    const w=window.artWorld;
    w.setOthers([{id:'close-arrival',name:'Near visitor',avatar:'dog',x:w.x,z:w.z,yaw:w.yaw}]);
  });
  await page.waitForTimeout(100);
  check(await page.evaluate(()=>{const w=window.artWorld;return w.others.has('close-arrival')&&!w.others.get('close-arrival').sprite.visible;}),'overlapping arrivals keep their identity without drawing a body inside the camera');
  await page.evaluate(()=>{
    const w=window.artWorld;
    w.setOthers([{id:'close-arrival',name:'Near visitor',avatar:'dog',x:w.x-Math.sin(w.yaw)*2,z:w.z-Math.cos(w.yaw)*2,yaw:w.yaw}]);
  });
  await page.waitForTimeout(300);
  check(await page.evaluate(()=>window.artWorld.others.get('close-arrival').sprite.visible),'stepping apart restores the same three-dimensional visitor');
  await page.evaluate(()=>window.artWorld.setOthers([]));
  const result=await page.evaluate(()=>{
    const w=window.artWorld,s=window.artSounds;
    const near=[...s.marks.values()].find(m=>m.label.classList.contains('in-reach'));
    const target=near.label.getBoundingClientRect();
    const overlaps=[...s.marks.values()].filter(m=>m!==near&&!m.label.hidden).map(m=>({id:m.sound.id,rect:m.label.getBoundingClientRect()})).filter(({rect:r})=>r.left<target.right&&r.right>target.left&&r.top<target.bottom&&r.bottom>target.top).map(m=>m.id);
    let transmission=0;w.root.traverse(o=>{if(o.isMesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.transmission>0))transmission++;});
    return {overlaps,transmission,grounded:[...s.marks.values()].every(m=>{const floor=w.surfaceHeight(m.sound.x,m.sound.z);return m.anchor.position.y>=floor&&m.anchor.position.y<floor+.06;}),people:[...w.passers,...w.regulars,...w.game.kids].every(p=>p.sprite.isGroup&&!p.sprite.isSprite&&p.sprite.headAnchor),silent:s.ctx===null};
  });
  check(result.overlaps.length===0,'aligned distant sound titles do not cover the nearest contribution actions');
  check(result.grounded,'contribution rings sit just above the actual boardwalk floor');
  check(result.transmission===0,'small lamps do not trigger a full-scene transmission render');
  check(result.people,'all animal visitors use actual 3D bodies and head anchors');
  check(result.silent,'a visual review never starts audio automatically');
  const waterBlocked=await page.evaluate(async()=>{
    const {canStand}=await import('/client/world-build.js');
    return [[-20,15],[-40,28],[-10,18],[30,30.65],[31,30.65],[32,30.65]]
      .every(([x,z])=>!canStand(window.artWorld.built,x,z));
  });
  check(waterBlocked,'the curved western and eastern waterline both exclude submerged ground');
  if(out)await page.screenshot({path:out+'/aligned-sounds.png'});
  await page.setViewportSize({width:375,height:812});
  await page.waitForTimeout(250);
  const narrow=await page.evaluate(()=>{
    const m=[...window.artSounds.marks.values()].find(m=>m.label.classList.contains('in-reach'));
    const r=m.label.getBoundingClientRect();
    return {rect:r.toJSON(),fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,buttons:[...m.label.querySelectorAll('button')].filter(b=>!b.hidden).map(b=>b.getBoundingClientRect().height)};
  });
  check(narrow.fits&&narrow.buttons.every(h=>h>=44),'nearest sound actions fit a 375px view with 44px controls: '+JSON.stringify(narrow));
  if(out)await page.screenshot({path:out+'/aligned-sounds-phone.png'});
  const skyBrightness=async(minute,revision)=>{
    await page.evaluate(({minute,revision})=>{
      const w=window.artWorld,now=new Date().toISOString();
      w.goTo('beach');w.pitch=.15;
      w.setEnvironment({weather:'cloudy',minuteOfDay:minute,clockRunning:false,revision,updatedAt:now},now);
    },{minute,revision});
    await page.waitForTimeout(1000);
    return page.evaluate(()=>{
      const w=window.artWorld,r=w.renderer,gl=r.getContext(),canvas=r.domElement;
      w.picture.render();
      const pixels=new Uint8Array(canvas.width*canvas.height*4);
      gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const samples=[];
      for(let y=.55;y<.95;y+=.05)for(let x=.1;x<.95;x+=.08){
        const i=(Math.floor(y*canvas.height)*canvas.width+Math.floor(x*canvas.width))*4;
        samples.push(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722);
      }
      samples.sort((a,b)=>a-b);
      return samples[samples.length-1];
    });
  };
  const daySky=await skyBrightness(840,2),nightSky=await skyBrightness(1320,3);
  check(daySky>170&&nightSky<150,'cloud highlights follow the night sky instead of staying daylight white: '+JSON.stringify({daySky,nightSky}));
  if(out)await page.screenshot({path:out+'/cloudy-night-sky.png'});
  check(errors.length===0,'no page or resource errors: '+errors.join(' | '));
}finally{await browser.close();}
