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
import { EnvironmentPanel, type ApplyEnvironmentResult } from "./environment-panel.js";
import { WEATHER_LABELS, formatTime, minuteAt, type Environment } from "../shared/environment.js";
import { HUTS } from "../shared/huts.js";
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
    here = { x: l.x, z: l.z };
  },
  onNear: (person) => showChat(person),
  onRoom: (room) => {
    enteredRoom(room);
    guide.entered(room);
  },
  onWait: (room) => say(`Someone is in ${room.name}. Please wait: the light by the door turns green when it's free.`),
});
let here = { x: 0, z: 0 };
const lookSettings = new LookSettings({
  change: (mode) => world.setLookMode(mode),
  open: () => world.setInputPaused(true),
  close: () => restoreWorldInput(),
});
stage.append(lookSettings.element);
$("look-settings").onclick = () => lookSettings.open();

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
$("environment-settings").onclick = () => environmentPanel.open("environment");
$("scene-settings").onclick = () => environmentPanel.open("scenes");

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
const trail = new ListeningTrail((sound) => {
  world.faceSound(sound.x, sound.z);
  say("Facing " + soundName(sound.soundId) + ". Walk closer to hear it clearly.");
});
trail.setAll(snapshot.sounds);
stage.append(trail.element);

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
      receiveEnvironment(msg.environment, msg.serverNow);
      renderPeople();
      const live = new Set(msg.sounds.map((s) => s.id));
      for (const id of contributions.keys()) if (!live.has(id)) removedSounds.add(id);
      soundscape.setAll(msg.sounds);
      trail.setAll(msg.sounds);
      contributions.clear();
      for (const sound of msg.sounds) contributions.set(sound.id, sound);
      if (replyTarget) {
        const current = contributions.get(replyTarget.id);
        replyTarget = current ?? { ...replyTarget, removedAt: replyTarget.removedAt ?? msg.serverNow };
        renderReply();
      }
      conversations.changed();
    } else if (msg.sessionId !== snapshot.sessionId) return;
    else if (msg.type === "presence") {
      snapshot = { ...snapshot, online: msg.online };
      renderPeople();
    } else if (msg.type === "moves") world.setOthers(msg.people.filter((p) => p.id !== me()?.id) as Other[]);
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

// Five times a second at most, and only when you've moved or turned.
function reportPosition(x: number, z: number, yaw: number): void {
  // Keep position commands in order: a delayed rejection must not undo a
  // newer accepted move. Frames keep running; the next report uses their
  // latest position as soon as this response has been handled.
  if (moveInFlight) return;
  if (!boot.joined || !connected) return;
  const now = performance.now();
  if (now - lastSent.at < 200) return;
  if (Math.hypot(x - lastSent.x, z - lastSent.z) < 0.05 && Math.abs(yaw - lastSent.yaw) < 0.05 && now - lastSent.at < 5000) return;
  lastSent = { at: now, x, z, yaw };
  moveInFlight = true;
  void fetch(`/api/sessions/${snapshot.sessionId}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round(yaw * 100) / 100 }),
    signal: AbortSignal.timeout(5000),
  }).then(async (response) => {
    if (response.status !== 409) return;
    const result = await response.json() as MoveResult;
    if (!result.ok && result.code === "hut_taken") {
      world.correctPosition(result.position);
      lastSent = { at: 0, x: NaN, z: NaN, yaw: NaN };
      const hut = HUTS.find((h) => h.id === result.hutId);
      say("Someone is in " + (hut?.name ?? "that room") + ". Please wait for the green light.");
    }
  }).catch(() => undefined).finally(() => { moveInFlight = false; });
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
  soundscape.add(sound);
  trail.add(sound);
  conversations.changed(sound.id, sound.replyTo?.id);
  // a stay in the toilets or showers isn't news
  if (sound.byId !== me()?.id && !sound.whileIn) say(sound.replyTo
    ? `${sound.by} answered ${sound.replyTo.by}'s ${soundName(sound.replyTo.soundId)} with ${soundName(sound.soundId)}.`
    : `${sound.by} left ${soundName(sound.soundId)} at ${zoneTitle(sound.x, sound.z)}.`);
}

function soundRemoved(msg: SoundRemoved): void {
  removedSounds.add(msg.id);
  contributions.delete(msg.id);
  const removedAt = msg.removedAt ?? new Date().toISOString();
  for (const [id, sound] of contributions) {
    if (sound.replyTo?.id === msg.id) contributions.set(id, { ...sound, replyTo: { ...sound.replyTo, removedAt } });
  }
  if (replyTarget?.id === msg.id) {
    replyTarget = { ...replyTarget, removedAt };
    renderReply();
  }
  conversations.changed(msg.id);
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

// The sound switch in the header: remembered in this browser.
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
  soundSwitch.setAttribute("aria-pressed", String(on));
  soundSwitch.textContent = on ? "Sound on" : "Sound off";
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // not remembered; that's all
  }
}
soundSwitch.onclick = () => setSound(!soundscape.on);

// The library is a native modal: browsing has one focus scope and never moves you.
const leaveBtn = document.createElement("button");
leaveBtn.type = "button";
leaveBtn.className = "btn primary leave-sound";
leaveBtn.id = "leave-sound";
leaveBtn.innerHTML = '<span aria-hidden="true" class="leave-icon">+</span> Leave a sound here';
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
  renderReply();
}

function renderPeople(): void {
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
    <p class="enter-intro">Walk with W A S D, drag to look. Meet someone to talk.</p>
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
