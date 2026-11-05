// The live place: the walkable world, who's in it, and talking to whoever is
// near. Sound was taken out (ADR 010); what's here is the place and the
// people in it.
import { findScene, findZone, type Scene } from "../shared/catalog.js";
import type { Person, ServerMessage, Snapshot } from "../shared/protocol.js";
import { figureSvg } from "./figures.js";
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
  onListen: (l) => reportPosition(l.x, l.z, l.yaw),
  onNear: (person) => showChat(person),
});

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
    } else if (msg.sessionId !== snapshot.sessionId) return;
    else if (msg.type === "presence") {
      snapshot = { ...snapshot, online: msg.online };
      renderPeople();
    } else if (msg.type === "moves") world.setOthers(msg.people.filter((p) => p.id !== me()?.id) as Other[]);
    else if (msg.type === "said" && msg.by !== me()?.id) world.showSaid(msg.by, msg.text);
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

const done = (): void => {
  enter.remove();
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
  stage.append(chat);
  connect();
}

renderPeople();
renderZone();
renderStatus();
connect();
