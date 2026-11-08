import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { PlanetAudio } from "../src/client/planet-audio.ts";
import { deriveChorusWorks, type ChorusWork } from "../src/shared/chorus.ts";
import type { PlacedSound, ServerMessage } from "../src/shared/protocol.ts";

interface State { ended: string[]; liveIds: string[]; audioIds: string[]; drawnIds: string[]; works: ChorusWork[]; }
interface Harness {
  publish(): Promise<string | null>;
  receive(message: ServerMessage): void;
  read(): State;
}
const root: PlacedSound = { id: "snd_root", soundId: "guitar", by: "Friend", byId: "friend", x: 0, z: 0, at: "2026-11-07T12:00:00Z" };
const child: PlacedSound = { id: "snd_unseen_child", soundId: "trickle", by: "You", byId: "you", x: 1, z: 0, at: "2026-11-07T12:00:01Z", replyToId: root.id, replyTo: root };
const removedAt = "2026-11-07T12:00:02Z";
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

// Run the actual private controller functions and stream handler without a
// GPU. Only transport and view adapters are substituted; PlanetAudio's real
// source-selection methods run. This is not a browser or acoustic check.
// The optional source path supports a frozen pre-fix negative control without
// ever editing production code or weakening this spec's assertions.
function controller(): { harness: Harness; acknowledge(): void } {
  const path = resolve(process.env.CHORUS_CONTROLLER_SOURCE ?? "src/client/planet.ts");
  const source = readFileSync(path, "utf8"), tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set(["leaveSound", "receiveChorus", "refreshWorld"]), snippets: string[] = [];
  for (const statement of tree.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && names.has(statement.name.text)) snippets.push(statement.getText(tree));
    if (ts.isExpressionStatement(statement) && statement.getText(tree).startsWith("stream.onmessage =")) snippets.push(statement.getText(tree));
  }
  expect(snippets, "the test must execute the actual controller functions and complete SSE handler").toHaveLength(4);
  const implementation = ts.transpileModule(snippets.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const audio = Object.create(PlanetAudio.prototype) as PlanetAudio;
  Object.assign(audio, { sources: [], works: [], seenRemoved: new Set(), voices: new Map() });
  let acknowledge!: () => void;
  const ack = new Promise(resolve => { acknowledge = () => resolve({ ok: true, sound: { ...child } }); });
  const harness = new Function("audio", "ack", "root", "child", `
    let connected=true,boot={joined:true},disposed=false,draftRevision=0,audioRevision=0,operation=null;
    let reply={...root},snapshot={sessionId:'ses_test'},chorus=[],drawnIds=[];
    const sounds=new Map([[root.id,root]]),ended=new Set(),errors={},stage={dataset:{}},stream={};
    const world={setWorks(){},setContributions(rows){drawnIds=rows.map(row=>row.id);},setSelf(){},setPeople(){}};
    const studio={setWorks(){}},library={setReply(){},close(){}},conversations={changed(){}},soundInteractions={setAll(){}};
    const settledMove=async()=>true,api=()=>ack,record=()=>{},say=()=>{},renderShared=()=>{},renderPeople=()=>{},receiveNpcs=()=>{},receiveEnvironment=()=>{},renderOccupancy=()=>{},receiveWords=()=>{},refreshSoundLife=()=>{};
    let people=[];
    audio.setAll([root]);
    ${implementation}
    return {publish:()=>leaveSound(child.soundId),receive:message=>stream.onmessage({data:JSON.stringify(message)}),
      read:()=>({ended:[...ended],liveIds:[...sounds.keys()],audioIds:audio.sources.map(row=>row.id),drawnIds,works:chorus})};
  `)(audio, ack, root, child) as Harness;
  return { harness, acknowledge };
}
function reconnect(harness: Harness, sounds: PlacedSound[], chorus: ChorusWork[]): void {
  harness.receive({ type: "snapshot", sessionId: "ses_test", sceneId: "planet", serverNow: "2026-11-07T12:00:03Z", online: [],
    you: { id: "you", name: "You", avatar: "cat" }, sounds, chorus,
    environment: { weather: "clear", minuteOfDay: 840, clockRunning: false, updatedAt: root.at, revision: 0 }, npcs: [] });
}

describe("canonical playback across an unseen in-flight contribution", () => {
  it.each(["present", "outside the bounded archive"] as const)("never revives an unknown removed child from its held ACK when work history is %s", async history => {
    const { harness, acknowledge } = controller();
    const pending = harness.publish(); await settle();
    // The HTTP command committed, but this visitor missed both its creation
    // and its later withdrawal SSE. A real reconnect supplies current state.
    const current = history === "present" ? [root] : [];
    const works = history === "present" ? deriveChorusWorks([root, { ...child, removedAt }]) : [];
    reconnect(harness, current, works);
    expect(harness.read().liveIds).not.toContain(child.id);
    acknowledge(); await pending;
    const after = harness.read();
    expect(after.liveIds).toEqual(current.map(row => row.id));
    expect(after.audioIds).toEqual(current.map(row => row.id));
    expect(after.drawnIds).toEqual(current.map(row => row.id));
    expect(after.works).toEqual(works);
  });

  it("treats an accepted HTTP acknowledgement as a receipt and waits for canonical SSE before drawing or selecting the new sound", async () => {
    const { harness, acknowledge } = controller();
    const pending = harness.publish(); await settle();
    acknowledge(); expect(await pending).toBeNull();
    expect(harness.read().liveIds).toEqual([root.id]);
    expect(harness.read().audioIds).toEqual([root.id]);
    const works = deriveChorusWorks([root, child]);
    harness.receive({ type: "sound-left", sessionId: "ses_test", sound: child, chorus: works });
    const after = harness.read();
    expect(after.liveIds).toEqual([root.id, child.id]);
    expect(after.audioIds).toEqual([root.id, child.id]);
    expect(after.drawnIds).toEqual([root.id, child.id]);
    expect(after.works).toEqual(works);
  });
});
