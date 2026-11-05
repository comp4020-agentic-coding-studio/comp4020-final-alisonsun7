// The live place: the walkable world, who's in it, talking to whoever is
// near, and the sounds people leave where they stand (ADR 011).
import { findScene, findZone, type Scene } from "../shared/catalog.js";
import type { Person, PlacedSound, ServerMessage, Snapshot, SoundRemoved } from "../shared/protocol.js";
import { FAMILIES, SOUNDS, findSound } from "../shared/sounds.js";
import { figureSvg } from "./figures.js";
import { Soundscape } from "./soundscape.js";
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

let snapshot = boot.snapshot;
let zoneId = boot.zoneId;
let connected = false;
const me = (): Person | null => snapshot.you;

const world = new WorldView(stage, scene, mode.id, {
  startZone: zoneId,
  onZone: (zone) => {
    zoneId = zone;
    history.replaceState(null, "", `/scene/${scene.id}?mode=${mode.id}&zone=${zone}`);
    renderZone();
  },
  onListen: (l) => {
    reportPosition(l.x, l.z, l.yaw);
    soundscape.frame(l);
    here = { x: l.x, z: l.z };
  },
  onNear: (person) => showChat(person),
});
let here = { x: 0, z: 0 };

const soundscape = new Soundscape(world, stage, {
  canChange: () => boot.joined,
  onRemove: (sound) => void removeSound(sound),
});
soundscape.setAll(snapshot.sounds);

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
      renderPeople();
      soundscape.setAll(msg.sounds);
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

// Five times a second at most, and only when you've moved or turned.
function reportPosition(x: number, z: number, yaw: number): void {
  if (!boot.joined || !connected) return;
  const now = performance.now();
  if (now - lastSent.at < 200) return;
  if (Math.hypot(x - lastSent.x, z - lastSent.z) < 0.05 && Math.abs(yaw - lastSent.yaw) < 0.05 && now - lastSent.at < 5000) return;
  lastSent = { at: now, x, z, yaw };
  void fetch(`/api/sessions/${snapshot.sessionId}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round(yaw * 100) / 100 }),
  }).catch(() => undefined);
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
  if (soundscape.has(sound.id)) return;
  soundscape.add(sound);
  if (sound.byId !== me()?.id) say(`${sound.by} left ${soundName(sound.soundId)} at ${zoneTitle(sound.x, sound.z)}.`);
}

function soundRemoved(msg: SoundRemoved): void {
  if (!soundscape.has(msg.id)) return;
  soundscape.remove(msg.id);
  if (msg.byId !== me()?.id) say(`${msg.by} removed ${soundName(msg.soundId)}.`);
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
};
const refused = (code?: string): string => (code && REFUSED[code]) || "That didn't work. Check your connection and try again.";

async function post(path: string, method: string, body?: unknown): Promise<{ ok: boolean; code?: string; sound?: PlacedSound } | null> {
  const res = await fetch(`/api/sessions/${snapshot.sessionId}/${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  return res ? ((await res.json().catch(() => null)) as { ok: boolean; code?: string; sound?: PlacedSound } | null) : null;
}

async function leaveSound(soundId: string): Promise<void> {
  // leaving a sound is a click, so it can turn sound on
  if (!soundscape.on) setSound(true);
  const result = await post("sounds", "POST", { soundId });
  if (!result?.ok || !result.sound) return say(refused(result?.code));
  soundscape.add(result.sound);
  closePalette();
  say(`You left ${soundName(soundId)} here. Everyone in the place can hear it now.`);
}

async function removeSound(sound: PlacedSound): Promise<void> {
  const result = await post(`sounds/${sound.id}`, "DELETE");
  if (!result?.ok) return say(refused(result?.code));
  soundscape.remove(sound.id);
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

// "Leave a sound here", and the sounds to choose from: those that suit
// where you're standing first.
const leaveBtn = document.createElement("button");
leaveBtn.type = "button";
leaveBtn.className = "btn primary leave-sound";
leaveBtn.id = "leave-sound";
leaveBtn.textContent = "+ Leave a sound here";
const palette = document.createElement("div");
palette.className = "sound-palette";
palette.id = "sound-palette";
palette.hidden = true;
palette.setAttribute("role", "dialog");
palette.setAttribute("aria-label", "Leave a sound here");
if (boot.joined) stage.append(leaveBtn, palette);

function openPalette(): void {
  const zone = world.zoneAt(here.x, here.z);
  const sorted = [...SOUNDS].sort((a, b) => Number(b.zones.includes(zone)) - Number(a.zones.includes(zone)));
  palette.textContent = "";
  const head = document.createElement("div");
  head.className = "palette-head";
  const title = document.createElement("h2");
  title.textContent = `Leave a sound at ${zoneTitle(here.x, here.z)}`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "link-btn";
  close.textContent = "Close";
  close.onclick = () => closePalette();
  head.append(title, close);
  const list = document.createElement("ul");
  for (const kind of sorted) {
    const li = document.createElement("li");
    li.style.setProperty("--family", FAMILIES[kind.family].colour);
    const text = document.createElement("div");
    text.className = "palette-text";
    const name = document.createElement("strong");
    name.textContent = kind.label;
    const fam = document.createElement("span");
    fam.className = "palette-family";
    fam.textContent = kind.zones.includes(zone) ? `${FAMILIES[kind.family].label} · suits here` : FAMILIES[kind.family].label;
    text.append(name, fam);
    const listen = document.createElement("button");
    listen.type = "button";
    listen.className = "btn ghost";
    listen.textContent = "Listen";
    listen.onclick = () => void soundscape.listen(kind.id);
    const leave = document.createElement("button");
    leave.type = "button";
    leave.className = "btn primary";
    leave.dataset.sound = kind.id;
    leave.textContent = "Leave it here";
    leave.onclick = () => void leaveSound(kind.id);
    li.append(text, listen, leave);
    list.append(li);
  }
  const note = document.createElement("p");
  note.className = "palette-note";
  note.textContent = "It stays where you're standing until someone removes it. Listen plays a few seconds just for you.";
  palette.append(head, list, note);
  palette.hidden = false;
  leaveBtn.hidden = true;
  list.querySelector<HTMLButtonElement>("button")?.focus();
}

function closePalette(): void {
  soundscape.stopPreview();
  palette.hidden = true;
  leaveBtn.hidden = false;
  world.focusCanvas();
}

leaveBtn.onclick = () => openPalette();
palette.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePalette();
});

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
