import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlanetSoundInteractions } from "../src/client/planet-sound-interactions.ts";
import type { PlacedSound } from "../src/shared/protocol.ts";
let dom: JSDOM, panel: PlanetSoundInteractions;
const source = {id:"source", soundId:"chorus-bells", by:"Nick", byId:"nick", x:0,z:0,at:"2026-11-07T00:00:00Z"} as PlacedSound;
beforeEach(()=>{
  dom = new JSDOM('<main id="host"></main><form id="planet-chat" hidden></form>');
  vi.stubGlobal("document",dom.window.document);
  const host=document.getElementById("host")!;Object.defineProperties(host,{clientWidth:{value:1920},clientHeight:{value:1080}});
  panel = new PlanetSoundInteractions(host,{at:()=>({x:0,z:0}),project:()=>({x:800,y:400,visible:true}),available:()=>true,respond:vi.fn(),conversation:vi.fn(),remove:vi.fn(),reaction:()=>""});
});
afterEach(()=>{panel.dispose();vi.unstubAllGlobals();dom.window.close();});
it("keeps a dismissed nearby card closed through incoming state, with a reachable explicit reopen",()=>{
  panel.setAll([source]);expect(document.getElementById("planet-nearby-sound")!.hidden).toBe(false);
  document.getElementById("planet-nearby-close")!.click();
  panel.setAll([source]);expect(document.getElementById("planet-nearby-sound")!.hidden).toBe(true);
  expect(document.getElementById("planet-nearby-reopen")!.hidden).toBe(false);
  document.getElementById("planet-nearby-reopen")!.click();
  expect(document.getElementById("planet-nearby-sound")!.hidden).toBe(false);
});
it("also reopens a dismissed source by selecting its actual world pin",()=>{
  panel.setAll([source]);document.getElementById("planet-nearby-close")!.click();
  document.querySelector<HTMLButtonElement>(".planet-sound-pin")!.click();
  expect(document.getElementById("planet-nearby-sound")!.hidden).toBe(false);
  panel.setAll([]);expect(document.getElementById("planet-nearby-reopen")!.hidden).toBe(true);
});
