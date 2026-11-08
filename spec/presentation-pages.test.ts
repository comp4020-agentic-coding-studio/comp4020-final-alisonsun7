import { JSDOM } from "jsdom";
import { describe,expect,inject,it } from "vitest";
const base=inject("baseUrl");
const page=async(path:string)=>new JSDOM(await (await fetch(new URL(path,base))).text()).window.document;
const boot=(doc:Document)=>JSON.parse(doc.getElementById("planet-boot")!.textContent!);
describe("retired comparison links find the retained 3D room",()=>{
 it("keeps existing session, source history and 3D controls through old links",async()=>{
  const views=await Promise.all([page("/planet"),page("/planet?view=2d"),page("/planet?view=2.5d"),page("/planet/flat")]);
  const snapshots=views.map(doc=>boot(doc).snapshot);
  expect(snapshots.every(s=>s.sessionId===snapshots[0].sessionId)).toBe(true);
  expect(snapshots.every(s=>s.sceneId==="planet")).toBe(true);
  for(const source of snapshots)expect(source.sounds).toEqual(snapshots[0].sounds);
  for(const doc of views){expect(doc.getElementById("planet-stage")!.dataset.presentation).toBe("3d");expect(boot(doc).view).toBe("3d");expect(doc.querySelectorAll(".planet-presentations")).toHaveLength(0);}
 });
 it.each(["2d","2.5d"])("retains %s invitation and place context through a same-site canonical redirect",async view=>{
  const response=await fetch(new URL(`/planet?view=${view}&zone=tea&work=snd_previous`,base),{redirect:"manual"});
  expect(response.status).toBe(303);expect(response.headers.get("location")).toBe("/planet?zone=tea&work=snd_previous");
  const doc=await page(response.headers.get("location")!);
  expect(boot(doc).view).toBe("3d");expect(doc.querySelector<HTMLInputElement>('input[name="next"]')!.value).toBe("/planet?work=snd_previous");
 });
 it.each(["/2d","/2.5d","/planet/flat","/planet/2d","/planet/2.5d"])("retires %s without creating another presentation",async path=>{
  const response=await fetch(new URL(path+"?zone=pool&work=snd_previous",base),{redirect:"manual"});expect(response.status).toBe(303);expect(response.headers.get("location")).toBe("/planet?zone=pool&work=snd_previous");
 });
 it("canonicalises an unknown presentation to the retained 3D default",async()=>{
  const doc=await page("/planet?view=unrecognised");expect(boot(doc).view).toBe("3d");expect(doc.body.classList.contains("planet-flat")).toBe(false);
 });
 it.each(["/client/flat-world.js","/client/flat-art.js","/client/presentation-handoff.js"])("does not serve retired runtime %s",async path=>{
  expect((await fetch(new URL(path,base))).status).toBe(404);
 });
 it("leaves the separate coastal edition and its room available",async()=>{
  const planet=boot(await page("/planet")).snapshot;
  const coast=await page("/scene/seaside"),coastBoot=JSON.parse(coast.getElementById("boot")!.textContent!);
  expect(coastBoot.sceneId).toBe("seaside");expect(coastBoot.snapshot.sessionId).not.toBe(planet.sessionId);
  expect(coast.querySelectorAll("#zones a").length).toBeGreaterThan(0);
 });
});
