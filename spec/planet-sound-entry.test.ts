import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { renderPlanet } from "../src/html.ts";
import { createDefaultEnvironment } from "../src/shared/environment.ts";
import { placementAvailability } from "../src/shared/chorus-placement.ts";
import { sceneHutAt } from "../src/shared/planet.ts";
import type { Position, Snapshot } from "../src/shared/protocol.ts";

const snapshot: Snapshot = { type: "snapshot", sessionId: "ses_entry", sceneId: "planet", serverNow: "2026-11-08T00:00:00Z", online: [], you: null, sounds: [], environment: createDefaultEnvironment("2026-11-08T00:00:00Z") };
const styles = readFileSync("src/client/style.css", "utf8");

// Run the actual entry/access functions. Only dialog, rendering and transport
// adapters are replaced; the real spherical/hut/room-density checks execute.
// No browser, audio context, network request or database is constructed.
function controller() {
  const source = readFileSync("src/client/planet.ts", "utf8");
  const tree = ts.createSourceFile("planet.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set(["creationAvailability", "publishPublicSound", "refreshCreationAccess", "openLibrary", "openListeningSettings"]);
  const functions = tree.statements.filter(statement => ts.isFunctionDeclaration(statement) && statement.name && names.has(statement.name.text));
  expect(functions).toHaveLength(names.size);
  const implementation = ts.transpileModule(functions.map(statement => statement.getText(tree)).join("\n"), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const dom = new JSDOM(renderPlanet(snapshot, false));
  const doc = dom.window.document;
  doc.body.insertAdjacentHTML("beforeend", '<dialog id="test-studio"></dialog><dialog id="test-library"><p id="access-note"></p><ul><li><button data-listen="chorus-bells">Listen</button><button data-sound="chorus-bells">Leave it here</button></li><li><button data-sound="trickle">Leave it here</button></li></ul></dialog>');
  const adapters = { publish:vi.fn(async()=>null),preview:vi.fn(),pause:vi.fn(),arrival:vi.fn(),studio:vi.fn(),library:vi.fn(),openTools:vi.fn() };
  doc.querySelector<HTMLButtonElement>("[data-listen]")!.onclick=()=>adapters.preview();
  const harness = new Function("document", "adapters", "sceneHutAt", "placementAvailability", `
    let connected=true,boot={joined:true},disposed=false,publicSoundPending=false,reply=null;
    const sounds=new Map(),chorus=[],world={at:{x:0,z:3,yaw:Math.PI},canPlaceAt:()=>true,setPaused:adapters.pause};
    const $=id=>document.getElementById(id),tools=$('planet-tools-panel'),arrival=$('planet-join');
    const library={element:$('test-library'),setReply:()=>{},open:()=>{library.element.open=true;adapters.library();}};
    const studio={element:$('test-studio'),setWorks:()=>{},open:()=>{studio.element.open=true;adapters.studio();}};
    const creationNotes=new Map([[library.element,$('access-note')]]);
    const show=dialog=>{dialog.hidden=false;dialog.open=true;adapters.arrival();};
    const leaveSound=adapters.publish,openTools=opener=>{tools.hidden=false;tools.open=true;adapters.openTools(opener.id);};
    ${implementation}
    return {open:full=>openLibrary(full),publish:id=>publishPublicSound(id),refresh:()=>refreshCreationAccess(),availability:id=>creationAvailability(id),
      joined:value=>{boot.joined=value;refreshCreationAccess();},connected:value=>{connected=value;refreshCreationAccess();},at:value=>{world.at=value;refreshCreationAccess();},
      sources:rows=>{sounds.clear();for(const row of rows)sounds.set(row.id,row);refreshCreationAccess();},settings:()=>openListeningSettings(),dispose:()=>{disposed=true;}};
  `)(doc,adapters,sceneHutAt,placementAvailability) as {
    open(full:boolean):void;publish(id:string):Promise<string|null>;refresh():void;availability(id:string):{allowed:boolean;reason:string};
    joined(value:boolean):void;connected(value:boolean):void;at(value:Position):void;sources(rows:unknown[]):void;settings():void;dispose():void;
  };
  return {harness,adapters,doc,dispose:()=>{harness.dispose();dom.window.close();}};
}

describe("a permanent entrance to shared sounds", () => {
  it.each([
    '<aside class="chorus-dock" data-collapsed="false">A living work</aside>',
    '<aside class="chorus-dock" data-collapsed="true">A dismissed work</aside>',
    '<aside id="sound-discovery">A nearby example</aside>',
    '<aside class="planet-restroom-card">A private stay</aside>',
  ])("keeps Share visible when a world card is present: %s", card => {
    const dom = new JSDOM(renderPlanet(snapshot, false));
    try {
      const doc = dom.window.document, style = doc.createElement("style");style.textContent = styles;doc.head.append(style);
      doc.getElementById("planet-stage")!.insertAdjacentHTML("beforeend", card);
      const entry = doc.getElementById("planet-place")!;
      expect(entry.hidden).toBe(false);
      expect(dom.window.getComputedStyle(entry).display, "a contextual card must never remove the shared creation entrance").not.toBe("none");
      expect(entry.textContent).toContain("Share a sound");
    } finally { dom.window.close(); }
  });

  it("provides one direct listening-settings entrance and one set of real local preferences", () => {
    const dom = new JSDOM(renderPlanet(snapshot, false));
    try {
      const doc = dom.window.document, entry = doc.getElementById("planet-listening-settings");
      expect(entry?.getAttribute("aria-label")).toContain("Listening settings");
      expect(entry?.getAttribute("aria-controls")).toBe("planet-tools-panel");
      expect(doc.querySelectorAll("#chorus-volume")).toHaveLength(1);
      expect(doc.querySelectorAll("#planet-examples")).toHaveLength(1);
      expect(doc.getElementById("planet-listening-settings-section")?.textContent).toContain("Only what you hear");
    } finally { dom.window.close(); }
  });

  it("routes an unjoined Share through the arrival choice without publishing or enabling audio", () => {
    const {harness,adapters,dispose}=controller();
    try {
      harness.joined(false);harness.open(false);
      expect(adapters.arrival).toHaveBeenCalledOnce();expect(adapters.studio).not.toHaveBeenCalled();expect(adapters.library).not.toHaveBeenCalled();
      expect(adapters.publish).not.toHaveBeenCalled();expect(adapters.preview).not.toHaveBeenCalled();
    } finally {dispose();}
  });

  it("keeps private Listen available through disconnection, then requires a separate explicit Leave after reconnecting",async()=>{
    const {harness,adapters,doc,dispose}=controller();
    try {
      harness.connected(false);harness.open(true);
      expect(doc.querySelector<HTMLButtonElement>('[data-sound="chorus-bells"]')!.disabled).toBe(true);
      expect(doc.getElementById("access-note")!.textContent).toContain("Listen privately");
      doc.querySelector<HTMLButtonElement>("[data-listen]")!.click();expect(adapters.preview).toHaveBeenCalledOnce();
      expect(await harness.publish("chorus-bells")).toContain("Reconnecting");expect(adapters.publish).not.toHaveBeenCalled();
      harness.connected(true);
      expect(doc.querySelector<HTMLButtonElement>('[data-sound="chorus-bells"]')!.disabled).toBe(false);
      expect(adapters.publish).not.toHaveBeenCalled();expect(await harness.publish("chorus-bells")).toBeNull();
      expect(adapters.publish).toHaveBeenCalledExactlyOnceWith("chorus-bells");
    } finally {dispose();}
  });

  it("explains a private stay and a crowded corner without sending public sounds or removing the entry",async()=>{
    const {harness,adapters,doc,dispose}=controller();
    try {
      harness.at({x:13.5,z:5,yaw:0});harness.open(true);
      expect(doc.getElementById("access-note")!.textContent).toContain("private stay");
      expect(await harness.publish("chorus-bells")).toContain("step outside");
      harness.at({x:0,z:3,yaw:0});
      harness.sources(Array.from({length:6},(_,index)=>({id:"old-"+index,soundId:"trickle",x:index*.1,z:3,by:"A friend",byId:"friend",at:"2026-11-08T00:00:00Z"})));
      expect(harness.availability("chorus-bells").allowed).toBe(false);
      expect(await harness.publish("chorus-bells")).toContain("six sounds");
      expect(doc.querySelector(".planet-library-placement")!.textContent).toContain("six sounds");
      expect(adapters.publish).not.toHaveBeenCalled();
      expect(doc.querySelector<HTMLButtonElement>("[data-listen]")!.disabled).toBe(false);
      expect(doc.getElementById("planet-place")!.hidden).toBe(false);
    } finally {dispose();}
  });

  it("opens the actual listening preferences without changing consent, volume or example choice",()=>{
    const {harness,adapters,doc,dispose}=controller();
    try {
      const volume=doc.getElementById("chorus-volume") as HTMLInputElement,examples=doc.getElementById("planet-examples") as HTMLInputElement;
      volume.value="37";examples.checked=false;
      harness.settings();
      expect(adapters.openTools).toHaveBeenCalledExactlyOnceWith("planet-listening-settings");
      expect(doc.activeElement?.id).toBe("planet-listening-toggle");expect(volume.value).toBe("37");expect(examples.checked).toBe(false);
      expect(adapters.publish).not.toHaveBeenCalled();expect(adapters.preview).not.toHaveBeenCalled();
    } finally {dispose();}
  });
});
