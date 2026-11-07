import { JSDOM } from "jsdom";
import { describe,expect,inject,it } from "vitest";
const base=inject("baseUrl");
const page=async(path:string)=>new JSDOM(await (await fetch(new URL(path,base))).text()).window.document;
const boot=(doc:Document)=>JSON.parse(doc.getElementById("planet-boot")!.textContent!);
describe("three lenses on one durable planet room",()=>{
 it("uses the same existing session and source history across all presentation routes",async()=>{
  const views=await Promise.all([page("/planet"),page("/planet?view=2d"),page("/planet?view=2.5d")]);
  const snapshots=views.map(doc=>boot(doc).snapshot);
  expect(snapshots.every(s=>s.sessionId===snapshots[0].sessionId)).toBe(true);
  expect(snapshots.map(s=>s.sounds)).toEqual([snapshots[0].sounds,snapshots[0].sounds,snapshots[0].sounds]);
  expect(views.map(doc=>doc.getElementById("planet-stage")!.dataset.presentation)).toEqual(["3d","2d","2.5d"]);
 });
 it.each(["2d","2.5d"])("keeps %s through both JavaScript and native join targets",async view=>{
  const doc=await page("/planet?view="+view);
  expect(boot(doc).view).toBe(view);expect(doc.querySelector<HTMLInputElement>('input[name="next"]')!.value).toBe("/planet?view="+view);
  expect(doc.querySelector('#planet-presentations a[aria-current="page"]')?.getAttribute("data-presentation")).toBe(view);
  expect(doc.querySelectorAll("#planet-presentations-settings a").length).toBe(3);
 });
 it.each(["2d","2.5d"])("provides a short %s link without creating a room",async view=>{
  const response=await fetch(new URL("/"+view,base),{redirect:"manual"});expect(response.status).toBe(303);expect(response.headers.get("location")).toBe("/planet?view="+view);
 });
 it("treats an unknown presentation as the retained 3D default",async()=>{
  const doc=await page("/planet?view=unrecognised");expect(boot(doc).view).toBe("3d");expect(doc.body.classList.contains("planet-flat")).toBe(false);
 });
});
