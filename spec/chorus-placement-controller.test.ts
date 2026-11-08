import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { chorusPlaceAt, deriveChorusWorks } from "../src/shared/chorus.ts";
import { placementAvailability, findNearbyPlan } from "../src/shared/chorus-placement.ts";
import { PLANET_PLACES, planetDistance, sceneHutAt } from "../src/shared/planet.ts";
import { findSound } from "../src/shared/sounds.ts";
import type { Position, SoundReference } from "../src/shared/protocol.ts";

const stage: Position = { x: 10, z: -5, yaw: Math.PI };
const staleGreen: Position = { x: 0, z: 3, yaw: Math.PI };
const oldGreen: SoundReference = { id: "snd_old_green", soundId: "chorus-chords", by: "Nick", byId: "nick", ...staleGreen, at: "2026-11-08T00:00:00Z" };
interface Cancellation { chat?: boolean; modal?: boolean; walking?: boolean; revision?: number }

// Execute the actual private controller declarations and the actual studio
// position/availability hooks. DOM/view/transport adapters replace the browser;
// the real spherical planner and contribution projection run. This neither
// launches a renderer nor makes an HTTP request. A frozen source path permits
// a negative control without overwriting the candidate during another build.
function controller(cancellation?: Cancellation) {
  const path = resolve(process.env.CHORUS_PLACEMENT_CONTROLLER_SOURCE ?? "src/client/planet.ts");
  const source = readFileSync(path, "utf8"), tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set(["makeRoom", "updatePlacementPlan", "cancelPlacement", "creationAvailability"]), snippets: string[] = [];
  let hooks: ts.ObjectLiteralExpression | undefined;
  for (const statement of tree.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && names.has(statement.name.text)) snippets.push(statement.getText(tree));
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "studio" || !declaration.initializer || !ts.isNewExpression(declaration.initializer)) continue;
      const options = declaration.initializer.arguments?.[1];
      if (options && ts.isObjectLiteralExpression(options)) hooks = options;
    }
  }
  expect(snippets, "extract the actual placement functions and their shared availability guard").toHaveLength(4);
  const hookSource = hooks?.properties.filter(property => property.name && ["at", "availability"].includes(property.name.getText(tree))).map(property => property.getText(tree));
  expect(hookSource, "extract the real studio position and availability bindings").toHaveLength(2);
  const implementation = ts.transpileModule(`const studioHooks={${hookSource!.join(",")}};\n${snippets.join("\n")}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const dom = new JSDOM('<!doctype html><input id="typing" value="Keep my draft"><form id="planet-chat" hidden></form><dialog id="other"></dialog><dialog id="studio"><p class="chorus-feedback"></p><button data-leave="chorus-chords" disabled>Leave it here</button></dialog>');
  const document = dom.window.document, dialog = document.getElementById("studio") as HTMLDialogElement;
  dialog.open = !cancellation;
  const input = document.getElementById("typing") as HTMLInputElement;input.focus();
  const chat = document.getElementById("planet-chat")!;chat.hidden = !cancellation?.chat;
  const modal = document.getElementById("other")!;
  const documentAdapter = { querySelector: (selector: string) => selector === "dialog:modal" ? cancellation?.modal ? modal : null : document.querySelector(selector) };
  const adapters = { afterDialogClose: vi.fn(), walkToward: vi.fn(() => true), publish: vi.fn(), openLibrary: vi.fn(), cancelWalking: vi.fn(), focusWorld: vi.fn(), notices: [] as string[] };
  const harness = new Function("document", "realDocument", "dialog", "adapters", "initial", "cancellation", "chorusPlaceAt", "planetDistance", "findNearbyPlan", "placementAvailability", "findSound", "PLANET_PLACES", "deriveChorusWorks", "sceneHutAt", `
    let here={...initial.staleGreen}, reply=null, walkingReply=null, lastSent='';
    const boot={joined:true},connected=true;
    const sounds=new Map([[initial.oldGreen.id,initial.oldGreen]]),ended=new Set();
    const chorus=deriveChorusWorks([...sounds.values()]);
    let walking=cancellation?.walking ?? true,revision=cancellation?.revision ?? 7;
    const world={at:{...initial.stage},canPlaceAt:()=>true,get walkingIntent(){return walking;},get walkingIntentRevision(){return revision;},
      walkToward:adapters.walkToward,cancelWalkingIntent:()=>{adapters.cancelWalking();walking=false;revision++;},focus:adapters.focusWorld};
    const placementIntent={hidden:false},placementText={textContent:''};
    let placementPlan=cancellation?{soundId:'chorus-chords',parent:null,target:{...initial.stage},revision:7}:null;
    if(cancellation)here={...initial.stage};
    const $=id=>realDocument.getElementById(id),CSS={escape:value=>value};
    const afterDialogClose=adapters.afterDialogClose,openLibrary=adapters.openLibrary;
    const leaveSound=adapters.publish,say=text=>adapters.notices.push(text);
    const button=(text,run)=>{const element=realDocument.createElement('button');element.textContent=text;element.onclick=run;return element;};
    ${implementation}
    let refreshes=0;
    const studio={element:dialog,setWorks:()=>{refreshes++;dialog.querySelector('[data-leave="chorus-chords"]').disabled=!studioHooks.availability('chorus-chords').allowed;}};
    const library={setReply:adapters.setReply=()=>{adapters.replyChanges=(adapters.replyChanges??0)+1;}};
    return {makeRoom:()=>makeRoom('chorus-chords',null),update:()=>updatePlacementPlan(),
      read:()=>({plan:placementPlan,intentHidden:placementIntent.hidden,refreshes,at:studioHooks.at(),leaveDisabled:dialog.querySelector('[data-leave="chorus-chords"]').disabled,
        focused:realDocument.activeElement?.id || realDocument.activeElement?.getAttribute('data-leave'),draft:realDocument.getElementById('typing').value,open:dialog.open})};
  `)(documentAdapter, document, dialog, adapters, { stage, staleGreen, oldGreen }, cancellation, chorusPlaceAt, planetDistance, findNearbyPlan, placementAvailability, findSound, PLANET_PLACES, deriveChorusWorks, sceneHutAt) as {
    makeRoom(): void; update(): void; read(): { plan: unknown; intentHidden: boolean; refreshes: number; at: Position; leaveDisabled: boolean; focused: string | null; draft: string; open: boolean };
  };
  return { harness, adapters, dispose: () => dom.window.close() };
}

describe("actual placement controller handoffs", () => {
  it("keeps an already-available Stage choice open after travel, even when the previous animation sample is still in Green", () => {
    const { harness, adapters, dispose } = controller();
    try {
      harness.makeRoom();const after=harness.read();
      expect(adapters.afterDialogClose, "an already-valid spot must not close its current chooser").not.toHaveBeenCalled();
      expect(adapters.walkToward).not.toHaveBeenCalled();expect(adapters.publish).not.toHaveBeenCalled();expect(adapters.openLibrary).not.toHaveBeenCalled();
      expect(after.at).toEqual(stage);expect(after.open).toBe(true);expect(after.refreshes).toBe(1);expect(after.leaveDisabled).toBe(false);
      expect(after.focused).toBe("chorus-chords");
    } finally { dispose(); }
  });

  it("lets typing, a modal or a cancelled walking revision win over an already-reached target", () => {
    for (const state of [{chat:true},{modal:true},{walking:false},{revision:8}]) {
      const {harness,adapters,dispose}=controller(state);
      try {
        harness.update();const after=harness.read();
        expect(after.plan,JSON.stringify(state)).toBeNull();expect(after.intentHidden).toBe(true);expect(adapters.cancelWalking).toHaveBeenCalledTimes(1);
        expect(adapters.openLibrary,"cancellation must be checked before arrival").not.toHaveBeenCalled();expect(adapters.walkToward).not.toHaveBeenCalled();expect(adapters.publish).not.toHaveBeenCalled();
        expect(after.focused).toBe("typing");expect(after.draft).toBe("Keep my draft");expect(after.open).toBe(false);
      } finally { dispose(); }
    }
  });
});
