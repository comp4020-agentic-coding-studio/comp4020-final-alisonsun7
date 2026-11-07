// Little Chorus: cookie identity, real SSE, durable sounds,
// ephemeral nearby words and authoritative shared restroom routines.
import { FlatWorld } from "./flat-world.js";
import { presentation, presentationHref } from "../shared/presentation.js";
import { enterPresentation, leavePresentation } from "./presentation-handoff.js";
import { PlanetWorld } from "./planet-world.js";
import { PlanetSocial } from "./planet-social.js";
import { PlanetAudio } from "./planet-audio.js";
import { RoutineAudio } from "./routine-audio.js";
import { ChorusStudio } from "./chorus-studio.js";
import type { ChorusWork } from "../shared/chorus.js";
import { SoundLibrary } from "./sound-library.js";
import { EnvironmentPanel, type ApplyEnvironmentResult } from "./environment-panel.js";
import { PlanetSoundInteractions } from "./planet-sound-interactions.js";
import { SoundConversations } from "./sound-conversations.js";
import { loadLookMode } from "./look-settings.js";
import { findScene } from "../shared/catalog.js";
import { PLANET_PLACES, PLANET_HUTS, planetDistance, sceneHutAt } from "../shared/planet.js";
import { findSound, FAMILIES } from "../shared/sounds.js";
import { privateSound } from "../shared/huts.js";
import { minuteAt, WEATHER_LABELS, formatTime } from "../shared/environment.js";
import type { Snapshot, ServerMessage, PlacedSound, SoundReference, Position, MoveResult, Moves } from "../shared/protocol.js";
import type { NpcRoutineFrame } from "../shared/npc-routines.js";
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const boot = JSON.parse($("planet-boot").textContent!) as {
    snapshot: Snapshot;
    joined: boolean;
    view?: string;
};
const visualView = presentation(boot.view), flat = visualView !== "3d";
let snapshot = boot.snapshot, connected = false;
let chorus: ChorusWork[] = snapshot.chorus ?? [];
const stage = $("planet-stage"), notice = $("planet-notice"), tools = $<HTMLDialogElement>("planet-tools-panel"), arrival = $<HTMLDialogElement>("planet-join");
const sounds = new Map(snapshot.sounds.map(s => [s.id, s])), ended = new Set<string>(), events = new Set<string>(), activity: string[] = [];
let people: Moves["people"] = [], npcs: NpcRoutineFrame[] = snapshot.npcs ?? [];
let reply: SoundReference | null = null, operation: {
    signature: string;
    id: string;
} | null = null;
let draftRevision=0,npcTime=Date.parse(snapshot.serverNow);
let movePending: Promise<boolean> | null = null, lastMove = 0, lastSent = "", disposed = false;
let here: Position = { x: 0, z: 3, yaw: Math.PI };
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let soundInteractions: PlanetSoundInteractions | undefined;
let social: PlanetSocial | undefined;
let walkingReply: string | null = null;
let walkingReplyRevision = 0;
function say(text: string): void { notice.textContent = text; notice.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.hidden = true, 8000); }
const audio = new PlanetAudio(count => stage.dataset.voices = String(count));
audio.setVolume(.7);
const routineAudio = new RoutineAudio({ distanceBetween: planetDistance, report: count => stage.dataset.npcFlushVoices = String(count) });
let currentArea = PLANET_PLACES[0];
const worldOptions: ConstructorParameters<typeof PlanetWorld>[1] = { listen: l => {
        here = { x: l.x, z: l.z, yaw: l.yaw };
        audio.frame(here, l.camera, l.serverNow);
        routineAudio.frame(npcs, here, audio.on, l.serverNow);
        soundInteractions?.frame();
        studio.frame();
        social?.frame();
        updateReplyIntent();
        updateView();
        const run = $("planet-run"), pressed = String(world.runEnabled);if (run.getAttribute("aria-pressed") !== pressed) run.setAttribute("aria-pressed", pressed);
        if (boot.joined && connected && performance.now() - lastMove > 180)
            void reportMove();
    }, area: p => { currentArea = p; $("planet-area").textContent = p.title; $("planet-guide").textContent = p.description;document.querySelectorAll<HTMLButtonElement>("#chorus-travel [data-place]").forEach(b => b.setAttribute("aria-pressed",String(b.dataset.place === p.id))); }, wait: say,
    work: (id) => id ? studio.showJournal(id) : openLibrary(),
    interaction: cue => { const button = $("planet-interact");button.hidden = !cue;button.textContent = cue?.action ?? "Meet the kangaroo";button.setAttribute("aria-label", cue ? cue.label + ": " + cue.action : "Meet the kangaroo"); } };
const world = flat ? new FlatWorld(stage, worldOptions, visualView) : new PlanetWorld(stage, worldOptions);
world.setSelf(snapshot.you);
world.setNpcs(npcs);
world.setEnvironment(snapshot.environment, snapshot.serverNow);
world.setContributions([...sounds.values()]);
audio.setAll([...sounds.values()]);
try {
    world.setViewMode(!flat && localStorage.getItem("soundfolk-view") === "first" ? "first" : "third");
}
catch { }
let drawnViewState = "";
function updateView(): void {
    const state = flat ? "flat:" + String(world.cameraDistance >= 20) : "3d:" + world.viewMode;
    if(state === drawnViewState)return;
    drawnViewState = state;
    const button = $("planet-view");
    if(flat){const overview=world.cameraDistance>=20;button.querySelector("span")!.textContent=overview?"Follow me":"Village overview";button.setAttribute("aria-pressed",String(overview));button.setAttribute("aria-label",overview?"Follow my character":"See the whole village");button.title=overview?"Follow my character":"See the whole village";return;}
    button.querySelector("span")!.textContent = world.viewMode === "third" ? "Third person" : "First person";button.setAttribute("aria-pressed", String(world.viewMode === "third"));button.setAttribute("aria-label", world.viewMode === "third" ? "Third person; switch to first person" : "First person; switch to third person");
}
$("planet-view").onclick = () => { if(flat)world.setCameraDistance(world.cameraDistance<20?26:8);else world.setViewMode(world.viewMode === "third" ? "first" : "third");updateView();world.focus(); };
updateView();
const zoomControls=document.createElement("div");zoomControls.className="planet-zoom";zoomControls.setAttribute("aria-label","Camera distance");
for(const [id,label,text,delta]of [["planet-zoom-in","Camera closer","+",-2],["planet-zoom-out","See more of the world","−",2]] as const){const b=document.createElement("button");b.type="button";b.id=id;b.setAttribute("aria-label",label);b.title=label;b.textContent=text;b.onclick=()=>{world.setViewMode("third");world.setCameraDistance(world.cameraDistance+delta);updateView();world.focus();};zoomControls.append(b);}stage.append(zoomControls);
const setLook = (value: string): void => { const mode = value === "scene" ? "scene" : "follow"; world.setLookMode(mode); try {
    localStorage.setItem("soac-look-mode", mode);
}
catch { } for (const id of ["planet-look", "planet-look-settings"])
    $<HTMLSelectElement>(id).value = mode; $("planet-look-hint").textContent = mode === "follow" ? "Drag down to look down, left to look left." : "Drag down to look up, left to look right."; };
setLook(loadLookMode());
for (const id of ["planet-look", "planet-look-settings"])
    $<HTMLSelectElement>(id).onchange = e => setLook((e.target as HTMLSelectElement).value);
const listenHint = document.createElement("button");listenHint.id = "planet-listen-hint";listenHint.type = "button";listenHint.className = "planet-listen-hint";listenHint.hidden = true;stage.append(listenHint);
function updateSoundControl(): void {
    const running = audio.playbackState === "running", on = audio.on, silent = audio.volumeLevel === 0;
    const label = !on ? "Sound off; turn on" : !running ? "Audio paused; tap to resume" : "Sound on; turn off";
    const b = $("planet-sound");b.setAttribute("aria-pressed", String(on));b.setAttribute("aria-label", label);b.title = label;b.querySelector("span")!.textContent = !on ? "Sound off" : running ? "Sound on" : "Resume sound";
    stage.dataset.soundOn = String(on);stage.dataset.audioState = audio.playbackState;
    listenHint.hidden = running && !silent || !!document.querySelector("dialog:modal") || !$("planet-chat").hidden;
    listenHint.textContent = !on ? "Sound off · Tap to listen" : !running ? "Audio paused · Tap to resume" : "Volume is zero · Restore sound";
}
updateSoundControl();
function setSound(on: boolean): void {if(disposed)return;audio.setOn(on);updateSoundControl();routineAudio.frame(npcs, here, on, world.serverNow);}
function enableListening(): void {if(audio.volumeLevel===0){audio.setVolume(.7);$<HTMLInputElement>("chorus-volume").value="70";}setSound(true);}
listenHint.onclick = () => {enableListening();world.focus();};
$("planet-sound").onclick = () => setSound(audio.on && audio.playbackState === "running" ? false : true);
stage.dataset.voices = "0";
stage.dataset.npcFlushVoices = "0";
stage.dataset.soundOn = "false";
function restore(): void { const modal = !!document.querySelector("dialog:modal") || !$("planet-chat").hidden; world.setPaused(modal); if (!modal)
    world.focus(); }
function show(d: HTMLDialogElement): void { world.setPaused(true); d.hidden = false; d.showModal(); d.scrollTop = 0; }
function hide(d: HTMLDialogElement): void { if (d.open)
    d.close(); }
function afterDialogClose(dialog: HTMLDialogElement, action: () => void): void {
    const resume = (): void => { if (!document.querySelector("dialog:modal") && $("planet-chat").hidden) { world.setPaused(false);world.focus();action(); } };
    // close() queues its event. Existing close handlers restore movement first;
    // only then may a new walking intent be created.
    if (dialog.hidden) resume();
    else { dialog.addEventListener("close", resume, {once:true});hide(dialog); }
}
function native(d: HTMLDialogElement, opener: HTMLElement): void { d.addEventListener("close", () => { if (d.open)
    return; d.hidden = true; restore(); if (!document.querySelector("dialog:modal"))
    opener.focus(); }); }
function containFocus(dialog:HTMLDialogElement):void{dialog.addEventListener("keydown",event=>{if(event.key!=="Tab"||!dialog.open)return;const targets=[...dialog.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href],summary,[tabindex]")].filter(e=>e.tabIndex>=0&&!e.matches(":disabled")&&!e.closest("[hidden],[inert]")&&e.getClientRects().length>0);const first=targets[0],last=targets.at(-1);if(!first)return;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last!.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});}
containFocus(tools);containFocus(arrival);
native(tools, $("planet-tools"));
native(arrival, $("planet-place"));
$("planet-tools").onclick = () => { show(tools); $("planet-tools").setAttribute("aria-expanded", "true"); renderPeople(); renderOccupancy(); };
$("planet-tools-close").onclick = () => hide(tools);
tools.addEventListener("close", () => $("planet-tools").setAttribute("aria-expanded", "false"));
for (const p of PLANET_PLACES) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.zone = p.id;
    b.className = "planet-destination";
    const title = document.createElement("strong"), desc = document.createElement("span");
    title.textContent = p.title;
    desc.textContent = p.description;
    b.append(title, desc);
    b.onclick = () => { hide(tools); world.goTo(p.id); lastSent = ""; setTimeout(() => world.focus(), 0); };
    $("planet-destinations").append(b);
}
const scene = findScene("planet")!;
const environmentPanel = new EnvironmentPanel({ scene, apply: async (draft, revision): Promise<ApplyEnvironmentResult> => {
        if (!connected)
            return { ok: false, code: "offline" };
        if (!boot.joined)
            return { ok: false, code: "no_session" };
        try {
            const r = await fetch(`/api/sessions/${snapshot.sessionId}/environment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, revision }), signal: AbortSignal.timeout(8000) });
            const result = await r.json() as ApplyEnvironmentResult;
            if (result.environment && result.serverNow)
                receiveEnvironment(result.environment, result.serverNow);
            return result;
        }
        catch {
            return { ok: false, code: "offline" };
        }
    }, goTo: id => world.goTo(id), open: () => world.setPaused(true), close: restore });
stage.append(environmentPanel.element);
environmentPanel.setEnvironment(snapshot.environment, snapshot.serverNow);
const environmentButton = document.createElement("button");
environmentButton.className = "btn ghost";
environmentButton.type = "button";
environmentButton.id = "planet-environment-settings";
environmentButton.textContent = "Shared weather & time";
environmentButton.onclick = () => { hide(tools); environmentPanel.open("environment"); };
$("planet-environment").append(environmentButton);
const environmentReadout = document.createElement("p");
$("planet-environment").append(environmentReadout);
function receiveEnvironment(environment: Snapshot["environment"], serverNow: string): void { if (environment.revision < snapshot.environment.revision)
    return; snapshot.environment = environment; world.setEnvironment(environment, serverNow); environmentPanel.setEnvironment(environment, serverNow); }
const shared = document.createElement("dialog");
shared.id = "planet-soundscape";
shared.className = "planet-dialog";
shared.hidden = true;
shared.setAttribute("aria-labelledby", "planet-shared-title");
const sharedHead = document.createElement("div");
sharedHead.className = "planet-dialog-heading";
const sharedTitle = document.createElement("h2");
sharedTitle.id = "planet-shared-title";
sharedTitle.textContent = "Our soundscape";
const closeShared = document.createElement("button");
closeShared.className = "btn ghost";
closeShared.textContent = "Close";
closeShared.onclick = () => hide(shared);
sharedHead.append(sharedTitle, closeShared);
const sharedMix = document.createElement("p"),sharedReactions=document.createElement("div"), sharedList = document.createElement("div");
sharedReactions.id="planet-resident-responses";
shared.append(sharedHead, sharedMix,sharedReactions, sharedList);
stage.append(shared);
native(shared, $("planet-shared"));
containFocus(shared);
$("planet-shared").onclick = () => { renderShared(); show(shared); };
function publicSounds(): PlacedSound[] { return [...sounds.values()].filter(s => !s.whileIn && !s.removedAt && !ended.has(s.id)); }
function refreshWorld(): void { const list = [...sounds.values()].filter(s => !ended.has(s.id)); world.setContributions(list); audio.setAll(list); soundInteractions?.setAll(list);conversations.changed();renderShared(); renderPeople(); }
function record(kind: string, s: PlacedSound, by = s.by): void { if (s.whileIn)
    return; const id = s.id + ":" + kind; if (events.has(id))
    return; events.add(id); activity.unshift(by + (kind === "removed" ? " removed " : " left ") + (findSound(s.soundId)?.label ?? "a sound")); activity.splice(4); $("planet-activity").replaceChildren(...activity.map(text => { const p = document.createElement("p"); p.textContent = text; return p; })); }
function button(label: string, run: () => void): HTMLButtonElement { const b = document.createElement("button"); b.className = "btn ghost"; b.type = "button"; b.textContent = label; b.onclick = run; return b; }
function renderShared(): void {
    const list = publicSounds().sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)), near = list.filter(s => planetDistance(s, here) <= 18), authors = new Set(near.map(s => s.byId));
    sharedMix.textContent = `${list.length} lasting sounds · ${snapshot.online.length} people here. This corner: ${near.length} ingredients by ${authors.size} people.`;
    const focus = document.activeElement as HTMLElement | null, key = focus?.closest<HTMLElement>("[data-id]")?.dataset.id, action = focus?.dataset.planetReply !== undefined ? "reply" : focus?.dataset.planetRemove !== undefined ? "remove" : "";
    const rows = list.map(s => {
        const card = document.createElement("article");
        card.className = "planet-sound-card";
        card.dataset.id = s.id;
        const kind = findSound(s.soundId);
        if (kind)
            card.style.setProperty("--family", FAMILIES[kind.family].colour);
        const h = document.createElement("h3");
        h.textContent = kind?.label ?? "Sound";
        const p = document.createElement("p");
        p.textContent = `Left by ${s.by} · ${Math.round(planetDistance(s, here))} m away` + (s.replyTo ? ` · answering ${s.replyTo.by}'s ${findSound(s.replyTo.soundId)?.label ?? "sound"}` : "");
        const face = button("Walk toward this sound", () => afterDialogClose(shared, () => { if (!sounds.has(s.id) || ended.has(s.id)) return say("That sound has been removed.");world.walkToward(s, 2.4);say("Walking toward the sound. Use any movement key to cancel."); }));
        const view = button("Conversation", () => { hide(shared);conversations.open(s.id); });
        const answer = button("Respond to sound", () => { hide(shared);startReply(s); });
        answer.dataset.planetReply = "";
        answer.disabled = !boot.joined || planetDistance(s, here) > 4;
        const remove = button("Remove", () => void removeSound(s));
        remove.dataset.planetRemove = "";
        remove.disabled = !boot.joined || planetDistance(s, here) > 4;
        card.append(h, p, face, answer, view, remove);
        return card;
    });
    if (!rows.length) {
        const p = document.createElement("p");
        p.textContent = "Nothing has been left here yet. Choose a sound at your feet and invite a friend to answer.";
        sharedList.replaceChildren(p);
    }
    else
        sharedList.replaceChildren(...rows);
    if (key && action)
        sharedList.querySelector<HTMLElement>(`[data-id="${CSS.escape(key)}"] [data-planet-${action}]`)?.focus();
    stage.dataset.sounds = String(list.length);
}
async function api(path: string, method = "POST", body?: unknown): Promise<Record<string, unknown>> { const r = await fetch(`/api/sessions/${snapshot.sessionId}/${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) }); return await r.json() as Record<string, unknown>; }
async function reportMove(force = false): Promise<boolean> {
    if (!boot.joined || !connected || disposed)
        return false;
    if (movePending)
        return movePending;
    const p = world.at, signature = JSON.stringify(p);
    if (!force && signature === lastSent && performance.now() - lastMove < 2000)
        return true;
    const previous = lastMove;
    movePending = (async () => {
        try {
            if (force && performance.now() - previous < 110)
                await new Promise(r => setTimeout(r, 110 - (performance.now() - previous)));
            lastMove = performance.now();
            const r = await fetch(`/api/sessions/${snapshot.sessionId}/move`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p), signal: AbortSignal.timeout(5000) });
            const result = await r.json() as MoveResult;
            if (!result.ok) {
                if (result.code === "hut_taken") {
                    world.correctPosition(result.position);
                    say("The restroom is occupied. Its door stays locked until the occupant comes out.");
                }
                return false;
            }
            lastSent = signature;
            return true;
        }
        catch {
            return false;
        }
        finally {
            movePending = null;
        }
    })();
    return movePending;
}
async function settledMove(): Promise<boolean> { await movePending; return await reportMove(true); }
const errors: Record<string, string> = { too_close: "That sound is already nearby. Leave room for another ingredient.", crowded: "Six sounds already meet here. Try a nearby quieter corner.", too_far: "Walk within four metres first.", gone: "That sound has been removed.", reply_gone: "That sound was removed; cancel the reply or choose another.", reply_private: "Private stay sounds are outside public conversations.", slow_down: "One moment; try again in a second.", not_inside: "Step inside the restroom first.", already: "There is already a sound for your stay.", no_session: "Enter with a name first.", not_here: "Reconnect and take a step first.", place_full: "The world is full of sounds. Remove one beside you first." };
async function leaveSound(id: string, stay = false): Promise<string | null> {
    if (!connected)
        return "Connection lost. Your choice was not sent.";
    if (!boot.joined)
        return "Enter with a name first.";
    const context=draftRevision,parent=stay?null:reply?{...reply}:null;
    if (!await settledMove())
        return "Your position could not be confirmed. Reconnect and try again.";
    if(disposed||context!==draftRevision)return "Your selection changed before sending. Choose Leave again when ready.";
    const signature = JSON.stringify([id, stay, parent?.id]);
    if (operation?.signature !== signature)
        operation = { signature, id: crypto.randomUUID() };
    try {
        const requestId=operation.id;
        const result = await api("sounds", "POST", { soundId: id, operationId:requestId, ...(stay ? { whileInside: true } : {}), ...(parent ? { replyToId: parent.id } : {}) });
        if(disposed)return "The page changed before confirmation.";
        if (!result.ok)
            return errors[String(result.code)] ?? "That did not work. Check your connection and try again.";
        const s = result.sound as PlacedSound;
        const active=!s.removedAt&&!ended.has(s.id);
        if(!active){ended.add(s.id);sounds.delete(s.id);audio.remove(s.id);refreshWorld();}
        // Only the canonical stream/snapshot owns live sources. An original
        // HTTP acknowledgement may predate a removal missed while offline;
        // replaying it here would revive a source absent from the new snapshot.
        const current=context===draftRevision&&operation?.id===requestId;
        if(current){operation=null;reply=null;library.setReply(null);if(!stay&&active)library.close();}
        if(!active)return "That contribution was removed before confirmation. It will not play.";
        // A contribution never overrides a chosen quiet visit. Private Listen
        // is explicit; shared playback is controlled only by the Sound button.
        if(current)say(stay ? "Your stay sound was accepted. It ends when you come out." : "Your sound was left here. The world keeps your contribution.");
        return null;
    }
    catch {
        return "Connection interrupted. Choose Leave again to retry this same contribution.";
    }
}
async function removeSound(s: PlacedSound): Promise<void> { try {
    if (!await settledMove())
        return say("Confirm your position before removing.");
    const result = await api("sounds/" + s.id, "DELETE");
    if (result.ok) {
        ended.add(s.id);
        sounds.delete(s.id);
        audio.remove(s.id);
        record("removed", s, snapshot.you?.name ?? "Someone");
        refreshWorld();
    }
    else
        say(errors[String(result.code)] ?? "That could not be removed.");
}
catch {
    say("Connection interrupted; your sound was not removed.");
} }
const library = new SoundLibrary({ zone: () => ({ id: currentArea.id, title: currentArea.title }), listen: id => audio.preview(id), stop: () => audio.stopPreview(), leave: id => leaveSound(id), cancelReply: () => {draftRevision++; reply = null; operation = null; library.setReply(null); }, close: ()=>{draftRevision++;restore();} });
stage.append(library.element);
const studio = new ChorusStudio(stage, {
    minimise: () => soundInteractions?.dismiss(),
    at: () => here, you: () => snapshot.you, ready: () => boot.joined && connected,
    preview: id => audio.preview(id), stop: () => audio.stopPreview(), publish: id => leaveSound(id),
    respond: source => startReply(source), create: () => {cancelReply();openLibrary();},
    remove: source => {const sound = sounds.get(source.id);if(sound)void removeSound(sound);},
    visit: work => afterDialogClose(studio.journal, () => {world.goTo(work.placeId);world.focusWork(work.id);lastSent="";}),
    full: () => afterDialogClose(studio.element, () => openLibrary(true)),
    pause: () => world.setPaused(true), resume: restore, closeDraft: () => {draftRevision++;}, sound: on => on ? enableListening() : setSound(false), listening: () => audio.on && audio.playbackState === "running" && audio.volumeLevel > 0, focus: id => audio.setFocus(id),
});
function receiveChorus(works: readonly ChorusWork[]): void {
    for (const work of works) for (const source of work.sources) if (source.removedAt) {
        ended.add(source.id);sounds.delete(source.id);audio.remove(source.id);
    }
    chorus = [...works];world.setWorks(chorus);audio.setWorks(chorus);studio.setWorks(chorus);
    stage.dataset.chorus = JSON.stringify(chorus.map(w=>({id:w.id,placeId:w.placeId,variant:w.variant,duet:w.duet,sources:w.sources.map(s=>({id:s.id,byId:s.byId,replyToId:s.replyToId,removedAt:s.removedAt})),live:w.liveSources.map(s=>s.id)})));
}
receiveChorus(chorus);
function openLibrary(full = false): void { if (!boot.joined) {
    show(arrival);
    return;
} world.setPaused(true);if(full){library.setReply(reply);library.open();}else studio.open(reply); }
$("planet-place").onclick = () => {cancelReply();openLibrary();};
const conversations = new SoundConversations({
    visitLabel: "Walk toward sound",
    load: async (id, after) => { const r = await fetch(`/api/sessions/${snapshot.sessionId}/sounds/${encodeURIComponent(id)}/replies${after ? "?after=" + encodeURIComponent(after) : ""}`);return r.ok ? await r.json() as import("../shared/protocol.js").SoundReplies : null; },
    face: sound => afterDialogClose(conversations.element, () => { if (!sounds.has(sound.id) || ended.has(sound.id)) return say("That sound has been removed.");world.walkToward(sound, 2.4); }),
    reply: sound => startReply(sound),
    canReply: sound => boot.joined && connected && !sound.removedAt && sounds.has(sound.id) && planetDistance(here, sound) <= 4,
    joined: () => boot.joined,open: () => world.setPaused(true),close: restore,
});
stage.append(conversations.element);containFocus(conversations.element);
const replyIntent = document.createElement("aside");replyIntent.id = "planet-reply-intent";replyIntent.className = "planet-reply-intent";replyIntent.hidden = true;
const replyText = document.createElement("p"), chooseReply = button("Choose a response", () => { if (reply) startReply(reply); }), cancelReplyButton = button("Cancel", cancelReply);
chooseReply.id = "planet-reply-choose";cancelReplyButton.id = "planet-reply-cancel";replyIntent.append(replyText, chooseReply, cancelReplyButton);stage.append(replyIntent);
function cancelReply(): void { draftRevision++;reply = null;operation = null;walkingReply = null;world.cancelWalkingIntent();library.setReply(null);replyIntent.hidden = true;world.focus(); }
function startReply(reference: SoundReference): void {
    if (!boot.joined) { show(arrival);return; }
    if (!connected) return say("Reconnect before responding. Your sounds have not changed.");
    const source = sounds.get(reference.id);
    if (!source || source.removedAt || source.whileIn || ended.has(source.id)) return say("That sound has been removed. Choose another sound to answer.");
    draftRevision++;reply = { ...source };operation = null;library.setReply(reply);
    if (planetDistance(here, source) <= 4) { walkingReply = null;openLibrary(); }
    else { walkingReply = source.id;if (!world.walkToward(source, 2.4)) walkingReply = null;walkingReplyRevision = world.walkingIntentRevision;world.focus();say("Walk closer to answer. Nothing is shared until you choose Leave it here."); }
    updateReplyIntent();
}
function updateReplyIntent(): void {
    // The view's first animation frame runs after the module is initialized.
    if (typeof replyIntent === "undefined") return;
    replyIntent.hidden = !reply || !!document.querySelector("dialog:modal");
    if (!reply) return;
    replyIntent.dataset.target = reply.id;
    const removed = !!reply.removedAt || ended.has(reply.id) || !sounds.has(reply.id);
    if (removed && walkingReply) { walkingReply = null;world.cancelWalkingIntent(); }
    const distance = planetDistance(here, reply);
    replyText.textContent = removed ? "The sound you were answering was removed. Your response was not sent." : `${distance > 4 ? "Approaching" : "Answering"} ${reply.by}'s ${findSound(reply.soundId)?.label ?? "sound"} · ${Math.round(distance)} m`;
    chooseReply.disabled = removed || !connected;
    chooseReply.textContent = distance > 4 ? "Walk closer" : "Choose a response";
    if (walkingReply && (!world.walkingIntent || world.walkingIntentRevision !== walkingReplyRevision)) walkingReply = null;
    else if (walkingReply && distance <= 3.8) { walkingReply = null;world.cancelWalkingIntent();openLibrary(); }
}
soundInteractions = new PlanetSoundInteractions(stage, {
    at: () => here,project: (x,z,height) => world.project(x,z,height),available: () => boot.joined && connected,
    respond: source => startReply(source),conversation: id => conversations.open(id),remove: source => void removeSound(source),
    reaction: id => world.responses.filter(r => r.sourceId === id).map(r => r.label + " · " + r.behavior).join(" · "),
});
soundInteractions.setAll([...sounds.values()]);
document.addEventListener("keydown", event => { if (event.key.toLowerCase() !== "e" || event.repeat || event.altKey || event.ctrlKey || event.metaKey || document.querySelector("dialog:modal") || !(event.target instanceof HTMLCanvasElement)) return;const primary=$<HTMLButtonElement>("chorus-primary");if(!studio.dock.hidden&&primary&&!primary.disabled){event.preventDefault();event.stopImmediatePropagation();primary.click();return;}if (soundInteractions?.respondNearest()) { event.preventDefault();event.stopImmediatePropagation(); } }, {capture:true});
$("planet-run").onclick = () => { world.setRunning(!world.runEnabled);$("planet-run").setAttribute("aria-pressed", String(world.runEnabled));world.focus(); };
$("planet-jump").onclick = () => { world.jump();world.focus(); };
$("planet-interact").onclick = () => { world.interact();world.focus(); };
const privateButton = button("Flush for this stay", () => { const h = sceneHutAt("planet", here.x, here.z), sound = h && privateSound(h); if (sound)
    void leaveSound(sound, true).then(error => error && say(error)); });
privateButton.id = "planet-private-sound";
privateButton.hidden = true;
$("planet-occupancy").after(privateButton);
function renderOccupancy(): void { const parts = PLANET_HUTS.map(h => { const n = npcs.find(n => n.hutId === h.id && n.occupying), person = people.find(p => sceneHutAt("planet", p.x, p.z)?.id === h.id); return `${h.name}: ${n ? n.label + " · " + n.phase : person ? person.name + " · occupied" : "free · green light"}`; }); $("planet-occupancy").textContent = parts.join(". "); const h = sceneHutAt("planet", here.x, here.z); privateButton.hidden = !boot.joined || !h; privateButton.textContent = h?.kind.endsWith("shower") ? "Run shower for this stay" : "Flush for this stay"; }
function renderPeople(): void {environmentPanel.setAvailability({joined:boot.joined,connected}); $("planet-presence").textContent = `${snapshot.online.length} here · ${publicSounds().length} shared sounds` + (connected ? "" : " · reconnecting"); $("planet-people").replaceChildren(...snapshot.online.map(p => { const e = document.createElement("p"); e.textContent = p.name + (p.id === snapshot.you?.id ? " (you)" : " · player"); return e; })); stage.dataset.people = String(snapshot.online.length); }
function receiveNpcs(frames:readonly NpcRoutineFrame[],serverNow:string):void{const time=Date.parse(serverNow);if(!Number.isFinite(time)||time<npcTime||disposed)return;npcTime=time;npcs=frames.map(n=>({...n}));world.setNpcs(npcs);renderOccupancy();}
const chat = $<HTMLFormElement>("planet-chat");
$("planet-chat-toggle").onclick = () => { if (!boot.joined)
    return say("Enter with a name first.");
    if (!chat.hidden) return $("planet-chat-input").focus();
    afterDialogClose(tools, () => {chat.hidden = false;world.setPaused(true);$("planet-chat-input").focus();});
};
$("planet-chat-close").onclick = () => { chat.hidden = true; restore(); };
let sendingWords = false;
chat.onsubmit = async (e) => {
    e.preventDefault();if(sendingWords)return;
    const input = $<HTMLInputElement>("planet-chat-input"), submit = $<HTMLButtonElement>("planet-chat-submit"), text = input.value;
    if(!text.trim())return;
    sendingWords = true;submit.disabled = true;
    try {
        if(!connected || !await settledMove()){say("Reconnect before sending. Your words are still here.");return;}
        const result = await api("say", "POST", { text });
        if (result.ok) {
            if(input.value===text)input.value = "";
            if (result.heard === 0)say("No friend was within twelve metres to hear that. Invite them closer.");
        } else say(errors[String(result.code)] ?? "Those words could not be sent.");
    } catch {say("Connection interrupted. Your words were not sent.");}
    finally {sendingWords = false;submit.disabled = false;if(!chat.hidden)input.focus();}
};
social = new PlanetSocial(stage, {
    at: () => here, you: () => snapshot.you, people: () => people, npcs: () => npcs, sounds: () => [...sounds.values()],
    joined: () => boot.joined, connected: () => connected, project: (x,z,height) => world.project(x,z,height),
    openChat: () => $("planet-chat-toggle").click(), closeChat: () => $("planet-chat-close").click(),
    walk: target => {world.walkToward(target,.12);world.focus();}, stay: id => leaveSound(id,true),
    notice: say,
});
function receiveWords(name: string, text: string): void { const p = document.createElement("p"); p.textContent = name + ": " + text; $("planet-chat-log").append(p); setTimeout(() => p.remove(), 8000); }
const stream = new EventSource("/api/stream?scene=planet&mode=weekday");
stream.onopen = () => { connected = true; renderPeople(); };
stream.onerror = () => { connected = false; renderPeople(); };
stream.onmessage = e => {
    if(disposed)return;
    let msg: ServerMessage;
    try {
        msg = JSON.parse(e.data) as ServerMessage;
    }
    catch {
        return;
    }
    if (msg.type === "snapshot") {
        for (const id of sounds.keys())
            if (!msg.sounds.some(s => s.id === id))
                ended.add(id);
        snapshot = msg;
        receiveChorus(msg.chorus ?? []);
        sounds.clear();
        for (const s of msg.sounds)
            if (!ended.has(s.id))
                sounds.set(s.id, s);
        if(reply){const current=sounds.get(reply.id);if(!current&&!reply.removedAt){reply={...reply,removedAt:msg.serverNow};draftRevision++;}else if(current)reply={...current};library.setReply(reply);}
        world.setSelf(msg.you);
        receiveNpcs(msg.npcs??[],msg.serverNow);
        receiveEnvironment(msg.environment, msg.serverNow);
        refreshWorld();
        renderOccupancy();
    }
    else if (msg.type === "presence") {
        snapshot.online = msg.online;
        renderPeople();
    }
    else if (msg.type === "moves") {
        people = msg.people;
        world.setPeople(people, snapshot.you?.id ?? null);
        if (msg.npcs) {
            receiveNpcs(msg.npcs,msg.serverNow??new Date(world.serverNow).toISOString());
        }
    }
    else if (msg.type === "sound-left") {
        if(msg.chorus)receiveChorus(msg.chorus);
        if (!ended.has(msg.sound.id) && !msg.sound.removedAt) {
            sounds.set(msg.sound.id, msg.sound);
            record("left", msg.sound);
            refreshWorld();
        }
    }
    else if (msg.type === "sound-removed") {
        if(msg.chorus)receiveChorus(msg.chorus);
        const s = sounds.get(msg.id);
        ended.add(msg.id);
        sounds.delete(msg.id);
        audio.remove(msg.id);
        if (s)
            record("removed", s, msg.by);
        if (reply?.id === msg.id) {
            reply = { ...reply, removedAt: msg.removedAt };
            draftRevision++;
            library.setReply(reply);
        }
        refreshWorld();
    }
    else if (msg.type === "said") {
        receiveWords(msg.name, msg.text);social?.receiveWords(msg.by, msg.name, msg.text);
    }
    else if (msg.type === "environment")
        receiveEnvironment(msg.environment, msg.serverNow);
};
const clock = setInterval(() => { environmentReadout.textContent = `${WEATHER_LABELS[snapshot.environment.weather]} · ${formatTime(minuteAt(snapshot.environment, world.serverNow))}`; renderOccupancy(); updateView();
  if(shared.open){const responses=world.responses.filter(r=>sounds.has(r.sourceId)&&planetDistance(r,here)<=18);sharedReactions.replaceChildren(...responses.map(r=>{const p=document.createElement("p"),s=sounds.get(r.sourceId)!;p.dataset.source=r.sourceId;p.dataset.behavior=r.behavior;p.textContent=r.label+": "+r.behavior+" · "+s.by+"'s "+(findSound(s.soundId)?.label??"sound");return p;}));}
  updateSoundControl();
}, 700);
$<HTMLFormElement>("planet-join-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = $<HTMLFormElement>("planet-join-form"), submit = $<HTMLButtonElement>("planet-enter");
    submit.disabled = true;
    try {
        const result = await fetch("/join", { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(new FormData(form) as never) });
        const data = await result.json();
        if (!result.ok) {
            const error = $("planet-join-error");
            error.hidden = false;
            error.textContent = data.error ?? "Choose a name and character.";
            return;
        }
        location.assign(presentationHref(visualView));
    }
    catch {
        const error = $("planet-join-error");
        error.hidden = false;
        error.textContent = "Connection interrupted. Your name was not submitted.";
    }
    finally {
        submit.disabled = false;
    }
};
$("planet-observe").onclick = () => hide(arrival);
if (!boot.joined)
    show(arrival);
else {
    let welcomed = false;try {welcomed = localStorage.getItem("chorus-welcome-v1") === "seen";}catch{}
    if(!welcomed)studio.showWelcome();else world.focus();
}
$("chorus-welcome-again").onclick = () => afterDialogClose(tools, () => studio.showWelcome());
$("chorus-notebook").onclick = () => afterDialogClose(tools, () => studio.showJournal());
$<HTMLInputElement>("chorus-volume").oninput = e => audio.setVolume(Number((e.target as HTMLInputElement).value)/100);
$("chorus-overview").onclick = () => {const overview=world.cameraDistance<20;world.setViewMode("third");world.setCameraDistance(overview?26:8);$("chorus-overview").setAttribute("aria-pressed",String(overview));$("chorus-overview").textContent=overview?"Back to my place":"World overview";world.focus();};
document.querySelectorAll<HTMLButtonElement>("#chorus-travel [data-place]").forEach(b=>b.onclick=()=>{cancelReply();world.goTo(b.dataset.place!);world.setCameraDistance(8);lastSent="";world.focus();});
document.querySelectorAll<HTMLAnchorElement>(".planet-presentations a[data-presentation]").forEach(link=>link.onclick=event=>{
    event.preventDefault();const next=presentation(link.dataset.presentation);
    if(next===visualView){if(tools.open)hide(tools);else world.focus();return;}
    try {leavePresentation(sessionStorage,next,world.at,snapshot.you?.id??null,Date.now());}catch{}
    location.assign(presentationHref(next));
});
try {const handoff=enterPresentation(sessionStorage,visualView,snapshot.you?.id??null,Date.now());if(handoff)world.correctPosition(handoff);}catch{}
const startPlace = new URLSearchParams(location.search).get("zone");
if (startPlace)
    world.goTo(startPlace);
renderPeople();
renderShared();
renderOccupancy();
window.addEventListener("pagehide", e => { if (e.persisted || disposed)
    return; disposed = true; clearInterval(clock); clearTimeout(noticeTimer); stream.close(); studio.dispose();audio.dispose(); routineAudio.dispose();soundInteractions?.dispose();social?.dispose();world.dispose(); }, { once: false });
