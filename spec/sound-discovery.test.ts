import { JSDOM } from "jsdom";
import {afterEach,it,expect,vi} from "vitest";
import {SoundDiscovery} from "../src/client/sound-discovery.ts";
import {worldSoundExamples} from "../src/shared/sound-life.ts";
import type {PlacedSound} from "../src/shared/protocol.ts";
let dom:JSDOM|undefined,guide:SoundDiscovery|undefined;
afterEach(()=>{guide?.dispose();dom?.window.close();vi.unstubAllGlobals();});
function fixture(){
  dom=new JSDOM('<!doctype html><form id="planet-chat" hidden></form><main></main>');vi.stubGlobal("document",dom.window.document);
  let modal=false,on=true,sources:PlacedSound[]=[];const query=document.querySelector.bind(document);
  vi.spyOn(document,"querySelector").mockImplementation(selector=>selector==="dialog:modal"?modal?document.body:null:query(selector));
  const examples=worldSoundExamples("room"),at={x:examples[0].x,z:examples[0].z,yaw:0};
  const opts={at:()=>at,sources:()=>sources,blueprints:()=>examples,enabled:()=>on,setEnabled:vi.fn((value:boolean)=>{on=value;}),listen:vi.fn(async()=>true),stop:vi.fn(),create:vi.fn()};
  guide=new SoundDiscovery(document.querySelector("main")!,opts);guide.frame();
  return {opts,examples,setModal:(value:boolean)=>{modal=value;guide!.frame();},setSources:(value:PlacedSound[])=>{sources=value;guide!.frame();}};
}
it("a modal cancels an in-flight private listen without publishing or claiming successful playback",async()=>{
  const f=fixture();let finish!:(ok:boolean)=>void;f.opts.listen.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  document.getElementById("sound-discovery-listen")!.click();const before=f.opts.stop.mock.calls.length;
  f.setModal(true);expect(f.opts.stop.mock.calls.length).toBeGreaterThan(before);finish(true);await Promise.resolve();await Promise.resolve();
  expect(document.getElementById("sound-discovery-feedback")!.textContent).not.toContain("Only your preview");expect(f.opts.create).not.toHaveBeenCalled();
});
it("credits the real source while local comparison and dismissal preserve the contribution",()=>{
  const f=fixture(),source:PlacedSound={...f.examples[0],id:"real",by:"Ada",byId:"ada",origin:undefined} as PlacedSound;
  f.setSources([source]);expect(document.getElementById("sound-discovery-origin")!.textContent).toContain("By Ada");
  document.getElementById("sound-example-compare")!.click();expect(f.opts.setEnabled).toHaveBeenCalledWith(false);expect(document.getElementById("sound-discovery-origin")!.textContent).toContain("By Ada");
  document.getElementById("sound-discovery-close")!.click();expect(guide!.panel.hidden).toBe(true);expect(document.getElementById("sound-discovery-reopen")!.hidden).toBe(false);
  document.getElementById("sound-discovery-reopen")!.click();expect(guide!.panel.hidden).toBe(false);expect(source.byId).toBe("ada");expect(f.opts.create).not.toHaveBeenCalled();
});
it("a hidden guide never stops the chooser's unrelated preview after a friend's update",()=>{
  const f=fixture();f.setModal(true);const stopped=f.opts.stop.mock.calls.length;
  const source:PlacedSound={...f.examples[0],soundId:"cafe-music",id:"friend",by:"Bo",byId:"bo",origin:undefined} as PlacedSound;
  f.setSources([source]);guide!.frame();
  expect(f.opts.stop).toHaveBeenCalledTimes(stopped);
  expect(guide!.panel.hidden).toBe(true);
  f.setModal(false);expect(document.getElementById("sound-discovery-origin")!.textContent).toContain("By Bo");
});
