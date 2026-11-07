import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { PlacedSound, ServerMessage } from "../src/shared/protocol.ts";

const root: PlacedSound = { id: "snd_root", soundId: "guitar", x: 0, z: 0, by: "Friend", byId: "friend", at: "2026-11-07T12:00:00Z" };
const child: PlacedSound = { id: "snd_unseen_child", soundId: "trickle", x: 1, z: 0, by: "You", byId: "you", at: "2026-11-07T12:00:01Z", replyToId: root.id, replyTo: root };
interface State { liveIds: string[]; audioIds: string[]; trailIds: string[]; drawnIds: string[]; removedIds: string[]; activity: { id: string; kind: string; by: string }[]; }
interface Harness { publish(): Promise<string | null>; receive(message: ServerMessage): void; read(): State; }
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

// Exercise the actual legacy controller, including its complete EventSource
// handler. Audio/render adapters expose requested sources without a GPU;
// separate soundscape and browser checks cover their playback and rendering.
function controller() {
  const path = resolve(process.env.CHORUS_COAST_CONTROLLER_SOURCE ?? "src/client/scene.ts");
  const source = readFileSync(path, "utf8"), tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set(["leaveSound", "soundLeft", "soundRemoved", "connect"]);
  const snippets = tree.statements.filter((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && !!statement.name && names.has(statement.name.text)).map(statement => statement.getText(tree));
  expect(snippets, "execute the real placement, source and connection handlers").toHaveLength(4);
  const implementation = ts.transpileModule(snippets.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  let acknowledge!: (sound?: PlacedSound) => void;
  const ack = new Promise(resolve => { acknowledge = (sound = child) => resolve({ ok: true, sound }); });
  const harness = new Function("ack", "root", "child", `
    let snapshot={sessionId:'ses_test',you:{id:'you',name:'You'},online:[]},connected=true,source=null;
    let replyTarget={...root},replyRevision=0,operation=null,occupancyKnown=false,occupancyPeople=[];
    const scene={id:'seaside'},mode={id:'weekday'},contributions=new Map([[root.id,root]]),removedSounds=new Set();
    let drawnIds=[root.id];const marks=new Map([[root.id,root]]),trailMarks=new Map([[root.id,root]]),activity=[];
    class EventSource {close() {}}
    const soundscape={on:true,has:id=>marks.has(id),add:row=>marks.set(row.id,row),remove:id=>marks.delete(id),setAll:rows=>{marks.clear();rows.forEach(row=>marks.set(row.id,row));}};
    const trail={add:row=>trailMarks.set(row.id,row),remove:id=>trailMarks.delete(id),setAll:rows=>{trailMarks.clear();rows.forEach(row=>trailMarks.set(row.id,row));}};
    const world={setSelf(){},setOthers(){},showSaid(){},setContributions:rows=>{drawnIds=rows.map(row=>row.id);}};
    const library={element:{open:true},close(){this.element.open=false;}},conversations={changed(){}},sharedPlace={changed:(row,kind,by)=>activity.push({id:row.id,kind,by})};
    const me=()=>snapshot.you,post=()=>ack,REFUSED={reply_gone:'gone'},refused=()=>'',soundName=id=>id,zoneTitle=()=>'',say=()=>{},setSound=()=>{},renderReply=()=>{},renderSharedPlace=()=>{},receiveNpcRoutines=()=>{},receiveEnvironment=()=>{},renderPeople=()=>{},renderStatus=()=>{},renderRestroomStatus=()=>{},heard=()=>{};
    const cancelReply=()=>{replyTarget=null;replyRevision++;};
    let environment={revision:0};
    ${implementation}
    connect();
    return {publish:()=>leaveSound(child.soundId),receive:message=>source.onmessage({data:JSON.stringify(message)}),
      read:()=>({liveIds:[...contributions.keys()],audioIds:[...marks.keys()],trailIds:[...trailMarks.keys()],drawnIds,removedIds:[...removedSounds],activity})};
  `)(ack, root, child) as Harness;
  return { harness, acknowledge };
}
function reconnect(harness: Harness): void {
  harness.receive({ type: "snapshot", sceneId: "seaside", sessionId: "ses_test", serverNow: "2026-11-07T12:00:03Z", sounds: [root], online: [], you: { id: "you", name: "You", avatar: "cat" },
    environment: { weather: "clear", minuteOfDay: 840, clockRunning: false, updatedAt: root.at, revision: 0 } });
}

describe("the preserved coast's canonical sound ownership", () => {
  it("does not revive a never-seen contribution after missing its creation and removal and receiving a fresh snapshot", async () => {
    const { harness, acknowledge } = controller(), pending = harness.publish(); await settle();
    reconnect(harness); acknowledge(); await pending;
    const state = harness.read();
    for (const ids of [state.liveIds, state.audioIds, state.trailIds, state.drawnIds]) expect(ids).toEqual([root.id]);
    expect(state.activity).toEqual([]);
  });

  it("waits for accepted canonical SSE rather than drawing or selecting playback from an HTTP acknowledgement", async () => {
    const { harness, acknowledge } = controller(), pending = harness.publish(); await settle();
    acknowledge(); expect(await pending).toBeNull();
    expect(harness.read().liveIds).toEqual([root.id]);
    harness.receive({ type: "sound-left", sessionId: "ses_test", sound: child });
    const state = harness.read();
    for (const ids of [state.liveIds, state.audioIds, state.trailIds, state.drawnIds]) expect(ids).toEqual([root.id, child.id]);
    expect(state.activity).toEqual([{ id: child.id, kind: "left", by: child.by }]);
  });

  it("honours a tombstoned retry acknowledgement without inventing a removal actor or public activity", async () => {
    const { harness, acknowledge } = controller(), pending = harness.publish(); await settle();
    harness.receive({ type: "sound-left", sessionId: "ses_test", sound: child });
    acknowledge({ ...child, removedAt: "2026-11-07T12:00:02Z" }); await pending;
    const state = harness.read();
    for (const ids of [state.liveIds, state.audioIds, state.trailIds, state.drawnIds]) expect(ids).toEqual([root.id]);
    expect(state.removedIds).toContain(child.id);
    expect(state.activity.filter(event => event.kind === "removed")).toEqual([]);
  });
});
