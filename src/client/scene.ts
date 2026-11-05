// The live place. Shows the server's state and nothing else: a sound appears
// as placed only when the server has committed it, so the page never claims
// a change that wasn't saved.
import { CATEGORIES, PER_PERSON, SOUNDS, SPOT_MAX, checkPlace, findScene, findShot, soundsIn, type Scene, type SoundId } from "../shared/catalog.js";
import { REJECT_MESSAGES, type Committed, type Person, type Placement, type ServerMessage, type Snapshot } from "../shared/protocol.js";

import { applyCommitted, formatClock, remainingMs, type LiveState } from "../shared/state.js";
import { AudioEngine } from "./audio.js";
import { newOperationId, sendOp, type OpBody } from "./ops.js";
import { drawShot, drawWeather, pulse } from "./stage.js";
import { figureSvg } from "./figures.js";
import { WorldView, type Other } from "./world.js";

interface Boot {
  sceneId: string;
  mode: string;
  shotId: string;
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
const hint = $("hint");

let live: LiveState = { snapshot: boot.snapshot, gap: false };
let shotId = boot.shotId;
// offset between the server's clock and this browser's, so the countdown is
// the server's time, not whatever this machine thinks
let skewMs = Date.parse(boot.snapshot.serverNow) - Date.now();
let connected = false;
let choosing: SoundId | null = null;
let selected: string | null = null;
let category = CATEGORIES[0];
const pending = new Set<string>();

const audio = new AudioEngine(mode.ambience);
audio.indoorAmbience = scene.indoorAmbience ?? "room";
const me = (): Person | null => live.snapshot.you;

// The walkable world (ADR 004) instead of a photo: the zone you're standing
// in plays the part of the shot you're looking at.
const world =
  scene.view === "world"
    ? new WorldView(stage, scene, mode.id, {
        startZone: shotId,
        onZone: (zone) => {
          shotId = zone;
          history.replaceState(null, "", `/scene/${scene.id}?mode=${mode.id}&shot=${zone}`);
          render();
        },
        onListen: (l) => {
          audio.listen(l.x, l.y, l.z, l.yaw, l.inside, l.ambience);
          reportPosition(l.x, l.z, l.yaw);
        },
        onNear: (person) => showChat(person),
      })
    : null;

// ---- where you are, and talking to whoever is near (ADR 007) ----------

const living = scene.living === true;
let lastSent = { at: 0, x: NaN, z: NaN, yaw: NaN };

// Five times a second at most, and only when you've moved or turned.
function reportPosition(x: number, z: number, yaw: number): void {
  if (!living || !boot.joined || !connected) return;
  const now = performance.now();
  if (now - lastSent.at < 200) return;
  if (Math.hypot(x - lastSent.x, z - lastSent.z) < 0.05 && Math.abs(yaw - lastSent.yaw) < 0.05 && now - lastSent.at < 5000) return;
  lastSent = { at: now, x, z, yaw };
  void fetch(`/api/sessions/${live.snapshot.sessionId}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round(yaw * 100) / 100 }),
  }).catch(() => undefined);
}

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
if (living && boot.joined) stage.append(chat);

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
    world?.focusCanvas();
  }
});

chat.onsubmit = async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const res = await fetch(`/api/sessions/${live.snapshot.sessionId}/say`, {
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

// ---- server messages ----------------------------------------------------

function onSnapshot(snap: Snapshot): void {
  const sessionChanged = snap.sessionId !== live.snapshot.sessionId;
  live = { snapshot: snap, gap: false };
  skewMs = Date.parse(snap.serverNow) - Date.now();
  if (selected && !snap.placements.some((p) => p.id === selected)) selected = null;
  // The new, empty session arrives right after "saved": keep the link to
  // the memory in what people read, rather than replacing it.
  if (sessionChanged && snap.status === "idle") {
    say(
      "A place, made alive together. It's silent again, ready for the next memory.",
      snap.lastMemoryId ? `/memory/${snap.lastMemoryId}` : undefined,
    );
  }
  render();
}

function onCommitted(ev: Committed): void {
  const before = live.snapshot;
  live = applyCommitted(live, ev);
  if (live.gap) {
    // We missed something: never guess, refetch the whole state.
    void refetch();
    return;
  }
  if (live.snapshot === before) return;
  skewMs = Date.parse(ev.serverAt) - Date.now();
  const mine = ev.by !== null && ev.by === me()?.id;
  const p = ev.payload;
  if (!mine) {
    const who = live.snapshot.online.find((x) => x.id === ev.by)?.name ?? before.placements.find((x) => x.ownerId === ev.by)?.ownerName ?? "Someone";
    if (p.kind === "sound.add") say(`${p.placement.ownerName} ${living ? "chose" : "added"} ${SOUNDS[p.placement.soundId].label.toLowerCase()} at ${anchorLabel(p.placement)}.`);
    if (p.kind === "sound.remove") {
      const gone = before.placements.find((x) => x.id === p.placementId);
      say(living && gone ? `${who} turned off the ${SOUNDS[gone.soundId].label.toLowerCase()} at ${anchorLabel(gone)}.` : `${who} removed a sound.`);
    }
    if (p.kind === "sound.update" && p.patch.gain !== undefined) {
      const was = before.placements.find((x) => x.id === p.patch.placementId);
      if (was && was.gain !== p.patch.gain) say(`${who} turned ${was.ownerId === me()?.id ? "your" : `${was.ownerName}'s`} ${SOUNDS[was.soundId].label.toLowerCase()} ${p.patch.gain > was.gain ? "up" : "down"}.`);
    }
    if (p.kind === "session.start") say(`${who} started a 3-minute memory.`);
  }
  if (p.kind === "session.saved") say("A place, made alive together.", `/memory/${p.memoryId}`);
  if (p.kind === "session.failed") say(p.error);
  render();
}

async function refetch(): Promise<void> {
  try {
    const res = await fetch(`/api/sessions/${live.snapshot.sessionId}`);
    if (res.ok) onSnapshot((await res.json()) as Snapshot);
  } catch {
    // the stream's reconnect will bring a snapshot
  }
}

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
    if (msg.type === "snapshot") onSnapshot(msg);
    else if (msg.type === "committed") onCommitted(msg);
    else if (msg.type === "moves" && msg.sessionId === live.snapshot.sessionId) {
      world?.setOthers(msg.people.filter((p) => p.id !== me()?.id) as Other[]);
    } else if (msg.type === "said" && msg.sessionId === live.snapshot.sessionId) {
      if (msg.by !== me()?.id) world?.showSaid(msg.by, msg.text);
    } else if (msg.type === "presence" && msg.sessionId === live.snapshot.sessionId) {
      live = { ...live, snapshot: { ...live.snapshot, online: msg.online } };
      renderPeople();
    }
    if (!connected) {
      connected = true;
      renderStatus();
    }
  };
  // EventSource reconnects by itself; every reconnect starts with a fresh
  // snapshot from the server, so nothing missed is replayed or lost.
  source.onerror = () => {
    connected = false;
    renderStatus();
  };
}

// ---- sending ------------------------------------------------------------

async function send(body: OpBody, waiting: string): Promise<boolean> {
  if (!connected) {
    say("Connection lost. New changes aren't saved yet.");
    return false;
  }
  const id = newOperationId();
  pending.add(id);
  renderStatus(waiting);
  const result = await sendOp(live.snapshot.sessionId, body, id);
  pending.delete(id);
  if (!result.ok) {
    if (result.code === "stale" && result.placement) await refetch();
    say(REJECT_MESSAGES[result.code] ?? result.message);
    renderStatus();
    return false;
  }
  // Apply what the server committed now, rather than waiting for the echo on
  // the stream; the echo is then ignored as already seen.
  for (const c of result.committed) onCommitted(c);
  renderStatus();
  return true;
}

// A volume slider sends on every step, and a step sent before the last one
// came back would carry an old revision and be refused as someone else's
// change. So steps for one sound wait their turn, and only the latest waiting
// value is sent, with the revision the previous step produced.
const volumeWaiting = new Map<string, number>();

async function setVolume(placementId: string, gain: number): Promise<void> {
  const sending = volumeWaiting.has(placementId);
  volumeWaiting.set(placementId, gain);
  if (sending) return;
  while (volumeWaiting.has(placementId)) {
    const next = volumeWaiting.get(placementId)!;
    const p = live.snapshot.placements.find((x) => x.id === placementId);
    if (!p) break;
    const ok = await send({ type: "sound.update", placementId, baseRevision: p.revision, gain: next }, "Saving…");
    if (!ok || volumeWaiting.get(placementId) === next) break;
  }
  volumeWaiting.delete(placementId);
}

async function place(anchorId: string, inShot = shotId): Promise<void> {
  if (!choosing) {
    say("Choose a sound below first, then a spot for it.");
    document.querySelector<HTMLElement>(".chip")?.focus();
    return;
  }
  const soundId = choosing;
  if (await addSound(soundId, inShot, anchorId)) {
    choosing = null;
    render();
  }
}

async function addSound(soundId: SoundId, inShot: string, anchorId: string): Promise<boolean> {
  const check = checkPlace(scene.id, inShot, anchorId, soundId);
  if (!check.ok) {
    say(REJECT_MESSAGES[check.code]);
    return false;
  }
  const ok = await send({ type: "sound.add", soundId, shotId: inShot, anchorId, gain: 0.7 }, "Saving your sound…");
  if (ok) say(`${SOUNDS[soundId].label} added. Everyone here can hear it.${audio.enabled ? "" : " Turn sound on to hear it too."}`);
  return ok;
}

// ---- a spot's card: what's playing there, and what you can add ---------

let openSpot: { shot: string; anchor: string } | null = null;
let cardSignature = "";
const card = document.createElement("section");
card.className = "spot-card";
card.hidden = true;
card.setAttribute("role", "dialog");
if (world) stage.append(card);

function openCard(inShot: string, anchorId: string): void {
  openSpot = { shot: inShot, anchor: anchorId };
  choosing = null;
  render();
  card.querySelector<HTMLElement>("[data-focus-key]")?.focus();
}

function closeCard(): void {
  openSpot = null;
  render();
  world?.focusCanvas();
}

function button(text: string, key: string, onClick: () => void, cls = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.dataset.focusKey = key;
  if (cls) b.className = cls;
  b.onclick = onClick;
  return b;
}

function renderCard(): void {
  if (!world) return;
  const found = openSpot && findShot(scene, openSpot.shot);
  const anchor = found && found.anchors.find((a) => a.id === openSpot!.anchor);
  if (!found || !anchor) {
    card.hidden = true;
    cardSignature = "";
    return;
  }
  const here = live.snapshot.placements.filter((p) => p.shotId === found.id && p.anchorId === anchor.id);
  const mineCount = live.snapshot.placements.filter((p) => p.ownerId === me()?.id).length;
  // rebuild only when something on the card changed, so a slider isn't
  // replaced under your finger
  const signature = JSON.stringify([found.id, anchor.id, here.map((p) => [p.id, p.gain, p.revision, p.adjustedBy]), boot.joined, audio.enabled, mineCount]);
  card.hidden = false;
  if (signature === cardSignature) return;
  cardSignature = signature;
  card.setAttribute("aria-label", `Sounds at ${anchor.label}`);
  card.textContent = "";

  const head = document.createElement("header");
  const h = document.createElement("h3");
  h.textContent = anchor.label;
  const where = document.createElement("span");
  where.className = "card-where";
  where.textContent = found.title;
  head.append(h, where, button("Close", "card-close", closeCard, "card-close"));
  card.append(head);

  if (!audio.enabled) {
    const off = document.createElement("p");
    off.className = "card-sound-off";
    off.append("Sound is off. ", button("Turn sound on", "card-sound", () => void turnSoundOn(), "link-btn"));
    card.append(off);
  }

  // What's playing here (in a living place, at most one sound), with its
  // volume for everyone and a way to turn it off.
  const h4a = document.createElement("h4");
  h4a.textContent = living ? "Playing here now" : "Playing here";
  const playing = document.createElement("ul");
  playing.className = "card-list";
  if (here.length === 0) playing.innerHTML = `<li class="empty">Nothing: this place is quiet.</li>`;
  for (const p of here) {
    const li = document.createElement("li");
    const mine = p.ownerId === me()?.id;
    const name = document.createElement("span");
    name.className = "card-sound";
    name.textContent = SOUNDS[p.soundId].label;
    const by = document.createElement("span");
    by.className = "card-by";
    by.textContent = `${living ? "chosen by" : "by"} ${mine ? "you" : p.ownerName}${p.adjustedBy && p.adjustedBy !== p.ownerName ? ` · volume set by ${p.adjustedBy === me()?.name ? "you" : p.adjustedBy}` : ""}`;
    li.append(name, by);
    if (boot.joined && (mine || living)) {
      const vol = document.createElement("input");
      vol.type = "range";
      vol.min = "0";
      vol.max = "100";
      vol.step = "5";
      vol.value = String(Math.round((volumeWaiting.get(p.id) ?? p.gain) * 100));
      vol.dataset.focusKey = `card-vol:${p.id}`;
      vol.setAttribute("aria-label", `Volume of the ${SOUNDS[p.soundId].label.toLowerCase()} here, for everyone`);
      vol.onchange = () => void setVolume(p.id, Number(vol.value) / 100);
      li.append(vol);
    } else {
      const v = document.createElement("span");
      v.className = "vol";
      v.textContent = `${Math.round(p.gain * 100)}%`;
      li.append(v);
    }
    if (boot.joined && (mine || living))
      li.append(
        button(living ? "Turn off" : "Remove", `card-remove:${p.id}`, () => void send({ type: "sound.remove", placementId: p.id, baseRevision: p.revision }, "Turning off…").then((ok) => ok && say(living ? `${anchor.label} is quiet again.` : "Sound removed.")), "remove"),
      );
    playing.append(li);
  }
  card.append(h4a, playing);

  // The sounds this place can have. In a living place choosing one plays it
  // here, switching whatever was playing.
  const h4b = document.createElement("h4");
  h4b.textContent = living ? "Choose this place's sound" : "Add a sound here";
  const options = document.createElement("ul");
  options.className = "card-list";
  const current = living ? here[0] : undefined;
  for (const id of anchor.sounds) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "card-sound";
    name.textContent = SOUNDS[id].label;
    const listen = button("▶ Listen", `card-listen:${id}`, () => void audio.preview(id).then((ok) => ok || say("This browser wouldn't play sound.")), "link-btn");
    listen.setAttribute("aria-label", `Listen to ${SOUNDS[id].label.toLowerCase()} (only you hear this)`);
    li.append(name, listen);
    if (boot.joined) {
      const label = !living ? "+ Add here" : current?.soundId === id ? "Playing" : current ? "Switch to this" : "Play here";
      const add = button(label, `card-add:${id}`, () => void addSound(id, found.id, anchor.id), "btn primary small");
      add.disabled = current?.soundId === id;
      li.append(add);
    }
    options.append(li);
  }
  card.append(h4b, options);

  const foot = document.createElement("p");
  foot.className = "card-foot";
  if (!boot.joined) {
    foot.append("Choose a name to change sounds: ");
    const a = document.createElement("a");
    a.href = "#tray";
    a.textContent = "join below";
    foot.append(a);
  } else if (living) foot.textContent = "Anyone here can choose, switch, turn up or down, or turn off this place's sound. It stays for everyone.";
  else foot.textContent = `You've added ${mineCount} of ${PER_PERSON}.`;
  card.append(foot);
}

async function turnSoundOn(): Promise<boolean> {
  const ok = await audio.enable();
  if (ok) {
    toggle.textContent = "Mute";
    toggle.setAttribute("aria-pressed", "true");
    syncAudio();
  } else say("This browser wouldn't start audio. Everything else still works.");
  renderHint();
  render();
  return ok;
}

// ---- rendering ----------------------------------------------------------

function anchorLabel(p: Pick<Placement, "shotId" | "anchorId">): string {
  const shot = findShot(scene, p.shotId);
  const a = shot?.anchors.find((x) => x.id === p.anchorId);
  return `${a?.label.toLowerCase() ?? p.anchorId}${shot && shot.id !== shotId ? ` (${shot.title})` : ""}`;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function say(text: string, link?: string): void {
  toast.textContent = "";
  const p = document.createElement("p");
  p.textContent = text;
  if (link) {
    const a = document.createElement("a");
    a.href = link;
    a.textContent = "View memory";
    p.append(" ", a);
  }
  toast.append(p);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), link ? 12000 : 4500);
}

function renderStatus(waiting?: string): void {
  status.className = `status${connected ? "" : " offline"}`;
  status.textContent = !connected
    ? "Connection lost. New changes aren't saved yet."
    : pending.size > 0
      ? (waiting ?? "Saving…")
      : "";
}

function renderPeople(): void {
  const online = live.snapshot.online;
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

function soundRow(p: Placement, mine: boolean): HTMLLIElement {
  const li = document.createElement("li");
  li.className = `sound-row${p.id === selected ? " selected" : ""}`;
  li.dataset.placement = p.id;
  const name = document.createElement("button");
  name.type = "button";
  name.dataset.focusKey = `name:${p.id}`;
  name.className = "sound-name";
  name.textContent = SOUNDS[p.soundId].label;
  name.onclick = () => {
    selected = p.id;
    if (p.shotId !== shotId) goShot(p.shotId);
    else render();
  };
  const where = document.createElement("span");
  where.className = "where";
  where.textContent = mine ? anchorLabel(p) : `${p.ownerName} · ${anchorLabel(p)}`;
  li.append(name, where);

  // In a living place anyone can turn any sound up or down, for everyone.
  if (mine || (living && boot.joined)) {
    const vol = document.createElement("input");
    vol.type = "range";
    vol.min = "0";
    vol.max = "100";
    vol.step = "5";
    vol.value = String(Math.round((volumeWaiting.get(p.id) ?? p.gain) * 100));
    vol.setAttribute("aria-label", mine ? `Volume of your ${SOUNDS[p.soundId].label.toLowerCase()}` : `Volume of ${p.ownerName}'s ${SOUNDS[p.soundId].label.toLowerCase()}, for everyone`);
    vol.dataset.focusKey = `vol:${p.id}`;
    vol.onchange = () => void setVolume(p.id, Number(vol.value) / 100);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.focusKey = `remove:${p.id}`;
    remove.className = "remove";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove your ${SOUNDS[p.soundId].label.toLowerCase()}`);
    remove.onclick = async () => {
      if (await send({ type: "sound.remove", placementId: p.id, baseRevision: p.revision }, "Removing…")) say("Sound removed.");
    };
    li.append(vol);
    if (living) {
      remove.textContent = "Turn off";
      remove.setAttribute("aria-label", `Turn off the ${SOUNDS[p.soundId].label.toLowerCase()} at ${anchorLabel(p)}`);
    }
    if (mine || living) li.append(remove);
  } else {
    const vol = document.createElement("span");
    vol.className = "vol";
    vol.textContent = `${Math.round(p.gain * 100)}%`;
    li.append(vol);
  }
  return li;
}

function renderLists(): void {
  const mine = $("mine");
  const theirs = $("theirs");
  mine.textContent = "";
  theirs.textContent = "";
  const myId = me()?.id;
  const ps = live.snapshot.placements;
  for (const p of ps) (p.ownerId === myId ? mine : theirs).append(soundRow(p, p.ownerId === myId));
  if (!mine.children.length) mine.innerHTML = `<li class="empty">${boot.joined ? "None yet." : "Join to add sounds."}</li>`;
  if (!theirs.children.length) theirs.innerHTML = `<li class="empty">None yet.</li>`;

  for (const el of document.querySelectorAll<HTMLElement>("[data-count]")) {
    const n = ps.filter((p) => p.shotId === el.dataset.count).length;
    el.textContent = n ? String(n) : "";
  }
}

function renderSession(): void {
  const box = $("session");
  const s = live.snapshot;
  box.textContent = "";
  if (living) {
    // nothing to record: the place itself keeps what people leave
    const h = document.createElement("h2");
    h.textContent = "A place that keeps its sounds";
    const p = document.createElement("p");
    p.className = "fine";
    const n = s.placements.length;
    const people = new Set(s.placements.map((x) => x.ownerName)).size;
    p.textContent = `${n === 0 ? "It's quiet so far." : `${n} of its places ${n === 1 ? "has a sound" : "have sounds"}, chosen by ${people} ${people === 1 ? "person" : "people"}.`} Each place plays one sound. Click a label to choose it, switch it, turn it up or down, or off. It stays, for everyone, at every time of day.`;
    box.append(h, p);
    return;
  }
  const h = document.createElement("h2");
  const p = document.createElement("p");
  p.className = "fine";
  box.append(h);

  if (s.status === "idle") {
    h.textContent = "Start a 3-minute memory";
    p.textContent = "When it starts, everyone here gets the same three minutes. At the end the place is saved as it sounds, with everyone's names, and starts silent again.";
    box.append(p);
    if (boot.joined) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn primary";
      b.textContent = "Start a 3-minute memory";
      b.onclick = async () => {
        if (await send({ type: "session.start" }, "Starting…")) say(s.online.length < 2 ? "Recording. It's better with someone else here: send them this page's link." : "Recording. Everyone here has three minutes.");
      };
      box.append(b);
    }
  } else if (s.status === "active") {
    h.innerHTML = `Time remaining <span class="clock" id="clock"></span>`;
    const starter = s.online.find((x) => x.id === s.startedBy)?.name;
    p.textContent = starter ? `${starter} started this memory. It saves itself at the end.` : "It saves itself at the end.";
    box.append(p);
    const bar = document.createElement("div");
    bar.className = "progress";
    bar.innerHTML = `<span id="progress"></span>`;
    box.append(bar);
    if (s.startedBy && s.startedBy === me()?.id) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn ghost";
      b.textContent = "Save this memory now";
      b.onclick = () => void send({ type: "session.finish" }, "Saving the memory…");
      box.append(b);
    }
    tickClock();
  } else if (s.status === "ending") {
    h.textContent = "Saving this memory…";
  } else if (s.status === "failed") {
    h.textContent = "The memory wasn't saved";
    p.textContent = s.error ?? REJECT_MESSAGES.save_failed;
    box.append(p);
    if (boot.joined) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn primary";
      b.textContent = "Try saving again";
      b.onclick = () => void send({ type: "session.finish" }, "Saving the memory…");
      box.append(b);
    }
  } else {
    h.textContent = "Saved";
  }

  if (s.lastMemoryId && s.status !== "saved") {
    const a = document.createElement("a");
    a.href = `/memory/${s.lastMemoryId}`;
    a.className = "last-memory";
    a.textContent = "View the last memory made here";
    box.append(a);
  }
}

function tickClock(): void {
  const clock = document.getElementById("clock");
  const bar = document.getElementById("progress");
  const s = live.snapshot;
  if (!clock || s.status !== "active") return;
  const left = remainingMs(s, Date.now() + skewMs);
  clock.textContent = formatClock(left);
  if (bar) bar.style.width = `${(100 * (1 - left / s.durationMs)).toFixed(1)}%`;
}
setInterval(tickClock, 250);

function renderTray(): void {
  const cats = document.getElementById("cats");
  const chips = document.getElementById("chips");
  if (!cats || !chips) return;
  const available = soundsIn(scene);
  const shot = findShot(scene, shotId)!;
  const hereOk = new Set(shot.anchors.flatMap((a) => a.sounds));
  // in the world, say which part of it a sound belongs in
  const whereElse = (id: SoundId): string =>
    world
      ? `at ${scene.shots
          .filter((s) => s.anchors.some((a) => a.sounds.includes(id)))
          .map((s) => s.title.toLowerCase())
          .slice(0, 2)
          .join(" or ")}`
      : "in another view";
  const usedCats = CATEGORIES.filter((c) => available.some((id) => SOUNDS[id].category === c));
  if (!usedCats.includes(category)) category = usedCats[0];

  cats.textContent = "";
  for (const c of usedCats) {
    const b = document.createElement("button");
    b.type = "button";
    b.role = "tab";
    b.dataset.focusKey = `cat:${c}`;
    b.className = "cat";
    b.textContent = c;
    b.setAttribute("aria-selected", String(c === category));
    b.setAttribute("aria-controls", "chips");
    // One tab stop for the whole list: arrows move between kinds, Tab goes
    // on to the sounds.
    b.tabIndex = c === category ? 0 : -1;
    b.onclick = () => {
      category = c;
      keepingFocus(renderTray);
    };
    b.onkeydown = (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      category = usedCats[(usedCats.indexOf(c) + step + usedCats.length) % usedCats.length];
      renderTray();
      document.querySelector<HTMLElement>(`[data-focus-key="cat:${category}"]`)?.focus();
    };
    cats.append(b);
  }

  chips.textContent = "";
  for (const id of available.filter((x) => SOUNDS[x].category === category)) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.focusKey = `chip:${id}`;
    b.className = `chip${choosing === id ? " active" : ""}${hereOk.has(id) ? "" : " elsewhere"}`;
    b.setAttribute("aria-pressed", String(choosing === id));
    b.innerHTML = `<span class="chip-name"></span><span class="chip-where"></span>`;
    b.querySelector(".chip-name")!.textContent = SOUNDS[id].label;
    b.querySelector(".chip-where")!.textContent = hereOk.has(id) ? "" : whereElse(id);
    b.onclick = () => {
      choosing = choosing === id ? null : id;
      selected = null;
      render();
      if (choosing) {
        const first = stage.querySelector<HTMLButtonElement>(".anchor.accepts:not([hidden])");
        if (world) say(first ? "Click a glowing spot to put it there." : `Walk to a glowing spot ${whereElse(choosing)}, or use Go to.`);
        else say(first ? "Choose a place for this sound." : "That sound belongs in another part of this scene. Try another view below.");
        first?.focus();
      }
    };
    chips.append(b);
  }
}

function renderHint(): void {
  const s = live.snapshot;
  hint.textContent = "";
  if (choosing)
    hint.textContent = living
      ? `${SOUNDS[choosing].label} can go at the highlighted labels: click one to open it. Esc to cancel.`
      : `Choose a place for ${SOUNDS[choosing].label.toLowerCase()}. Highlighted spots accept it. Esc to cancel.`;
  else if (!audio.enabled) {
    // a real button, not words that look like one
    hint.append("Sound is off. ", button("Turn sound on", "hint-sound", () => void turnSoundOn(), "link-btn"));
  } else if (s.placements.length === 0) hint.textContent = "This place has its shape, but not yet its sound. Click a label to give it one.";
}

function syncAudio(): void {
  const sources = new Map<string, { soundId: SoundId; gain: number; pan: number; away: boolean; pos?: [number, number, number]; inside?: boolean; onPlay?: () => void }>();
  for (const p of live.snapshot.placements) {
    const at = world?.where(p);
    if (world && at) {
      sources.set(p.id, { soundId: p.soundId, gain: p.gain, pan: p.pan, away: false, pos: at.pos, inside: at.inside, onPlay: () => world.pulse(p.id) });
      continue;
    }
    const away = p.shotId !== shotId;
    sources.set(p.id, { soundId: p.soundId, gain: p.gain, pan: p.pan, away, onPlay: away ? undefined : () => pulse(stage, p.id) });
  }
  audio.sync(sources);
  // for the end-to-end checks: how many of the place's sounds are playing
  stage.dataset.playing = String(audio.playing);
}

// Rebuilding the lists and tray replaces their controls; put focus back on
// the same control, so a keyboard user's next key still means something.
function keepingFocus(rebuild: () => void): void {
  const active = document.activeElement as HTMLElement | null;
  const key = active?.dataset.focusKey ?? (active?.dataset.anchor ? `anchor:${active.dataset.anchor}` : undefined);
  rebuild();
  if (key && !document.contains(active)) {
    const again = key.startsWith("anchor:")
      ? stage.querySelector<HTMLElement>(`.anchor[data-anchor="${CSS.escape(key.slice(7))}"]`)
      : document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`);
    again?.focus();
  }
}

function render(): void {
  keepingFocus(draw);
}

function draw(): void {
  const shot = findShot(scene, shotId)!;
  if (world) {
    world.draw(live.snapshot.placements, {
      interactive: boot.joined,
      mineId: me()?.id ?? null,
      choosing,
      selected,
      openSpot: openSpot ? `${openSpot.shot}/${openSpot.anchor}` : null,
      // with a sound chosen in the tray, a spot takes it; otherwise it opens
      // with a sound picked in the tray: elsewhere it goes straight there; in a
      // living place it opens the spot's card, the one way to change a sound
      onAnchor: (zone, id) => (choosing && !living ? void place(id, zone) : openCard(zone, id)),
      onMarker: (id) => {
        const p = live.snapshot.placements.find((x) => x.id === id);
        if (p) openCard(p.shotId, p.anchorId);
      },
    });
    renderCard();
  } else drawShot(stage, scene, shot, live.snapshot.placements, {
    interactive: boot.joined,
    mineId: me()?.id ?? null,
    choosing,
    selected,
    onAnchor: (id) => void place(id),
    onLink: (to) => goLink(to),
    onMarker: (id) => {
      selected = selected === id ? null : id;
      render();
      document.querySelector<HTMLElement>(`.sound-row[data-placement="${id}"] .sound-name`)?.focus();
    },
  });
  if (!world && (!stage.querySelector(".weather, .passers") || stage.dataset.mode !== mode.id)) {
    drawWeather(stage, mode.id, shot);
    stage.dataset.mode = mode.id;
  }
  $("evidence-text").textContent = shot.evidence;
  const postcard = document.getElementById("postcard") as HTMLAnchorElement | null;
  if (postcard && shot.thumb && postcard.dataset.shot !== shot.id) {
    postcard.dataset.shot = shot.id;
    postcard.href = shot.thumb.replace("-thumb", "");
    postcard.querySelector("img")!.src = shot.thumb;
    postcard.querySelector(".postcard-title")!.textContent = shot.title;
  }
  for (const a of document.querySelectorAll<HTMLAnchorElement>("#shots a")) {
    if (a.dataset.shot === shotId) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  }
  renderPeople();
  renderLists();
  renderSession();
  renderTray();
  renderHint();
  renderStatus();
  syncAudio();
}

// ---- navigation ---------------------------------------------------------

function goShot(id: string): void {
  if (!findShot(scene, id)) return;
  if (world) {
    world.goTo(id);
    return;
  }
  shotId = id;
  history.replaceState(null, "", `/scene/${scene.id}?mode=${mode.id}&shot=${id}`);
  stage.querySelector(".weather")?.remove();
  stage.querySelector(".passers")?.remove();
  render();
}

function goLink(to: string): void {
  if (!to.includes("/")) return goShot(to);
  const [sceneId, shot] = to.split("/");
  const target = findScene(sceneId);
  if (!target) return;
  const m = target.modes.find((x) => x.id === mode.id) ?? target.modes[0];
  // Leaving through a door: fade the place out, then go.
  document.body.classList.add("leaving");
  setTimeout(() => (location.href = `/scene/${sceneId}?mode=${m.id}&shot=${shot}`), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450);
}

for (const a of document.querySelectorAll<HTMLAnchorElement>("#shots a")) {
  a.onclick = (e) => {
    e.preventDefault();
    goShot(a.dataset.shot!);
  };
}

// ---- controls -----------------------------------------------------------

const toggle = $<HTMLButtonElement>("sound-toggle");
toggle.disabled = false;
toggle.onclick = async () => {
  if (audio.enabled) {
    await audio.disable();
    toggle.textContent = "Enable sound";
    toggle.setAttribute("aria-pressed", "false");
    renderHint();
    render();
  } else await turnSoundOn();
};

// Arriving in a walkable place: say who you are (a name and a cat or a dog)
// and whether to come in with sound, in one step, without leaving the page,
// so the click that sound needs is still the click that starts it. Sound
// never starts by itself.
if (world) {
  const enter = document.createElement("div");
  enter.className = "enter-card";
  const you = live.snapshot.you;
  const art = (a: "cat" | "dog"): string => figureSvg(a, "stand", "preview");
  enter.innerHTML = `<form class="enter-box">
    <h2></h2>
    <p class="enter-intro">Walk with W A S D, drag to look. Click any label to hear and add sounds; meet someone to talk.</p>
    ${
      you
        ? `<p class="enter-welcome">Welcome back, <strong class="enter-name"></strong>. <button type="button" class="link-btn" data-leave>Not you?</button></p>`
        : `<label class="enter-field">Your name <input name="nickname" maxlength="24" autocomplete="nickname" /></label>
    <fieldset class="enter-avatars"><legend>Come as</legend>
      <label class="avatar-choice"><input type="radio" name="avatar" value="cat" checked /><span class="avatar-art">${art("cat")}</span><span>A cat</span></label>
      <label class="avatar-choice"><input type="radio" name="avatar" value="dog" /><span class="avatar-art">${art("dog")}</span><span>A dog</span></label>
    </fieldset>
    <p class="enter-note">Others see your name. What you add stays for everyone.</p>`
    }
    <p class="enter-error" role="alert" hidden></p>
    <div class="enter-actions"><button type="submit" class="btn primary" data-sound="on">Enter with sound</button><button type="submit" class="btn ghost" data-sound="off">Enter quietly</button></div>
    ${you ? "" : `<p class="enter-look"><button type="button" class="link-btn" data-look>Just look around first</button></p>`}
  </form>`;
  enter.querySelector("h2")!.textContent = scene.title;
  if (you) enter.querySelector(".enter-name")!.textContent = you.name;
  stage.append(enter);
  const form = enter.querySelector<HTMLFormElement>("form")!;
  const error = enter.querySelector<HTMLParagraphElement>(".enter-error")!;
  const nameInput = form.querySelector<HTMLInputElement>('input[name="nickname"]');
  (nameInput ?? form.querySelector<HTMLButtonElement>('[data-sound="on"]'))!.focus();

  const done = (): void => {
    enter.remove();
    world.focusCanvas();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const withSound = (e.submitter as HTMLElement | null)?.dataset.sound !== "off";
    // start sound first, while this is still the click
    const sound = withSound ? turnSoundOn() : Promise.resolve(false);
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
    await sound;
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
}

// Joined from the arrival card: the page becomes a joined person's page
// without reloading, and the stream reconnects so the server knows you.
function becomeJoined(): void {
  boot.joined = true;
  if (living) stage.append(chat);
  const tray = document.getElementById("tray");
  if (tray) {
    tray.classList.remove("tray-join");
    tray.innerHTML = `<div class="tray-head"><h2>Add a sound</h2><button type="button" class="link-btn" id="tray-toggle" aria-expanded="true">Hide</button></div>
  <div class="tray-body" id="tray-body"><div class="cats" id="cats" role="tablist" aria-label="Kinds of sound"></div><div class="chips" id="chips" role="tabpanel" aria-label="Sounds of this kind"></div></div>`;
    wireTrayToggle();
    nameTray();
  }
  connect();
  render();
}

const ambience = $<HTMLInputElement>("ambience");
ambience.disabled = false;
ambience.checked = true;
ambience.onchange = () => audio.setAmbience(ambience.checked);

// In a living place the tray is a map of sounds: picking one shows where it
// can go; the spot's card is where it's chosen.
function nameTray(): void {
  const h = document.querySelector("#tray .tray-head h2");
  if (living && h && boot.joined) h.textContent = "Sound map: pick a sound to see where it can go";
}
nameTray();

function wireTrayToggle(): void {
  const trayToggle = document.getElementById("tray-toggle");
  if (!trayToggle) return;
  trayToggle.onclick = () => {
    const open = trayToggle.getAttribute("aria-expanded") !== "true";
    trayToggle.setAttribute("aria-expanded", String(open));
    trayToggle.textContent = open ? "Hide" : "Show";
    $("tray-body").hidden = !open;
  };
}
wireTrayToggle();

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openSpot) {
    closeCard();
    return;
  }
  if (e.key === "Escape" && choosing) {
    choosing = null;
    render();
    say("Cancelled.");
  }
  // Delete removes your selected sound, when focus isn't in a text field
  if ((e.key === "Delete" || e.key === "Backspace") && selected && !(e.target instanceof HTMLInputElement)) {
    const p = live.snapshot.placements.find((x) => x.id === selected);
    if (p && p.ownerId === me()?.id) {
      e.preventDefault();
      void send({ type: "sound.remove", placementId: p.id, baseRevision: p.revision }, "Removing…").then((ok) => ok && say("Sound removed."));
    }
  }
});

document.addEventListener("visibilitychange", () => void audio.visibility(document.hidden));

render();
connect();
