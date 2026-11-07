// The live place: the walkable world, who's in it, talking to whoever is
// near, and the sounds people leave where they stand (ADR 011).
import { findScene, findZone, type Scene } from "../shared/catalog.js";
import type { MoveResult, Person, PlacedSound, ServerMessage, Snapshot, SoundReference, SoundRemoved, SoundReplies } from "../shared/protocol.js";
import { REACH, findSound } from "../shared/sounds.js";
import { figureSvg } from "./figures.js";
import { Soundscape } from "./soundscape.js";
import { Guide } from "./guide.js";
import { SoundLibrary } from "./sound-library.js";
import { ListeningTrail } from "./listening-trail.js";
import { LookSettings } from "./look-settings.js";
import { SoundConversations } from "./sound-conversations.js";
import { SharedSoundPlace } from "./shared-sound-place.js";
import { EnvironmentPanel, type ApplyEnvironmentResult } from "./environment-panel.js";
import { WEATHER_LABELS, formatTime, minuteAt, type Environment } from "../shared/environment.js";
import { HUTS } from "../shared/huts.js";
import type { NpcRestroomResult, NpcRoutineFrame } from "../shared/npc-routines.js";
import { RoutineAudio } from "./routine-audio.js";
import type { Room } from "./places.js";
import { WorldView, type Other } from "./world.js";

interface Boot {
  sceneId: string;
  mode: string;
  zoneId: string;
  snapshot: Snapshot;
  joined: boolean;
}

const boot = JSON.parse(document.getElementById("boot")!.textContent!) as Boot;
const scene = findScene(boot.sceneId) as Scene;
const mode = scene.modes.find((m) => m.id === boot.mode)!;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = $("stage");
const status = $("status");
const toast = $("toast");
stage.append(toast);

let snapshot = boot.snapshot;
let zoneId = boot.zoneId;
let connected = false;
const contributions = new Map(snapshot.sounds.map((s) => [s.id, s]));
// A delayed placement acknowledgement must not revive a contribution whose
// removal this page has already observed, including across SSE reconnects.
const removedSounds = new Set<string>();
let replyTarget: SoundReference | null = null;
let replyRevision = 0;
let operation: { key: string; id: string } | null = null;
const me = (): Person | null => snapshot.you;
let sharedPlace: SharedSoundPlace | null = null;
let npcFrames: NpcRoutineFrame[] = snapshot.npcs ?? [];
let npcTime = { server: Date.parse(snapshot.serverNow), received: performance.now() };
let occupancyPeople: (Person & { x: number; z: number; yaw: number })[] = [];
let occupancyKnown = false;
let restroomPending = false;
let routineListener = { ...(scene.zones.find(zone => zone.id === zoneId)?.spawn ?? { x: 0, z: 0, yaw: 0 }) };
const routineAudio = new RoutineAudio({ report: count => { stage.dataset.npcFlushVoices = String(count); } });

const world = new WorldView(stage, scene, mode.id, {
  startZone: zoneId,
  onZone: (zone) => {
    zoneId = zone;
    history.replaceState(null, "", `/scene/${scene.id}?mode=${mode.id}&zone=${zone}`);
    renderZone();
    guide.arrived(zone);
  },
  onListen: (l) => {
    reportPosition(l.x, l.z, l.yaw);
    soundscape.frame(l);
    trail.frame(l.x, l.z, l.yaw, soundscape.on);
    sharedPlace?.frame(l.x, l.z);
    routineListener = { x: l.x, z: l.z, yaw: l.yaw };
    routineAudio.frame(npcFrames, routineListener, soundscape.on, npcTime.server + Math.max(0, performance.now() - npcTime.received));
    here = { x: l.x, z: l.z };
  },
  onNear: (person) => showChat(person),
  onRoom: (room) => {
    enteredRoom(room);
    guide.entered(room);
  },
  onWait: (room) => say(`Someone is in ${room.name}. Please wait: the light by the door turns green when it's free.`),
});
world.setSelf(snapshot.you);
let here = { x: 0, z: 0 };

// The small Tools drawer keeps secondary controls within one native focus scope.
const toolsToggle = $<HTMLButtonElement>("world-tools-toggle");
const toolsDrawer = $<HTMLDialogElement>("world-tools-panel");
let toolsReturnToWorld = false;
let toolsOpener: HTMLElement = toolsToggle;
toolsToggle.onclick = () => {
  if (toolsDrawer.open) return closeWorldTools();
  openWorldTools(toolsToggle);
};
function openWorldTools(opener: HTMLElement): void {
  if (toolsDrawer.open) return;
  toolsOpener = opener;
  toolsReturnToWorld = false;
  toolsDrawer.hidden = false;
  toolsDrawer.showModal();
  toolsDrawer.scrollTop = 0;
  toolsToggle.setAttribute("aria-expanded", "true");
  sharedPlace?.setExpanded(true);
  world.setInputPaused(true);
}
$("world-tools-close").onclick = () => closeWorldTools();
toolsDrawer.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || !toolsDrawer.open) return;
  // Chrome can put focus on BODY between the last dialog link and its
  // browser toolbar. Wrap at the actual visible endpoints before that step.
  const focusable = [...toolsDrawer.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]")]
    .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled")
      && !element.closest("[hidden], [inert]") && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== "hidden");
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last!.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
toolsDrawer.addEventListener("cancel", () => {
  toolsToggle.setAttribute("aria-expanded", "false");
  sharedPlace?.setExpanded(false);
});
toolsDrawer.addEventListener("close", () => {
  if (toolsDrawer.open) return;
  toolsDrawer.hidden = true;
  toolsToggle.setAttribute("aria-expanded", "false");
  sharedPlace?.setExpanded(false);
  // A selected tool may already have opened its own modal when close fires.
  const modalOpen = !!document.querySelector("dialog:modal");
  world.setInputPaused(modalOpen);
  if (!modalOpen) {
    if (toolsReturnToWorld) world.focusCanvas();
    else toolsOpener.focus();
  }
  toolsReturnToWorld = false;
});
function closeWorldTools(returnToWorld = false): void {
  if (!toolsDrawer.open) return;
  toolsReturnToWorld = returnToWorld;
  toolsToggle.setAttribute("aria-expanded", "false");
  toolsDrawer.close();
}

const lookSettings = new LookSettings({
  change: (mode) => world.setLookMode(mode),
  open: () => world.setInputPaused(true),
  close: () => restoreWorldInput(),
});
stage.append(lookSettings.element);
$("look-settings").onclick = () => { closeWorldTools(); lookSettings.open(); };
const viewModeButton = $<HTMLButtonElement>("view-mode");
function renderViewMode(): void {
  const third = world.viewMode === "third";
  viewModeButton.setAttribute("aria-pressed", String(third));
  viewModeButton.textContent = third ? "Walk in first person" : "See my character";
  viewModeButton.setAttribute("aria-label", third ? "Third-person view. Switch to first person" : "First-person view. See my character from behind");
}
viewModeButton.onclick = () => { world.setViewMode(world.viewMode === "first" ? "third" : "first"); renderViewMode(); };
renderViewMode();

// One durable sky for everyone; scene destinations only change your own path.
let environment = snapshot.environment;
let environmentSample = { server: Date.parse(snapshot.serverNow), received: performance.now() };
const environmentPanel = new EnvironmentPanel({
  scene,
  apply: async (draft, revision): Promise<ApplyEnvironmentResult> => {
    if (!connected) return { ok: false, code: "offline" };
    if (!boot.joined) return { ok: false, code: "no_session" };
    try {
      const response = await fetch(`/api/sessions/${snapshot.sessionId}/environment`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, revision }), signal: AbortSignal.timeout(8000),
      });
      const result = await response.json() as ApplyEnvironmentResult;
      if (result.environment && result.serverNow) receiveEnvironment(result.environment, result.serverNow);
      return result;
    } catch {
      return { ok: false, code: "offline" };
    }
  },
  goTo: (zone) => world.goTo(zone),
  open: () => world.setInputPaused(true),
  close: () => restoreWorldInput(),
});
stage.append(environmentPanel.element);
$("environment-settings").onclick = () => { closeWorldTools(); environmentPanel.open("environment"); };
$("scene-settings").onclick = () => { closeWorldTools(); environmentPanel.open("scenes"); };

function receiveEnvironment(next: Environment, serverNow: string): void {
  // SSE may already have delivered a newer edit before an older POST ACK.
  const server = Date.parse(serverNow);
  if (next.revision < environment.revision || !Number.isFinite(server)) return;
  const received = performance.now();
  // A duplicate acknowledgement cannot rewind a running clock. A fresh
  // snapshot can still catch up after the computer has been asleep.
  const effectiveServer = next.revision === environment.revision
    ? Math.max(server, environmentSample.server + Math.max(0, received - environmentSample.received)) : server;
  environment = next;
  snapshot.environment = next;
  environmentSample = { server: effectiveServer, received };
  const sample = new Date(effectiveServer).toISOString();
  world.setEnvironment(next, sample);
  environmentPanel.setEnvironment(next, sample);
  renderEnvironment();
}

function renderEnvironment(): void {
  const now = environmentSample.server + performance.now() - environmentSample.received;
  $("world-conditions").textContent = `${WEATHER_LABELS[environment.weather]} · ${formatTime(minuteAt(environment, now))}`;
  $("world-clock-mode").textContent = environment.clockRunning ? "24-minute day" : "Time paused";
}
receiveEnvironment(environment, snapshot.serverNow);
environmentPanel.setZone(zoneId);
setInterval(renderEnvironment, 1000);

// cards for someone new: a short tour, then what each part of the place offers
const guide = new Guide(stage, zoneId, { joined: () => boot.joined, goTo: (zone) => world.goTo(zone), refocus: () => world.focusCanvas() });

const soundscape = new Soundscape(world, stage, {
  canChange: () => boot.joined,
  onRemove: (sound) => void removeSound(sound),
  onReply: (sound) => startReply(sound),
  onConversation: (sound) => conversations.open(sound.id),
});
soundscape.setAll(snapshot.sounds);
world.setContributions(snapshot.sounds.filter(sound => !sound.whileIn && !sound.removedAt));
const trail = new ListeningTrail((sound) => {
  world.faceSound(sound.x, sound.z);
  closeWorldTools(true);
  say("Facing " + soundName(sound.soundId) + ". Walk closer to hear it clearly.");
});
trail.setAll(snapshot.sounds);
trail.element.open = false;
$("tools-listening").append(trail.element);

const restroomButton = $<HTMLButtonElement>("test-restroom");
const restroomStatus = $("restroom-status");
restroomButton.textContent = "Invite a resident to test the restroom";
function receiveNpcRoutines(frames: readonly NpcRoutineFrame[], serverNow?: string): void {
  const server = serverNow ? Date.parse(serverNow) : NaN;
  const current = npcTime.server + Math.max(0, performance.now() - npcTime.received);
  if (Number.isFinite(server) && server < npcTime.server) return;
  npcFrames = frames.map(frame => ({ ...frame }));
  if (Number.isFinite(server)) npcTime = { server: Math.max(server, current), received: performance.now() };
  world.setNpcRoutines(npcFrames, serverNow);
  renderRestroomStatus();
}
function renderRestroomStatus(): void {
  restroomButton.disabled = restroomPending || !boot.joined || !connected;
  if (!connected) { restroomStatus.textContent = "Waiting for the shared door state. Reconnect before inviting a resident."; return; }
  if (!occupancyKnown) { restroomStatus.textContent = "Waiting for shared occupancy positions…"; return; }
  const state = HUTS.filter(hut => hut.kind !== "shop").map(hut => {
    const npc = npcFrames.find(frame => frame.hutId === hut.id && frame.occupying);
    const human = occupancyPeople.find(person => person.x > hut.x0 && person.x < hut.x1 && person.z > hut.z0 && person.z < hut.z1);
    return `${hut.name}: ${human ? `occupied by ${human.name}` : npc ? `occupied by ${npc.label}` : "free"}`;
  });
  const routine = npcFrames.find(frame => frame.phase !== "idle");
  const description = routine ? ` ${routine.label} is ${routine.phase === "waiting" ? "waiting for the current occupant to leave"
    : routine.phase === "walking" ? "walking to the restroom" : routine.phase === "entering" ? "entering"
      : routine.phase === "flushing" ? "flushing" : routine.phase === "leaving" ? "leaving" : "using the restroom"}.` : "";
  restroomStatus.textContent = state.join("; ") + "." + description
    + " Red means occupied; green means free. A second visitor can try the door while it is occupied.";
}
receiveNpcRoutines(npcFrames, snapshot.serverNow);
restroomButton.onclick = () => { void inviteRestroomResident(); };
addEventListener("pagehide", event => { if (!event.persisted) routineAudio.dispose(); });

// ---- the server's stream --------------------------------------------------

let source: EventSource | null = null;

function connect(): void {
  source?.close();
  source = new EventSource(`/api/stream?scene=${encodeURIComponent(scene.id)}&mode=${encodeURIComponent(mode.id)}`);
  source.onopen = () => {
    connected = true;
    renderStatus();
  };
  source.onmessage = (e) => {
    const msg = JSON.parse(e.data as string) as ServerMessage;
    if (msg.type === "snapshot") {
      snapshot = msg;
      world.setSelf(msg.you);
      occupancyKnown = false;
      occupancyPeople = [];
      receiveNpcRoutines(msg.npcs ?? [], msg.serverNow);
      receiveEnvironment(msg.environment, msg.serverNow);
      renderPeople();
      const live = new Set(msg.sounds.map((s) => s.id));
      for (const id of contributions.keys()) if (!live.has(id)) removedSounds.add(id);
      soundscape.setAll(msg.sounds);
      trail.setAll(msg.sounds);
      contributions.clear();
      for (const sound of msg.sounds) contributions.set(sound.id, sound);
      world.setContributions(msg.sounds.filter(sound => !sound.whileIn && !sound.removedAt));
      if (replyTarget) {
        const current = contributions.get(replyTarget.id);
        replyTarget = current ?? { ...replyTarget, removedAt: replyTarget.removedAt ?? msg.serverNow };
        renderReply();
      }
      conversations.changed();
      renderSharedPlace();
    } else if (msg.sessionId !== snapshot.sessionId) return;
    else if (msg.type === "presence") {
      snapshot = { ...snapshot, online: msg.online };
      renderPeople();
    } else if (msg.type === "moves") {
      occupancyPeople = msg.people.map(person => ({ ...person }));
      occupancyKnown = true;
      receiveNpcRoutines(msg.npcs ?? [], msg.serverNow);
      world.setOthers(msg.people.filter((p) => p.id !== me()?.id) as Other[]);
      renderRestroomStatus();
    }
    else if (msg.type === "said" && msg.by !== me()?.id) {
      world.showSaid(msg.by, msg.text);
      heard(msg.name, msg.text);
    }
    else if (msg.type === "sound-left") soundLeft(msg.sound);
    else if (msg.type === "sound-removed") soundRemoved(msg);
    else if (msg.type === "environment") {
      if (msg.environment.revision >= environment.revision) {
        receiveEnvironment(msg.environment, msg.serverNow);
        if (msg.byId !== me()?.id) say(`${msg.by} changed the shared weather and time.`);
      }
    }
    if (!connected) {
      connected = true;
      renderStatus();
    }
  };
  // EventSource reconnects by itself, and every reconnect starts with a
  // fresh snapshot.
  source.onerror = () => {
    connected = false;
    renderStatus();
  };
}

// ---- where you are (ADR 007) ----------------------------------------------

let lastSent = { at: 0, x: NaN, z: NaN, yaw: NaN };
let moveInFlight = false;
let positionRequest: Promise<MoveResult | null> | null = null;

// Five times a second at most, and only when you've moved or turned.
function reportPosition(x: number, z: number, yaw: number, force = false): Promise<MoveResult | null> | null {
  // Keep position commands in order: a delayed rejection must not undo a
  // newer accepted move. Frames keep running; the next report uses their
  // latest position as soon as this response has been handled.
  if (moveInFlight) return positionRequest;
  if ((!force && restroomPending) || !boot.joined || !connected) return null;
  const now = performance.now();
  if (!force && now - lastSent.at < 200) return null;
  if (!force && Math.hypot(x - lastSent.x, z - lastSent.z) < 0.05 && Math.abs(yaw - lastSent.yaw) < 0.05 && now - lastSent.at < 5000) return null;
  lastSent = { at: now, x, z, yaw };
  moveInFlight = true;
  positionRequest = fetch(`/api/sessions/${snapshot.sessionId}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round(yaw * 100) / 100 }),
    signal: AbortSignal.timeout(5000),
  }).then(async (response) => {
    const result = await response.json().catch(() => null) as MoveResult | null;
    if (!result) return null;
    if (!result.ok && result.code === "hut_taken") {
      world.correctPosition(result.position);
      lastSent = { at: 0, x: NaN, z: NaN, yaw: NaN };
      const hut = HUTS.find((h) => h.id === result.hutId);
      say("Someone is in " + (hut?.name ?? "that room") + ". Please wait for the green light.");
    }
    return result;
  }).catch(() => null).finally(() => { moveInFlight = false; positionRequest = null; });
  return positionRequest;
}

async function inviteRestroomResident(): Promise<void> {
  if (restroomPending || !boot.joined || !connected) return;
  const hut = HUTS.find(item => item.kind.endsWith("toilet"));
  if (!hut) return;
  restroomPending = true;
  world.setInputPaused(true);
  renderRestroomStatus();
  try {
    // Settle an earlier command before moving the observer. Frames cannot
    // publish a stale position between this explicit move and its invitation.
    await positionRequest;
    // The server intentionally drops moves less than 90 ms apart. A forced
    // observer move must be accepted, not mistaken for a throttled no-op.
    const wait = 110 - (performance.now() - lastSent.at);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    const position = { x: (hut.door.x0 + hut.door.x1) / 2, z: hut.z1 + 2.4, yaw: 0 };
    world.correctPosition(position);
    here = { x: position.x, z: position.z };
    world.faceSound(position.x, hut.z1 - 0.6);
    const moved = await reportPosition(position.x, position.z, position.yaw, true);
    if (!moved?.ok) { say("Couldn't confirm your position by the restroom. Check the connection and try again."); return; }
    const response = await fetch(`/api/sessions/${snapshot.sessionId}/npc-restroom`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hutId: hut.id }), signal: AbortSignal.timeout(8000),
    });
    const result = await response.json() as NpcRestroomResult;
    if (!result.ok) {
      say(result.code === "busy" ? "The resident already has a restroom visit underway. Watch the shared door state."
        : result.code === "slow_down" ? "Wait a moment before inviting the resident again."
          : "The invitation wasn't accepted. Reconnect and try again.");
      return;
    }
    receiveNpcRoutines(result.npcs, result.serverNow);
    closeWorldTools(true);
    say("The resident is walking to the restroom. Watch the red and green lamp; a second visitor can try the occupied door.");
  } catch {
    say("The invitation could not be confirmed. It may have reached the server; check the shared door state before trying again.");
  } finally {
    restroomPending = false;
    renderRestroomStatus();
    restoreWorldInput();
  }
}

// ---- talking to whoever is near -------------------------------------------

// The talk box: shown when someone is close enough to talk to, and kept
// while you're typing in it.
const chat = document.createElement("form");
chat.className = "chat-bar";
chat.hidden = true;
chat.innerHTML = `<label class="chat-to" for="chat-input"></label><div class="chat-row"><input id="chat-input" maxlength="120" autocomplete="off" /><button type="submit" class="btn primary">Say</button></div><p class="chat-mine" hidden></p>`;
const chatInput = chat.querySelector<HTMLInputElement>("input")!;
const chatTo = chat.querySelector<HTMLLabelElement>(".chat-to")!;
const chatMine = chat.querySelector<HTMLParagraphElement>(".chat-mine")!;
let nearPerson: Person | null = null;
let mineTimer: ReturnType<typeof setTimeout> | undefined;
if (boot.joined) stage.append(chat);

function showChat(person: Person | null): void {
  nearPerson = person;
  if (person) chatTo.textContent = `${person.name} is here. Say something:`;
  chatInput.placeholder = person ? `Say something to ${person.name}…` : "";
  // don't snatch the box away from someone mid-sentence
  chat.hidden = !person && document.activeElement !== chatInput && chatInput.value === "";
}

// What others say, low in the view, whether or not they're in sight: a
// bubble over the head of someone beside or behind you can't be seen.
const heardLog = document.createElement("div");
heardLog.className = "heard-log";
heardLog.setAttribute("aria-live", "polite");
stage.append(heardLog);
const HEARD_MS = 8000;

function heard(name: string, text: string): void {
  const line = document.createElement("p");
  const who = document.createElement("strong");
  who.textContent = `${name}: `;
  line.append(who, text);
  heardLog.append(line);
  while (heardLog.children.length > 4) heardLog.firstElementChild!.remove();
  setTimeout(() => line.remove(), HEARD_MS);
}

chatInput.addEventListener("blur", () => showChat(nearPerson));
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    chatInput.blur();
    world.focusCanvas();
  }
});

chat.onsubmit = async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const res = await fetch(`/api/sessions/${snapshot.sessionId}/say`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => null);
  const result = res ? ((await res.json()) as { ok: boolean; code?: string; heard?: number }) : null;
  if (!result?.ok) {
    say(result?.code === "slow_down" ? "A little slower: wait a moment before saying more." : "That wasn't sent. Try again in a moment.");
    return;
  }
  chatInput.value = "";
  // your own words, under the box, until you say something else or 5 s pass
  chatMine.textContent = `You: ${text}`;
  chatMine.hidden = false;
  clearTimeout(mineTimer);
  mineTimer = setTimeout(() => (chatMine.hidden = true), 5000);
  if (result.heard === 0) say("Nobody was close enough to hear that.");
};

// ---- sounds people leave (ADR 011) -----------------------------------------

const soundName = (id: string): string => findSound(id)?.label ?? "A sound";
const zoneTitle = (x: number, z: number): string => findZone(scene, world.zoneAt(x, z))?.title ?? "the place";
// Your own changes are told when the server answers; others' as they
// arrive, whichever comes first.
function soundLeft(sound: PlacedSound): void {
  if (sound.removedAt) removedSounds.add(sound.id);
  if (removedSounds.has(sound.id)) return;
  if (soundscape.has(sound.id)) return;
  contributions.set(sound.id, sound);
  world.setContributions([...contributions.values()].filter(sound => !sound.whileIn && !sound.removedAt));
  soundscape.add(sound);
  trail.add(sound);
  conversations.changed(sound.id, sound.replyTo?.id);
  sharedPlace?.changed(sound, "left", sound.by);
  renderSharedPlace();
  // a stay in the toilets or showers isn't news
  if (sound.byId !== me()?.id && !sound.whileIn) say(sound.replyTo
    ? `${sound.by} answered ${sound.replyTo.by}'s ${soundName(sound.replyTo.soundId)} with ${soundName(sound.soundId)}.`
    : `${sound.by} left ${soundName(sound.soundId)} at ${zoneTitle(sound.x, sound.z)}.`);
}

function soundRemoved(msg: SoundRemoved): void {
  removedSounds.add(msg.id);
  const previous = contributions.get(msg.id);
  contributions.delete(msg.id);
  const removedAt = msg.removedAt ?? new Date().toISOString();
  for (const [id, sound] of contributions) {
    if (sound.replyTo?.id === msg.id) contributions.set(id, { ...sound, replyTo: { ...sound.replyTo, removedAt } });
  }
  world.setContributions([...contributions.values()].filter(sound => !sound.whileIn && !sound.removedAt));
  if (replyTarget?.id === msg.id) {
    replyTarget = { ...replyTarget, removedAt };
    renderReply();
  }
  conversations.changed(msg.id);
  if (previous) sharedPlace?.changed(previous, "removed", msg.by);
  renderSharedPlace();
  if (!soundscape.has(msg.id)) return;
  soundscape.remove(msg.id);
  trail.remove(msg.id);
  soundscape.setAll([...contributions.values()]);
  // a sound left for a stay in the toilets or showers ends quietly as its
  // person comes out; only they are told
  if (msg.left) {
    if (msg.byId === me()?.id) say(`${soundName(msg.soundId)} stopped as you came out.`);
  } else if (msg.byId !== me()?.id) say(`${msg.by} removed ${soundName(msg.soundId)}.`);
}

// ---- toilets and showers (ADR 013) ------------------------------------------

// Going into a toilet or shower asks whether to leave its sound for while
// you're in; coming out ends it (the server sees you leave).
let roomPrompt: HTMLDivElement | null = null;
let room: Room | null = null;
function enteredRoom(now: Room | null): void {
  room = now;
  roomPrompt?.remove();
  roomPrompt = null;
  if (!room?.private || !room.sound || !boot.joined) return;
  const here = room;
  const what = soundName(here.sound!).toLowerCase();
  roomPrompt = ask(`You're in ${here.name}. Leave the sound of ${what} here while you're in? Everyone nearby hears it, and it stops when you come out.`, [
    [`Leave ${what}`, () => void leaveSound(here.sound!, true)],
    ["Not now", () => {}],
  ]);
}

// A small card over the world with a question and a button per answer; it
// goes when one is chosen.
function ask(text: string, answers: [string, () => void][]): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "prompt-card";
  card.setAttribute("role", "dialog");
  const p = document.createElement("p");
  p.textContent = text;
  const row = document.createElement("div");
  row.className = "prompt-actions";
  answers.forEach(([label, act], i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = i === 0 ? "btn primary" : "btn";
    b.textContent = label;
    b.onclick = () => {
      card.remove();
      if (roomPrompt === card) roomPrompt = null;
      act();
      world.focusCanvas();
    };
    row.append(b);
  });
  card.append(p, row);
  stage.append(card);
  return card;
}

const REFUSED: Record<string, string> = {
  not_here: "Take a step first, so the place knows where you're standing.",
  too_close: "That sound is already playing right here. Walk a few steps away and leave it there.",
  crowded: "There are already six sounds around here. Remove one, or find a quieter spot.",
  place_full: "The place is full of sounds. Remove one somewhere first.",
  too_far: "Walk up to it first: you can only remove a sound you're standing beside.",
  gone: "Someone has removed that one already.",
  slow_down: "One moment: wait a second between changes.",
  no_session: "Join first: give a name to change the place's sounds.",
  // the page and the server disagree on the sounds on offer, as when one
  // has been updated and the other not yet
  bad_request: "The place doesn't know that sound yet: it may have just been updated. Reload the page and try again.",
  not_inside: "You've already come out, so that sound wasn't left.",
  already: "You've already left a sound for while you're in here.",
  reply_gone: "That sound has been removed. Leave without a reply, or choose another sound to answer.",
  reply_private: "Sounds tied to a toilet or shower stay outside public conversations.",
  operation_conflict: "That choice has changed. Choose a sound again before leaving it.",
};
const refused = (code?: string): string => (code && REFUSED[code]) || "That didn't work. Check your connection and try again.";

async function post(path: string, method: string, body?: unknown): Promise<{ ok: boolean; code?: string; sound?: PlacedSound } | null> {
  const res = await fetch(`/api/sessions/${snapshot.sessionId}/${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  return res ? ((await res.json().catch(() => null)) as { ok: boolean; code?: string; sound?: PlacedSound } | null) : null;
}

async function leaveSound(soundId: string, whileInside = false): Promise<string | null> {
  if (!connected) return "Connection lost. Your sound wasn't sent. Reconnect, then try again from where you stand.";
  const target = whileInside ? null : replyTarget;
  const revision = replyRevision;
  if (target?.removedAt) return REFUSED.reply_gone!;
  const key = JSON.stringify([soundId, target?.id ?? null, whileInside]);
  if (operation?.key !== key) operation = { key, id: crypto.randomUUID() };
  const request = operation;
  // leaving a sound is a click, so it can turn sound on
  if (!soundscape.on) setSound(true);
  const result = await post("sounds", "POST", { soundId, operationId: request.id, ...(whileInside ? { whileInside: true } : {}), ...(target ? { replyToId: target.id } : {}) });
  if (!result?.ok || !result.sound) {
    if (result && operation === request) operation = null;
    if (result?.code === "reply_gone" && replyTarget?.id === target?.id) {
      replyTarget = { ...target!, removedAt: new Date().toISOString() };
      renderReply();
    }
    const error = refused(result?.code);
    if (!library.element.open) say(error);
    return error;
  }
  if (operation === request) operation = null;
  soundLeft(result.sound);
  if (revision === replyRevision) {
    if (!whileInside) cancelReply();
    if (library.element.open) library.close();
  }
  say(result.sound.removedAt || removedSounds.has(result.sound.id) ? "That sound was already left, then removed. It wasn't placed again."
    : whileInside ? `${soundName(soundId)} is playing. It stops when you come out.`
    : target ? `You answered ${target.by}'s ${soundName(target.soundId)} with ${soundName(soundId)}.`
    : `You left ${soundName(soundId)} here. Everyone in the place can hear it now.`);
  return null;
}

async function removeSound(sound: PlacedSound): Promise<void> {
  const result = await post(`sounds/${sound.id}`, "DELETE");
  if (!result?.ok) return say(refused(result?.code));
  soundRemoved({ type: "sound-removed", sessionId: snapshot.sessionId, id: sound.id, soundId: sound.soundId, by: me()!.name, byId: me()!.id, removedAt: new Date().toISOString() });
  say(`You removed ${soundName(sound.soundId)}.`);
}

// The compact sound switch keeps its full changing accessible name.
const soundSwitch = $<HTMLButtonElement>("sound-switch");
const SOUND_KEY = "soac-sound";
const remembered = (): string | null => {
  try {
    return localStorage.getItem(SOUND_KEY);
  } catch {
    return null;
  }
};
function setSound(on: boolean): void {
  soundscape.setOn(on);
  routineAudio.frame(npcFrames, routineListener, on, npcTime.server + Math.max(0, performance.now() - npcTime.received));
  soundSwitch.setAttribute("aria-pressed", String(on));
  const label = on ? "Sound on" : "Sound off";
  soundSwitch.querySelector<HTMLElement>(".world-action-label")!.textContent = label;
  soundSwitch.setAttribute("aria-label", label);
  soundSwitch.title = label;
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // not remembered; that's all
  }
  renderSharedPlace();
}
soundSwitch.onclick = () => setSound(!soundscape.on);

// The library is a native modal: browsing has one focus scope and never moves you.
const leaveBtn = document.createElement("button");
leaveBtn.type = "button";
leaveBtn.className = "btn primary leave-sound";
leaveBtn.id = "leave-sound";
leaveBtn.setAttribute("aria-label", "Leave a sound here");
leaveBtn.innerHTML = '<svg class="leave-icon" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 11v6m5-11v16m5-20v24m5-20v16m5-11v6"/></svg><span>Leave a sound</span>';
const library = new SoundLibrary({
  zone: () => ({ id: world.zoneAt(here.x, here.z), title: zoneTitle(here.x, here.z) }),
  listen: (id) => soundscape.listen(id),
  stop: () => soundscape.stopPreview(),
  leave: (id) => leaveSound(id),
  cancelReply: () => cancelReply(),
  close: () => { restoreWorldInput(); leaveBtn.hidden = false; },
});
const palette = library.element;
if (boot.joined) stage.append(leaveBtn, palette);
leaveBtn.onclick = () => openLibrary();

function restoreWorldInput(): void {
  const paused = !!document.querySelector("dialog:modal");
  world.setInputPaused(paused);
  if (!paused) world.focusCanvas();
}

function openLibrary(): void {
  world.setInputPaused(true);
  library.open();
  leaveBtn.hidden = true;
}

const replyIntent = document.createElement("aside");
replyIntent.id = "reply-intent";
replyIntent.className = "reply-intent";
replyIntent.hidden = true;
const replyDescription = document.createElement("p");
replyDescription.setAttribute("role", "status");
const replyHint = document.createElement("p");
replyHint.className = "reply-hint";
const replyActions = document.createElement("div");
const choose = document.createElement("button");
choose.type = "button";
choose.className = "btn primary";
choose.textContent = "Choose a sound";
choose.onclick = () => openLibrary();
const cancel = document.createElement("button");
cancel.type = "button";
cancel.className = "btn ghost";
cancel.textContent = "Cancel reply";
cancel.onclick = () => { cancelReply(); world.focusCanvas(); };
replyActions.append(choose, cancel);
replyIntent.append(replyDescription, replyHint, replyActions);
stage.append(replyIntent);

function startReply(sound: SoundReference): void {
  if (!boot.joined) return say("Enter with a name first to reply with a sound.");
  replyTarget = { ...sound };
  replyRevision++;
  operation = null;
  renderReply();
  openLibrary();
}

function cancelReply(): void {
  replyTarget = null;
  replyRevision++;
  operation = null;
  renderReply();
}

function renderReply(): void {
  replyIntent.hidden = !replyTarget;
  library.setReply(replyTarget);
  if (!replyTarget) return;
  replyDescription.textContent = "Replying to " + replyTarget.by + "'s " + soundName(replyTarget.soundId);
  replyHint.textContent = !connected ? "Connection lost. Reconnect before leaving your answer."
    : replyTarget.removedAt ? "That contribution was removed. Choose a sound for the available options."
    : "Walk to a place, then choose a sound. Your answer will stay for the next visitor.";
}

const conversations = new SoundConversations({
  load: async (id, after) => {
    const response = await fetch(`/api/sessions/${snapshot.sessionId}/sounds/${encodeURIComponent(id)}/replies${after ? "?after=" + encodeURIComponent(after) : ""}`, { signal: AbortSignal.timeout(8000) });
    return response.ok ? await response.json() as SoundReplies : null;
  },
  face: (sound) => { world.faceSound(sound.x, sound.z); say("Facing " + soundName(sound.soundId) + ". Walk closer to hear it clearly."); },
  reply: (sound) => startReply(sound),
  canReply: (sound) => boot.joined && !sound.removedAt && Math.hypot(sound.x - here.x, sound.z - here.z) <= REACH,
  joined: () => boot.joined,
  open: () => world.setInputPaused(true),
  close: () => restoreWorldInput(),
});
stage.append(conversations.element);

// Community comes before scenery settings. Reuse the existing native drawer
// and its input/focus handoff for every action, including the new entry point.
sharedPlace = new SharedSoundPlace({
  open: () => openWorldTools(sharedPlace!.trigger),
  add: () => {
    if (!boot.joined) { location.reload(); return; }
    closeWorldTools();
    openLibrary();
  },
  face: sound => {
    closeWorldTools(true);
    world.faceSound(sound.x, sound.z);
    say("Facing " + soundName(sound.soundId) + ". Walk closer to listen and reply.");
  },
  reply: sound => { closeWorldTools(); startReply(sound); },
  conversation: sound => { closeWorldTools(); conversations.open(sound.id); },
  toggleSound: () => setSound(!soundscape.on),
  zone: (x, z) => zoneTitle(x, z),
  responses: () => world.residentResponses,
});
stage.append(sharedPlace.trigger);
$("shared-sound-place").append(sharedPlace.element);

function renderSharedPlace(): void {
  sharedPlace?.setState({ sounds: [...contributions.values()], people: snapshot.online,
    you: me()?.id ?? null, joined: boot.joined, connected, soundOn: soundscape.on });
}

// ---- the page around the world --------------------------------------------

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function say(text: string): void {
  toast.textContent = "";
  const p = document.createElement("p");
  p.textContent = text;
  toast.append(p);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4500);
}

function renderStatus(): void {
  status.className = `status${connected ? "" : " offline"}`;
  status.textContent = connected ? "" : "Connection lost. Trying again…";
  environmentPanel.setAvailability({ joined: boot.joined, connected });
  renderSharedPlace();
  renderReply();
  renderRestroomStatus();
}

function renderPeople(): void {
  renderSharedPlace();
  const online = snapshot.online;
  const box = $("people");
  box.textContent = "";
  const n = document.createElement("span");
  n.className = "online-count";
  n.textContent = online.length === 0 ? "Nobody here yet" : `${online.length} here`;
  box.append(n);
  for (const p of online.slice(0, 6)) {
    const chip = document.createElement("span");
    chip.className = `person avatar-${p.avatar}${p.id === me()?.id ? " is-you" : ""}`;
    chip.textContent = p.id === me()?.id ? `${p.name} (you)` : p.name;
    box.append(chip);
  }
}

function renderZone(): void {
  environmentPanel.setZone(zoneId);
  $("zone-text").textContent = findZone(scene, zoneId)?.description ?? "";
  for (const a of document.querySelectorAll<HTMLAnchorElement>("#zones a")) {
    if (a.dataset.zone === zoneId) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  }
}

for (const a of document.querySelectorAll<HTMLAnchorElement>("#zones a")) {
  a.onclick = (e) => {
    e.preventDefault();
    closeWorldTools(true);
    world.goTo(a.dataset.zone!);
  };
}

// ---- arriving: a name, and a cat or a dog ----------------------------------

// Joining happens here, without leaving the page (POST /join answers JSON).
const enter = document.createElement("div");
enter.className = "enter-card";
const you = snapshot.you;
const art = (a: "cat" | "dog"): string => figureSvg(a, "stand", "preview");
enter.innerHTML = `<form class="enter-box">
    <h2></h2>
    <p class="enter-intro">A world you and your friends shape through sound. Make a cozy corner, a lively gathering, or something of your own. Nearby residents respond to the sounds you leave; your sounds stay until someone removes them.</p>
    <p class="enter-movement">Walk with W A S D, drag to look. Meet a named visitor to talk.</p>
    ${
      you
        ? `<p class="enter-welcome">Welcome back, <strong class="enter-name"></strong>. <button type="button" class="link-btn" data-leave>Not you?</button></p>`
        : `<label class="enter-field">Your name <input name="nickname" maxlength="24" autocomplete="nickname" /></label>
    <fieldset class="enter-avatars"><legend>Come as</legend>
      <label class="avatar-choice"><input type="radio" name="avatar" value="cat" checked /><span class="avatar-art">${art("cat")}</span><span>A cat</span></label>
      <label class="avatar-choice"><input type="radio" name="avatar" value="dog" /><span class="avatar-art">${art("dog")}</span><span>A dog</span></label>
    </fieldset>
    <p class="enter-note">Others see your name.</p>`
    }
    <p class="enter-error" role="alert" hidden></p>
    <div class="enter-actions"><button type="submit" class="btn primary" data-enter>Enter</button></div>
    ${you ? "" : `<p class="enter-look"><button type="button" class="link-btn" data-look>Just look around first</button></p>`}
  </form>`;
enter.querySelector("h2")!.textContent = scene.title;
const arrivalLook = lookSettings.choices("arrival-look-mode");
const lookHint = document.createElement("p");
lookHint.className = "look-note";
lookHint.textContent = "You can change this later in Controls.";
arrivalLook.append(lookHint);
enter.querySelector(".enter-actions")!.before(arrivalLook);
if (you) enter.querySelector(".enter-name")!.textContent = you.name;
stage.append(enter);
const form = enter.querySelector<HTMLFormElement>("form")!;
const error = enter.querySelector<HTMLParagraphElement>(".enter-error")!;
const nameInput = form.querySelector<HTMLInputElement>('input[name="nickname"]');
(nameInput ?? form.querySelector<HTMLButtonElement>("[data-enter]"))!.focus();

// Entering is a click, so it can start the sound, unless this browser
// turned it off last time.
const done = (): void => {
  enter.remove();
  setSound(remembered() !== "off");
  world.focusCanvas();
  // arriving already inside a toilet or shower asks, as walking in would
  enteredRoom(room);
  guide.begin();
};
form.onsubmit = async (e) => {
  e.preventDefault();
  if (!you) {
    const nickname = nameInput!.value.replace(/\s+/g, " ").trim();
    const avatar = (form.querySelector<HTMLInputElement>('input[name="avatar"]:checked')?.value ?? "cat") as "cat" | "dog";
    if (!nickname) {
      error.textContent = "Choose a name first.";
      error.hidden = false;
      nameInput!.focus();
      return;
    }
    const res = await fetch("/join", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ nickname, avatar, next: location.pathname }),
    }).catch(() => null);
    if (!res?.ok) {
      error.textContent = "That didn't work. Check your connection and try again.";
      error.hidden = false;
      return;
    }
    becomeJoined();
  }
  done();
};
enter.querySelector<HTMLButtonElement>("[data-look]")?.addEventListener("click", done);
enter.querySelector<HTMLButtonElement>("[data-leave]")?.addEventListener("click", () => {
  const f = document.createElement("form");
  f.method = "post";
  f.action = "/leave";
  document.body.append(f);
  f.submit();
});

// Joined from the arrival card: the stream reconnects so the server knows you.
function becomeJoined(): void {
  boot.joined = true;
  stage.append(chat, leaveBtn, palette);
  connect();
}

renderPeople();
renderZone();
renderStatus();
connect();
