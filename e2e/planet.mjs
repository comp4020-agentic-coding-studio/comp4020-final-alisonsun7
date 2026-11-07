#!/usr/bin/env node
// The new Soundfolk edition, through real people, native UI and server SSE.
// A LOCAL SCRATCH server only: this creates and soft-removes contributions.
// APP_URL=http://localhost:18881 node e2e/planet.mjs [shotsDir]
// Isolated output: set APP_BUILD=.cache/planet-build/dist; normal build uses dist.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

// This shared module has runtime .js imports. Use the built application, as
// pnpm build && pnpm e2e does; an isolated candidate can name its build root.
const { PLANET_HALF, PLANET_HUTS, PLANET_PLACES, PLANET_RADIUS, planetDistance } = await import(
  pathToFileURL(resolve(process.env.APP_BUILD ?? "dist", "shared/planet.js")).href);

const base = process.env.APP_URL ?? "http://localhost:8080";
const address = new URL(base);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(address.hostname), "planet checks require a local scratch server");
assert.notEqual(address.port, "18861", "The working preview is not a scratch database");
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const people = [], made = [], errors = [];
let assertionFailed = false;
const check = (value, label) => { assert.ok(value, label); console.log("ok  " + label); };
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const at = page => page.locator("#planet-stage").evaluate(stage => stage.dataset.at.split(",").map(Number));
const card = (page, id) => page.locator(`.planet-sound-card[data-id="${id}"]`);
const soundscape = page => page.locator("#planet-soundscape");
const mainDialog = page => page.locator("#planet-tools-panel");
const samePosition = (a, b) => planetDistance({ x: a[0], z: a[1] }, { x: b[0], z: b[1] }) < .025;

async function snapshot(who, path = "/planet") {
  const response = await who.context.request.get(base + path);
  assert.ok(response.ok(), `Snapshot request failed (${response.status()})`);
  const match = (await response.text()).match(/<script\b[^>]*\bid="(?:planet-boot|boot)"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, "The real page must contain its server boot snapshot");
  return JSON.parse(match[1]).snapshot;
}

async function person(name, avatar) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(({clockOffset}) => {
    localStorage.setItem("soac-sound", "off");
    localStorage.setItem("soundfolk-view", "third");
    const realNow=Date.now.bind(Date);
    Date.now=()=>realNow()+clockOffset;
    window.__planetClockOffset=clockOffset;
    window.__planetAudioStarts = 0;
    const OriginalAudio = window.AudioContext;
    window.AudioContext = class extends OriginalAudio {
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => { window.__planetAudioStarts++; return start(...args); };
        return source;
      }
    };
  },{clockOffset:name==="Planet Bo"?3_600_000:0});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const who = { context, page, name, sessionId: null, posts: 0, lastMoveAt: 0 };
  people.push(who);
  page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
  page.on("request", request => {
    if(request.method()!=="POST")return;
    const path=new URL(request.url()).pathname;
    if(/\/sounds$/.test(path))who.posts++;
    if(/\/move$/.test(path))who.lastMoveAt=Date.now();
  });
  await page.goto(base + "/planet");
  // Negative control: the previous version fails here before anyone publishes.
  assert.equal(await page.locator("#planet-view").count(), 1, "The new planet must expose an actual camera view control");
  await page.locator("#planet-join").waitFor({ state: "visible" });
  assert.ok(await page.locator("#planet-join").evaluate(dialog => dialog.matches(":modal")), "Arrival must use a native focus scope");
  who.sessionId = await page.locator("#planet-boot").evaluate(boot => JSON.parse(boot.textContent).snapshot.sessionId);
  await page.fill('#planet-join-form input[name="nickname"]', name);
  await page.check(`#planet-join-form input[value="${avatar}"]`, { force: true });
  await page.selectOption("#planet-look", "follow");
  await page.click("#planet-enter");
  await page.locator("#planet-join").waitFor({ state: "hidden" });
  await page.waitForFunction(() => !!document.getElementById("planet-stage").dataset.at);
  return who;
}

async function openTools(page) {
  if (!await mainDialog(page).evaluate(dialog => dialog.open)) await page.locator("#planet-tools").click();
  await mainDialog(page).waitFor({ state: "visible" });
}

async function closeTools(page) {
  if (await mainDialog(page).evaluate(dialog => dialog.open)) await page.locator("#planet-tools-close").click();
  await page.waitForFunction(() => !document.getElementById("planet-tools-panel").open);
  await page.waitForTimeout(100);
}

async function openSounds(page) {
  if (!await soundscape(page).evaluate(dialog => dialog.open)) await page.locator("#planet-shared").click();
  await soundscape(page).waitFor({ state: "visible" });
}

async function closeSounds(page) {
  if (await soundscape(page).evaluate(dialog => dialog.open)) await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("planet-soundscape").open);
  await page.waitForTimeout(100);
}

async function place(who, soundId, open = true) {
  if (open) await who.page.locator("#planet-place").click();
  const response = who.page.waitForResponse(res => res.request().method() === "POST" && new URL(res.url()).pathname === `/api/sessions/${who.sessionId}/sounds`);
  await who.page.locator(`#sound-palette [data-sound="${soundId}"]`).click();
  const res = await response, result = await res.json();
  assert.ok(res.ok() && result.ok && result.sound, `Planet placement failed (${res.status()}): ${JSON.stringify(result)}`);
  made.push({ who, sound: result.sound });
  await who.page.locator("#sound-palette").waitFor({ state: "hidden" });
  return result.sound;
}

async function goTo(page, id) {
  await openTools(page);
  const target=await page.evaluate(async id=>{
    const {PLANET_PLACES}=await import("/shared/planet.js");
    const p=PLANET_PLACES.find(place=>place.id===id);
    return{x:p.x,z:p.z+(p.kind==="tea"?3:0)};
  },id);
  await page.locator(`#planet-destinations [data-zone="${id}"]`).click();
  await page.waitForFunction(() => !document.getElementById("planet-tools-panel").open);
  await page.waitForFunction(target=>{
    const at=document.getElementById("planet-stage").dataset.at?.split(",").map(Number);
    return at&&Math.hypot(at[0]-target.x,at[1]-target.z)<.025;
  },target);
  await page.waitForTimeout(450);
}

// Actual browser move reports run every two seconds even while a drawer is
// open. Honour the server's existing 90 ms rate window before an authority
// probe, without intercepting or altering any real page request.
async function afterBrowserMove(who) {
  while(Date.now()-who.lastMoveAt<130)await who.page.waitForTimeout(130-(Date.now()-who.lastMoveAt));
}

try {
  const ada = await person("Planet Ada", "cat");
  const bo = await person("Planet Bo", "dog");
  const a = ada.page, b = bo.page;
  const coastBefore = (await snapshot(ada, "/scene/seaside")).sounds;
  await a.waitForFunction(()=>document.getElementById("planet-stage").dataset.people==="2");
  const initial = await snapshot(ada);
  check(initial.sceneId === "planet" && initial.sessionId !== (await snapshot(ada, "/scene/seaside")).sessionId,
    "the little world uses a deliberate separate room while preserving the coastal version");
  await a.waitForFunction(() => document.getElementById("planet-presence").textContent.includes("2"));
  check(initial.online.every(person => !/resident|NPC/.test(person.id)) && initial.online.some(person => person.name === bo.name),
    "the real snapshot contains the two human identities without counting residents as people");
  const clocks=await Promise.all([a,b].map(page=>page.locator("#planet-stage").evaluate(stage=>Number(stage.dataset.serverNow))));
  check(await b.evaluate(()=>window.__planetClockOffset)===3_600_000&&clocks.every(Number.isFinite)&&Math.abs(clocks[0]-clocks[1])<500,
    "actual world clocks stay aligned to server time despite the other visitor's one-hour clock skew");

  await a.waitForFunction(() => document.getElementById("planet-stage").dataset.view === "third");
  assert.equal(Number(await a.locator("#planet-stage").getAttribute("data-camera-distance")),16,"The reviewed coastal framing is the authored initial camera");
  const beforeView = await at(a), viewPosts = ada.posts;
  check(await a.locator("#planet-stage").getAttribute("data-self-visible") === "true", "third person shows the actual local character");
  await a.locator("#planet-view").click();
  await a.waitForFunction(() => document.getElementById("planet-stage").dataset.view === "first");
  check(await a.locator("#planet-stage").getAttribute("data-self-visible") === "false" && samePosition(beforeView, await at(a)) && ada.posts === viewPosts,
    "first person hides the local body without moving the person or publishing a sound");
  await a.locator("#planet-view").click();
  await a.waitForFunction(() => document.getElementById("planet-stage").dataset.view === "third");
  check(samePosition(beforeView, await at(a)), "returning to third person preserves the same admitted position");
  for(let i=0;i<4;i++)await a.getByRole("button",{name:"See more of the world",exact:true}).click();
  await a.waitForFunction(()=>Number(document.getElementById("planet-stage").dataset.cameraDistance)>=24);
  check(samePosition(beforeView,await at(a))&&ada.posts===viewPosts,"zooming out reveals more of the real world without moving the visitor or publishing");
  await shot(a,"planet-whole-world-overview");
  for(let i=0;i<14&&Number(await a.locator("#planet-stage").getAttribute("data-camera-distance"))>6;i++)await a.getByRole("button",{name:"Camera closer",exact:true}).click();
  await a.waitForFunction(()=>Number(document.getElementById("planet-stage").dataset.cameraDistance)<=6);
  check(await a.locator("#planet-stage").getAttribute("data-self-visible")==="true"&&samePosition(beforeView,await at(a)),"camera controls bring the visitor's actual character closer while keeping third person");
  await shot(a,"planet-close-character");
  for(let i=0;i<8&&Number(await a.locator("#planet-stage").getAttribute("data-camera-distance"))<12;i++)await a.getByRole("button",{name:"See more of the world",exact:true}).click();
  await a.waitForFunction(()=>Number(document.getElementById("planet-stage").dataset.cameraDistance)===12);
  check(Math.abs(Number(await a.locator("#planet-stage").getAttribute("data-surface-radius"))-PLANET_RADIUS)<.001,
    "the running visitor stands on the actual spherical surface");
  await openTools(a);
  await a.locator("#planet-environment-settings").click();
  await a.locator("#environment-dialog").waitFor({state:"visible"});
  const targetWeather=initial.environment.weather==="mist"?"clear":"mist";
  await a.locator(`input[name="environment-weather"][value="${targetWeather}"]`).check();
  check(await a.locator("#environment-apply").isEnabled(),"a joined connected visitor can explicitly apply the planet's shared weather");
  const weatherResponse=a.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname.endsWith("/environment"));
  await a.locator("#environment-apply").click();
  const changedWeather=await(await weatherResponse).json();
  assert.ok(changedWeather.ok,"The real shared weather update must be accepted");
  await b.waitForFunction(weather=>document.getElementById("planet-stage").dataset.weather===weather,targetWeather);
  check(true,"the other actual visitor receives and renders the new planet weather through SSE");
  await a.waitForTimeout(1100);
  await a.locator(`input[name="environment-weather"][value="${initial.environment.weather}"]`).check();
  const restoreWeather=a.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname.endsWith("/environment"));
  await a.locator("#environment-apply").click();
  assert.ok((await(await restoreWeather).json()).ok,"The original shared weather must restore explicitly");
  await b.waitForFunction(weather=>document.getElementById("planet-stage").dataset.weather===weather,initial.environment.weather);
  await a.keyboard.press("Escape");
  await a.locator("#environment-dialog").waitFor({state:"hidden"});
  await openTools(a);
  assert.deepEqual((await a.locator("#planet-destinations [data-zone]").evaluateAll(buttons=>buttons.map(button=>button.dataset.zone))).sort(),PLANET_PLACES.map(place=>place.id).sort());
  check(PLANET_PLACES.length===9,"all nine real authored destinations are offered without invented activity counters");
  await closeTools(a);
  const travelPosts=ada.posts;
  for(const place of PLANET_PLACES) {
    await goTo(a,place.id);
    check((await a.locator("#planet-area").textContent())===place.title,`${place.title}: actual world travel reaches its authored area`);
    if(["tea","reading","stage","pool","observatory"].includes(place.id))await shot(a,"planet-place-"+place.id);
  }
  await goTo(a,"green");
  check(ada.posts===travelPosts,"exploring the places never fabricates shared sound contributions");

  const surface = await a.evaluate(async () => {
    const THREE = await import("three");
    const { buildPlanet, onPlanet } = await import("/client/planet-build.js");
    const { PLANET_RADIUS, planetNormal } = await import("/shared/planet.js");
    const build = buildPlanet();
    try {
      let globe;
      build.root.traverse(object => { if (object.isMesh && object.geometry?.type === "SphereGeometry" && object.geometry.parameters.radius === PLANET_RADIUS) globe = object; });
      if (!globe) return { globe: false };
      const positions = globe.geometry.getAttribute("position");
      let maxError = 0;
      for (let i = 0; i < positions.count; i++) maxError = Math.max(maxError, Math.abs(Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)) - PLANET_RADIUS));
      const placements = [[0,0],[55,-8],[-60,16]].map(([x,z]) => {
        const object = new THREE.Object3D(); onPlanet(object,x,z);
        const normal = planetNormal(x,z), up = new THREE.Vector3(0,1,0).applyQuaternion(object.quaternion);
        return { radius: object.position.length(), alignment: up.dot(new THREE.Vector3(normal.x,normal.y,normal.z)) };
      });
      return { globe: true, maxError, placements };
    } finally { build.dispose(); }
  });
  check(surface.globe && surface.maxError < .0001 && surface.placements.every(placement => Math.abs(placement.radius - PLANET_RADIUS) < .0001 && placement.alignment > .9999),
    "the actual production build contains a sphere and places figures upright on its curved surface");
  await shot(a, "planet-third-person-world");

  const source = await place(ada, "guitar");
  await Promise.all([a,b].map(page=>page.waitForFunction(id=>JSON.parse(document.getElementById("planet-stage").dataset.residentResponses??"[]")
    .some(response=>response.sourceId===id&&response.behavior==="sway"),source.id)));
  check(await b.locator("#planet-sound").getAttribute("aria-pressed")==="false"&&await b.evaluate(()=>window.__planetAudioStarts)===0,
    "actual planet residents respond to the public source in both pages while the listener's Sound off remains silent");
  await openSounds(b);
  await card(b, source.id).waitFor();
  check((await card(b, source.id).textContent()).includes(ada.name), "another real person receives the attributed contribution through SSE");
  const beforeReply = bo.posts;
  await card(b, source.id).locator("[data-planet-reply]").click();
  await b.locator("#sound-palette").waitFor({ state: "visible" });
  check(bo.posts === beforeReply, "choosing Reply names a source without publishing an answer");
  const answer = await place(bo, "hand-claps", false);
  check(answer.replyTo?.id === source.id && answer.replyTo?.by === ada.name, "the second person explicitly leaves an attributed persistent reply");
  await openSounds(a);
  await card(a, answer.id).waitFor();
  check((await card(a, answer.id).textContent()).includes(bo.name), "both pages receive the same new reply");
  await closeSounds(a);
  const beforeReload = ada.posts;
  await a.reload();
  await a.waitForFunction(() => !!document.getElementById("planet-stage").dataset.at);
  await openSounds(a);
  await card(a, answer.id).waitFor();
  check(ada.posts === beforeReload && (await snapshot(ada)).sounds.some(sound => sound.id === source.id), "a late snapshot preserves sounds and relationships without resending a draft");
  const removedSource=a.waitForResponse(response=>response.request().method()==="DELETE"&&new URL(response.url()).pathname.endsWith("/sounds/"+source.id));
  await card(a,source.id).locator("[data-planet-remove]").click();
  assert.ok((await(await removedSource).json()).ok,"The in-reach parent removal must be accepted by real server authority");
  await openSounds(b);
  await Promise.all([a,b].map(page=>page.waitForFunction(({source,answer})=>!document.querySelector(`.planet-sound-card[data-id="${source}"]`)
    &&!!document.querySelector(`.planet-sound-card[data-id="${answer}"]`),{source:source.id,answer:answer.id})));
  check((await snapshot(bo)).sounds.find(sound=>sound.id===answer.id)?.replyTo?.removedAt,
    "normal UI removal clears a parent in both pages while its friend's attributed answer remains durable");
  await closeSounds(b);
  await closeSounds(a);

  await openTools(a);
  await a.locator("#planet-chat-toggle").click();
  await a.locator("#planet-chat-input").fill("Shall we make a little jam?");
  await a.locator("#planet-chat-submit").click();
  await b.locator("#planet-chat-log").filter({ hasText: "Shall we make a little jam?" }).waitFor();
  check(true, "nearby friends receive the actual ephemeral chat message");
  await a.locator("#planet-chat-close").click();

  await b.setViewportSize({ width: 375, height: 812 });
  await b.locator("#planet-place").click();
  await b.locator('[data-intention="cozy"]').click();
  check(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth
    && [...document.querySelectorAll(".library-intentions button")].every(button => button.getBoundingClientRect().height >= 44)),
    "phone sound ideas preserve labels and forty-four-pixel touch controls without horizontal overflow");
  await b.locator(".library-close").focus();
  await b.keyboard.press("Shift+Tab");
  check(await b.evaluate(() => document.activeElement.closest("dialog")?.id === "sound-palette"), "phone library keyboard focus stays in the native dialog");
  await shot(b, "planet-phone-sound-library");
  await b.keyboard.press("Escape");
  await b.locator("#sound-palette").waitFor({ state: "hidden" });
  await openTools(b);
  const toolsPosts = bo.posts, toolsAt = await at(b);
  await b.locator("#planet-help summary").click();
  await b.selectOption("#planet-look-settings", "scene");
  check(await b.evaluate(() => localStorage.getItem("soac-look-mode")) === "scene", "the alternate pointer direction remains explicitly configurable");
  await b.locator("#planet-tools-close").focus();
  for (const key of [...Array(28).fill("Tab"),...Array(10).fill("Shift+Tab")]) {
    await b.keyboard.press(key);
    assert.ok(await mainDialog(b).evaluate(dialog => dialog.contains(document.activeElement)), "Focus must remain in the tools drawer");
  }
  check(samePosition(toolsAt, await at(b)) && bo.posts === toolsPosts, "phone tools and look preferences never publish or move the visitor");
  await mainDialog(b).evaluate(dialog=>dialog.scrollTop=0);
  await shot(b, "planet-phone-places-drawer");
  await closeTools(b);
  await shot(b, "planet-phone-world");
  const phonePosts=bo.posts,phoneAt=await at(b);
  check(await b.locator(".planet-touch button").evaluateAll(buttons=>buttons.length===4&&buttons.every(button=>{
    const rect=button.getBoundingClientRect();return rect.width>=44&&rect.height>=44&&rect.left>=0&&rect.right<=innerWidth;
  })),"the real phone world exposes four reachable forty-four-pixel movement controls");
  check(await b.locator(".planet-zoom button").evaluateAll(buttons=>buttons.length===2&&buttons.every(button=>{
    const rect=button.getBoundingClientRect();return rect.width>=44&&rect.height>=44&&rect.left>=0&&rect.right<=innerWidth;
  })),"phone camera controls remain visible with separate forty-four-pixel targets");
  const forward=await b.getByRole("button",{name:"Move forward",exact:true}).boundingBox();
  await b.mouse.move(forward.x+forward.width/2,forward.y+forward.height/2);
  await b.mouse.down();
  try{await b.waitForTimeout(650);}finally{await b.mouse.up();}
  await b.waitForFunction(before=>{
    const at=document.getElementById("planet-stage").dataset.at?.split(",").map(Number);
    return at&&Math.hypot(at[0]-before[0],at[1]-before[1])>.25;
  },phoneAt);
  check(bo.posts===phonePosts,"holding the actual phone arrow walks on the world without publishing a sound");
  await b.setViewportSize({ width: 1440, height: 960 });

  // Use the normal destination UI for a seam fixture, as the legacy hut suite
  // does with a local catalogue spawn. Real move requests, SSE and room rules
  // still decide whether the nearby people can share, talk and remove.
  const originals = [];
  for (const [who, x] of [[ada, PLANET_HALF - .7], [bo, -PLANET_HALF + .7]]) {
    const original = await who.page.evaluate(async x => {
      const { PLANET_PLACES } = await import("/shared/planet.js");
      const destination = PLANET_PLACES.find(place => place.id === "observatory");
      const before = { x: destination.x, z: destination.z }; destination.x = x; destination.z = 0; return before;
    }, x);
    originals.push({ who, original });
    await goTo(who.page, "observatory");
  }
  try {
    const seamA = await at(a), seamB = await at(b);
    check(Math.abs(seamA[0] - seamB[0]) > PLANET_HALF && planetDistance({x:seamA[0],z:seamA[1]},{x:seamB[0],z:seamB[1]}) < 2,
      "actual visitors can stand on opposite coordinate sides of the same nearby curved-world seam");
    await a.waitForTimeout(1100);
    const seamSound = await place(ada, "evening-forest");
    const duplicate = await bo.context.request.post(`${base}/api/sessions/${bo.sessionId}/sounds`, { data: { soundId: "evening-forest" } });
    const refused = await duplicate.json();
    check(!refused.ok && refused.code === "too_close", "the actual server enforces same-sound spacing by spherical distance across the seam");
    const remove = await bo.context.request.delete(`${base}/api/sessions/${bo.sessionId}/sounds/${seamSound.id}`);
    check(remove.ok() && (await remove.json()).ok, "a real nearby person can remove a contribution across the coordinate seam");
  } finally {
    for (const { who, original } of originals) await who.page.evaluate(async original => {
      const { PLANET_PLACES } = await import("/shared/planet.js");
      Object.assign(PLANET_PLACES.find(place=>place.id === "observatory"),original);
    }, original);
  }

  await Promise.all([goTo(a,"restrooms"),goTo(b,"restrooms")]);
  if (await b.locator("#planet-sound").getAttribute("aria-pressed") !== "true") await b.locator("#planet-sound").click();
  const beforeRoutine = (await snapshot(ada)).sounds;
  await openTools(a);
  await a.locator(".planet-restroom summary").click();
  const invited = a.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/npc-restroom"));
  await a.locator("#planet-test-restroom").click();
  const invitation = await (await invited).json();
  check(invitation.ok && invitation.npcs.some(npc => npc.phase === "walking"), "the visible restroom check starts a real authoritative resident routine");
  const hut = PLANET_HUTS.find(item=>item.kind.endsWith("toilet"));
  const waitNpc = (page, expected) => page.waitForFunction(expected=>{
    const stage=document.getElementById("planet-stage");
    const npcs=JSON.parse(stage.dataset.npcRoutines ?? stage.dataset.npcs ?? "[]");
    return npcs.some(npc=>npc.hutId===expected.hutId
      &&(expected.phase===undefined||npc.phase===expected.phase)
      &&(expected.occupying===undefined||npc.occupying===expected.occupying)
      &&(!expected.flush||!!npc.flushId));
  },expected,{timeout:25000});
  await Promise.all([a,b].map(page=>waitNpc(page,{hutId:hut.id,phase:"occupied",occupying:true})));
  await Promise.all([a,b].map(page=>page.waitForFunction(id=>{
    const door=JSON.parse(document.getElementById("planet-stage").dataset.huts??"[]").find(door=>door.id===id);
    return door?.taken&&Math.abs(door.angle)<.07;
  },hut.id)));
  check(true,"both real renderers show the occupied restroom door shut and claimed");
  await afterBrowserMove(bo);
  const denied = await bo.context.request.post(`${base}/api/sessions/${bo.sessionId}/move`, { data: {x:(hut.door.x0+hut.door.x1)/2,z:hut.z1-1.2,yaw:Math.PI} });
  const denial = await denied.json();
  check(denied.status()===409 && denial.code==="hut_taken", "a human cannot bypass the actual occupied restroom while the resident is inside");
  const starts=await b.evaluate(()=>window.__planetAudioStarts);
  await waitNpc(b,{hutId:hut.id,phase:"flushing",flush:true});
  await b.waitForFunction(starts=>window.__planetAudioStarts>starts&&Number(document.getElementById("planet-stage").dataset.npcFlushVoices)>0,starts);
  check(true,"the real shared flush phase starts a transient spatial recording for a nearby listener");
  await shot(b,"planet-resident-restroom");
  await waitNpc(b,{hutId:hut.id,phase:"leaving",occupying:false});
  await b.waitForTimeout(1100);
  await afterBrowserMove(bo);
  const enter=await bo.context.request.post(`${base}/api/sessions/${bo.sessionId}/move`, {data:{x:(hut.door.x0+hut.door.x1)/2,z:hut.z1-1.2,yaw:Math.PI}});
  check(enter.ok()&&(await enter.json()).ok,"the same authoritative door releases admission after the resident exits");
  await b.waitForTimeout(1100);
  await bo.context.request.post(`${base}/api/sessions/${bo.sessionId}/move`,{data:{x:(hut.door.x0+hut.door.x1)/2,z:hut.z1+1.5,yaw:0}});
  assert.deepEqual((await snapshot(ada)).sounds,beforeRoutine,"A resident visit/flush must never manufacture persistent public sounds");
  check(true,"the restroom routine leaves the actual persistent contribution snapshot unchanged");
  assert.deepEqual((await snapshot(ada,"/scene/seaside")).sounds,coastBefore,"Planet interactions must not alter old coastal contributions");
  check(true,"the previous coastal edition retains exactly the same sound data");
  check(errors.length===0,"no browser page errors: "+errors.join(" | "));
} catch(error) {
  assertionFailed=true;
  for(const {page,name} of people)if(!page.isClosed())await shot(page,"failure-"+name.replaceAll(" ","-")).catch(()=>undefined);
  throw error;
} finally {
  const cleanupErrors=[];
  await Promise.all(people.map(({page})=>page.close().catch(()=>undefined)));
  for(const {who,sound} of made) {
    await new Promise(resolve=>setTimeout(resolve,1100));
    try {
      const move=await who.context.request.post(`${base}/api/sessions/${who.sessionId}/move`,{data:{x:sound.x,z:sound.z,yaw:0}}),moved=await move.json();
      assert.ok(move.ok()&&moved.ok,`Cleanup move failed: ${JSON.stringify(moved)}`);
      const response=await who.context.request.delete(`${base}/api/sessions/${who.sessionId}/sounds/${sound.id}`),result=await response.json();
      assert.ok((response.ok()&&result.ok)||result.code==="gone",`Cleanup removal failed: ${JSON.stringify(result)}`);
    }catch(error){cleanupErrors.push(new Error(`Cleanup ${sound.id}: ${error.message}`,{cause:error}));}
  }
  if(made.length) {
    try {
      const current=await snapshot(made[0].who),ids=new Set(made.map(({sound})=>sound.id));
      assert.deepEqual(current.sounds.filter(sound=>ids.has(sound.id)&&!sound.removedAt).map(sound=>sound.id),[],"All test-created ordinary contributions must be soft-removed");
      check(true,"the final real snapshot confirms cleanup of every test contribution");
    }catch(error){cleanupErrors.push(new Error(`Cleanup verification: ${error.message}`,{cause:error}));}
  }
  await browser.close();
  for(const error of cleanupErrors)console.error(error.message);
  if(cleanupErrors.length&&!assertionFailed)throw new AggregateError(cleanupErrors,"Planet cleanup failed");
}
